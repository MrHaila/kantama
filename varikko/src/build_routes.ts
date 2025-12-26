import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';
import 'dotenv/config';
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';

interface OTPItinerary {
  duration: number;
  numberOfTransfers: number;
  walkDistance: number;
  legs: unknown[];
}

interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

interface RouteResult {
  status: 'OK' | 'ERROR' | 'NO_ROUTE';
  duration?: number;
  numberOfTransfers?: number;
  walkDistance?: number;
  legs?: unknown[];
  data?: string;
}

const DB_PATH = path.resolve(__dirname, '../../opas/public/varikko.db');

const IS_TEST = process.argv.includes('--test');
const PERIOD_ARG = process.argv.find(a => a.startsWith('--period='));
const REQUESTED_PERIOD = PERIOD_ARG ? PERIOD_ARG.split('=')[1] : null;

const ALL_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];
const PERIODS_TO_RUN = REQUESTED_PERIOD ? [REQUESTED_PERIOD] : ALL_PERIODS;

// Mapping periods to specific target times
const TIME_MAPPING: Record<string, string> = {
  'MORNING': '08:30:00',
  'EVENING': '17:30:00',
  'MIDNIGHT': '23:30:00'
};

const IS_LOCAL = process.env.USE_LOCAL_OTP !== 'false'; 
const HSL_API_URL = IS_LOCAL 
  ? 'http://localhost:9080/otp/gtfs/v1' 
  : 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

const API_KEY = process.env.HSL_API_KEY;

if (!IS_LOCAL && !API_KEY) {
  console.error("Missing HSL_API_KEY environment variable (required for remote API).");
  process.exit(1);
}

const CONCURRENCY = IS_LOCAL ? 10 : 1;
const RATE_LIMIT_DELAY = IS_LOCAL ? 0 : 200;

console.log(`Using API: ${HSL_API_URL} (Local: ${IS_LOCAL})`);
console.log(`Running for periods: ${PERIODS_TO_RUN.join(', ')}`);
console.log(`Concurrency: ${CONCURRENCY}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function getNextTuesday() {
  const d = new Date();
  d.setDate(d.getDate() + (2 + 7 - d.getDay()) % 7);
  return d.toISOString().split('T')[0];
}

const TARGET_DATE = getNextTuesday();

async function fetchRoute(fromLat: number, fromLon: number, toLat: number, toLon: number, targetTime: string): Promise<RouteResult> {
  const query = `
    {
      plan(
        from: {lat: ${fromLat}, lon: ${fromLon}}
        to: {lat: ${toLat}, lon: ${toLon}}
        date: "${TARGET_DATE}"
        time: "${targetTime}"
        numItineraries: 3
      ) {
        itineraries {
          duration
          numberOfTransfers
          walkDistance
          legs {
            from { name }
            to { name }
            mode
            duration
            distance
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
          'Accept': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      return { status: 'ERROR', data: response.data.errors[0].message };
    }

    const itineraries = response.data.plan.itineraries;
    if (!itineraries || itineraries.length === 0) {
      return { status: 'NO_ROUTE' };
    }

    // Pick the best itinerary (fastest)
    const best = itineraries.sort((a: OTPItinerary, b: OTPItinerary) => a.duration - b.duration)[0];

    return {
      status: 'OK',
      duration: best.duration,
      numberOfTransfers: best.numberOfTransfers,
      walkDistance: best.walkDistance,
      legs: best.legs
    };

  } catch (error: unknown) {
    if (error instanceof Error && 'response' in error && (error as AxiosError).response?.status === 429) {
      await new Promise(r => setTimeout(r, 5000));
      return fetchRoute(fromLat, fromLon, toLat, toLon, targetTime);
    }
    return { status: 'ERROR', data: error instanceof Error ? error.message : String(error) };
  }
}

async function runPeriod(period: string, placeMap: Map<string, { lat: number; lon: number }>) {
  const targetTime = TIME_MAPPING[period] || '08:30:00';
  console.log(`\n--- Processing Period: ${period} (${targetTime}) ---`);

  const pendingRoutes = db.prepare(`
    SELECT from_id, to_id 
    FROM routes 
    WHERE status = 'PENDING' AND time_period = ?
  `).all(period) as { from_id: string; to_id: string }[];

  console.log(`Pending routes for ${period}: ${pendingRoutes.length}`);

  if (pendingRoutes.length === 0) {
    console.log(`No pending routes for ${period}.`);
    return;
  }

  let tasks = pendingRoutes;
  if (IS_TEST) {
    console.log(`Test mode: Processing 5 random routes for ${period}.`);
    tasks = [...tasks].sort(() => Math.random() - 0.5).slice(0, 5);
  }

  const updateStmt = db.prepare(`
    UPDATE routes 
    SET duration = ?, numberOfTransfers = ?, walkDistance = ?, legs = ?, status = ?
    WHERE from_id = ? AND to_id = ? AND time_period = ?
  `);

  const limit = pLimit(CONCURRENCY);
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(tasks.length, 0);

  let completed = 0;

  const runTask = async (task: { from_id: string; to_id: string }) => {
    const from = placeMap.get(task.from_id);
    const to = placeMap.get(task.to_id);

    if (!from || !to) {
      completed++;
      progressBar.update(completed);
      return;
    }

    if (!IS_LOCAL && RATE_LIMIT_DELAY > 0) {
      await new Promise(r => setTimeout(r, Math.random() * RATE_LIMIT_DELAY));
    }

    const result = await fetchRoute(from.lat, from.lon, to.lat, to.lon, targetTime);

    if (result.status === 'OK') {
      updateStmt.run(
        result.duration,
        result.numberOfTransfers,
        result.walkDistance,
        JSON.stringify(result.legs),
        'OK',
        task.from_id,
        task.to_id,
        period
      );
    } else {
      updateStmt.run(null, null, null, result.data || null, result.status, task.from_id, task.to_id, period);
    }

    completed++;
    progressBar.update(completed);

    // Occasional metadata update
    if (completed % 10 === 0 || completed === tasks.length) {
      db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)')
        .run(`progress_${period}`, JSON.stringify({
          completed,
          total: tasks.length,
          lastUpdate: new Date().toISOString()
        }));
    }
  };

  await Promise.all(tasks.map(t => limit(() => runTask(t))));
  
  progressBar.stop();
  console.log(`Batch for ${period} complete!`);
}

async function main() {
  const places = db.prepare('SELECT id, lat, lon FROM places').all() as { id: string; lat: number; lon: number }[];
  console.log(`Loaded ${places.length} places.`);
  const placeMap = new Map(places.map(p => [p.id, p]));

  for (const period of PERIODS_TO_RUN) {
    await runPeriod(period, placeMap);
  }

  console.log("\nAll requested periods complete!");
}

main();
