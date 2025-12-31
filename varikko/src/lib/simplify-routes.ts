/**
 * Route polyline simplification utilities
 *
 * Reduces file size by simplifying polyline geometry in stored route files
 */

import { getAllZoneIds, readZoneRoutes, writeZoneRoutes } from './datastore';
import { decodePolyline, encodePolyline, simplifyPath } from './polyline';
import type { ProgressEmitter } from './events';
import type { TimePeriod } from '../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface SimplifyRoutesOptions {
  periods: TimePeriod[];
  tolerance: number;
  dryRun?: boolean;
  emitter?: ProgressEmitter;
}

export interface SimplifyRoutesResult {
  filesProcessed: number;
  legsSimplified: number;
  originalBytes: number;
  newBytes: number;
  reductionPercent: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Simplify polylines in all route files
 */
export function simplifyRouteFiles(options: SimplifyRoutesOptions): SimplifyRoutesResult {
  const { periods, tolerance, dryRun = false, emitter } = options;
  const zoneIds = getAllZoneIds();

  let filesProcessed = 0;
  let legsSimplified = 0;
  let originalBytes = 0;
  let newBytes = 0;

  const totalFiles = zoneIds.length * periods.length;

  emitter?.emitStart('simplify_routes', totalFiles, `Simplifying routes in ${totalFiles} files...`);

  for (const period of periods) {
    emitter?.emitProgress('process', 0, zoneIds.length, `Processing ${period}...`);

    for (let i = 0; i < zoneIds.length; i++) {
      const zoneId = zoneIds[i];

      // Read routes data
      const routesData = readZoneRoutes(zoneId, period);
      if (!routesData) continue;

      // Calculate original size (estimate from MessagePack)
      const originalData = Buffer.from(JSON.stringify(routesData));
      originalBytes += originalData.length;

      // Process each route's legs
      for (const route of routesData.r) {
        if (!route.l) continue;

        for (const leg of route.l) {
          if (!leg.g) continue;

          // Decode → Simplify → Encode
          const originalPolyline = leg.g;
          const points = decodePolyline(originalPolyline);
          const simplified = simplifyPath(points, tolerance);
          const newPolyline = encodePolyline(simplified);

          // Update leg geometry
          leg.g = newPolyline;
          legsSimplified++;
        }
      }

      // Calculate new size and write back (unless dry run)
      const newData = Buffer.from(JSON.stringify(routesData));
      newBytes += newData.length;

      if (!dryRun) {
        writeZoneRoutes(zoneId, period, routesData);
      }

      filesProcessed++;

      // Progress update every 50 zones
      if (i % 50 === 0 || i === zoneIds.length - 1) {
        emitter?.emitProgress('process', i + 1, zoneIds.length, `Processed ${i + 1}/${zoneIds.length} zones`);
      }
    }
  }

  const reductionPercent = ((originalBytes - newBytes) / originalBytes) * 100;

  emitter?.emitComplete('simplify_routes', `Simplified ${filesProcessed} files`);

  return {
    filesProcessed,
    legsSimplified,
    originalBytes,
    newBytes,
    reductionPercent,
  };
}
