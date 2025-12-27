import Database from 'better-sqlite3';
import pLimit from 'p-limit';
import { ProgressEmitter } from './events';
import { fetchRoute, getOTPConfig, type BuildRoutesOptions, type BuildRoutesResult, type OTPConfig } from './routing';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CityProgress {
  city: string;
  totalZones: number;
  completedZones: number;
  currentZone?: string;
  periods: {
    [key: string]: {
      total: number;
      completed: number;
      ok: number;
      noRoute: number;
      errors: number;
    };
  };
}

export interface ZoneBatchProgress {
  currentCity: string;
  currentPeriod: string;
  currentZoneIndex: number;
  totalZones: number;
  zonesInCity: number;
  elapsed: number;
  estimatedTotal: number;
  cityProgress: CityProgress[];
}

export interface EnhancedBuildRoutesOptions extends BuildRoutesOptions {
  onCityComplete?: (city: string, results: BuildRoutesResult) => void;
}

// ============================================================================
// Zone-Based Route Processing
// ============================================================================

/**
 * Get all zones grouped by city
 */
export function getZonesByCity(db: Database.Database): Map<string, Array<{ id: string; lat: number; lon: number }>> {
  const places = db
    .prepare(
      `
      SELECT
        id,
        city,
        COALESCE(routing_lat, lat) as lat,
        COALESCE(routing_lon, lon) as lon
      FROM places
      ORDER BY city, id
    `
    )
    .all() as { id: string; city: string; lat: number; lon: number }[];

  const zonesByCity = new Map<string, Array<{ id: string; lat: number; lon: number }>>();

  for (const place of places) {
    if (!zonesByCity.has(place.city)) {
      zonesByCity.set(place.city, []);
    }
    zonesByCity.get(place.city)!.push({ id: place.id, lat: place.lat, lon: place.lon });
  }

  return zonesByCity;
}

/**
 * Get pending routes for specific zones in a period
 */
function getPendingRoutesForZones(
  db: Database.Database,
  zoneIds: string[],
  period: string
): Array<{ from_id: string; to_id: string }> {
  // Create placeholders for the IN clause
  const placeholders = zoneIds.map(() => '?').join(',');
  
  return db
    .prepare(
      `
      SELECT from_id, to_id
      FROM routes
      WHERE status = 'PENDING' 
        AND time_period = ?
        AND from_id IN (${placeholders})
        AND to_id IN (${placeholders})
    `
    )
    .all(period, ...zoneIds, ...zoneIds) as { from_id: string; to_id: string }[];
}

/**
 * Process routes for a single city and period
 */
async function processCityPeriod(
  db: Database.Database,
  city: string,
  zones: Array<{ id: string; lat: number; lon: number }>,
  period: string,
  config: OTPConfig,
  emitter?: ProgressEmitter
): Promise<{ processed: number; ok: number; noRoute: number; errors: number }> {
  const targetTime = {
    MORNING: '08:30:00',
    EVENING: '17:30:00',
    MIDNIGHT: '23:30:00',
  }[period] || '08:30:00';

  const zoneIds = zones.map(z => z.id);
  const placeMap = new Map(zones.map(z => [z.id, { lat: z.lat, lon: z.lon }]));

  // Get pending routes for this city/period
  const pendingRoutes = getPendingRoutesForZones(db, zoneIds, period);

  if (pendingRoutes.length === 0) {
    return { processed: 0, ok: 0, noRoute: 0, errors: 0 };
  }

  const updateStmt = db.prepare(`
    UPDATE routes
    SET duration = ?, numberOfTransfers = ?, walkDistance = ?, legs = ?, status = ?
    WHERE from_id = ? AND to_id = ? AND time_period = ?
  `);

  const limit = pLimit(config.concurrency);
  const startTime = Date.now();

  let completed = 0;
  let okCount = 0;
  let noRouteCount = 0;
  let errorCount = 0;

  // Process routes in smaller batches for better progress feedback
  const batchSize = Math.min(100, pendingRoutes.length);
  for (let i = 0; i < pendingRoutes.length; i += batchSize) {
    const batch = pendingRoutes.slice(i, i + batchSize);
    
    const promises = batch.map((task) => limit(async () => {
      const from = placeMap.get(task.from_id);
      const to = placeMap.get(task.to_id);

      if (!from || !to) {
        errorCount++;
        completed++;
        return;
      }

      // Rate limiting for remote API
      if (!config.isLocal && config.rateLimitDelay > 0) {
        await new Promise(r => setTimeout(r, Math.random() * config.rateLimitDelay));
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
    }));

    await Promise.all(promises);

    // Emit progress after each batch
    if (emitter) {
      const elapsed = Date.now() - startTime;
      const avgTimePerRoute = elapsed / completed;
      const remaining = pendingRoutes.length - completed;
      const eta = remaining * avgTimePerRoute;

      emitter.emitProgress('build_routes', completed, pendingRoutes.length, 
        `Processing ${city} (${period}) - ${completed}/${pendingRoutes.length} routes`, {
          city,
          period,
          elapsed,
          eta,
          ok: okCount,
          noRoute: noRouteCount,
          errors: errorCount,
        });
    }
  }

  return {
    processed: completed,
    ok: okCount,
    noRoute: noRouteCount,
    errors: errorCount,
  };
}

/**
 * Build routes using zone-by-zone approach
 */
export async function buildRoutesByZone(
  db: Database.Database,
  options: EnhancedBuildRoutesOptions = {}
): Promise<BuildRoutesResult> {
  const {
    period,
    testMode = false,
    emitter,
    onCityComplete,
  } = options;

  const config = getOTPConfig();
  const startTime = Date.now();

  // Validate API key for remote OTP
  if (!config.isLocal && !config.apiKey) {
    throw new Error('Missing HSL_API_KEY or DIGITRANSIT_API_KEY environment variable');
  }

  // Get zones grouped by city
  const zonesByCity = getZonesByCity(db);
  const cities = Array.from(zonesByCity.keys());
  
  // Determine which periods to process
  const periodsToRun = period ? [period] : ['MORNING', 'EVENING', 'MIDNIGHT'];

  // Emit start event with city information
  if (emitter) {
    emitter.emitStart('build_routes', undefined, 'Starting zone-based route calculation...', {
      cities,
      periods: periodsToRun,
      totalZones: Array.from(zonesByCity.values()).reduce((sum, zones) => sum + zones.length, 0),
      isLocal: config.isLocal,
      concurrency: config.concurrency,
      testMode,
    });
  }

  // Process each city
  let totalProcessed = 0;
  let totalOk = 0;
  let totalNoRoute = 0;
  let totalErrors = 0;

  for (const city of cities) {
    const zones = zonesByCity.get(city)!;
    
    if (emitter) {
      emitter.emitProgress('build_routes', 0, 0, `Starting ${city}...`, {
        currentCity: city,
        zonesInCity: zones.length,
      });
    }

    let cityProcessed = 0;
    let cityOk = 0;
    let cityNoRoute = 0;
    let cityErrors = 0;

    // Process each period for this city
    for (const p of periodsToRun) {
      const result = await processCityPeriod(db, city, zones, p, config, emitter);
      
      cityProcessed += result.processed;
      cityOk += result.ok;
      cityNoRoute += result.noRoute;
      cityErrors += result.errors;

      // Store city-level progress
      db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
        `progress_${city}_${p}`,
        JSON.stringify({
          completed: result.processed,
          total: result.processed, // All pending routes for this city/period
          lastUpdate: new Date().toISOString(),
        })
      );
    }

    // Emit city completion
    if (emitter) {
      const elapsed = Date.now() - startTime;
      emitter.emitProgress('build_routes', 
        cities.indexOf(city) + 1, 
        cities.length, 
        `Completed ${city}: ${cityProcessed} routes processed`,
        {
          cityCompleted: city,
          cityResults: {
            processed: cityProcessed,
            ok: cityOk,
            noRoute: cityNoRoute,
            errors: cityErrors,
          },
          elapsed,
        });
    }

    // Call callback if provided
    if (onCityComplete) {
      onCityComplete(city, {
        processed: cityProcessed,
        ok: cityOk,
        noRoute: cityNoRoute,
        errors: cityErrors,
      });
    }

    totalProcessed += cityProcessed;
    totalOk += cityOk;
    totalNoRoute += cityNoRoute;
    totalErrors += cityErrors;
  }

  // Store final metadata
  const totalElapsed = Date.now() - startTime;
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'last_route_calculation',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      periods: periodsToRun,
      processed: totalProcessed,
      ok: totalOk,
      noRoute: totalNoRoute,
      errors: totalErrors,
      testMode,
      elapsed: totalElapsed,
      zoneBased: true,
    })
  );

  // Emit complete event
  if (emitter) {
    emitter.emitComplete('build_routes', 
      `Completed all cities: ${totalProcessed} routes processed in ${Math.round(totalElapsed / 1000)}s`, {
      processed: totalProcessed,
      ok: totalOk,
      noRoute: totalNoRoute,
      errors: totalErrors,
      elapsed: totalElapsed,
    });
  }

  return {
    processed: totalProcessed,
    ok: totalOk,
    noRoute: totalNoRoute,
    errors: totalErrors,
  };
}

/**
 * Resume route calculation from last completed city/period
 */
export async function resumeRoutesByZone(
  db: Database.Database,
  options: EnhancedBuildRoutesOptions = {}
): Promise<BuildRoutesResult> {
  const { period, testMode = false, emitter } = options;
  const config = getOTPConfig();

  // Validate API key for remote OTP
  if (!config.isLocal && !config.apiKey) {
    throw new Error('Missing HSL_API_KEY or DIGITRANSIT_API_KEY environment variable');
  }

  // Get zones grouped by city
  const zonesByCity = getZonesByCity(db);
  const cities = Array.from(zonesByCity.keys());
  const periodsToRun = period ? [period] : ['MORNING', 'EVENING', 'MIDNIGHT'];

  // Check which cities/periods are already completed
  const completed: Set<string> = new Set();
  for (const city of cities) {
    for (const p of periodsToRun) {
      const progressKey = `progress_${city}_${p}`;
      const progress = db.prepare('SELECT value FROM metadata WHERE key = ?').get(progressKey) as { value: string } | undefined;
      
      if (progress) {
        // Check if all routes for this city/period are completed
        const totalRoutes = db.prepare(`
          SELECT COUNT(*) as count 
          FROM routes 
          WHERE from_id IN (SELECT id FROM places WHERE city = ?) 
            AND to_id IN (SELECT id FROM places WHERE city = ?) 
            AND time_period = ?
        `).get(city, city, p) as { count: number };
        
        const completedRoutes = db.prepare(`
          SELECT COUNT(*) as count 
          FROM routes 
          WHERE from_id IN (SELECT id FROM places WHERE city = ?) 
            AND to_id IN (SELECT id FROM places WHERE city = ?) 
            AND time_period = ? 
            AND status != 'PENDING'
        `).get(city, city, p) as { count: number };
        
        if (completedRoutes.count === totalRoutes.count) {
          completed.add(`${city}_${p}`);
        }
      }
    }
  }

  if (emitter) {
    emitter.emitStart('build_routes', undefined, 'Resuming zone-based route calculation...', {
      cities,
      periods: periodsToRun,
      completed: Array.from(completed),
      totalZones: Array.from(zonesByCity.values()).reduce((sum, zones) => sum + zones.length, 0),
      isLocal: config.isLocal,
      concurrency: config.concurrency,
      testMode,
    });
  }

  // Filter out completed city/period combinations
  const remainingTasks: Array<{ city: string; period: string }> = [];
  for (const city of cities) {
    for (const p of periodsToRun) {
      if (!completed.has(`${city}_${p}`)) {
        remainingTasks.push({ city, period: p });
      }
    }
  }

  if (remainingTasks.length === 0) {
    if (emitter) {
      emitter.emitComplete('build_routes', 'All routes already completed!');
    }
    return { processed: 0, ok: 0, noRoute: 0, errors: 0 };
  }

  // Process remaining tasks
  let totalProcessed = 0;
  let totalOk = 0;
  let totalNoRoute = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  for (const task of remainingTasks) {
    const zones = zonesByCity.get(task.city)!;
    
    if (emitter) {
      emitter.emitProgress('build_routes', 0, 0, `Resuming ${task.city} (${task.period})...`, {
        currentCity: task.city,
        zonesInCity: zones.length,
        resuming: true,
      });
    }

    const result = await processCityPeriod(db, task.city, zones, task.period, config, emitter);
    
    totalProcessed += result.processed;
    totalOk += result.ok;
    totalNoRoute += result.noRoute;
    totalErrors += result.errors;

    // Store progress
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
      `progress_${task.city}_${task.period}`,
      JSON.stringify({
        completed: result.processed,
        total: result.processed,
        lastUpdate: new Date().toISOString(),
      })
    );
  }

  // Store final metadata
  const totalElapsed = Date.now() - startTime;
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'last_route_calculation',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      periods: periodsToRun,
      processed: totalProcessed,
      ok: totalOk,
      noRoute: totalNoRoute,
      errors: totalErrors,
      testMode,
      elapsed: totalElapsed,
      zoneBased: true,
      resumed: true,
    })
  );

  if (emitter) {
    emitter.emitComplete('build_routes', 
      `Resumed calculation complete: ${totalProcessed} routes processed in ${Math.round(totalElapsed / 1000)}s`, {
      processed: totalProcessed,
      ok: totalOk,
      noRoute: totalNoRoute,
      errors: totalErrors,
      elapsed: totalElapsed,
    });
  }

  return {
    processed: totalProcessed,
    ok: totalOk,
    noRoute: totalNoRoute,
    errors: totalErrors,
  };
}
