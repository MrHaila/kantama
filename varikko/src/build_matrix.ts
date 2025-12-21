import axios from 'axios';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import 'dotenv/config'; // Make sure to install dotenv or use --env-file in Node 20

const DB_PATH = path.resolve(__dirname, '../data/intermediate.db');
const ZONES_PATH = path.resolve(__dirname, '../data/zones.geojson');
const HSL_API_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
const API_KEY = process.env.HSL_API_KEY;
const IS_TEST = process.argv.includes('--test');

if (!API_KEY) {
  console.error("Missing HSL_API_KEY environment variable.");
  process.exit(1);
}

const db = new Database(DB_PATH);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS matrix (
    from_id TEXT,
    to_id TEXT,
    duration INTEGER,
    walk_dist INTEGER,
    transit_legs INTEGER,
    PRIMARY KEY (from_id, to_id)
  )
`);

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO matrix (from_id, to_id, duration, walk_dist, transit_legs)
  VALUES (?, ?, ?, ?, ?)
`);

const checkStmt = db.prepare(`
  SELECT 1 FROM matrix WHERE from_id = ? AND to_id = ?
`);

async function fetchRoute(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const query = `
    {
      plan(
        from: {lat: ${fromLat}, lon: ${fromLon}}
        to: {lat: ${toLat}, lon: ${toLon}}
        numItineraries: 1
      ) {
        itineraries {
          duration
          walkDistance
          legs {
            mode
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      HSL_API_URL,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'digitransit-subscription-key': API_KEY,
        },
        timeout: 10000 
      }
    );

    if (response.data.errors) {
      console.warn("GraphQL Error:", response.data.errors);
      return null;
    }

    const plan = response.data.data.plan;
    if (!plan || !plan.itineraries || plan.itineraries.length === 0) {
      return null; // No route found
    }

    const itinerary = plan.itineraries[0];
    return {
      duration: itinerary.duration, // in seconds
      walkDistance: itinerary.walkDistance,
      legs: itinerary.legs.length
    };

  } catch (error: any) {
    if (error.response && error.response.status === 429) {
      console.warn("Rate limited. Waiting...");
      await new Promise(r => setTimeout(r, 5000));
      return fetchRoute(fromLat, fromLon, toLat, toLon); // Retry
    }
    console.error("Request failed:", error.message);
    return null;
  }
}

async function main() {
  const zonesRaw = fs.readFileSync(ZONES_PATH, 'utf-8');
  const zones = JSON.parse(zonesRaw).features;

  console.log(`Loaded ${zones.length} zones.`);
  let processed = 0;
  const total = zones.length * zones.length;

  for (const fromZone of zones) {
    for (const toZone of zones) {
      const fromId = fromZone.properties.id;
      const toId = toZone.properties.id;

      if (fromId === toId) continue;

      // Check if done
      if (checkStmt.get(fromId, toId)) {
        // console.log(`Skipping ${fromId} -> ${toId} (already done)`);
        processed++;
        continue;
      }

      const [fLon, fLat] = fromZone.properties.centroid;
      const [tLon, tLat] = toZone.properties.centroid;

      console.log(`Fetching ${fromId} -> ${toId} (${processed}/${total})...`);
      
      const result = await fetchRoute(fLat, fLon, tLat, tLon);
      
      if (result) {
        console.log(`  Success: ${result.duration}s`);
        insertStmt.run(fromId, toId, result.duration, result.walkDistance, result.legs);
      } else {
        // Record as unreachable? Or null. 
        // For now, simpler to just skip or insert -1.
        // insertStmt.run(fromId, toId, -1, 0, 0); 
        console.warn(`No route ${fromId} -> ${toId}`);
      }
      
      processed++;
      
      if (IS_TEST) {
        console.log("Test mode: Exiting after one request.");
        process.exit(0);
      }

      // Sleep to be nice
      await new Promise(r => setTimeout(r, 100)); // 10 req/s limit roughly
    }
  }
  console.log("Done!");
}

main();
