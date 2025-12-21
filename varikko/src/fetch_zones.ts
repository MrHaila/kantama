import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import Database from 'better-sqlite3';

const WFS_URL = 'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'varikko.db');

const IS_TEST = process.argv.includes('--test');
const TIME_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];

function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT,
      lat REAL,
      lon REAL,
      geometry TEXT
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

    let processedZones = geojson.features.map((feature: any) => {
      const props = feature.properties;
      const code = props.postinumeroalue || props.posti_alue;
      const name = props.nimi;

      if (!code) return null;
      if (!code.match(/^(00|01|02)/)) return null;

      let centroid = null;
      try {
        const center = turf.centroid(feature);
        centroid = center.geometry.coordinates; // [lon, lat]
      } catch (e) {
        return null;
      }

      return {
        id: code,
        name: name,
        lat: centroid[1],
        lon: centroid[0],
        geometry: JSON.stringify(feature.geometry)
      };
    }).filter((f: any) => f !== null);

    if (IS_TEST) {
      console.log('Test mode: Limiting to 5 zones.');
      processedZones = processedZones.slice(0, 5);
    }

    console.log(`Processing ${processedZones.length} zones...`);

    const insertPlace = db.prepare(`
      INSERT OR REPLACE INTO places (id, name, lat, lon, geometry)
      VALUES (@id, @name, @lat, @lon, @geometry)
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
