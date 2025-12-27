import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { ProgressEmitter } from './events.js';

/**
 * Export options
 */
export interface ExportOptions {
  /** Time period to export (MORNING, EVENING, MIDNIGHT). If not specified, exports all periods. */
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  /** Output file path (defaults to routes_export.json) */
  outputPath?: string;
  /** Progress event emitter */
  emitter?: ProgressEmitter;
}

/**
 * Export result
 */
export interface ExportResult {
  /** Number of routes exported */
  routeCount: number;
  /** Number of origin zones */
  originCount: number;
  /** Output file path */
  outputPath: string;
  /** File size in bytes */
  fileSize: number;
}

/**
 * Exported routes data structure
 * { from_id: { to_id: duration, ... }, ... }
 */
export type ExportedRoutes = Record<string, Record<string, number>>;

/**
 * Export routes to JSON file
 *
 * Queries all routes with status='OK' (optionally filtered by period)
 * and exports them to a nested JSON structure:
 * { "00100": { "00120": 120, "00130": 400 }, ... }
 *
 * @param db - SQLite database instance
 * @param options - Export options
 * @returns Export statistics
 */
export function exportRoutes(
  db: Database.Database,
  options: ExportOptions = {}
): ExportResult {
  const { period, outputPath, emitter } = options;

  // Default output path
  const finalOutputPath = outputPath || path.resolve(process.cwd(), 'routes_export.json');

  // Emit start event
  emitter?.emitStart('export_routes', undefined, 'Querying routes from database...');

  // Query routes
  let query = 'SELECT from_id, to_id, duration FROM routes WHERE status = ?';
  const params: (string | number)[] = ['OK'];

  if (period) {
    query += ' AND time_period = ?';
    params.push(period);
  }

  const rows = db.prepare(query).all(...params) as Array<{
    from_id: string;
    to_id: string;
    duration: number;
  }>;

  // Emit progress
  emitter?.emitProgress('export_routes', 1, 2, `Processing ${rows.length} routes...`);

  // Build nested structure
  const exportData: ExportedRoutes = {};
  let routeCount = 0;

  for (const row of rows) {
    if (!exportData[row.from_id]) {
      exportData[row.from_id] = {};
    }
    exportData[row.from_id][row.to_id] = row.duration;
    routeCount++;
  }

  const originCount = Object.keys(exportData).length;

  // Write to file
  emitter?.emitProgress('export_routes', 2, 2, `Writing to ${path.basename(finalOutputPath)}...`);
  fs.writeFileSync(finalOutputPath, JSON.stringify(exportData, null, 2));

  // Get file size
  const stats = fs.statSync(finalOutputPath);
  const fileSize = stats.size;

  // Emit complete
  emitter?.emitComplete(
    'export_routes',
    `Exported ${routeCount} routes for ${originCount} origins`,
    { routeCount, originCount, fileSize }
  );

  return {
    routeCount,
    originCount,
    outputPath: finalOutputPath,
    fileSize,
  };
}

/**
 * Get export statistics without actually exporting
 *
 * @param db - SQLite database instance
 * @param period - Optional time period filter
 * @returns Route counts
 */
export function getExportStats(
  db: Database.Database,
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT'
): { routeCount: number; originCount: number } {
  let query = 'SELECT COUNT(*) as count FROM routes WHERE status = ?';
  const params: (string | number)[] = ['OK'];

  if (period) {
    query += ' AND time_period = ?';
    params.push(period);
  }

  const routeCount = (db.prepare(query).get(...params) as { count: number }).count;

  // Count distinct origins
  let originQuery = 'SELECT COUNT(DISTINCT from_id) as count FROM routes WHERE status = ?';
  const originParams: (string | number)[] = ['OK'];

  if (period) {
    originQuery += ' AND time_period = ?';
    originParams.push(period);
  }

  const originCount = (db.prepare(originQuery).get(...originParams) as { count: number }).count;

  return { routeCount, originCount };
}
