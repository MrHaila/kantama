/**
 * Shared types between varikko (data pipeline) and opas (visualization)
 *
 * IMPORTANT: This is the single source of truth for data contract types.
 * Changes here affect both the export (varikko) and import (opas) sides.
 */

// ============================================================================
// Zone Types
// ============================================================================

export interface Zone {
  id: string;
  name: string;
  city: string;
  svgPath: string;
  routingPoint: [number, number]; // [lat, lon]
}

// ============================================================================
// Time Bucket Types
// ============================================================================

export interface TimeBucket {
  number: number;
  min: number;
  max: number;
  color: string;
  label: string;
}

// ============================================================================
// Route Types (Compact Format)
// ============================================================================

/** Route status mapping to minimize bytes */
export enum RouteStatus {
  OK = 0,
  NO_ROUTE = 1,
  ERROR = 2,
  PENDING = 3,
}

/** Leg data for route visualization (minimized keys to save bytes) */
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

/** Compact route for msgpack files (minimized keys to save bytes) */
export interface CompactRoute {
  i: string; // toId
  d: number | null; // duration
  t: number | null; // transfers
  s: RouteStatus; // status
  l?: CompactLeg[]; // legs
}

export type TimePeriod = 'MORNING' | 'EVENING' | 'MIDNIGHT';

/** Per-zone route file structure (minimized keys, one file per period) */
export interface ZoneRoutesData {
  f: string; // fromId
  p: string; // period (M, E, N)
  r: CompactRoute[]; // routes
}

// ============================================================================
// Data File Types
// ============================================================================

export interface ZonesData {
  version: number;
  timeBuckets: TimeBucket[];
  zones: Zone[];
}

export interface DataManifest {
  version: number;
  generated: string;
  zones: number;
  routeFiles: number;
  totalSize: number;
  errors: number;
}
