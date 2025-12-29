import Database from 'better-sqlite3';
import fs from 'fs';
import { TEST_DB_PATH } from '../setup';

export interface TestDB {
  db: Database.Database;
  cleanup: () => void;
}

/**
 * Create a fresh test database with schema
 */
export function createTestDB(path: string = TEST_DB_PATH): TestDB {
  const db = new Database(path);

  // Enable WAL mode (same as production)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema (extracted from fetch_zones.ts logic)
  db.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      name_se TEXT,
      admin_level TEXT,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      geometry TEXT NOT NULL,
      svg_path TEXT NOT NULL,
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
      status TEXT NOT NULL DEFAULT 'PENDING',
      PRIMARY KEY (from_id, to_id, time_period),
      FOREIGN KEY (from_id) REFERENCES places(id),
      FOREIGN KEY (to_id) REFERENCES places(id)
    );

    CREATE INDEX IF NOT EXISTS idx_routes_to ON routes(to_id, time_period);
    CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);

    CREATE TABLE IF NOT EXISTS time_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket_number INTEGER UNIQUE NOT NULL,
      min_duration INTEGER NOT NULL,
      max_duration INTEGER NOT NULL,
      color_hex TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_time_buckets_number ON time_buckets(bucket_number);

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return {
    db,
    cleanup: () => {
      db.close();
      if (path !== ':memory:' && fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    },
  };
}

/**
 * Seed database with fixture data
 */
export function seedDB(
  db: Database.Database,
  fixtures: {
    places?: Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      geometry: object;
      svg_path: string;
      routing_lat?: number | null;
      routing_lon?: number | null;
      routing_source?: string | null;
    }>;
    routes?: Array<{
      from_id: string;
      to_id: string;
      time_period: string;
      duration?: number | null;
      numberOfTransfers?: number | null;
      walkDistance?: number | null;
      legs?: object | null;
      status?: string;
    }>;
    timeBuckets?: Array<{
      bucket_number: number;
      min_duration: number;
      max_duration: number;
      color_hex: string;
      label: string;
    }>;
    metadata?: Record<string, unknown>;
  }
): void {
  if (fixtures.places) {
    const insertPlace = db.prepare(`
      INSERT INTO places (id, name, city, name_se, admin_level, lat, lon, geometry, svg_path, source_layer, routing_lat, routing_lon, routing_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const place of fixtures.places) {
      insertPlace.run(
        place.id,
        place.name,
        null, // city (fixtures don't have this)
        null, // name_se (fixtures don't have this)
        null, // admin_level (fixtures don't have this)
        place.lat,
        place.lon,
        JSON.stringify(place.geometry),
        place.svg_path,
        null, // source_layer (fixtures don't have this)
        place.routing_lat || null,
        place.routing_lon || null,
        place.routing_source || null
      );
    }
  }

  if (fixtures.routes) {
    const insertRoute = db.prepare(`
      INSERT INTO routes (from_id, to_id, time_period, duration, numberOfTransfers, walkDistance, legs, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const route of fixtures.routes) {
      insertRoute.run(
        route.from_id,
        route.to_id,
        route.time_period,
        route.duration || null,
        route.numberOfTransfers || null,
        route.walkDistance || null,
        route.legs ? JSON.stringify(route.legs) : null,
        route.status || 'PENDING'
      );
    }
  }

  if (fixtures.timeBuckets) {
    const insertBucket = db.prepare(`
      INSERT INTO time_buckets (bucket_number, min_duration, max_duration, color_hex, label)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const bucket of fixtures.timeBuckets) {
      insertBucket.run(
        bucket.bucket_number,
        bucket.min_duration,
        bucket.max_duration,
        bucket.color_hex,
        bucket.label
      );
    }
  }

  if (fixtures.metadata) {
    const insertMetadata = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');

    for (const [key, value] of Object.entries(fixtures.metadata)) {
      insertMetadata.run(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
}

/**
 * Get all data from database (for assertions)
 */
export function getDBSnapshot(db: Database.Database) {
  return {
    places: db.prepare('SELECT * FROM places ORDER BY id').all(),
    routes: db.prepare('SELECT * FROM routes ORDER BY from_id, to_id, time_period').all(),
    timeBuckets: db.prepare('SELECT * FROM time_buckets ORDER BY bucket_number').all(),
    metadata: db.prepare('SELECT * FROM metadata ORDER BY key').all(),
  };
}
