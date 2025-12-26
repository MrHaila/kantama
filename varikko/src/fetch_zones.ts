import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import * as d3 from 'd3-geo';
import Database from 'better-sqlite3';
import type { Geometry, Position, Polygon, MultiPolygon, Feature } from 'geojson';

interface FeatureProperties {
  postinumeroalue?: string;
  posti_alue?: string;
  nimi?: string;
}

interface ProcessedZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  geometry: string;
  svg_path: string;
}

// SVG projection parameters - must match MAP_CONFIG in opas
const zoomLevel = 1.2;
const baseWidth = 800;
const baseHeight = 800;
const width = baseWidth * zoomLevel;
const height = baseHeight * zoomLevel;

function createProjection() {
  return d3
    .geoMercator()
    .center([24.93, 60.17])
    .scale(120000)
    .translate([width / 2, height / 2]);
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

const WFS_URL = 'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';
const DATA_DIR = path.resolve(__dirname, '../../opas/public');
const DB_PATH = path.resolve(__dirname, '../../opas/public/varikko.db');

const IS_TEST = process.argv.includes('--test');
const TIME_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];

// Helsinki area bounds in WGS84
const BOUNDS = {
  minLon: 24.0,
  maxLon: 25.5,
  minLat: 59.9,
  maxLat: 60.5,
};

function isValidRing(ring: Position[]): boolean {
  // Check if all coordinates in the ring are within reasonable WGS84 bounds
  return ring.every((coord) => {
    const lon = coord[0];
    const lat = coord[1];
    if (lon === undefined || lat === undefined) return false;
    return lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon && lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat;
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

function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    DROP TABLE IF EXISTS routes;
    DROP TABLE IF EXISTS places;
    CREATE TABLE places (
      id TEXT PRIMARY KEY,
      name TEXT,
      lat REAL,
      lon REAL,
      geometry TEXT,
      svg_path TEXT
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

    CREATE INDEX IF NOT EXISTS idx_routes_to ON routes(to_id, time_period);
    CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
  `);

  return db;
}

async function main() {
  const db = initDb();

  try {
    console.log(`Fetching data from WFS...`);
    const response = await axios.get(WFS_URL, {
      responseType: 'json',
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const geojson = response.data;
    console.log(`Downloaded ${geojson.features.length} features.`);

    let processedZones = geojson.features.map((feature: Feature<Geometry, FeatureProperties>) => {
      const props = feature.properties;
      const code = props.postinumeroalue || props.posti_alue;
      const name = props.nimi;

      if (!code) return null;
      if (!code.match(/^(00|01|02)/)) return null;

      let centroid: [number, number] | null = null;
      try {
        const center = turf.centroid(feature);
        centroid = center.geometry.coordinates as [number, number];
      } catch {
        return null;
      }

      // Clean the geometry to remove corrupt polygon rings
      const cleanedGeometry = cleanGeometry(feature.geometry);
      if (!cleanedGeometry) {
        console.warn(`Skipping zone ${code}: Invalid geometry after cleaning`);
        return null;
      }

      // Generate SVG path at fetch time
      const projection = createProjection();
      const svgPath = generateSvgPath(cleanedGeometry, projection);
      if (!svgPath) {
        console.warn(`Skipping zone ${code}: Could not generate SVG path`);
        return null;
      }

      return {
        id: code,
        name: name || '',
        lat: centroid[1],
        lon: centroid[0],
        geometry: JSON.stringify(cleanedGeometry),
        svg_path: svgPath
      };
    }).filter((f: ProcessedZone | null): f is ProcessedZone => f !== null);

    if (IS_TEST) {
      console.log('Test mode: Limiting to 5 zones.');
      processedZones = processedZones.slice(0, 5);
    }

    console.log(`Processing ${processedZones.length} zones...`);

    const insertPlace = db.prepare(`
      INSERT OR REPLACE INTO places (id, name, lat, lon, geometry, svg_path)
      VALUES (@id, @name, @lat, @lon, @geometry, @svg_path)
    `);

    const insertRoute = db.prepare(`
      INSERT OR IGNORE INTO routes (from_id, to_id, time_period, status)
      VALUES (?, ?, ?, 'PENDING')
    `);

    const transaction = db.transaction((zones) => {
      for (const zone of zones) {
        insertPlace.run(zone);
      }

      console.log('Pre-filling routes Cartesian product...');
      for (const fromZone of zones) {
        for (const toZone of zones) {
          if (fromZone.id === toZone.id) continue;
          for (const period of TIME_PERIODS) {
            insertRoute.run(fromZone.id, toZone.id, period);
          }
        }
      }
    });

    transaction(processedZones);

    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
      .run('last_fetch', JSON.stringify({
        date: new Date().toISOString(),
        zoneCount: processedZones.length,
        isTest: IS_TEST
      }));

    console.log('Database updated successfully.');

  } catch (error) {
    console.error('Error fetching/processing zones:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
