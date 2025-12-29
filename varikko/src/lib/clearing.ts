import type Database from 'better-sqlite3';
import type { ProgressEmitter } from './events.js';

export interface ClearOptions {
  force?: boolean;
  routes?: boolean; // Reset routes to PENDING
  places?: boolean; // Clear places AND routes
  metadata?: boolean; // Clear metadata
  timeBuckets?: boolean; // Clear time buckets
  emitter?: ProgressEmitter;
}

export interface ClearResult {
  deleted: {
    routes?: number;
    places?: number;
    metadata?: number;
    timeBuckets?: number;
  };
}

/**
 * Clear database data based on options
 *
 * Behavior:
 * - If no flags specified: clears ALL data (routes, places, metadata, time_buckets)
 * - If --routes: resets route status to PENDING (doesn't delete)
 * - If --places: deletes places AND routes (cascade)
 * - If --metadata: deletes metadata
 * - If --time-buckets: deletes time buckets
 *
 * Always runs VACUUM after clearing to reclaim disk space.
 */
export function clearData(db: Database.Database, options: ClearOptions = {}): ClearResult {
  const { routes, places, metadata, timeBuckets, emitter } = options;

  // Default to clearing everything if no specific flags
  const clearAll = !routes && !places && !metadata && !timeBuckets;

  const result: ClearResult = {
    deleted: {},
  };

  try {
    const operation = clearAll
      ? 'all'
      : [
          routes && 'routes',
          places && 'places',
          metadata && 'metadata',
          timeBuckets && 'time_buckets',
        ]
          .filter(Boolean)
          .join(', ');

    emitter?.emitStart('clear_data', undefined, `Clearing ${operation}...`);

    db.pragma('foreign_keys = ON');

    if (clearAll) {
      // Clear all data
      const routesCount = db.prepare('SELECT COUNT(*) as count FROM routes').get() as {
        count: number;
      };
      const placesCount = db.prepare('SELECT COUNT(*) as count FROM places').get() as {
        count: number;
      };
      const metadataCount = db.prepare('SELECT COUNT(*) as count FROM metadata').get() as {
        count: number;
      };
      const timeBucketsCount = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
        count: number;
      };

      db.prepare('DELETE FROM routes').run();
      db.prepare('DELETE FROM places').run();
      db.prepare('DELETE FROM metadata').run();
      db.prepare('DELETE FROM time_buckets').run();

      result.deleted.routes = routesCount.count;
      result.deleted.places = placesCount.count;
      result.deleted.metadata = metadataCount.count;
      result.deleted.timeBuckets = timeBucketsCount.count;
    } else {
      // Selective clearing
      if (routes) {
        // Reset routes to PENDING (doesn't delete)
        const info = db
          .prepare(
            `
          UPDATE routes
          SET duration = NULL,
              numberOfTransfers = NULL,
              walkDistance = NULL,
              legs = NULL,
              status = 'PENDING'
        `
          )
          .run();
        result.deleted.routes = info.changes;
      }

      if (places) {
        // Delete places AND routes (cascade)
        const routesCount = db.prepare('SELECT COUNT(*) as count FROM routes').get() as {
          count: number;
        };
        const placesCount = db.prepare('SELECT COUNT(*) as count FROM places').get() as {
          count: number;
        };

        db.prepare('DELETE FROM routes').run();
        db.prepare('DELETE FROM places').run();

        result.deleted.routes = routesCount.count;
        result.deleted.places = placesCount.count;
      }

      if (metadata) {
        const metadataCount = db.prepare('SELECT COUNT(*) as count FROM metadata').get() as {
          count: number;
        };
        db.prepare('DELETE FROM metadata').run();
        result.deleted.metadata = metadataCount.count;
      }

      if (timeBuckets) {
        const timeBucketsCount = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
          count: number;
        };
        db.prepare('DELETE FROM time_buckets').run();
        result.deleted.timeBuckets = timeBucketsCount.count;
      }
    }

    // Run VACUUM to reclaim disk space
    db.exec('VACUUM');

    emitter?.emitComplete('clear_data', `Cleared data successfully`, result);

    return result;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error during clearing');
    emitter?.emitError('clear_data', err);
    throw error;
  }
}

/**
 * Get counts of records in each table for display
 */
export function getCounts(db: Database.Database): {
  routes: number;
  places: number;
  metadata: number;
  timeBuckets: number;
} {
  try {
    const routesCount = db.prepare('SELECT COUNT(*) as count FROM routes').get() as {
      count: number;
    };
    const placesCount = db.prepare('SELECT COUNT(*) as count FROM places').get() as {
      count: number;
    };
    const metadataCount = db.prepare('SELECT COUNT(*) as count FROM metadata').get() as {
      count: number;
    };
    const timeBucketsCount = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
      count: number;
    };

    return {
      routes: routesCount.count,
      places: placesCount.count,
      metadata: metadataCount.count,
      timeBuckets: timeBucketsCount.count,
    };
  } catch (_error) {
    // If tables don't exist, return 0
    return {
      routes: 0,
      places: 0,
      metadata: 0,
      timeBuckets: 0,
    };
  }
}
