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
  timeBuckets: TimeBucket[];
  zones: CompactZone[];
}

/** Route status mapping to minimize bytes */
export enum RouteStatus {
  OK = 0,
  NO_ROUTE = 1,
  ERROR = 2,
  PENDING = 3,
}

/** Leg data for route visualization (minimized keys) */
export interface CompactLeg {
  m: string; // mode
  d: number; // duration
  di?: number; // distance
  f?: { n: string; lt?: number; ln?: number }; // from: name, lat, lon
  t?: { n: string; lt?: number; ln?: number }; // to: name, lat, lon
  g?: string; // geometry (encoded polyline)
  sn?: string; // routeShortName
  ln?: string; // routeLongName
}

/** Compact route for msgpack files (minimized keys) */
export interface CompactRoute {
  i: string; // toId
  d: number | null; // duration
  t: number | null; // transfers
  s: RouteStatus; // status
  l?: CompactLeg[]; // legs
}

/** Per-zone route file structure (minimized keys) */
export interface ZoneRoutesFile {
  f: string; // fromId
  p: string; // period (M, E, N)
  r: CompactRoute[]; // routes
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

    return legs.map((leg: {
      mode?: string;
      duration?: number;
      distance?: number;
      from?: { name?: string; lat?: number; lon?: number };
      to?: { name?: string; lat?: number; lon?: number };
      legGeometry?: { points?: string };
      route?: { shortName?: string; longName?: string };
    }) => {
      const compactLeg: CompactLeg = {
        m: String(leg.mode || 'WALK'),
        d: Number(leg.duration || 0),
      };

      if (leg.distance) compactLeg.di = Number(leg.distance);
      if (leg.from && typeof leg.from === 'object') {
        compactLeg.f = {
          n: String(leg.from.name || ''),
          lt: leg.from.lat !== undefined ? Number(leg.from.lat) : undefined,
          ln: leg.from.lon !== undefined ? Number(leg.from.lon) : undefined,
        };
      }
      if (leg.to && typeof leg.to === 'object') {
        compactLeg.t = {
          n: String(leg.to.name || ''),
          lt: leg.to.lat !== undefined ? Number(leg.to.lat) : undefined,
          ln: leg.to.lon !== undefined ? Number(leg.to.lon) : undefined,
        };
      }
      if (leg.legGeometry?.points) {
        compactLeg.g = String(leg.legGeometry.points);
      }
      if (leg.route) {
        if (leg.route.shortName) compactLeg.sn = String(leg.route.shortName);
        if (leg.route.longName) compactLeg.ln = String(leg.route.longName);
      }

      return compactLeg;
    });
  } catch {
    return undefined;
  }
}

/**
 * Map status string to RouteStatus enum
 */
function mapStatus(status: string): RouteStatus {
  switch (status) {
    case 'OK':
      return RouteStatus.OK;
    case 'NO_ROUTE':
      return RouteStatus.NO_ROUTE;
    case 'ERROR':
      return RouteStatus.ERROR;
    case 'PENDING':
    default:
      return RouteStatus.PENDING;
  }
}

/**
 * Export routes for a single zone to msgpack (split into period files)
 */
export function exportZoneRoutes(
  db: Database.Database,
  zoneId: string,
  outputDir: string
): { routes: number; size: number } {
  const periodMap: Record<string, { key: string; suffix: string }> = {
    MORNING: { key: 'M', suffix: 'morning' },
    EVENING: { key: 'E', suffix: 'evening' },
    MIDNIGHT: { key: 'N', suffix: 'midnight' },
  };

  let totalRoutes = 0;
  let totalSize = 0;

  for (const [periodName, config] of Object.entries(periodMap)) {
    const routes = db
      .prepare(
        `
        SELECT to_id, duration, numberOfTransfers, status, legs
        FROM routes
        WHERE from_id = ? AND time_period = ?
      `
      )
      .all(zoneId, periodName) as {
      to_id: string;
      duration: number | null;
      numberOfTransfers: number | null;
      status: string;
      legs: string | null;
    }[];

    const compactRoutes = routes
      .filter((r) => r.status !== 'PENDING')
      .map((r) => {
        const route: CompactRoute = {
          i: r.to_id,
          d: r.duration,
          t: r.numberOfTransfers,
          s: mapStatus(r.status),
        };

        if (r.status === 'OK' && r.legs) {
          route.l = parseLegs(r.legs);
        }

        return route;
      });

    const routesData: ZoneRoutesFile = {
      f: zoneId,
      p: config.key,
      r: compactRoutes,
    };

    const encoded = encode(routesData);
    const outputPath = path.join(outputDir, `${zoneId}-${config.suffix}.msgpack`);
    fs.writeFileSync(outputPath, Buffer.from(encoded));

    totalRoutes += routes.length;
    totalSize += encoded.length;
  }

  return { routes: totalRoutes, size: totalSize };
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

    try {
      const routeResult = exportZoneRoutes(db, zone.id, routesDir);
      totalSize += routeResult.size;
      routeFilesCount += 3; // morning, evening, midnight
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
