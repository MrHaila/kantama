import { expect } from 'vitest';
import type Database from 'better-sqlite3';

/**
 * Assert that database has expected number of records
 */
export function assertRecordCount(
  db: Database.Database,
  table: string,
  expected: number,
  message?: string
) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  expect(result.count, message || `Expected ${expected} records in ${table}`).toBe(expected);
}

/**
 * Assert that all routes have specific status
 */
export function assertAllRoutesStatus(
  db: Database.Database,
  status: string,
  period?: string
) {
  const query = period
    ? db.prepare('SELECT COUNT(*) as count FROM routes WHERE time_period = ? AND status != ?')
    : db.prepare('SELECT COUNT(*) as count FROM routes WHERE status != ?');

  const params = period ? [period, status] : [status];
  const result = query.get(...params) as { count: number };

  expect(result.count).toBe(0);
}

/**
 * Assert that zone has routing coordinates set
 */
export function assertZoneHasRoutingCoords(
  db: Database.Database,
  zoneId: string
) {
  const zone = db.prepare('SELECT routing_lat, routing_lon, routing_source FROM places WHERE id = ?')
    .get(zoneId) as {
      routing_lat: number | null;
      routing_lon: number | null;
      routing_source: string | null;
    } | undefined;

  expect(zone).toBeDefined();
  if (!zone) {
    throw new Error(`Zone ${zoneId} not found`);
  }
  expect(zone.routing_lat).not.toBeNull();
  expect(zone.routing_lon).not.toBeNull();
  expect(zone.routing_source).not.toBeNull();
}

/**
 * Assert deciles are correctly calculated
 */
export function assertDecilesValid(db: Database.Database) {
  const deciles = db.prepare('SELECT * FROM deciles ORDER BY decile_number').all() as Array<{
    decile_number: number;
    min_duration: number;
    max_duration: number;
    color_hex: string;
    label: string;
  }>;

  // Should have 10 deciles
  expect(deciles).toHaveLength(10);

  // Decile numbers should be 1-10
  expect(deciles.map(d => d.decile_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Ranges should be continuous (no gaps)
  for (let i = 0; i < deciles.length - 1; i++) {
    expect(deciles[i].max_duration).toBe(deciles[i + 1].min_duration - 1);
  }

  // Last decile should have max_duration = -1 (open-ended)
  expect(deciles[9].max_duration).toBe(-1);

  // All should have colors and labels
  for (const decile of deciles) {
    expect(decile.color_hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(decile.label).toBeTruthy();
  }
}

/**
 * Compare two database snapshots (for regression testing)
 */
export function assertDBMatches(actual: Record<string, unknown[]>, expected: Record<string, unknown[]>, options?: {
  ignoredFields?: string[];
  tables?: string[];
}) {
  const tables = options?.tables || ['places', 'routes', 'deciles', 'metadata'];
  const ignored = options?.ignoredFields || ['created_at'];

  for (const table of tables) {
    const actualRecords = actual[table] || [];
    const expectedRecords = expected[table] || [];

    expect(actualRecords.length, `${table} record count mismatch`).toBe(expectedRecords.length);

    for (let i = 0; i < actualRecords.length; i++) {
      const actualRecord = actualRecords[i] as Record<string, unknown>;
      const expectedRecord = expectedRecords[i] as Record<string, unknown>;

      // Remove ignored fields
      for (const field of ignored) {
        delete actualRecord[field];
        delete expectedRecord[field];
      }

      expect(actualRecord, `${table}[${i}] mismatch`).toEqual(expectedRecord);
    }
  }
}
