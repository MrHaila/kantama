import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { calculateDeciles } from '../../lib/deciles.js';
import { ProgressEmitter } from '../../lib/events.js';
import { createTestDB } from '../helpers/db.js';

describe('calculateDeciles', () => {
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
    // Insert enough test places to accommodate all routes
    // We need enough places to create unique (from, to, period) combinations
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

    // Insert routes with specified durations
    const insertRoute = db.prepare(`
      INSERT INTO routes (from_id, to_id, time_period, status, duration)
      VALUES (?, ?, ?, ?, ?)
    `);

    const periods = ['MORNING', 'EVENING', 'MIDNIGHT'];

    durations.forEach((duration, index) => {
      // Create a unique route by varying from, to, and period
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
    it('should calculate deciles for typical dataset (100 routes)', () => {
      // Create 100 routes with durations from 600s to 6000s (10-100 minutes)
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      expect(result.deciles).toHaveLength(10);

      // Verify each decile
      result.deciles.forEach((decile, index) => {
        expect(decile.number).toBe(index + 1);
        expect(decile.min).toBeGreaterThanOrEqual(600);
        expect(decile.color).toMatch(/^#[0-9A-F]{6}$/i);
        expect(decile.label).toMatch(/^\d+(-\d+)? min$|^>\d+ min$/);

        // Last decile should have max = -1 (open-ended)
        if (index === 9) {
          expect(decile.max).toBe(-1);
        } else {
          expect(decile.max).toBeGreaterThan(decile.min);
        }
      });

      // Verify deciles stored in database
      const storedDeciles = db.prepare('SELECT COUNT(*) as count FROM deciles').get() as {
        count: number;
      };
      expect(storedDeciles.count).toBe(10);

      // Verify metadata stored
      const metadata = db
        .prepare("SELECT value FROM metadata WHERE key = 'deciles_calculated_at'")
        .get() as { value: string } | undefined;
      expect(metadata).toBeDefined();
      expect(metadata?.value).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date format
    });

    it('should assign correct colors in order', () => {
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      // Verify color progression (should be vintage palette)
      const expectedColors = [
        '#E76F51',
        '#F4A261',
        '#F9C74F',
        '#90BE6D',
        '#43AA8B',
        '#277DA1',
        '#4D5061',
        '#6C5B7B',
        '#8B5A8C',
        '#355C7D',
      ];

      result.deciles.forEach((decile, index) => {
        expect(decile.color).toBe(expectedColors[index]);
      });
    });

    it('should generate correct labels', () => {
      // Durations: 600, 1200, 1800, ..., 6000 (10, 20, 30, ..., 100 minutes)
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      // First decile should have specific label
      expect(result.deciles[0].label).toMatch(/^\d+-\d+ min$/);

      // Last decile should be open-ended
      expect(result.deciles[9].label).toMatch(/^>\d+ min$/);
    });
  });

  describe('edge cases', () => {
    it('should handle exactly 10 routes (1 per decile)', () => {
      const durations = [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000];
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      expect(result.deciles).toHaveLength(10);

      // Each decile should have exactly 1 route
      result.deciles.forEach((decile, index) => {
        expect(decile.min).toBe(durations[index]);
        if (index < 9) {
          // First 9 deciles should have max equal to min (only 1 route)
          expect(decile.max).toBe(durations[index]);
        } else {
          // Last decile should be open-ended
          expect(decile.max).toBe(-1);
        }
      });
    });

    it('should handle less than 10 routes', () => {
      const durations = [600, 1200, 1800, 2400, 3000];
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      expect(result.deciles).toHaveLength(10);

      // Some deciles will be empty or have 1 route
      // First few deciles should have valid data
      expect(result.deciles[0].min).toBe(600);
    });

    it('should handle uneven distribution (97 routes)', () => {
      const durations = Array.from({ length: 97 }, (_, i) => 600 + i * 50);
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      expect(result.deciles).toHaveLength(10);

      // Verify no gaps between deciles
      for (let i = 0; i < 9; i++) {
        const currentMax = result.deciles[i].max;
        const nextMin = result.deciles[i + 1].min;
        // Next decile should start at or after current decile ends
        expect(nextMin).toBeGreaterThanOrEqual(currentMax);
      }
    });

    it('should throw error if no successful routes exist', () => {
      // Database has no routes
      expect(() => calculateDeciles(db)).toThrow(
        'No successful routes found. Please run route calculation first.'
      );
    });

    it('should throw error if routes exist but none are successful', () => {
      // Insert places
      const insertPlace = db.prepare(`
        INSERT INTO places (id, name, lat, lon, routing_lat, routing_lon, geometry, svg_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertPlace.run(
        '00101',
        'Zone 1',
        60.0,
        24.0,
        60.0,
        24.0,
        JSON.stringify({ type: 'Point', coordinates: [24.0, 60.0] }),
        'M 0 0'
      );
      insertPlace.run(
        '00102',
        'Zone 2',
        60.01,
        24.01,
        60.01,
        24.01,
        JSON.stringify({ type: 'Point', coordinates: [24.01, 60.01] }),
        'M 0 0'
      );

      // Insert routes with non-OK status
      const insertRoute = db.prepare(`
        INSERT INTO routes (from_id, to_id, time_period, status)
        VALUES (?, ?, ?, ?)
      `);
      insertRoute.run('00101', '00102', 'MORNING', 'PENDING');
      insertRoute.run('00102', '00101', 'MORNING', 'ERROR');

      expect(() => calculateDeciles(db)).toThrow(
        'No successful routes found. Please run route calculation first.'
      );
    });
  });

  describe('force recalculation', () => {
    it('should refuse to recalculate without --force flag', () => {
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      // First calculation
      calculateDeciles(db);

      // Second calculation without force should throw
      expect(() => calculateDeciles(db)).toThrow(/already exist.*Use --force/);
    });

    it('should recalculate when --force flag is provided', () => {
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      // First calculation
      const result1 = calculateDeciles(db);
      expect(result1.deciles).toHaveLength(10);

      // Second calculation with force
      const result2 = calculateDeciles(db, { force: true });
      expect(result2.deciles).toHaveLength(10);

      // Verify old deciles were deleted and new ones created
      const storedDeciles = db.prepare('SELECT COUNT(*) as count FROM deciles').get() as {
        count: number;
      };
      expect(storedDeciles.count).toBe(10); // Not 20
    });
  });

  describe('progress events', () => {
    it('should emit progress events during calculation', () => {
      const durations = Array.from({ length: 50 }, (_, i) => 600 + i * 100);
      insertTestRoutes(durations);

      const events: string[] = [];
      const emitter = new ProgressEmitter();

      emitter.on('progress', (event) => {
        events.push(event.type);
      });

      calculateDeciles(db, { emitter });

      expect(events).toContain('start');
      expect(events).toContain('progress');
      expect(events).toContain('complete');
    });

    it('should emit error event on failure', () => {
      const emitter = new ProgressEmitter();
      let errorEmitted = false;

      emitter.on('progress', (event) => {
        if (event.type === 'error') {
          errorEmitted = true;
        }
      });

      // No routes - should fail
      expect(() => calculateDeciles(db, { emitter })).toThrow();
      expect(errorEmitted).toBe(true);
    });
  });

  describe('decile continuity', () => {
    it('should ensure no gaps between decile ranges', () => {
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      // Check each pair of adjacent deciles
      for (let i = 0; i < 9; i++) {
        const currentMax = result.deciles[i].max;
        const nextMin = result.deciles[i + 1].min;

        // Next decile should start at or very close to where current ends
        // (allowing for discrete duration values)
        expect(nextMin).toBeGreaterThanOrEqual(currentMax);
        expect(nextMin - currentMax).toBeLessThanOrEqual(54); // Max gap is 1 route duration
      }
    });

    it('should mark last decile as open-ended', () => {
      const durations = Array.from({ length: 100 }, (_, i) => 600 + i * 54);
      insertTestRoutes(durations);

      const result = calculateDeciles(db);

      // Last decile should have max = -1
      expect(result.deciles[9].max).toBe(-1);

      // Verify in database
      const lastDecile = db
        .prepare('SELECT max_duration FROM deciles WHERE decile_number = 10')
        .get() as { max_duration: number };
      expect(lastDecile.max_duration).toBe(-1);
    });
  });
});
