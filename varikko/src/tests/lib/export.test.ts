import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import type { ProgressEvent } from '../../lib/events.js';

// Mock fs module before importing
vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024 })),
  },
  writeFileSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1024 })),
}));

// Import after mocks are set up
// eslint-disable-next-line import/order
import { exportRoutes, getExportStats } from '../../lib/export.js';
// eslint-disable-next-line import/order
import { createTestDB } from '../helpers/db.js';
// eslint-disable-next-line import/order
import fs from 'fs';

const mockFs = vi.mocked(fs);

describe('export', () => {
  let cleanup: () => void;
  let db: ReturnType<typeof createTestDB>['db'];

  beforeEach(() => {
    const result = createTestDB();
    db = result.db;
    cleanup = result.cleanup;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  describe('getExportStats', () => {
    it('should return zero counts when no routes exist', () => {
      const stats = getExportStats(db);
      expect(stats.routeCount).toBe(0);
      expect(stats.originCount).toBe(0);
    });

    it('should count only OK routes', () => {
      // Insert places
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES
          ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9),
          ('00120', 'Zone 2', 60.2, 24.8, '{}', 'M0,0', 60.2, 24.8);
      `);

      // Insert routes with different statuses
      db.exec(`
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES
          ('00100', '00120', 'MORNING', 'OK', 600),
          ('00120', '00100', 'MORNING', 'NO_ROUTE', NULL),
          ('00100', '00120', 'EVENING', 'ERROR', NULL);
      `);

      const stats = getExportStats(db);
      expect(stats.routeCount).toBe(1);
      expect(stats.originCount).toBe(1);
    });

    it('should filter by period when specified', () => {
      // Insert places
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES
          ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9),
          ('00120', 'Zone 2', 60.2, 24.8, '{}', 'M0,0', 60.2, 24.8);
      `);

      // Insert routes for different periods
      db.exec(`
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES
          ('00100', '00120', 'MORNING', 'OK', 600),
          ('00120', '00100', 'MORNING', 'OK', 700),
          ('00100', '00120', 'EVENING', 'OK', 500);
      `);

      const morningStats = getExportStats(db, 'MORNING');
      expect(morningStats.routeCount).toBe(2);
      expect(morningStats.originCount).toBe(2);

      const eveningStats = getExportStats(db, 'EVENING');
      expect(eveningStats.routeCount).toBe(1);
      expect(eveningStats.originCount).toBe(1);
    });
  });

  describe('exportRoutes', () => {
    it('should export routes in correct nested format', () => {
      // Insert places
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES
          ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9),
          ('00120', 'Zone 2', 60.2, 24.8, '{}', 'M0,0', 60.2, 24.8),
          ('00130', 'Zone 3', 60.3, 24.7, '{}', 'M0,0', 60.3, 24.7);
      `);

      // Insert routes
      db.exec(`
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES
          ('00100', '00120', 'MORNING', 'OK', 600),
          ('00100', '00130', 'MORNING', 'OK', 800),
          ('00120', '00100', 'MORNING', 'OK', 700);
      `);

      const result = exportRoutes(db);

      // Verify writeFileSync was called
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const [, content] = mockFs.writeFileSync.mock.calls[0];
      const exportData = JSON.parse(content as string);

      // Verify nested structure
      expect(exportData['00100']).toEqual({
        '00120': 600,
        '00130': 800,
      });
      expect(exportData['00120']).toEqual({
        '00100': 700,
      });

      // Verify result
      expect(result.routeCount).toBe(3);
      expect(result.originCount).toBe(2);
    });

    it('should only export OK routes', () => {
      // Insert places
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES
          ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9),
          ('00120', 'Zone 2', 60.2, 24.8, '{}', 'M0,0', 60.2, 24.8);
      `);

      // Insert routes with different statuses
      db.exec(`
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES
          ('00100', '00120', 'MORNING', 'OK', 600),
          ('00120', '00100', 'MORNING', 'NO_ROUTE', NULL),
          ('00100', '00120', 'EVENING', 'ERROR', NULL),
          ('00100', '00120', 'MIDNIGHT', 'PENDING', NULL);
      `);

      const result = exportRoutes(db);

      // Verify only OK route was exported
      expect(result.routeCount).toBe(1);
      expect(result.originCount).toBe(1);

      const [, content] = mockFs.writeFileSync.mock.calls[0];
      const exportData = JSON.parse(content as string);
      expect(exportData['00100']['00120']).toBe(600);
      expect(Object.keys(exportData)).toHaveLength(1);
    });

    it('should filter by period when specified', () => {
      // Insert places
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES
          ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9),
          ('00120', 'Zone 2', 60.2, 24.8, '{}', 'M0,0', 60.2, 24.8);
      `);

      // Insert routes for different periods
      db.exec(`
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES
          ('00100', '00120', 'MORNING', 'OK', 600),
          ('00120', '00100', 'MORNING', 'OK', 700),
          ('00100', '00120', 'EVENING', 'OK', 500);
      `);

      const result = exportRoutes(db, { period: 'MORNING' });

      // Verify only MORNING routes were exported
      expect(result.routeCount).toBe(2);
      expect(result.originCount).toBe(2);

      const [, content] = mockFs.writeFileSync.mock.calls[0];
      const exportData = JSON.parse(content as string);
      expect(exportData['00100']['00120']).toBe(600);
      expect(exportData['00120']['00100']).toBe(700);
    });

    it('should use custom output path when specified', () => {
      // Insert minimal data
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9);
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES ('00100', '00100', 'MORNING', 'OK', 0);
      `);

      const customPath = '/tmp/custom_export.json';
      const result = exportRoutes(db, { outputPath: customPath });

      expect(result.outputPath).toBe(customPath);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        customPath,
        expect.any(String)
      );
    });

    it('should use default output path when not specified', () => {
      // Insert minimal data
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9);
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES ('00100', '00100', 'MORNING', 'OK', 0);
      `);

      const result = exportRoutes(db);

      expect(result.outputPath).toBe(path.resolve(process.cwd(), 'routes_export.json'));
    });

    it('should emit progress events when emitter provided', () => {
      // Insert minimal data
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9);
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES ('00100', '00100', 'MORNING', 'OK', 0);
      `);

      const events: ProgressEvent[] = [];
      const mockEmitter = {
        emitStart: vi.fn((stage, total?, message?, metadata?) => {
          events.push({ type: 'start', stage, total, message, metadata });
        }),
        emitProgress: vi.fn((stage, current, total, message?, metadata?) => {
          events.push({ type: 'progress', stage, current, total, message, metadata });
        }),
        emitComplete: vi.fn((stage, message?, metadata?) => {
          events.push({ type: 'complete', stage, message, metadata });
        }),
        emitError: vi.fn(),
      };

      exportRoutes(db, { emitter: mockEmitter });

      expect(mockEmitter.emitStart).toHaveBeenCalledTimes(1);
      expect(mockEmitter.emitProgress).toHaveBeenCalledTimes(2);
      expect(mockEmitter.emitComplete).toHaveBeenCalledTimes(1);

      expect(events[0].type).toBe('start');
      expect(events[0].stage).toBe('export_routes');
      expect(events[events.length - 1].type).toBe('complete');
    });

    it('should return file size in result', () => {
      // Insert minimal data
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9);
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES ('00100', '00100', 'MORNING', 'OK', 0);
      `);

      mockFs.statSync.mockReturnValue({ size: 2048 } as any);

      const result = exportRoutes(db);

      expect(result.fileSize).toBe(2048);
    });

    it('should handle empty export (no OK routes)', () => {
      // Insert places but no OK routes
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9);
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES ('00100', '00100', 'MORNING', 'PENDING', NULL);
      `);

      const result = exportRoutes(db);

      expect(result.routeCount).toBe(0);
      expect(result.originCount).toBe(0);

      const [, content] = mockFs.writeFileSync.mock.calls[0];
      const exportData = JSON.parse(content as string);
      expect(exportData).toEqual({});
    });

    it('should export all periods when period not specified', () => {
      // Insert places
      db.exec(`
        INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon)
        VALUES
          ('00100', 'Zone 1', 60.1, 24.9, '{}', 'M0,0', 60.1, 24.9),
          ('00120', 'Zone 2', 60.2, 24.8, '{}', 'M0,0', 60.2, 24.8);
      `);

      // Insert routes for all periods
      db.exec(`
        INSERT INTO routes (from_id, to_id, time_period, status, duration)
        VALUES
          ('00100', '00120', 'MORNING', 'OK', 600),
          ('00100', '00120', 'EVENING', 'OK', 500),
          ('00100', '00120', 'MIDNIGHT', 'OK', 400);
      `);

      const result = exportRoutes(db);

      // Should export 3 routes (same origin-destination, different periods)
      expect(result.routeCount).toBe(3);
    });
  });
});
