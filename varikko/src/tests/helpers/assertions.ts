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
export function assertAllRoutesStatus(db: Database.Database, status: string, period?: string) {
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
export function assertZoneHasRoutingCoords(db: Database.Database, zoneId: string) {
  const zone = db
    .prepare('SELECT routing_lat, routing_lon, routing_source FROM places WHERE id = ?')
    .get(zoneId) as
    | {
        routing_lat: number | null;
        routing_lon: number | null;
        routing_source: string | null;
      }
    | undefined;

  expect(zone).toBeDefined();
  if (!zone) {
    throw new Error(`Zone ${zoneId} not found`);
  }
  expect(zone.routing_lat).not.toBeNull();
  expect(zone.routing_lon).not.toBeNull();
  expect(zone.routing_source).not.toBeNull();
}

/**
 * Assert time buckets are correctly calculated
 */
export function assertTimeBucketsValid(db: Database.Database) {
  const buckets = db.prepare('SELECT * FROM time_buckets ORDER BY bucket_number').all() as Array<{
    bucket_number: number;
    min_duration: number;
    max_duration: number;
    color_hex: string;
    label: string;
  }>;

  // Should have 6 time buckets
  expect(buckets).toHaveLength(6);

  // Bucket numbers should be 1-6
  expect(buckets.map((b) => b.bucket_number)).toEqual([1, 2, 3, 4, 5, 6]);

  // Verify fixed bucket boundaries
  const expectedBuckets = [
    { number: 1, min: 0, max: 900, label: '15min' },
    { number: 2, min: 900, max: 1800, label: '30min' },
    { number: 3, min: 1800, max: 2700, label: '45min' },
    { number: 4, min: 2700, max: 3600, label: '1h' },
    { number: 5, min: 3600, max: 4500, label: '1h 15min' },
    { number: 6, min: 4500, max: -1, label: '1h 30min' },
  ];

  buckets.forEach((bucket, index) => {
    const expected = expectedBuckets[index];
    expect(bucket.bucket_number).toBe(expected.number);
    expect(bucket.min_duration).toBe(expected.min);
    expect(bucket.max_duration).toBe(expected.max);
    expect(bucket.label).toBe(expected.label);
  });

  // All should have colors
  for (const bucket of buckets) {
    expect(bucket.color_hex).toMatch(/^#[0-9a-f]{6}$/i);
  }
}

/**
 * Compare two database snapshots (for regression testing)
 */
export function assertDBMatches(
  actual: Record<string, unknown[]>,
  expected: Record<string, unknown[]>,
  options?: {
    ignoredFields?: string[];
    tables?: string[];
  }
) {
  const tables = options?.tables || ['places', 'routes', 'timeBuckets', 'metadata'];
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
