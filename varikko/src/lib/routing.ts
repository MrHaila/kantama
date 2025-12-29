import axios from 'axios';
import pLimit from 'p-limit';
import { ProgressEmitter } from './events';
import {
  readZones,
  getAllZoneIds,
  readZoneRoutes,
  writeZoneRoutes,
  updatePipelineMetadata,
} from './datastore';
import {
  TimePeriod,
  TransportMode,
  CompactRoute,
  CompactLeg,
  RouteStatus,
  RouteCalculationMetadata,
} from '../shared/types';

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
  mode?: TransportMode;
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

/** Transport mode configuration for OTP queries */
const TRANSPORT_MODE_CONFIG = {
  WALK: {
    modes: '[{mode: WALK}, {mode: TRANSIT}]',
    bikeSpeed: null,
    bikeSwitchTime: null,
    bikeSwitchCost: null,
  },
  BICYCLE: {
    modes: '[{mode: BICYCLE}, {mode: TRANSIT}]',
    bikeSpeed: 5.0, // m/s (~18 km/h, reasonable city cycling speed)
    bikeSwitchTime: 120, // seconds to park/unpark bike
    bikeSwitchCost: 600, // 10-min penalty to discourage frequent switches
  },
} as const;

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
  config: OTPConfig,
  mode: TransportMode = 'WALK'
): Promise<RouteResult> {
  const targetDate = getNextTuesday();
  const modeConfig = TRANSPORT_MODE_CONFIG[mode];

  // Build optional bike parameters
  const bikeParams =
    mode === 'BICYCLE'
      ? `bikeSpeed: ${modeConfig.bikeSpeed}
       bikeSwitchTime: ${modeConfig.bikeSwitchTime}
       bikeSwitchCost: ${modeConfig.bikeSwitchCost}`
      : '';

  const query = `
    {
      plan(
        from: {lat: ${fromLat}, lon: ${fromLon}}
        to: {lat: ${toLat}, lon: ${toLon}}
        date: "${targetDate}"
        time: "${targetTime}"
        numItineraries: 3
        transportModes: ${modeConfig.modes}
        ${bikeParams}
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // Add API key for remote OTP server
    if (config.apiKey) {
      headers['digitransit-subscription-key'] = config.apiKey;
    }

    const response = await axios.post(config.url, { query }, { headers });

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
  period: TimePeriod,
  placeMap: Map<string, { id: string; lat: number; lon: number }>,
  config: OTPConfig,
  mode: TransportMode = 'WALK',
  zones?: number,
  limit?: number,
  emitter?: ProgressEmitter,
  progressOffset: number = 0,
  totalTasks: number = 0
): Promise<{ processed: number; ok: number; noRoute: number; errors: number }> {
  const targetTime = TIME_MAPPING[period] || '08:30:00';

  // Get all zone IDs
  const allZoneIds = getAllZoneIds();

  // Get random origin zones if specified
  let selectedZones: string[] = allZoneIds;
  if (zones) {
    // Randomly select zones
    selectedZones = [...allZoneIds].sort(() => Math.random() - 0.5).slice(0, zones);
  }

  // Collect pending routes from selected zones
  const pendingRoutes: Array<{ from_id: string; to_id: string }> = [];

  for (const fromId of selectedZones) {
    const routesData = readZoneRoutes(fromId, period, mode);
    if (!routesData) continue;

    for (const route of routesData.r) {
      if (route.s === RouteStatus.PENDING) {
        pendingRoutes.push({ from_id: fromId, to_id: route.i });
      }
    }
  }

  if (pendingRoutes.length === 0) {
    return { processed: 0, ok: 0, noRoute: 0, errors: 0 };
  }

  // Apply route limit if specified
  let tasks = pendingRoutes;
  if (limit) {
    tasks = [...tasks].sort(() => Math.random() - 0.5).slice(0, limit);
  }

  const concurrencyLimit = pLimit(config.concurrency);

  let completed = 0;
  let okCount = 0;
  let noRouteCount = 0;
  let errorCount = 0;

  // Keep track of routes to update per zone (to batch file writes)
  const routeUpdates = new Map<string, Map<string, CompactRoute>>();

  const runTask = async (task: { from_id: string; to_id: string }) => {
    const from = placeMap.get(task.from_id);
    const to = placeMap.get(task.to_id);

    if (!from || !to) {
      errorCount++;
      completed++;
      if (emitter) {
        emitter.emitProgress('build_routes', progressOffset + completed, totalTasks || tasks.length, undefined, {
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

    const result = await fetchRoute(from.lat, from.lon, to.lat, to.lon, targetTime, config, mode);

    // Create updated route
    let updatedRoute: CompactRoute;

    if (result.status === 'OK') {
      updatedRoute = {
        i: task.to_id,
        d: result.duration || null,
        t: result.numberOfTransfers || null,
        s: RouteStatus.OK,
        l: result.legs ? convertLegsToCompact(result.legs) : undefined,
      };
      okCount++;
    } else {
      updatedRoute = {
        i: task.to_id,
        d: null,
        t: null,
        s: result.status === 'NO_ROUTE' ? RouteStatus.NO_ROUTE : RouteStatus.ERROR,
      };

      if (result.status === 'NO_ROUTE') {
        noRouteCount++;
      } else {
        errorCount++;
      }
    }

    // Store update for batching
    if (!routeUpdates.has(task.from_id)) {
      routeUpdates.set(task.from_id, new Map());
    }
    routeUpdates.get(task.from_id)!.set(task.to_id, updatedRoute);

    completed++;

    // Emit progress updates
    if (emitter) {
      emitter.emitProgress('build_routes', progressOffset + completed, totalTasks || tasks.length, undefined, {
        period,
        ok: okCount,
        noRoute: noRouteCount,
        errors: errorCount,
      });
    }

    // Flush updates periodically (every 50 routes or at end)
    if (completed % 50 === 0 || completed === tasks.length) {
      flushRouteUpdates(routeUpdates, period, mode);
    }
  };

  await Promise.all(tasks.map((t) => concurrencyLimit(() => runTask(t))));

  // Final flush of any remaining updates
  flushRouteUpdates(routeUpdates, period, mode);

  return {
    processed: completed,
    ok: okCount,
    noRoute: noRouteCount,
    errors: errorCount,
  };
}

/**
 * Flush route updates to msgpack files
 */
function flushRouteUpdates(
  routeUpdates: Map<string, Map<string, CompactRoute>>,
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): void {
  for (const [fromId, updates] of routeUpdates.entries()) {
    if (updates.size === 0) continue;

    const routesData = readZoneRoutes(fromId, period, mode);
    if (!routesData) continue;

    // Apply updates
    for (const [toId, updatedRoute] of updates.entries()) {
      const routeIndex = routesData.r.findIndex((r) => r.i === toId);
      if (routeIndex !== -1) {
        routesData.r[routeIndex] = updatedRoute;
      }
    }

    // Write back to file
    writeZoneRoutes(fromId, period, routesData, mode);

    // Clear processed updates
    updates.clear();
  }
}

/**
 * Convert OTP legs to compact format
 */
function convertLegsToCompact(legs: unknown[]): CompactLeg[] {
  return legs.map((leg: any) => {
    const compactLeg: CompactLeg = {
      m: leg.mode,
      d: leg.duration,
    };

    if (leg.distance !== undefined) compactLeg.di = leg.distance;
    if (leg.from) {
      compactLeg.f = {
        n: leg.from.name,
        lt: leg.from.lat,
        ln: leg.from.lon,
      };
    }
    if (leg.to) {
      compactLeg.t = {
        n: leg.to.name,
        lt: leg.to.lat,
        ln: leg.to.lon,
      };
    }
    if (leg.legGeometry) compactLeg.g = leg.legGeometry.points;
    if (leg.routeShortName) compactLeg.sn = leg.routeShortName;
    if (leg.routeLongName) compactLeg.ln = leg.routeLongName;

    return compactLeg;
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Build routes for one or all time periods
 */
export async function buildRoutes(
  options: BuildRoutesOptions = {}
): Promise<BuildRoutesResult> {
  const {
    period,
    mode = 'WALK',
    zones,
    limit,
    emitter,
  } = options;

  const config = getOTPConfig();

  // Validate API key for remote OTP
  if (!config.isLocal && !config.apiKey) {
    throw new Error('Missing HSL_API_KEY or DIGITRANSIT_API_KEY environment variable (required for remote API)');
  }

  // Determine which periods to process
  const periodsToRun: TimePeriod[] = period ? [period] : ['MORNING', 'EVENING', 'MIDNIGHT'];

  // Load zones with routing coordinates
  const zonesData = readZones();
  if (!zonesData) {
    throw new Error('No zones data found - run fetch first');
  }

  const placeMap = new Map(
    zonesData.zones.map((z) => [
      z.id,
      {
        id: z.id,
        lat: z.routingPoint[0],
        lon: z.routingPoint[1],
      },
    ])
  );

  // Count total tasks across all periods for cumulative progress
  let totalTasksAllPeriods = 0;
  const taskCountPerPeriod: Record<string, number> = {};

  for (const p of periodsToRun) {
    const allZoneIds = getAllZoneIds();
    let selectedZones = allZoneIds;
    if (zones) {
      selectedZones = [...allZoneIds].sort(() => Math.random() - 0.5).slice(0, zones);
    }

    let pendingCount = 0;
    for (const fromId of selectedZones) {
      const routesData = readZoneRoutes(fromId, p, mode);
      if (!routesData) continue;
      pendingCount += routesData.r.filter((r) => r.s === RouteStatus.PENDING).length;
    }

    const periodTasks = limit ? Math.min(pendingCount, limit) : pendingCount;
    taskCountPerPeriod[p] = periodTasks;
    totalTasksAllPeriods += periodTasks;
  }

  // Emit start event
  if (emitter) {
    emitter.emitStart('build_routes', totalTasksAllPeriods, undefined, {
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
  let totalPending = 0;
  let cumulativeProgress = 0;

  for (const p of periodsToRun) {
    const result = await processPeriod(
      p,
      placeMap,
      config,
      mode,
      zones,
      limit,
      emitter,
      cumulativeProgress,
      totalTasksAllPeriods
    );

    totalProcessed += result.processed;
    totalOk += result.ok;
    totalNoRoute += result.noRoute;
    totalErrors += result.errors;
    cumulativeProgress += result.processed;
  }

  // Count remaining pending routes (skip for limited runs - too slow)
  if (!zones && !limit) {
    for (const p of periodsToRun) {
      const allZoneIds = getAllZoneIds();
      for (const zoneId of allZoneIds) {
        const routesData = readZoneRoutes(zoneId, p, mode);
        if (!routesData) continue;

        totalPending += routesData.r.filter((r) => r.s === RouteStatus.PENDING).length;
      }
    }
  }

  // Store pipeline metadata
  const metadata: RouteCalculationMetadata = {
    timestamp: new Date().toISOString(),
    periods: periodsToRun,
    processed: totalProcessed,
    OK: totalOk,
    NO_ROUTE: totalNoRoute,
    ERROR: totalErrors,
    PENDING: totalPending,
  };
  updatePipelineMetadata('lastRouteCalculation', metadata);

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
