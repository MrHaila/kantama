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
// Route Types
// ============================================================================

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

export interface CompactRoute {
  toId: string;
  duration: number | null;
  transfers: number | null;
  walkDistance: number | null;
  status: 'OK' | 'NO_ROUTE' | 'ERROR' | 'PENDING';
  legs?: CompactLeg[];
}

export type TimePeriod = 'MORNING' | 'EVENING' | 'MIDNIGHT';

export interface ZoneRoutesData {
  fromId: string;
  generated: string;
  periods: {
    MORNING: CompactRoute[];
    EVENING: CompactRoute[];
    MIDNIGHT: CompactRoute[];
  };
}

// ============================================================================
// Data File Types
// ============================================================================

export interface ZonesData {
  version: number;
  generated: string;
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
