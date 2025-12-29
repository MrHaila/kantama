import axios from 'axios';
import Database from 'better-sqlite3';
import pLimit from 'p-limit';
import { ProgressEmitter } from './events';

// ============================================================================
// Types & Interfaces
// ============================================================================

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

export interface RouteResult {
  status: 'OK' | 'ERROR' | 'NO_ROUTE';
  duration?: number;
  numberOfTransfers?: number;
  walkDistance?: number;
  legs?: unknown[];
  data?: string;
}

export interface OTPConfig {
  url: string;
  isLocal: boolean;
  apiKey?: string;
  concurrency: number;
  rateLimitDelay: number;
}

export interface BuildRoutesOptions {
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  zones?: number;
  limit?: number;
  emitter?: ProgressEmitter;
}

export interface BuildRoutesResult {
  processed: number;
  ok: number;
  noRoute: number;
  errors: number;
}

// ============================================================================
// Constants
// ============================================================================

const ALL_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'] as const;

const TIME_MAPPING: Record<string, string> = {
  MORNING: '08:30:00',
  EVENING: '17:30:00',
  MIDNIGHT: '23:30:00',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the next Tuesday from today
 * Used for consistent transit schedules (weekday, avoiding Monday schedule variations)
 */
export function getNextTuesday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((2 + 7 - d.getDay()) % 7));
  return d.toISOString().split('T')[0];
}

/**
 * Get OTP configuration from environment variables
 */
export function getOTPConfig(): OTPConfig {
  const isLocal = process.env.USE_LOCAL_OTP !== 'false';
  const url = isLocal
    ? 'http://localhost:9080/otp/gtfs/v1'
    : 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

  const apiKey = process.env.HSL_API_KEY || process.env.DIGITRANSIT_API_KEY;

  return {
    url,
    isLocal,
    apiKey,
    concurrency: isLocal ? 10 : 1,
    rateLimitDelay: isLocal ? 0 : 200,
  };
}

// ============================================================================
// Core Routing Functions
// ============================================================================

/**
 * Fetch a single route from OTP
 */
export async function fetchRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  targetTime: string,
  config: OTPConfig
): Promise<RouteResult> {
  const targetDate = getNextTuesday();

  const query = `
    {
      plan(
        from: {lat: ${fromLat}, lon: ${fromLon}}
        to: {lat: ${toLat}, lon: ${toLon}}
        date: "${targetDate}"
        time: "${targetTime}"
        numItineraries: 3
      ) {
        itineraries {
          duration
          numberOfTransfers
          walkDistance
          legs {
            from { name lat lon }
            to { name lat lon }
            mode
            duration
            distance
            legGeometry { points }
            route { shortName longName }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      config.url,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    if (response.data.errors) {
      const error = response.data.errors[0];
      const errorMessage = error.message || 'Unknown OTP error';
      const errorDetails = error.path ? ` (path: ${error.path.join('.')})` : '';
      return { status: 'ERROR', data: `${errorMessage}${errorDetails}` };
    }

    // The response has a nested structure: response.data.data.plan.itineraries
    const plan = response.data.data?.plan;
    if (!plan) {
      return { status: 'ERROR', data: 'OTP response missing plan data' };
    }

    const itineraries = plan.itineraries;
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
      legs: best.legs,
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'response' in error &&
      (error as AxiosError).response?.status === 429
    ) {
      // Rate limited - wait 5 seconds and retry
      await new Promise((r) => setTimeout(r, 5000));
      return fetchRoute(fromLat, fromLon, toLat, toLon, targetTime, config);
    }

    // More detailed error logging
    if (error instanceof Error && 'response' in error) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return {
          status: 'ERROR',
          data: `HTTP ${axiosError.response.status}`,
        };
      } else {
        return {
          status: 'ERROR',
          data: `Network error: ${axiosError.message || 'Failed to connect to OTP server'}`,
        };
      }
    }

    return { status: 'ERROR', data: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Process routes for a single time period
 */
async function processPeriod(
  db: Database.Database,
  period: string,
  placeMap: Map<string, { lat: number; lon: number }>,
  config: OTPConfig,
  zones?: number,
  limit?: number,
  emitter?: ProgressEmitter
): Promise<{ processed: number; ok: number; noRoute: number; errors: number }> {
  const targetTime = TIME_MAPPING[period] || '08:30:00';

  // Get random origin zones if specified
  let selectedZones: string[] | undefined;
  if (zones) {
    const allZones = db
      .prepare('SELECT DISTINCT id FROM places ORDER BY RANDOM() LIMIT ?')
      .all(zones) as { id: string }[];
    selectedZones = allZones.map((z) => z.id);
  }

  // Fetch pending routes (optionally filtered by origin zones)
  let query = `
    SELECT from_id, to_id
    FROM routes
    WHERE status = 'PENDING' AND time_period = ?
  `;

  if (selectedZones && selectedZones.length > 0) {
    const placeholders = selectedZones.map(() => '?').join(',');
    query += ` AND from_id IN (${placeholders})`;
  }

  const params = selectedZones && selectedZones.length > 0 ? [period, ...selectedZones] : [period];

  const pendingRoutes = db.prepare(query).all(...params) as { from_id: string; to_id: string }[];

  if (pendingRoutes.length === 0) {
    return { processed: 0, ok: 0, noRoute: 0, errors: 0 };
  }

  // Apply route limit if specified
  let tasks = pendingRoutes;
  if (limit) {
    tasks = [...tasks].sort(() => Math.random() - 0.5).slice(0, limit);
  }

  const updateStmt = db.prepare(`
    UPDATE routes
    SET duration = ?, numberOfTransfers = ?, walkDistance = ?, legs = ?, status = ?
    WHERE from_id = ? AND to_id = ? AND time_period = ?
  `);

  const concurrencyLimit = pLimit(config.concurrency);

  let completed = 0;
  let okCount = 0;
  let noRouteCount = 0;
  let errorCount = 0;

  const runTask = async (task: { from_id: string; to_id: string }) => {
    const from = placeMap.get(task.from_id);
    const to = placeMap.get(task.to_id);

    if (!from || !to) {
      errorCount++;
      completed++;
      if (emitter) {
        emitter.emitProgress('build_routes', completed, tasks.length, undefined, {
          period,
          ok: okCount,
          noRoute: noRouteCount,
          errors: errorCount,
        });
      }
      return;
    }

    // Rate limiting for remote API
    if (!config.isLocal && config.rateLimitDelay > 0) {
      await new Promise((r) => setTimeout(r, Math.random() * config.rateLimitDelay));
    }

    const result = await fetchRoute(from.lat, from.lon, to.lat, to.lon, targetTime, config);

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
      okCount++;
    } else {
      updateStmt.run(
        null,
        null,
        null,
        result.data || null,
        result.status,
        task.from_id,
        task.to_id,
        period
      );

      if (result.status === 'NO_ROUTE') {
        noRouteCount++;
      } else {
        errorCount++;
      }
    }

    completed++;

    // Emit progress updates
    if (emitter) {
      emitter.emitProgress('build_routes', completed, tasks.length, undefined, {
        period,
        ok: okCount,
        noRoute: noRouteCount,
        errors: errorCount,
      });
    }

    // Update metadata periodically
    if (completed % 10 === 0 || completed === tasks.length) {
      db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
        `progress_${period}`,
        JSON.stringify({
          completed,
          total: tasks.length,
          lastUpdate: new Date().toISOString(),
        })
      );
    }
  };

  await Promise.all(tasks.map((t) => concurrencyLimit(() => runTask(t))));

  return {
    processed: completed,
    ok: okCount,
    noRoute: noRouteCount,
    errors: errorCount,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Build routes for one or all time periods
 */
export async function buildRoutes(
  db: Database.Database,
  options: BuildRoutesOptions = {}
): Promise<BuildRoutesResult> {
  const { period, zones, limit, emitter } = options;

  const config = getOTPConfig();

  // Validate API key for remote OTP
  if (!config.isLocal && !config.apiKey) {
    throw new Error(
      'Missing HSL_API_KEY or DIGITRANSIT_API_KEY environment variable (required for remote API)'
    );
  }

  // Determine which periods to process
  const periodsToRun = period ? [period] : ALL_PERIODS;

  // Load places with routing coordinates
  const places = db
    .prepare(
      `
      SELECT
        id,
        COALESCE(routing_lat, lat) as lat,
        COALESCE(routing_lon, lon) as lon
      FROM places
    `
    )
    .all() as { id: string; lat: number; lon: number }[];

  const placeMap = new Map(places.map((p) => [p.id, p]));

  // Emit start event
  if (emitter) {
    emitter.emitStart('build_routes', undefined, undefined, {
      periods: periodsToRun,
      isLocal: config.isLocal,
      concurrency: config.concurrency,
      zones,
      limit,
    });
  }

  // Process each period
  let totalProcessed = 0;
  let totalOk = 0;
  let totalNoRoute = 0;
  let totalErrors = 0;

  for (const p of periodsToRun) {
    const result = await processPeriod(db, p, placeMap, config, zones, limit, emitter);

    totalProcessed += result.processed;
    totalOk += result.ok;
    totalNoRoute += result.noRoute;
    totalErrors += result.errors;
  }

  // Store final metadata
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'last_route_calculation',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      periods: periodsToRun,
      processed: totalProcessed,
      ok: totalOk,
      noRoute: totalNoRoute,
      errors: totalErrors,
      zones,
      limit,
    })
  );

  // Emit complete event
  if (emitter) {
    emitter.emitComplete('build_routes', undefined, {
      processed: totalProcessed,
      ok: totalOk,
      noRoute: totalNoRoute,
      errors: totalErrors,
    });
  }

  return {
    processed: totalProcessed,
    ok: totalOk,
    noRoute: totalNoRoute,
    errors: totalErrors,
  };
}
