import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDB } from '../helpers/db.js';
import { clearData, getCounts } from '../../lib/clearing.js';
import { initializeSchema } from '../../lib/zones.js';

describe('clearing', () => {
  describe('getCounts', () => {
    it('should return counts of all tables', () => {
      const { db, cleanup } = createTestDB();
      try {
        initializeSchema(db);

        // Insert test data
        db.prepare(
          `INSERT INTO places (id, name, routing_lat, routing_lon, geometry, svg_path)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('00100', 'Test Zone 1', 60.1699, 24.9384, '{}', 'M0,0');

        db.prepare(
          `INSERT INTO places (id, name, routing_lat, routing_lon, geometry, svg_path)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('00200', 'Test Zone 2', 60.1799, 24.9484, '{}', 'M1,1');

        db.prepare(
          `INSERT INTO routes (from_id, to_id, time_period) VALUES (?, ?, ?)`
        ).run('00100', '00200', 'MORNING');

        db.prepare(
          `INSERT INTO metadata (key, value) VALUES (?, ?)`
        ).run('test_key', 'test_value');

        db.prepare(
          `INSERT INTO deciles (decile_number, min_duration, max_duration, color_hex, label) VALUES (?, ?, ?, ?, ?)`
        ).run(1, 0, 10, '#ff0000', '0-10 min');

        const counts = getCounts(db);

        expect(counts.places).toBe(2);
        expect(counts.routes).toBe(1);
        expect(counts.metadata).toBe(1);
        expect(counts.deciles).toBe(1);
      } finally {
        cleanup();
      }
    });

    it('should return 0 for non-existent tables', () => {
      const { db, cleanup } = createTestDB();
      try {
        // Don't initialize schema
        const counts = getCounts(db);

        expect(counts.places).toBe(0);
        expect(counts.routes).toBe(0);
        expect(counts.metadata).toBe(0);
        expect(counts.deciles).toBe(0);
      } finally {
        cleanup();
      }
    });
  });

  describe('clearData', () => {
    let db: ReturnType<typeof createTestDB>['db'];
    let cleanup: ReturnType<typeof createTestDB>['cleanup'];

    beforeEach(() => {
      const testDB = createTestDB();
      db = testDB.db;
      cleanup = testDB.cleanup;

      // Initialize schema and insert test data
      initializeSchema(db);

      db.prepare(
        `INSERT INTO places (id, name, routing_lat, routing_lon, geometry, svg_path)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('00100', 'Test Zone 1', 60.1699, 24.9384, '{}', 'M0,0');

      db.prepare(
        `INSERT INTO places (id, name, routing_lat, routing_lon, geometry, svg_path)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('00200', 'Test Zone 2', 60.1799, 24.9484, '{}', 'M1,1');

      db.prepare(
        `INSERT INTO routes (from_id, to_id, time_period, status, duration, numberOfTransfers, walkDistance, legs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('00100', '00200', 'MORNING', 'OK', 1200, 1, 500, '[]');

      db.prepare(
        `INSERT INTO routes (from_id, to_id, time_period, status)
         VALUES (?, ?, ?, ?)`
      ).run('00200', '00100', 'MORNING', 'PENDING');

      db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run('test_key', 'test_value');

      db.prepare(
        `INSERT INTO deciles (decile_number, min_duration, max_duration, color_hex, label) VALUES (?, ?, ?, ?, ?)`
      ).run(1, 0, 10, '#ff0000', '0-10 min');
    });

    afterEach(() => {
      if (cleanup) cleanup();
    });

    it('should clear all data by default', () => {
      const result = clearData(db, {});

      expect(result.deleted.places).toBe(2);
      expect(result.deleted.routes).toBe(2);
      expect(result.deleted.metadata).toBe(1);
      expect(result.deleted.deciles).toBe(1);

      const counts = getCounts(db);
      expect(counts.places).toBe(0);
      expect(counts.routes).toBe(0);
      expect(counts.metadata).toBe(0);
      expect(counts.deciles).toBe(0);
    });

    it('should reset routes to PENDING when routes flag is set', () => {
      const result = clearData(db, { routes: true });

      expect(result.deleted.routes).toBe(2); // Both routes updated
      expect(result.deleted.places).toBeUndefined();
      expect(result.deleted.metadata).toBeUndefined();

      // Routes should still exist but with PENDING status
      const routes = db.prepare('SELECT * FROM routes').all() as Array<{
        status: string;
        duration: number | null;
        numberOfTransfers: number | null;
        walkDistance: number | null;
        legs: string | null;
      }>;
      expect(routes).toHaveLength(2);
      expect(routes.every((r) => r.status === 'PENDING')).toBe(true);
      expect(routes.every((r) => r.duration === null)).toBe(true);
      expect(routes.every((r) => r.numberOfTransfers === null)).toBe(true);
      expect(routes.every((r) => r.walkDistance === null)).toBe(true);
      expect(routes.every((r) => r.legs === null)).toBe(true);

      // Places should remain untouched
      const places = db.prepare('SELECT * FROM places').all();
      expect(places).toHaveLength(2);
    });

    it('should clear places and routes when places flag is set', () => {
      const result = clearData(db, { places: true });

      expect(result.deleted.places).toBe(2);
      expect(result.deleted.routes).toBe(2);
      expect(result.deleted.metadata).toBeUndefined();

      const counts = getCounts(db);
      expect(counts.places).toBe(0);
      expect(counts.routes).toBe(0);
      expect(counts.metadata).toBe(1); // Metadata should remain
      expect(counts.deciles).toBe(1); // Deciles should remain
    });

    it('should clear metadata when metadata flag is set', () => {
      const result = clearData(db, { metadata: true });

      expect(result.deleted.metadata).toBe(1);
      expect(result.deleted.places).toBeUndefined();
      expect(result.deleted.routes).toBeUndefined();

      const counts = getCounts(db);
      expect(counts.metadata).toBe(0);
      expect(counts.places).toBe(2); // Places should remain
      expect(counts.routes).toBe(2); // Routes should remain
    });

    it('should clear deciles when deciles flag is set', () => {
      const result = clearData(db, { deciles: true });

      expect(result.deleted.deciles).toBe(1);
      expect(result.deleted.places).toBeUndefined();
      expect(result.deleted.routes).toBeUndefined();

      const counts = getCounts(db);
      expect(counts.deciles).toBe(0);
      expect(counts.places).toBe(2); // Places should remain
      expect(counts.routes).toBe(2); // Routes should remain
    });

    it('should clear multiple specific tables when multiple flags are set', () => {
      const result = clearData(db, { metadata: true, deciles: true });

      expect(result.deleted.metadata).toBe(1);
      expect(result.deleted.deciles).toBe(1);
      expect(result.deleted.places).toBeUndefined();
      expect(result.deleted.routes).toBeUndefined();

      const counts = getCounts(db);
      expect(counts.metadata).toBe(0);
      expect(counts.deciles).toBe(0);
      expect(counts.places).toBe(2); // Places should remain
      expect(counts.routes).toBe(2); // Routes should remain
    });

    it('should emit progress events', () => {
      const events: Array<{ type: string; stage: string; message?: string }> = [];

      const mockEmitter = {
        emitStart: (stage: string, metadata?: Record<string, unknown>) => {
          events.push({ type: 'start', stage, message: JSON.stringify(metadata) });
        },
        emitProgress: (
          stage: string,
          _current?: number,
          _total?: number,
          message?: string
        ) => {
          events.push({ type: 'progress', stage, message });
        },
        emitComplete: (stage: string, message?: string) => {
          events.push({ type: 'complete', stage, message });
        },
        emitError: (stage: string, message: string) => {
          events.push({ type: 'error', stage, message });
        },
      };

      clearData(db, { emitter: mockEmitter as never });

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ type: 'start', stage: 'clear_data' });
      expect(events[1]).toMatchObject({
        type: 'complete',
        stage: 'clear_data',
        message: 'Cleared data successfully',
      });
    });
  });
});
