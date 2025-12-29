/**
 * Test helpers for file-based data storage
 */

import fs from 'fs';
import path from 'path';
import { setDataDirectory, writeZones, writeZoneRoutes, writePipelineState } from '../../lib/datastore';
import type { Zone, ZonesData, ZoneRoutesData, TimePeriod, TimeBucket, RouteStatus, PipelineState } from '../../shared/types';

export interface TestDataStore {
  dataDir: string;
  cleanup: () => void;
}

/**
 * Create a temporary test data directory
 */
export function createTestDataStore(): TestDataStore {
  const testId = Date.now() + '-' + Math.random().toString(36).substring(7);
  const dataDir = path.join('/tmp', `varikko-test-${testId}`);

  // Create directory structure
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'routes'), { recursive: true });

  // Set as active data directory
  setDataDirectory(dataDir);

  return {
    dataDir,
    cleanup: () => {
      // Reset to default directory
      setDataDirectory(path.join(__dirname, '../../../opas/public/data'));

      // Clean up test directory
      if (fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Seed test data store with fixtures
 */
export function seedTestData(fixtures: {
  zones?: Zone[];
  timeBuckets?: TimeBucket[];
  routes?: Array<{
    fromId: string;
    toId: string;
    period: TimePeriod;
    routes: Array<{
      toId: string;
      duration?: number | null;
      transfers?: number | null;
      status: RouteStatus;
      legs?: any[];
    }>;
  }>;
  pipelineState?: PipelineState;
}): void {
  // Write zones.json
  if (fixtures.zones || fixtures.timeBuckets) {
    const zonesData: ZonesData = {
      version: 1,
      timeBuckets: fixtures.timeBuckets || [],
      zones: fixtures.zones || [],
    };
    writeZones(zonesData);
  }

  // Write route files
  if (fixtures.routes) {
    for (const routeFile of fixtures.routes) {
      const routesData: ZoneRoutesData = {
        f: routeFile.fromId,
        p: routeFile.period.charAt(0), // M, E, or N
        r: routeFile.routes.map(r => ({
          i: r.toId,
          d: r.duration !== undefined ? r.duration : null,
          t: r.transfers !== undefined ? r.transfers : null,
          s: r.status,
          l: r.legs,
        })),
      };
      writeZoneRoutes(routeFile.fromId, routeFile.period, routesData);
    }
  }

  // Write pipeline state
  if (fixtures.pipelineState) {
    writePipelineState(fixtures.pipelineState);
  }
}

/**
 * Read all data from test directory for assertions
 */
export function getDataSnapshot(dataDir: string) {
  const snapshot: {
    zones: Zone[];
    timeBuckets: TimeBucket[];
    routeFiles: string[];
    pipelineState: PipelineState | null;
  } = {
    zones: [],
    timeBuckets: [],
    routeFiles: [],
    pipelineState: null,
  };

  // Read zones.json
  const zonesPath = path.join(dataDir, 'zones.json');
  if (fs.existsSync(zonesPath)) {
    const zonesData = JSON.parse(fs.readFileSync(zonesPath, 'utf-8'));
    snapshot.zones = zonesData.zones;
    snapshot.timeBuckets = zonesData.timeBuckets;
  }

  // List route files
  const routesDir = path.join(dataDir, 'routes');
  if (fs.existsSync(routesDir)) {
    snapshot.routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.msgpack'));
  }

  // Read pipeline state
  const pipelinePath = path.join(dataDir, 'pipeline.json');
  if (fs.existsSync(pipelinePath)) {
    snapshot.pipelineState = JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
  }

  return snapshot;
}
