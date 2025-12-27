import axios from 'axios';
import * as turf from '@turf/turf';
import * as d3 from 'd3-geo';
import type Database from 'better-sqlite3';
import type { Geometry, Position, Polygon, MultiPolygon, Feature } from 'geojson';
import type { ProgressEmitter } from './events';

// Constants (extracted from fetch_zones.ts)
const WFS_URL =
  'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';

const TIME_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];

const HELSINKI_BOUNDS = {
  minLon: 24.0,
  maxLon: 25.5,
  minLat: 59.9,
  maxLat: 60.5,
};

// SVG projection parameters (must match MAP_CONFIG in opas)
const ZOOM_LEVEL = 1.2;
const BASE_WIDTH = 800;
const BASE_HEIGHT = 800;
const WIDTH = BASE_WIDTH * ZOOM_LEVEL;
const HEIGHT = BASE_HEIGHT * ZOOM_LEVEL;
const VIEW_BOX_X = -(WIDTH - BASE_WIDTH) / 2 + 60;
const VIEW_BOX_Y = -120 - (HEIGHT - BASE_HEIGHT);

interface FeatureProperties {
  postinumeroalue?: string;
  posti_alue?: string;
  nimi?: string;
}

export interface FetchZonesOptions {
  testMode?: boolean;
  testLimit?: number;
  emitter?: ProgressEmitter;
}

export interface ZoneData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  geometry: string;
  svg_path: string;
}

function createProjection() {
  return d3
    .geoMercator()
    .center([24.93, 60.17])
    .scale(120000)
    .translate([WIDTH / 2, HEIGHT / 2]);
}

// Manually project coordinates to avoid D3's spherical clipping artifacts
function projectGeometry(geometry: Geometry, proj: d3.GeoProjection): Geometry | null {
  const projectRing = (ring: Position[]): Position[] => {
    return ring.map((coord) => {
      const projected = proj(coord as [number, number]);
      return projected ? [projected[0], projected[1]] : coord;
    });
  };

  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    return {
      type: 'Polygon',
      coordinates: poly.coordinates.map(projectRing),
    };
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    return {
      type: 'MultiPolygon',
      coordinates: multi.coordinates.map((polygon) => polygon.map(projectRing)),
    };
  }

  return null;
}

function generateSvgPath(geometry: Geometry, projection: d3.GeoProjection): string | null {
  const projectedGeometry = projectGeometry(geometry, projection);
  if (!projectedGeometry) return null;

  const pathGenerator = d3.geoPath();
  return pathGenerator(projectedGeometry) || null;
}

// Calculate the visible area bounding box in lat/lon coordinates
function getVisibleAreaBounds(projection: d3.GeoProjection): {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} {
  // Get the four corners of the visible viewBox in SVG coordinates
  const topLeft = [VIEW_BOX_X, VIEW_BOX_Y];
  const topRight = [VIEW_BOX_X + WIDTH, VIEW_BOX_Y];
  const bottomLeft = [VIEW_BOX_X, VIEW_BOX_Y + HEIGHT];
  const bottomRight = [VIEW_BOX_X + WIDTH, VIEW_BOX_Y + HEIGHT];

  // Inverse project to get lat/lon coordinates
  const corners = [topLeft, topRight, bottomLeft, bottomRight]
    .map((coord) => projection.invert!(coord as [number, number]))
    .filter((coord): coord is [number, number] => coord !== null);

  if (corners.length === 0) {
    throw new Error('Failed to calculate visible area bounds');
  }

  // Find the bounding box
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);

  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

// Check if any point of a geometry is inside the visible area
function isGeometryInVisibleArea(
  geometry: Geometry,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }
): boolean {
  const isPointInBounds = (coord: Position): boolean => {
    const [lon, lat] = coord;
    return (
      lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat
    );
  };

  const checkRing = (ring: Position[]): boolean => {
    return ring.some(isPointInBounds);
  };

  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    return poly.coordinates.some(checkRing);
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    return multi.coordinates.some((polygon) => polygon.some(checkRing));
  }

  return false;
}

function isValidRing(ring: Position[]): boolean {
  // Check if all coordinates in the ring are within reasonable WGS84 bounds
  return ring.every((coord) => {
    const lon = coord[0];
    const lat = coord[1];
    if (lon === undefined || lat === undefined) return false;
    return (
      lon >= HELSINKI_BOUNDS.minLon &&
      lon <= HELSINKI_BOUNDS.maxLon &&
      lat >= HELSINKI_BOUNDS.minLat &&
      lat <= HELSINKI_BOUNDS.maxLat
    );
  });
}

function cleanGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    const validRings = poly.coordinates.filter(isValidRing);
    if (validRings.length === 0) return null;
    return { type: 'Polygon', coordinates: validRings };
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    const validPolygons = multi.coordinates
      .map((polygon) => polygon.filter(isValidRing))
      .filter((polygon) => polygon.length > 0);
    if (validPolygons.length === 0) return null;
    if (validPolygons.length === 1 && validPolygons[0]) {
      return { type: 'Polygon', coordinates: validPolygons[0] };
    }
    return { type: 'MultiPolygon', coordinates: validPolygons };
  }

  return geometry;
}

/**
 * Download zones from WFS service
 */
export async function downloadZonesFromWFS(): Promise<any> {
  const response = await axios.get(WFS_URL, {
    responseType: 'json',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response.data;
}

/**
 * Process raw WFS features into ZoneData
 */
export function processZones(
  features: any[],
  options: { testMode?: boolean; testLimit?: number } = {}
): ZoneData[] {
  const projection = createProjection();
  const visibleBounds = getVisibleAreaBounds(projection);

  let processed = features
    .map((feature: Feature<Geometry, FeatureProperties>) => {
      const props = feature.properties;
      const code = props.postinumeroalue || props.posti_alue;
      const name = props.nimi;

      // Filter to Helsinki postal codes
      if (!code || !code.match(/^(00|01|02)/)) return null;

      // Calculate geometric centroid
      let centroid: [number, number] | null = null;
      try {
        const center = turf.centroid(feature);
        centroid = center.geometry.coordinates as [number, number];
      } catch {
        return null;
      }

      // Clean geometry
      const cleanedGeometry = cleanGeometry(feature.geometry);
      if (!cleanedGeometry) return null;

      // Filter to visible area
      if (!isGeometryInVisibleArea(cleanedGeometry, visibleBounds)) {
        return null;
      }

      // Generate SVG path
      const svgPath = generateSvgPath(cleanedGeometry, projection);
      if (!svgPath) return null;

      return {
        id: code,
        name: name || '',
        lat: centroid[1],
        lon: centroid[0],
        geometry: JSON.stringify(cleanedGeometry),
        svg_path: svgPath,
      };
    })
    .filter((z): z is ZoneData => z !== null);

  // Apply test mode limit
  if (options.testMode && options.testLimit) {
    processed = processed.slice(0, options.testLimit);
  }

  return processed;
}

/**
 * Check if database schema is initialized
 */
export function validateSchema(db: Database.Database): boolean {
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('places', 'routes', 'metadata', 'deciles')")
      .all() as Array<{ name: string }>;

    return tables.length === 4;
  } catch {
    return false;
  }
}

/**
 * Initialize database schema (DESTRUCTIVE - drops existing tables)
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS routes;
    DROP TABLE IF EXISTS places;
    CREATE TABLE places (
      id TEXT PRIMARY KEY,
      name TEXT,
      lat REAL,
      lon REAL,
      geometry TEXT,
      svg_path TEXT,
      routing_lat REAL,
      routing_lon REAL,
      routing_source TEXT,
      geocoding_error TEXT
    );

    CREATE TABLE IF NOT EXISTS routes (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      time_period TEXT NOT NULL,
      duration INTEGER,
      numberOfTransfers INTEGER,
      walkDistance REAL,
      legs TEXT,
      status TEXT DEFAULT 'PENDING',
      PRIMARY KEY (from_id, to_id, time_period),
      FOREIGN KEY (from_id) REFERENCES places(id),
      FOREIGN KEY (to_id) REFERENCES places(id)
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS deciles (
      id INTEGER PRIMARY KEY,
      decile_number INTEGER NOT NULL UNIQUE,
      min_duration INTEGER NOT NULL,
      max_duration INTEGER NOT NULL,
      color_hex TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_routes_to ON routes(to_id, time_period);
    CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
    CREATE INDEX IF NOT EXISTS idx_deciles_number ON deciles(decile_number);
  `);
}

/**
 * Insert zones and pre-fill routes
 */
export function insertZones(
  db: Database.Database,
  zones: ZoneData[],
  emitter?: ProgressEmitter
): void {
  emitter?.emitStart('fetch_zones', zones.length, 'Inserting zones...');

  const insertPlace = db.prepare(`
    INSERT OR REPLACE INTO places (id, name, lat, lon, geometry, svg_path)
    VALUES (@id, @name, @lat, @lon, @geometry, @svg_path)
  `);

  const insertRoute = db.prepare(`
    INSERT OR IGNORE INTO routes (from_id, to_id, time_period, status)
    VALUES (?, ?, ?, 'PENDING')
  `);

  const transaction = db.transaction(() => {
    // Insert zones
    for (const zone of zones) {
      insertPlace.run(zone);
    }

    // Pre-fill routes Cartesian product
    let routeCount = 0;
    const totalRoutes = zones.length * (zones.length - 1) * TIME_PERIODS.length;

    for (const fromZone of zones) {
      for (const toZone of zones) {
        if (fromZone.id === toZone.id) continue;

        for (const period of TIME_PERIODS) {
          insertRoute.run(fromZone.id, toZone.id, period);
          routeCount++;

          if (routeCount % 100 === 0) {
            emitter?.emitProgress('fetch_zones', routeCount, totalRoutes, 'Pre-filling routes...');
          }
        }
      }
    }
  });

  transaction();

  emitter?.emitComplete('fetch_zones', 'Zones inserted successfully', {
    zoneCount: zones.length,
    routeCount: zones.length * (zones.length - 1) * TIME_PERIODS.length,
  });
}

/**
 * Fetch zones from WFS and populate database
 */
export async function fetchZones(
  db: Database.Database,
  options: FetchZonesOptions = {}
): Promise<{ zoneCount: number; routeCount: number }> {
  const emitter = options.emitter;

  // Validate schema exists
  if (!validateSchema(db)) {
    throw new Error(
      'Database schema not initialized. Run "varikko init" first to set up the database.'
    );
  }

  emitter?.emitStart('fetch_zones', undefined, 'Downloading zones from WFS...');

  // Download from WFS
  const geojson = await downloadZonesFromWFS();

  emitter?.emitProgress(
    'fetch_zones',
    0,
    100,
    `Downloaded ${geojson.features.length} features`
  );

  // Process zones
  const zones = processZones(geojson.features, {
    testMode: options.testMode,
    testLimit: options.testLimit || 5,
  });

  // Insert zones
  insertZones(db, zones, emitter);

  // Store metadata
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'last_fetch',
    JSON.stringify({
      date: new Date().toISOString(),
      zoneCount: zones.length,
      isTest: options.testMode || false,
    })
  );

  const routeCount = zones.length * (zones.length - 1) * TIME_PERIODS.length;

  return { zoneCount: zones.length, routeCount };
}
