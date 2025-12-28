import { encode } from '@msgpack/msgpack';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressEmitter } from './events';

// ============================================================================
// Types
// ============================================================================

export interface ExportOptions {
  outputDir: string;
  emitter?: ProgressEmitter;
}

export interface ExportResult {
  zonesFile: string;
  routeFiles: number;
  totalSize: number;
  errors: string[];
}

/** Compact zone format for zones.json */
export interface CompactZone {
  id: string;
  name: string;
  city: string;
  svgPath: string;
  routingPoint: [number, number]; // [lat, lon]
}

/** Time bucket (same as DB but serializable) */
export interface TimeBucket {
  number: number;
  min: number;
  max: number;
  color: string;
  label: string;
}

/** Root zones.json structure */
export interface ZonesFile {
  version: number;
  generated: string;
  timeBuckets: TimeBucket[];
  zones: CompactZone[];
}

/** Leg data for route visualization */
export interface CompactLeg {
  mode: string;
  duration: number;
  distance?: number;
  from?: { name: string; lat?: number; lon?: number };
  to?: { name: string; lat?: number; lon?: number };
  geometry?: string; // Encoded polyline
  routeShortName?: string;
  routeLongName?: string;
}

/** Compact route for msgpack files */
export interface CompactRoute {
  toId: string;
  duration: number | null; // seconds, null if no route
  transfers: number | null;
  walkDistance: number | null; // meters
  status: 'OK' | 'NO_ROUTE' | 'ERROR' | 'PENDING';
  legs?: CompactLeg[]; // Only present for OK routes
}

/** Per-zone route file structure */
export interface ZoneRoutesFile {
  fromId: string;
  generated: string;
  periods: {
    MORNING: CompactRoute[];
    EVENING: CompactRoute[];
    MIDNIGHT: CompactRoute[];
  };
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export zones to zones.json
 */
export function exportZones(db: Database.Database, outputPath: string): { zones: number; size: number } {
  const places = db
    .prepare(
      `
      SELECT
        id, name, city, svg_path,
        COALESCE(routing_lat, lat) as lat,
        COALESCE(routing_lon, lon) as lon
      FROM places
      WHERE svg_path IS NOT NULL
    `
    )
    .all() as {
    id: string;
    name: string;
    city: string | null;
    svg_path: string;
    lat: number;
    lon: number;
  }[];

  const timeBuckets = db
    .prepare('SELECT bucket_number, min_duration, max_duration, color_hex, label FROM time_buckets ORDER BY bucket_number')
    .all() as {
    bucket_number: number;
    min_duration: number;
    max_duration: number;
    color_hex: string;
    label: string;
  }[];

  const zonesFile: ZonesFile = {
    version: 1,
    generated: new Date().toISOString(),
    timeBuckets: timeBuckets.map((tb) => ({
      number: tb.bucket_number,
      min: tb.min_duration,
      max: tb.max_duration,
      color: tb.color_hex,
      label: tb.label,
    })),
    zones: places.map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city || 'Unknown',
      svgPath: p.svg_path,
      routingPoint: [p.lat, p.lon],
    })),
  };

  const json = JSON.stringify(zonesFile);
  fs.writeFileSync(outputPath, json, 'utf-8');

  return { zones: places.length, size: Buffer.byteLength(json, 'utf-8') };
}

/**
 * Parse legs JSON from database into compact format
 */
function parseLegs(legsJson: string | null): CompactLeg[] | undefined {
  if (!legsJson) return undefined;

  try {
    const legs = JSON.parse(legsJson);
    if (!Array.isArray(legs)) return undefined;

    return legs.map((leg: Record<string, unknown>) => {
      const compactLeg: CompactLeg = {
        mode: String(leg.mode || 'WALK'),
        duration: Number(leg.duration || 0),
      };

      if (leg.distance) compactLeg.distance = Number(leg.distance);
      if (leg.from && typeof leg.from === 'object') {
        const from = leg.from as Record<string, unknown>;
        compactLeg.from = {
          name: String(from.name || ''),
          lat: from.lat !== undefined ? Number(from.lat) : undefined,
          lon: from.lon !== undefined ? Number(from.lon) : undefined,
        };
      }
      if (leg.to && typeof leg.to === 'object') {
        const to = leg.to as Record<string, unknown>;
        compactLeg.to = {
          name: String(to.name || ''),
          lat: to.lat !== undefined ? Number(to.lat) : undefined,
          lon: to.lon !== undefined ? Number(to.lon) : undefined,
        };
      }
      if (leg.legGeometry && typeof leg.legGeometry === 'object') {
        const geom = leg.legGeometry as Record<string, unknown>;
        if (geom.points) compactLeg.geometry = String(geom.points);
      }
      if (leg.route && typeof leg.route === 'object') {
        const route = leg.route as Record<string, unknown>;
        if (route.shortName) compactLeg.routeShortName = String(route.shortName);
        if (route.longName) compactLeg.routeLongName = String(route.longName);
      }

      return compactLeg;
    });
  } catch {
    return undefined;
  }
}

/**
 * Export routes for a single zone to msgpack
 */
export function exportZoneRoutes(
  db: Database.Database,
  zoneId: string,
  outputPath: string
): { routes: number; size: number } {
  const periods = ['MORNING', 'EVENING', 'MIDNIGHT'] as const;
  const routesData: ZoneRoutesFile = {
    fromId: zoneId,
    generated: new Date().toISOString(),
    periods: {
      MORNING: [],
      EVENING: [],
      MIDNIGHT: [],
    },
  };

  let totalRoutes = 0;

  for (const period of periods) {
    const routes = db
      .prepare(
        `
        SELECT to_id, duration, numberOfTransfers, walkDistance, status, legs
        FROM routes
        WHERE from_id = ? AND time_period = ?
      `
      )
      .all(zoneId, period) as {
      to_id: string;
      duration: number | null;
      numberOfTransfers: number | null;
      walkDistance: number | null;
      status: string;
      legs: string | null;
    }[];

    routesData.periods[period] = routes.map((r) => {
      const route: CompactRoute = {
        toId: r.to_id,
        duration: r.duration,
        transfers: r.numberOfTransfers,
        walkDistance: r.walkDistance !== null ? Math.round(r.walkDistance) : null,
        status: r.status as CompactRoute['status'],
      };

      // Only include legs for OK routes
      if (r.status === 'OK' && r.legs) {
        route.legs = parseLegs(r.legs);
      }

      return route;
    });

    totalRoutes += routes.length;
  }

  const encoded = encode(routesData);
  fs.writeFileSync(outputPath, Buffer.from(encoded));

  return { routes: totalRoutes, size: encoded.length };
}

/**
 * Export all data to the new format
 */
export function exportAll(db: Database.Database, options: ExportOptions): ExportResult {
  const { outputDir, emitter } = options;
  const errors: string[] = [];
  let totalSize = 0;
  let routeFilesCount = 0;

  // Create output directories
  const dataDir = path.join(outputDir, 'data');
  const routesDir = path.join(dataDir, 'routes');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(routesDir, { recursive: true });

  // Get all zone IDs
  const zones = db.prepare('SELECT id FROM places WHERE svg_path IS NOT NULL').all() as { id: string }[];

  emitter?.emitStart('export', zones.length + 1, 'Exporting data...');

  // Export zones.json
  const zonesPath = path.join(dataDir, 'zones.json');
  try {
    const zonesResult = exportZones(db, zonesPath);
    totalSize += zonesResult.size;
    emitter?.emitProgress('export', 1, zones.length + 1, `Exported ${zonesResult.zones} zones`);
  } catch (err) {
    errors.push(`Failed to export zones: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Export per-zone route files
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const routePath = path.join(routesDir, `${zone.id}.msgpack`);

    try {
      const routeResult = exportZoneRoutes(db, zone.id, routePath);
      totalSize += routeResult.size;
      routeFilesCount++;
    } catch (err) {
      errors.push(`Failed to export routes for ${zone.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if ((i + 1) % 10 === 0 || i === zones.length - 1) {
      emitter?.emitProgress('export', i + 2, zones.length + 1, `Exported ${i + 1}/${zones.length} zone routes`);
    }
  }

  // Create manifest
  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    zones: zones.length,
    routeFiles: routeFilesCount,
    totalSize,
    errors: errors.length,
  };

  const manifestPath = path.join(dataDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  emitter?.emitComplete('export', 'Export complete', {
    zones: zones.length,
    routeFiles: routeFilesCount,
    totalSize,
    errors: errors.length,
  });

  return {
    zonesFile: zonesPath,
    routeFiles: routeFilesCount,
    totalSize,
    errors,
  };
}

/**
 * Get export statistics without actually exporting
 */
export function getExportStats(db: Database.Database): {
  zones: number;
  routes: number;
  estimatedZonesSize: number;
  estimatedRoutesSize: number;
} {
  const zoneCount = (db.prepare('SELECT COUNT(*) as count FROM places WHERE svg_path IS NOT NULL').get() as { count: number }).count;
  const routeCount = (db.prepare('SELECT COUNT(*) as count FROM routes WHERE status = ?').get('OK') as { count: number }).count;

  // Rough estimates based on typical data sizes
  // zones.json: ~800 bytes per zone (mostly SVG path)
  // route file: ~15 bytes per route × 3 periods
  const estimatedZonesSize = zoneCount * 800;
  const estimatedRoutesSize = routeCount * 15;

  return {
    zones: zoneCount,
    routes: routeCount,
    estimatedZonesSize,
    estimatedRoutesSize,
  };
}
