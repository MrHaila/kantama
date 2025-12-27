import axios from 'axios';
import * as turf from '@turf/turf';
import * as d3 from 'd3-geo';
import type Database from 'better-sqlite3';
import type { Geometry, Position, Polygon, MultiPolygon, Feature } from 'geojson';
import type { ProgressEmitter } from './events';
import { ALL_FETCHERS, generateZoneId } from './city-fetchers';
import type { StandardZone, ZoneData } from './types';
import polylabel from 'polylabel';
import {
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  MAP_CENTER,
  MAP_SCALE,
  METRO_AREA_BOUNDS,
} from './mapConfig';

// Constants
const WFS_URL =
  'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';

const TIME_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];

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

/**
 * Calculate pole of inaccessibility - the most distant internal point from polygon edges.
 * Guaranteed to be inside the polygon and visually centered.
 * For multi-polygons, uses the largest polygon by area.
 */
function calculateInsidePoint(geometry: Geometry): [number, number] | null {
  try {
    // For MultiPolygon, find the largest polygon by area
    if (geometry.type === 'MultiPolygon') {
      const multiPoly = geometry as MultiPolygon;
      let largestPolygon: Polygon | null = null;
      let maxArea = 0;

      for (const coords of multiPoly.coordinates) {
        const polygon: Polygon = { type: 'Polygon', coordinates: coords };
        const area = turf.area(polygon);
        if (area > maxArea) {
          maxArea = area;
          largestPolygon = polygon;
        }
      }

      if (!largestPolygon) return null;
      geometry = largestPolygon;
    }

    // For Polygon, calculate pole of inaccessibility
    if (geometry.type === 'Polygon') {
      const poly = geometry as Polygon;
      // polylabel expects array of rings: [[lon, lat], [lon, lat], ...]
      // Precision: 0.0001 degrees ≈ 11 meters (good balance for postal zones)
      const point = polylabel(poly.coordinates, 0.0001);
      return [point[0], point[1]]; // [lon, lat]
    }

    return null;
  } catch (error) {
    // If polylabel fails, return null (geometry is likely invalid)
    return null;
  }
}

function createProjection() {
  return d3
    .geoMercator()
    .center(MAP_CENTER)
    .scale(MAP_SCALE)
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
  const topLeft = [VIEWBOX_X, VIEWBOX_Y];
  const topRight = [VIEWBOX_X + WIDTH, VIEWBOX_Y];
  const bottomLeft = [VIEWBOX_X, VIEWBOX_Y + HEIGHT];
  const bottomRight = [VIEWBOX_X + WIDTH, VIEWBOX_Y + HEIGHT];

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
  // Check if coordinates are valid WGS84 (basic sanity check)
  // Geographic filtering is handled separately by isGeometryInVisibleArea
  return ring.every((coord) => {
    const lon = coord[0];
    const lat = coord[1];
    if (lon === undefined || lat === undefined) return false;
    // Use metro area bounds for sanity check (catches projection errors)
    return (
      lon >= METRO_AREA_BOUNDS.minLon && lon <= METRO_AREA_BOUNDS.maxLon &&
      lat >= METRO_AREA_BOUNDS.minLat && lat <= METRO_AREA_BOUNDS.maxLat &&
      !isNaN(lon) && !isNaN(lat)
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

      // Clean geometry first (needed for inside point calculation)
      const cleanedGeometry = cleanGeometry(feature.geometry);
      if (!cleanedGeometry) return null;

      // Calculate pole of inaccessibility (guaranteed inside point)
      const insidePoint = calculateInsidePoint(cleanedGeometry);
      if (!insidePoint) return null;

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
        lat: insidePoint[1],
        lon: insidePoint[0],
        geometry: JSON.stringify(cleanedGeometry),
        svg_path: svgPath,
      };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

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
      city TEXT,
      name_se TEXT,
      admin_level TEXT,
      lat REAL,
      lon REAL,
      geometry TEXT,
      svg_path TEXT,
      source_layer TEXT,
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
    INSERT OR REPLACE INTO places (
      id, name, city, name_se, admin_level, lat, lon, geometry, svg_path, source_layer,
      routing_lat, routing_lon, routing_source, geocoding_error
    )
    VALUES (
      @id, @name, COALESCE(@city, NULL), COALESCE(@name_se, NULL), COALESCE(@admin_level, NULL),
      @lat, @lon, @geometry, @svg_path, COALESCE(@source_layer, NULL),
      NULL, NULL, NULL, NULL
    )
  `);

  const insertRoute = db.prepare(`
    INSERT OR IGNORE INTO routes (from_id, to_id, time_period, status)
    VALUES (?, ?, ?, 'PENDING')
  `);

  const transaction = db.transaction(() => {
    // Insert zones
    for (const zone of zones) {
      // Ensure all properties exist (for compatibility with old postal code format)
      const normalizedZone = {
        ...zone,
        city: zone.city || null,
        name_se: zone.name_se || null,
        admin_level: zone.admin_level || null,
        source_layer: zone.source_layer || null,
      };
      insertPlace.run(normalizedZone);
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
 * Download zones from all cities
 */
export async function downloadZonesMultiCity(
  emitter?: ProgressEmitter
): Promise<StandardZone[]> {
  emitter?.emitStart('fetch_zones', ALL_FETCHERS.length, 'Fetching from multiple cities...');

  const allZones: StandardZone[] = [];
  const totalCities = ALL_FETCHERS.length;

  for (let i = 0; i < ALL_FETCHERS.length; i++) {
    const fetcher = ALL_FETCHERS[i];
    try {
      emitter?.emitProgress('fetch_zones', i, totalCities, `Fetching ${fetcher.cityName}...`);

      const features = await fetcher.fetchFeatures();
      const zones = features.map(f => fetcher.parseFeature(f));

      allZones.push(...zones);

      emitter?.emitProgress('fetch_zones', i + 1, totalCities,
        `Fetched ${zones.length} zones from ${fetcher.cityName}`);
    } catch (error) {
      console.error(`Failed to fetch ${fetcher.cityName}:`, error);
      // Continue with other cities (partial success)
      emitter?.emitProgress('fetch_zones', i + 1, totalCities,
        `Failed to fetch ${fetcher.cityName}, continuing...`);
    }
  }

  return allZones;
}

export interface ProcessingStats {
  total: number;
  insidePointFailed: number;
  geometryInvalid: number;
  outsideVisibleArea: number;
  svgPathFailed: number;
  passed: number;
}

/**
 * Process standard zones into ZoneData
 */
export function processZonesMultiCity(
  standardZones: StandardZone[],
  options: { testMode?: boolean; testLimit?: number } = {}
): { zones: ZoneData[]; stats: ProcessingStats } {
  const projection = createProjection();
  const visibleBounds = getVisibleAreaBounds(projection);

  const stats: ProcessingStats = {
    total: standardZones.length,
    insidePointFailed: 0,
    geometryInvalid: 0,
    outsideVisibleArea: 0,
    svgPathFailed: 0,
    passed: 0
  };

  let processed = standardZones
    .map((zone) => {
      // Generate zone ID with city prefix
      const id = generateZoneId(zone.cityCode, zone.originalId);

      // Clean geometry first (needed for inside point calculation)
      const cleanedGeometry = cleanGeometry(zone.geometry);
      if (!cleanedGeometry) {
        stats.geometryInvalid++;
        return null;
      }

      // Calculate pole of inaccessibility (guaranteed inside point)
      const insidePoint = calculateInsidePoint(cleanedGeometry);
      if (!insidePoint) {
        stats.insidePointFailed++;
        return null;
      }

      // Filter to visible area
      if (!isGeometryInVisibleArea(cleanedGeometry, visibleBounds)) {
        stats.outsideVisibleArea++;
        return null;
      }

      // Generate SVG path
      const svgPath = generateSvgPath(cleanedGeometry, projection);
      if (!svgPath) {
        stats.svgPathFailed++;
        return null;
      }

      stats.passed++;
      return {
        id,
        name: zone.name,
        lat: insidePoint[1],
        lon: insidePoint[0],
        geometry: JSON.stringify(cleanedGeometry),
        svg_path: svgPath,
        city: zone.city,
        name_se: zone.nameSe,
        admin_level: zone.adminLevel,
        source_layer: zone.metadata?.sourceLayer
      };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

  // Apply test mode limit
  if (options.testMode && options.testLimit) {
    processed = processed.slice(0, options.testLimit);
  }

  return { zones: processed, stats };
}

/**
 * Fetch zones using multi-city approach
 */
export async function fetchZonesMultiCity(
  db: Database.Database,
  options: FetchZonesOptions = {}
): Promise<{ zoneCount: number; routeCount: number; stats: ProcessingStats }> {
  const emitter = options.emitter;

  // Auto-initialize schema if needed
  if (!validateSchema(db)) {
    initializeSchema(db);
  }

  // Download from all cities
  const standardZones = await downloadZonesMultiCity(emitter);

  emitter?.emitProgress('fetch_zones', 3, 4,
    `Downloaded ${standardZones.length} zones, processing...`);

  // Process zones
  const { zones, stats } = processZonesMultiCity(standardZones, {
    testMode: options.testMode,
    testLimit: options.testLimit || 5
  });

  // Log filtering summary
  console.log('\n--- Zone Filtering Summary ---');
  console.log(`Total fetched:        ${stats.total}`);
  console.log(`Outside visible area: ${stats.outsideVisibleArea} (filtered out)`);
  console.log(`Invalid geometry:     ${stats.geometryInvalid} (filtered out)`);
  console.log(`Inside point failed:  ${stats.insidePointFailed} (filtered out)`);
  console.log(`SVG path failed:      ${stats.svgPathFailed} (filtered out)`);
  console.log(`Passed filtering:     ${stats.passed}`);
  console.log('------------------------------\n');

  emitter?.emitProgress('fetch_zones', 4, 4,
    `Processed ${zones.length} zones (${stats.outsideVisibleArea} filtered as outside visible area), inserting...`);

  // Insert zones
  insertZones(db, zones, emitter);

  // Store metadata
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'last_fetch',
    JSON.stringify({
      date: new Date().toISOString(),
      zoneCount: zones.length,
      isTest: options.testMode || false,
      multiCity: true,
      cities: ['Helsinki', 'Vantaa', 'Espoo', 'Kauniainen'],
      filteringStats: stats
    })
  );

  const routeCount = zones.length * (zones.length - 1) * TIME_PERIODS.length;

  return { zoneCount: zones.length, routeCount, stats };
}

/**
 * Fetch zones from WFS and populate database (original implementation)
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
