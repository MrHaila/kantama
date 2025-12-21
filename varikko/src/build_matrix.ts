import axios from 'axios';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';

const DB_PATH = path.resolve(__dirname, '../data/intermediate.db');
const ZONES_PATH = path.resolve(__dirname, '../data/zones.geojson');

const IS_TEST = process.argv.includes('--test');
const SHOW_STATUS = process.argv.includes('--status');
// Default to local if env var not set, or set explicitly. 
const IS_LOCAL = process.env.USE_LOCAL_OTP !== 'false'; 

const HSL_API_URL = IS_LOCAL 
  ? 'http://localhost:9080/otp/gtfs/v1' 
  : 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

const API_KEY = process.env.HSL_API_KEY;

if (!IS_LOCAL && !API_KEY) {
  console.error("Missing HSL_API_KEY environment variable (required for remote API).");
  process.exit(1);
}

// Concurrency settings
// Local: High concurrency (CPU/Memory bound)
// Remote: Low concurrency (Rate limit bound)
const CONCURRENCY = IS_LOCAL ? 2 : 1;
const RATE_LIMIT_DELAY = IS_LOCAL ? 0 : 150; // ms between starts if needed, or inside fetch

console.log(`Using API: ${HSL_API_URL} (Local: ${IS_LOCAL})`);
console.log(`Concurrency: ${CONCURRENCY}`);

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

const countStmt = db.prepare('SELECT COUNT(*) as count FROM matrix');

function getNextTuesday() {
  const d = new Date();
  d.setDate(d.getDate() + (2 + 7 - d.getDay()) % 7);
  return d.toISOString().split('T')[0];
}

const TARGET_DATE = getNextTuesday();
const TARGET_TIME = "08:30:00";

async function fetchRoute(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const query = `
    {
      plan(
        from: {lat: ${fromLat}, lon: ${fromLon}}
        to: {lat: ${toLat}, lon: ${toLon}}
        date: "${TARGET_DATE}"
        time: "${TARGET_TIME}"
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
        timeout: 10000,
        // For local, we don't want to keep connections open forever if we have high concurrency
        httpAgent: new (require('http').Agent)({ keepAlive: true }),
      }
    );

    if (response.data.errors) {
      // console.warn("GraphQL Error:", response.data.errors);
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
      // Backoff
      await new Promise(r => setTimeout(r, 5000));
      return fetchRoute(fromLat, fromLon, toLat, toLon);
    }
    // console.error("Request failed:", error.message);
    return null;
  }
}

async function main() {
  if (SHOW_STATUS) {
    const row = countStmt.get() as { count: number };
    const zonesRaw = fs.readFileSync(ZONES_PATH, 'utf-8');
    const zones = JSON.parse(zonesRaw).features;
    const totalPossible = zones.length * (zones.length - 1); // approximate, excluding self
    const pct = (row.count / totalPossible * 100).toFixed(2);
    console.log(`Matrix Status: ${row.count} / ~${totalPossible} rows (${pct}%)`);
    return;
  }

  const zonesRaw = fs.readFileSync(ZONES_PATH, 'utf-8');
  const zones = JSON.parse(zonesRaw).features;

  console.log(`Loaded ${zones.length} zones.`);
  
  // Pre-load existing pairs to skip
  // Reading 1M+ rows might be slow but better than individual checks if DB is huge?
  // For SQLite, singular checks are fast if indexed. Let's stick to checks or load a Set.
  // Loading a Set of IDs "from:to" for 1M rows consumes ~50MB RAM. Safe.
  console.log("Loading existing state...");
  const existingRows = db.prepare('SELECT from_id, to_id FROM matrix').all() as {from_id: string, to_id: string}[];
  const existingSet = new Set(existingRows.map(r => `${r.from_id}:${r.to_id}`));
  console.log(`Found ${existingSet.size} existing entries.`);

  const tasks: {from: any, to: any}[] = [];

  for (const fromZone of zones) {
    for (const toZone of zones) {
      const fromId = fromZone.properties.id;
      const toId = toZone.properties.id;

      if (fromId === toId) continue;
      if (existingSet.has(`${fromId}:${toId}`)) continue;

      tasks.push({ from: fromZone, to: toZone });
    }
  }

  console.log(`Remaining pairs to compute: ${tasks.length}`);

  if (tasks.length === 0) {
    console.log("All done!");
    return;
  }

  if (IS_TEST) {
    console.log("Test mode: Running 5 random tasks...");
    // Shuffle tasks
    tasks.sort(() => Math.random() - 0.5);
    const testTasks = tasks.slice(0, 5);
    
    for (const t of testTasks) {
       const [fLon, fLat] = t.from.properties.centroid;
       const [tLon, tLat] = t.to.properties.centroid;
       console.log(`Test: ${t.from.properties.id} -> ${t.to.properties.id}`);
       const result = await fetchRoute(fLat, fLon, tLat, tLon);
       console.log("Result:", result);
    }
    return;
  }

  const limit = pLimit(CONCURRENCY);
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(tasks.length, 0);

  let completed = 0;

  const runTask = async (task: {from: any, to: any}) => {
    const { from, to } = task;
    const fromId = from.properties.id;
    const toId = to.properties.id;
    const [fLon, fLat] = from.properties.centroid;
    const [tLon, tLat] = to.properties.centroid;

    // Small random delay for remote to avoid burst patterns even with low concurrency
    if (!IS_LOCAL && RATE_LIMIT_DELAY > 0) {
      await new Promise(r => setTimeout(r, Math.random() * RATE_LIMIT_DELAY));
    }

    const result = await fetchRoute(fLat, fLon, tLat, tLon);

    if (result) {
      insertStmt.run(fromId, toId, result.duration, result.walkDistance, result.legs);
    } else {
      // Mark as -1 or just log? 
      // User says "evaluate status", maybe we should record failures.
      // For now, let's just log failures to debug but not crash.
    }
    
    completed++;
    progressBar.update(completed);
  };

  const jobPromises = tasks.map(t => limit(() => runTask(t)));

  await Promise.all(jobPromises);
  
  progressBar.stop();
  console.log("Done!");
}

main();
