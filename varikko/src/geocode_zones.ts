import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';
import 'dotenv/config';
import cliProgress from 'cli-progress';

interface GeocodingFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    name: string;
    postalcode?: string;
    locality?: string;
    layer: string;
    distance?: number;
    label?: string;
  };
}

interface GeocodingResult {
  type: string;
  features: GeocodingFeature[];
}

interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const DB_PATH = path.resolve(__dirname, '../../opas/public/varikko.db');
const GEOCODING_API = 'https://api.digitransit.fi/geocoding/v1/search';

const IS_TEST = process.argv.includes('--test');
const RATE_LIMIT_DELAY = 100; // 100ms between requests = max 10 req/sec

// API key from environment variable
const API_KEY = process.env.DIGITRANSIT_API_KEY || process.env.HSL_API_KEY;

// Helsinki area boundaries (same as in fetch_zones.ts)
const BOUNDS = {
  minLon: 24.0,
  maxLon: 25.5,
  minLat: 59.9,
  maxLat: 60.5,
};

console.log('='.repeat(60));
console.log('Zone Geocoding - Address-based Routing Point Resolution');
console.log('='.repeat(60));
console.log(`Test mode: ${IS_TEST ? 'YES (will process 5 zones only)' : 'NO'}`);
console.log(`Rate limiting: ${RATE_LIMIT_DELAY}ms delay between requests`);
console.log(`API key configured: ${API_KEY ? 'YES' : 'NO (requests may fail)'}`);
console.log('='.repeat(60));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Add new columns to places table if they don't exist
function updateSchema() {
  console.log('\nUpdating database schema...');

  const columns = db.prepare("PRAGMA table_info(places)").all() as Array<{name: string}>;
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('routing_lat')) {
    db.prepare('ALTER TABLE places ADD COLUMN routing_lat REAL').run();
    console.log('  ✓ Added routing_lat column');
  }

  if (!columnNames.includes('routing_lon')) {
    db.prepare('ALTER TABLE places ADD COLUMN routing_lon REAL').run();
    console.log('  ✓ Added routing_lon column');
  }

  if (!columnNames.includes('routing_source')) {
    db.prepare('ALTER TABLE places ADD COLUMN routing_source TEXT').run();
    console.log('  ✓ Added routing_source column');
  }

  if (!columnNames.includes('geocoding_error')) {
    db.prepare('ALTER TABLE places ADD COLUMN geocoding_error TEXT').run();
    console.log('  ✓ Added geocoding_error column');
  }

  console.log('Schema update complete.\n');
}

async function geocodeZone(zone: Place): Promise<{
  success: boolean;
  lat?: number;
  lon?: number;
  source?: string;
  error?: string;
}> {
  try {
    // Try multiple search strategies
    const searchStrategies = [
      // Strategy 1: Postal code only
      {
        text: zone.id,
        description: 'postal code',
      },
      // Strategy 2: Zone name
      {
        text: zone.name,
        description: 'zone name',
        layers: 'neighbourhood,locality,address',
      },
      // Strategy 3: Postal code + Helsinki
      {
        text: `${zone.id} Helsinki`,
        description: 'postal code + Helsinki',
      },
    ];

    for (const strategy of searchStrategies) {
      const params: Record<string, string> = {
        text: strategy.text,
        size: '1',
        'boundary.rect.min_lat': BOUNDS.minLat.toString(),
        'boundary.rect.max_lat': BOUNDS.maxLat.toString(),
        'boundary.rect.min_lon': BOUNDS.minLon.toString(),
        'boundary.rect.max_lon': BOUNDS.maxLon.toString(),
      };

      if (strategy.layers) {
        params.layers = strategy.layers;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (API_KEY) {
        headers['digitransit-subscription-key'] = API_KEY;
      }

      const response = await axios.get<GeocodingResult>(GEOCODING_API, {
        params,
        headers,
      });

      if (response.data.features && response.data.features.length > 0) {
        const feature = response.data.features[0];
        const [lon, lat] = feature.geometry.coordinates;

        return {
          success: true,
          lat,
          lon,
          source: `geocoded:${strategy.description}`,
        };
      }
    }

    // No results from any strategy
    return {
      success: false,
      error: 'No geocoding results found',
    };

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      return {
        success: false,
        error: `HTTP ${status}: ${message}`,
      };
    }
    return {
      success: false,
      error: String(error),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  updateSchema();

  // Get all zones
  let zones = db.prepare('SELECT id, name, lat, lon FROM places ORDER BY id').all() as Place[];

  if (IS_TEST) {
    console.log('TEST MODE: Processing only 5 zones\n');
    zones = zones.slice(0, 5);
  }

  console.log(`Processing ${zones.length} zones...\n`);

  const progressBar = new cliProgress.SingleBar({
    format: 'Progress |{bar}| {percentage}% | {value}/{total} zones | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  });

  progressBar.start(zones.length, 0);

  const updatePlace = db.prepare(`
    UPDATE places
    SET routing_lat = ?,
        routing_lon = ?,
        routing_source = ?,
        geocoding_error = ?
    WHERE id = ?
  `);

  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{id: string, name: string, error: string}>,
  };

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];

    const result = await geocodeZone(zone);

    if (result.success && result.lat && result.lon) {
      updatePlace.run(result.lat, result.lon, result.source, null, zone.id);
      results.success++;
    } else {
      // Fallback to geometric centroid
      updatePlace.run(zone.lat, zone.lon, 'fallback:geometric', result.error || null, zone.id);
      results.failed++;
      results.errors.push({
        id: zone.id,
        name: zone.name,
        error: result.error || 'Unknown error',
      });
    }

    progressBar.update(i + 1);

    // Rate limiting - wait before next request (except for last one)
    if (i < zones.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  progressBar.stop();

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Successfully geocoded: ${results.success}/${zones.length} zones`);
  console.log(`Failed (using fallback): ${results.failed}/${zones.length} zones`);

  if (results.errors.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('FAILED ZONES (using geometric centroid as fallback):');
    console.log('-'.repeat(60));
    results.errors.forEach(err => {
      console.log(`${err.id} - ${err.name}`);
      console.log(`  Error: ${err.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('NEXT STEPS');
  console.log('='.repeat(60));
  console.log('1. Review the results above');
  console.log('2. If successful, run: pnpm --filter varikko build-routes');
  console.log('3. The routes will now use address-based routing points');
  console.log('4. Visualization in Opas UI will show these routing points');

  if (!API_KEY) {
    console.log('\n⚠️  WARNING: No API key configured');
    console.log('   Set DIGITRANSIT_API_KEY or HSL_API_KEY in .env');
    console.log('   Requests may fail without authentication');
  }

  console.log('='.repeat(60));

  db.close();
}

main().catch(console.error);
