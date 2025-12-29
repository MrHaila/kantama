/**
 * Data validation and manifest generation
 *
 * Since data is now written directly to final format, the "export" step is
 * no longer needed. This module provides optional validation and manifest
 * regeneration for debugging and verification.
 */

import { ProgressEmitter } from './events';
import {
  readZones,
  getAllZoneIds,
  readZoneRoutes,
  updateManifest,
  getDataDirectory,
} from './datastore';
import { TimePeriod, RouteStatus } from '../shared/types';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidateOptions {
  emitter?: ProgressEmitter;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    zones: number;
    routeFiles: number;
    totalRoutes: number;
    pendingRoutes: number;
    okRoutes: number;
    noRouteRoutes: number;
    errorRoutes: number;
    totalSize: number;
  };
}

/**
 * Validate data integrity and regenerate manifest
 */
export function validateData(options: ValidateOptions = {}): ValidationResult {
  const { emitter } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  emitter?.emitStart('validate_data', undefined, 'Validating data...');

  try {
    // Check if zones.json exists
    const zonesData = readZones();
    if (!zonesData) {
      errors.push('zones.json not found - run fetch first');
      return {
        valid: false,
        errors,
        warnings,
        stats: {
          zones: 0,
          routeFiles: 0,
          totalRoutes: 0,
          pendingRoutes: 0,
          okRoutes: 0,
          noRouteRoutes: 0,
          errorRoutes: 0,
          totalSize: 0,
        },
      };
    }

    const zoneIds = getAllZoneIds();
    const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT'];

    // Validate zones have required fields
    for (const zone of zonesData.zones) {
      if (!zone.id) errors.push(`Zone missing ID`);
      if (!zone.name) warnings.push(`Zone ${zone.id} missing name`);
      if (!zone.city) warnings.push(`Zone ${zone.id} missing city`);
      if (!zone.svgPath) errors.push(`Zone ${zone.id} missing SVG path`);
      if (!zone.routingPoint || zone.routingPoint.length !== 2) {
        errors.push(`Zone ${zone.id} missing valid routing point`);
      }
    }

    // Validate time buckets
    if (zonesData.timeBuckets.length === 0) {
      warnings.push('No time buckets defined - run time-buckets command');
    } else if (zonesData.timeBuckets.length !== 6) {
      warnings.push(`Expected 6 time buckets, found ${zonesData.timeBuckets.length}`);
    }

    // Validate route files exist for all zones
    let routeFileCount = 0;
    let totalRoutes = 0;
    let pendingCount = 0;
    let okCount = 0;
    let noRouteCount = 0;
    let errorCount = 0;

    for (const zoneId of zoneIds) {
      for (const period of periods) {
        const routesData = readZoneRoutes(zoneId, period);

        if (!routesData) {
          errors.push(`Missing route file for zone ${zoneId} period ${period}`);
          continue;
        }

        routeFileCount++;

        // Validate route data structure
        if (routesData.f !== zoneId) {
          errors.push(`Route file ${zoneId}-${period} has incorrect fromId: ${routesData.f}`);
        }

        if (!routesData.r || !Array.isArray(routesData.r)) {
          errors.push(`Route file ${zoneId}-${period} missing routes array`);
          continue;
        }

        totalRoutes += routesData.r.length;

        // Count routes by status
        for (const route of routesData.r) {
          switch (route.s) {
            case RouteStatus.PENDING:
              pendingCount++;
              break;
            case RouteStatus.OK:
              okCount++;
              break;
            case RouteStatus.NO_ROUTE:
              noRouteCount++;
              break;
            case RouteStatus.ERROR:
              errorCount++;
              break;
          }

          // Validate route structure
          if (!route.i) {
            errors.push(`Route in ${zoneId}-${period} missing toId`);
          }

          if (route.s === RouteStatus.OK) {
            if (route.d === null || route.d === undefined) {
              warnings.push(`Route ${zoneId} → ${route.i} (${period}) has status OK but no duration`);
            }
            if (!route.l || route.l.length === 0) {
              warnings.push(`Route ${zoneId} → ${route.i} (${period}) has status OK but no legs`);
            }
          }
        }
      }
    }

    // Calculate total size
    const dataDir = getDataDirectory();
    let totalSize = 0;

    const zonesPath = path.join(dataDir, 'zones.json');
    if (fs.existsSync(zonesPath)) {
      totalSize += fs.statSync(zonesPath).size;
    }

    const routesDir = path.join(dataDir, 'routes');
    if (fs.existsSync(routesDir)) {
      const files = fs.readdirSync(routesDir);
      for (const file of files) {
        const filePath = path.join(routesDir, file);
        totalSize += fs.statSync(filePath).size;
      }
    }

    // Regenerate manifest
    emitter?.emitProgress('validate_data', undefined, undefined, 'Regenerating manifest...');
    updateManifest();

    // Report results
    const valid = errors.length === 0;

    if (emitter) {
      if (valid) {
        emitter.emitComplete(
          'validate_data',
          `Validation passed! ${zoneIds.length} zones, ${routeFileCount} route files, ${totalSize} bytes`
        );
      } else {
        emitter.emitError(
          'validate_data',
          new Error(`Validation failed with ${errors.length} errors`),
          'Validation failed'
        );
      }
    }

    return {
      valid,
      errors,
      warnings,
      stats: {
        zones: zoneIds.length,
        routeFiles: routeFileCount,
        totalRoutes,
        pendingRoutes: pendingCount,
        okRoutes: okCount,
        noRouteRoutes: noRouteCount,
        errorRoutes: errorCount,
        totalSize,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Validation error: ${errorMsg}`);

    emitter?.emitError(
      'validate_data',
      error instanceof Error ? error : new Error(errorMsg),
      'Validation failed'
    );

    return {
      valid: false,
      errors,
      warnings,
      stats: {
        zones: 0,
        routeFiles: 0,
        totalRoutes: 0,
        pendingRoutes: 0,
        okRoutes: 0,
        noRouteRoutes: 0,
        errorRoutes: 0,
        totalSize: 0,
      },
    };
  }
}
