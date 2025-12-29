import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { calculateTimeBuckets } from '../../lib/time-buckets.js';
import { ProgressEmitter } from '../../lib/events.js';
import { createTestDB } from '../helpers/db.js';

describe('calculateTimeBuckets', () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestDB();
    db = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  function insertTestRoutes(durations: number[]) {
    const numPlaces = Math.max(10, Math.ceil(Math.sqrt(durations.length / 3)));

    const insertPlace = db.prepare(`
      INSERT INTO places (id, name, lat, lon, routing_lat, routing_lon, geometry, svg_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < numPlaces; i++) {
      insertPlace.run(
        `00${100 + i}`,
        `Zone ${i}`,
        60.0 + i * 0.01,
        24.0 + i * 0.01,
        60.0 + i * 0.01,
        24.0 + i * 0.01,
        JSON.stringify({ type: 'Point', coordinates: [24.0 + i * 0.01, 60.0 + i * 0.01] }),
        'M 0 0 L 10 10'
      );
    }

    const insertRoute = db.prepare(`
      INSERT INTO routes (from_id, to_id, time_period, status, duration)
      VALUES (?, ?, ?, ?, ?)
    `);

    const periods = ['MORNING', 'EVENING', 'MIDNIGHT'];

    durations.forEach((duration, index) => {
      const fromIndex = Math.floor(index / (numPlaces * 3)) % numPlaces;
      const toIndex = (fromIndex + 1 + Math.floor(index / 3)) % numPlaces;
      const periodIndex = index % 3;

      const fromId = `00${100 + fromIndex}`;
      const toId = `00${100 + toIndex}`;
      const period = periods[periodIndex];

      insertRoute.run(fromId, toId, period, 'OK', duration);
    });
  }

  describe('basic functionality', () => {
    it('should create 6 fixed time buckets', () => {
      // Create routes with various durations
      const durations = [
        300,
        600,
        900, // 5, 10, 15 min
        1200,
        1500,
        1800, // 20, 25, 30 min
        2100,
        2400,
        2700, // 35, 40, 45 min
        3000,
        3300,
        3600, // 50, 55, 60 min
        3900,
        4200,
        4500, // 65, 70, 75 min
        4800,
        5100,
        5400, // 80, 85, 90 min
      ];
      insertTestRoutes(durations);

      const result = calculateTimeBuckets(db);

      expect(result.timeBuckets).toHaveLength(6);

      // Verify bucket structure
      const expectedBuckets = [
        { number: 1, min: 0, max: 900, label: '15min' },
        { number: 2, min: 900, max: 1800, label: '30min' },
        { number: 3, min: 1800, max: 2700, label: '45min' },
        { number: 4, min: 2700, max: 3600, label: '1h' },
        { number: 5, min: 3600, max: 4500, label: '1h 15min' },
        { number: 6, min: 4500, max: -1, label: '1h 30min' }, // Last bucket is open-ended
      ];

      result.timeBuckets.forEach((bucket, index) => {
        const expected = expectedBuckets[index];
        expect(bucket.number).toBe(expected.number);
        expect(bucket.min).toBe(expected.min);
        expect(bucket.max).toBe(expected.max);
        expect(bucket.label).toBe(expected.label);
        expect(bucket.color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should store buckets in database', () => {
      const durations = [600, 1200, 1800];
      insertTestRoutes(durations);

      calculateTimeBuckets(db);

      const storedBuckets = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
        count: number;
      };
      expect(storedBuckets.count).toBe(6);

      // Verify metadata stored
      const metadata = db
        .prepare("SELECT value FROM metadata WHERE key = 'time_buckets_calculated_at'")
        .get() as { value: string } | undefined;

      expect(metadata).toBeDefined();
      expect(metadata!.value).toBeTruthy();
    });

    it('should assign colors from palette', () => {
      const durations = [600];
      insertTestRoutes(durations);

      const result = calculateTimeBuckets(db);

      const expectedColors = [
        '#1b9e77', // Vibrant Green - 0-15min (Fastest/Good)
        '#66c2a5', // Light Green - 15-30min
        '#fc8d62', // Light Orange - 30-45min
        '#8da0cb', // Soft Blue - 45-60min
        '#4574b4', // Medium Blue - 60-75min
        '#1e3a8a', // Deep Blue - 75-90min+ (Slowest/Far)
      ];

      result.timeBuckets.forEach((bucket, index) => {
        expect(bucket.color).toBe(expectedColors[index]);
      });
    });
  });

  describe('error handling', () => {
    it('should throw error if no successful routes exist', () => {
      expect(() => {
        calculateTimeBuckets(db);
      }).toThrow('No successful routes found');
    });

    it('should throw error if buckets already exist (without force)', () => {
      const durations = [600];
      insertTestRoutes(durations);

      // First calculation
      calculateTimeBuckets(db);

      // Second calculation without force should fail
      expect(() => {
        calculateTimeBuckets(db);
      }).toThrow('Time buckets already exist');
    });

    it('should recalculate if force=true', () => {
      const durations = [600];
      insertTestRoutes(durations);

      // First calculation
      calculateTimeBuckets(db);

      // Second calculation with force should succeed
      expect(() => {
        calculateTimeBuckets(db, { force: true });
      }).not.toThrow();

      const storedBuckets = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
        count: number;
      };
      expect(storedBuckets.count).toBe(6);
    });
  });

  describe('progress reporting', () => {
    it('should emit progress events', () => {
      const durations = [600, 1200];
      insertTestRoutes(durations);

      const emitter = new ProgressEmitter();
      const events: string[] = [];

      emitter.on('progress', (event) => {
        events.push(event.type);
      });

      calculateTimeBuckets(db, { emitter });

      expect(events).toContain('start');
      expect(events).toContain('progress');
      expect(events).toContain('complete');
    });

    it('should emit error events on failure', () => {
      const emitter = new ProgressEmitter();
      let errorEmitted = false;

      emitter.on('progress', (event) => {
        if (event.type === 'error') {
          errorEmitted = true;
        }
      });

      expect(() => {
        calculateTimeBuckets(db, { emitter });
      }).toThrow();

      expect(errorEmitted).toBe(true);
    });
  });

  describe('bucket boundaries', () => {
    it('should handle routes at bucket boundaries correctly', () => {
      // Test exact boundary values
      const durations = [
        900, // Exactly 15 min - should be in bucket 1 or 2?
        1800, // Exactly 30 min
        2700, // Exactly 45 min
        3600, // Exactly 60 min
        4500, // Exactly 75 min
        5400, // Exactly 90 min
      ];
      insertTestRoutes(durations);

      const result = calculateTimeBuckets(db);

      // Verify all buckets were created
      expect(result.timeBuckets).toHaveLength(6);

      // Verify bucket ranges
      const bucket1 = result.timeBuckets[0];
      const bucket6 = result.timeBuckets[5];

      expect(bucket1.min).toBe(0);
      expect(bucket1.max).toBe(900);
      expect(bucket6.min).toBe(4500);
      expect(bucket6.max).toBe(-1); // Open-ended
    });

    it('should handle very short routes', () => {
      const durations = [60, 120, 180]; // 1, 2, 3 minutes
      insertTestRoutes(durations);

      const result = calculateTimeBuckets(db);

      const bucket1 = result.timeBuckets[0];
      expect(bucket1.min).toBe(0);
      expect(bucket1.max).toBe(900);
    });

    it('should handle very long routes in last bucket', () => {
      const durations = [6000, 7200, 9000]; // 100, 120, 150 minutes
      insertTestRoutes(durations);

      const result = calculateTimeBuckets(db);

      const bucket6 = result.timeBuckets[5];
      expect(bucket6.min).toBe(4500); // 75 min
      expect(bucket6.max).toBe(-1); // Open-ended (captures all >75min)
      expect(bucket6.label).toBe('1h 30min');
    });
  });
});
