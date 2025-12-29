import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDB, seedDB } from '../helpers/db';
import { getDBStats, getRecentErrors } from '../../lib/db';
import { loadZonesFixture, loadRoutesFixture } from '../helpers/fixtures';

// NOTE: DB utility functions are obsolete after refactoring to file-based storage
// Skipping these tests until the module is removed or refactored
describe.skip('db utilities', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should get database stats', () => {
    seedDB(testDB.db, {
      places: loadZonesFixture('5-zones'),
      routes: loadRoutesFixture('sample-routes'),
    });

    const stats = getDBStats(testDB.db);

    expect(stats.zones).toBe(5);
    expect(stats.routes.total).toBeGreaterThan(0);
  });

  it('should get recent errors', () => {
    seedDB(testDB.db, {
      places: loadZonesFixture('5-zones'),
      routes: loadRoutesFixture('edge-cases'),
    });

    const errors = getRecentErrors(testDB.db, 5);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty('from_id');
    expect(errors[0]).toHaveProperty('legs');
  });
});
