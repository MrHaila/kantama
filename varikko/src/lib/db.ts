import Database from 'better-sqlite3';
import path from 'path';

/**
 * Get database path (from env or default)
 */
export function getDBPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), '../opas/public/varikko.db');
}

/**
 * Open database connection with standard configuration
 */
export function openDB(dbPath?: string): Database.Database {
  const db = new Database(dbPath || getDBPath());

  // Standard pragmas (match current implementation)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Database statistics type
 */
export interface DBStats {
  zones: number;
  routes: {
    total: number;
    ok: number;
    pending: number;
    no_route: number;
    error: number;
  };
  timeBuckets: {
    calculated: boolean;
    count: number;
  };
  lastRun: any;
}

/**
 * Get database statistics (for status displays)
 */
export function getDBStats(db: Database.Database): DBStats {
  const placeCount = db.prepare('SELECT COUNT(*) as count FROM places').get() as { count: number };

  const routeCounts = db
    .prepare(
      `
    SELECT
      status,
      COUNT(*) as count
    FROM routes
    GROUP BY status
  `
    )
    .all() as Array<{ status: string; count: number }>;

  const timeBucketsCalculated = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
    count: number;
  };

  const lastRun = db.prepare("SELECT value FROM metadata WHERE key = 'last_fetch'").get() as
    | { value: string }
    | undefined;

  // Route counts by status
  const statusMap: Record<string, number> = {};
  for (const row of routeCounts) {
    statusMap[row.status] = row.count;
  }

  return {
    zones: placeCount.count,
    routes: {
      total: routeCounts.reduce((sum, r) => sum + r.count, 0),
      ok: statusMap['OK'] || 0,
      pending: statusMap['PENDING'] || 0,
      no_route: statusMap['NO_ROUTE'] || 0,
      error: statusMap['ERROR'] || 0,
    },
    timeBuckets: {
      calculated: timeBucketsCalculated.count === 6,
      count: timeBucketsCalculated.count,
    },
    lastRun: lastRun ? JSON.parse(lastRun.value) : null,
  };
}

/**
 * Get recent errors (for error preview)
 */
export function getRecentErrors(db: Database.Database, limit: number = 5) {
  return db
    .prepare(
      `
    SELECT from_id, to_id, time_period, legs
    FROM routes
    WHERE status = 'ERROR'
    ORDER BY ROWID DESC
    LIMIT ?
  `
    )
    .all(limit) as Array<{
    from_id: string;
    to_id: string;
    time_period: string;
    legs: string;
  }>;
}
