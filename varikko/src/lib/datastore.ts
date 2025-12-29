/**
 * File-based data store for varikko
 *
 * This module replaces SQLite database operations with file-based storage,
 * establishing opas/public/data/ as the single source of truth.
 */

import * as fs from 'fs';
import * as path from 'path';
import { encode, decode } from '@msgpack/msgpack';
import {
  Zone,
  ZonesData,
  TimeBucket,
  CompactRoute,
  ZoneRoutesData,
  TimePeriod,
  RouteStatus,
  DataManifest,
  PipelineState,
  FetchMetadata,
  GeocodingMetadata,
  RouteCalculationMetadata,
} from '../shared/types';

// ============================================================================
// Path Configuration
// ============================================================================

const DEFAULT_DATA_DIR = path.join(__dirname, '../../../opas/public/data');

let dataDirectory = DEFAULT_DATA_DIR;

/**
 * Set the data directory (useful for testing)
 */
export function setDataDirectory(dir: string): void {
  dataDirectory = dir;
}

/**
 * Get the current data directory
 */
export function getDataDirectory(): string {
  return dataDirectory;
}

/**
 * Get path to zones.json
 */
function getZonesPath(): string {
  return path.join(dataDirectory, 'zones.json');
}

/**
 * Get path to routes directory
 */
function getRoutesDir(): string {
  return path.join(dataDirectory, 'routes');
}

/**
 * Get path to a specific route file
 */
function getRoutePath(zoneId: string, period: TimePeriod): string {
  const periodSuffix = period.toLowerCase();
  return path.join(getRoutesDir(), `${zoneId}-${periodSuffix}.msgpack`);
}

/**
 * Get path to pipeline.json
 */
function getPipelinePath(): string {
  return path.join(dataDirectory, 'pipeline.json');
}

/**
 * Get path to manifest.json
 */
function getManifestPath(): string {
  return path.join(dataDirectory, 'manifest.json');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Atomic write: write to temp file, then rename
 * This ensures the file is never in a partially written state
 */
function atomicWrite(filePath: string, content: string | Buffer): void {
  const dir = path.dirname(filePath);
  ensureDirectoryExists(dir);

  const tempPath = `${filePath}.tmp.${Date.now()}`;

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if something went wrong
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

/**
 * Read JSON file safely, returning null if file doesn't exist
 */
function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    return null;
  }
}

/**
 * Write JSON file atomically
 */
function writeJsonFile<T>(filePath: string, data: T): void {
  const json = JSON.stringify(data, null, 2);
  atomicWrite(filePath, json);
}

/**
 * Read msgpack file safely, returning null if file doesn't exist
 */
function readMsgpackFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return decode(buffer) as T;
  } catch (error) {
    console.error(`Error reading msgpack file ${filePath}:`, error);
    return null;
  }
}

/**
 * Write msgpack file atomically
 */
function writeMsgpackFile<T>(filePath: string, data: T): void {
  const encoded = encode(data);
  atomicWrite(filePath, Buffer.from(encoded));
}

// ============================================================================
// Zone Operations
// ============================================================================

/**
 * Read all zones from zones.json
 */
export function readZones(): ZonesData | null {
  return readJsonFile<ZonesData>(getZonesPath());
}

/**
 * Write zones to zones.json
 */
export function writeZones(data: ZonesData): void {
  writeJsonFile(getZonesPath(), data);
}

/**
 * Update a specific zone's data
 */
export function updateZone(zoneId: string, updates: Partial<Zone>): void {
  const zonesData = readZones();
  if (!zonesData) {
    throw new Error('No zones data found - run fetch first');
  }

  const zoneIndex = zonesData.zones.findIndex((z) => z.id === zoneId);
  if (zoneIndex === -1) {
    throw new Error(`Zone ${zoneId} not found`);
  }

  zonesData.zones[zoneIndex] = {
    ...zonesData.zones[zoneIndex],
    ...updates,
  };

  writeZones(zonesData);
}

/**
 * Get all zone IDs
 */
export function getAllZoneIds(): string[] {
  const zonesData = readZones();
  if (!zonesData) {
    return [];
  }
  return zonesData.zones.map((z) => z.id);
}

// ============================================================================
// Route Operations
// ============================================================================

/**
 * Read routes for a specific zone and time period
 */
export function readZoneRoutes(zoneId: string, period: TimePeriod): ZoneRoutesData | null {
  const filePath = getRoutePath(zoneId, period);
  return readMsgpackFile<ZoneRoutesData>(filePath);
}

/**
 * Write routes for a specific zone and time period
 */
export function writeZoneRoutes(zoneId: string, period: TimePeriod, data: ZoneRoutesData): void {
  const filePath = getRoutePath(zoneId, period);
  writeMsgpackFile(filePath, data);
}

/**
 * Update a specific route within a zone's route file
 */
export function updateRoute(
  fromId: string,
  toId: string,
  period: TimePeriod,
  route: CompactRoute
): void {
  const routesData = readZoneRoutes(fromId, period);
  if (!routesData) {
    throw new Error(`No routes data found for zone ${fromId} period ${period}`);
  }

  const routeIndex = routesData.r.findIndex((r) => r.i === toId);
  if (routeIndex === -1) {
    throw new Error(`Route from ${fromId} to ${toId} not found`);
  }

  routesData.r[routeIndex] = route;
  writeZoneRoutes(fromId, period, routesData);
}

/**
 * Initialize empty route files for all zones and periods
 * Each route is marked as PENDING
 */
export function initializeRoutes(zoneIds: string[], periods: TimePeriod[]): void {
  ensureDirectoryExists(getRoutesDir());

  for (const fromId of zoneIds) {
    for (const period of periods) {
      const routes: CompactRoute[] = zoneIds.map((toId) => ({
        i: toId,
        d: null,
        t: null,
        s: RouteStatus.PENDING,
      }));

      const routesData: ZoneRoutesData = {
        f: fromId,
        p: period.charAt(0), // M, E, or N
        r: routes,
      };

      writeZoneRoutes(fromId, period, routesData);
    }
  }
}

/**
 * Get all zones that have pending routes for a given period
 */
export function getZonesWithPendingRoutes(period: TimePeriod): string[] {
  const zoneIds = getAllZoneIds();
  const zonesWithPending: string[] = [];

  for (const zoneId of zoneIds) {
    const routesData = readZoneRoutes(zoneId, period);
    if (!routesData) continue;

    const hasPending = routesData.r.some((r) => r.s === RouteStatus.PENDING);
    if (hasPending) {
      zonesWithPending.push(zoneId);
    }
  }

  return zonesWithPending;
}

/**
 * Get all pending routes across all zones and periods
 * Returns a map of period -> array of zone IDs with pending routes
 */
export function getAllPendingRoutes(): Map<TimePeriod, string[]> {
  const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT'];
  const pendingMap = new Map<TimePeriod, string[]>();

  for (const period of periods) {
    const zones = getZonesWithPendingRoutes(period);
    if (zones.length > 0) {
      pendingMap.set(period, zones);
    }
  }

  return pendingMap;
}

/**
 * Count routes by status for a given period
 */
export function countRoutesByStatus(period: TimePeriod): Record<RouteStatus, number> {
  const zoneIds = getAllZoneIds();
  const counts: Record<RouteStatus, number> = {
    [RouteStatus.OK]: 0,
    [RouteStatus.NO_ROUTE]: 0,
    [RouteStatus.ERROR]: 0,
    [RouteStatus.PENDING]: 0,
  };

  for (const zoneId of zoneIds) {
    const routesData = readZoneRoutes(zoneId, period);
    if (!routesData) continue;

    for (const route of routesData.r) {
      counts[route.s]++;
    }
  }

  return counts;
}

/**
 * Get all route durations across all zones (for time bucket calculation)
 */
export function getAllRouteDurations(): number[] {
  const zoneIds = getAllZoneIds();
  const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT'];
  const durations: number[] = [];

  for (const zoneId of zoneIds) {
    for (const period of periods) {
      const routesData = readZoneRoutes(zoneId, period);
      if (!routesData) continue;

      for (const route of routesData.r) {
        if (route.s === RouteStatus.OK && route.d !== null) {
          durations.push(route.d);
        }
      }
    }
  }

  return durations;
}

// ============================================================================
// Pipeline State Operations
// ============================================================================

/**
 * Read pipeline state from pipeline.json
 */
export function readPipelineState(): PipelineState | null {
  return readJsonFile<PipelineState>(getPipelinePath());
}

/**
 * Write pipeline state to pipeline.json
 */
export function writePipelineState(state: PipelineState): void {
  writeJsonFile(getPipelinePath(), state);
}

/**
 * Update a specific field in pipeline state
 */
export function updatePipelineMetadata<K extends keyof PipelineState>(
  key: K,
  value: PipelineState[K]
): void {
  const state = readPipelineState() || {};
  state[key] = value;
  writePipelineState(state);
}

// ============================================================================
// Manifest Operations
// ============================================================================

/**
 * Read current manifest
 */
export function readManifest(): DataManifest | null {
  return readJsonFile<DataManifest>(getManifestPath());
}

/**
 * Update manifest.json based on current data state
 */
export function updateManifest(): void {
  const zonesData = readZones();
  if (!zonesData) {
    throw new Error('No zones data found');
  }

  const routesDir = getRoutesDir();
  let routeFiles = 0;
  let totalSize = 0;
  let errors = 0;

  // Count zones.json
  if (fs.existsSync(getZonesPath())) {
    totalSize += fs.statSync(getZonesPath()).size;
  }

  // Count route files
  if (fs.existsSync(routesDir)) {
    const files = fs.readdirSync(routesDir);
    routeFiles = files.filter((f) => f.endsWith('.msgpack')).length;

    for (const file of files) {
      const filePath = path.join(routesDir, file);
      totalSize += fs.statSync(filePath).size;
    }
  }

  // Count errors from pipeline state
  const pipelineState = readPipelineState();
  if (pipelineState?.lastRouteCalculation) {
    errors = pipelineState.lastRouteCalculation.ERROR;
  }

  const manifest: DataManifest = {
    version: 1,
    generated: new Date().toISOString(),
    zones: zonesData.zones.length,
    routeFiles,
    totalSize,
    errors,
  };

  writeJsonFile(getManifestPath(), manifest);
}

/**
 * Ensure data directory structure exists
 */
export function ensureDataDirectoryStructure(): void {
  ensureDirectoryExists(dataDirectory);
  ensureDirectoryExists(getRoutesDir());
}
