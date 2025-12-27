# Phase 03: Fetch Zones Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 02 (Foundation)
**Estimated Effort:** 2-3 days
**Priority:** HIGH (first workflow, sets pattern for others)

---

## Overview

Implement the zone fetching workflow - the first stage of the data pipeline. This creates the foundational dataset that all other workflows depend on.

**What it does:**
1. Fetch postal code polygons from Finnish WFS service (Tilastokeskus)
2. Filter to Helsinki area (postal codes 00xxx, 01xxx, 02xxx)
3. Filter to visible area only (based on map projection bounds)
4. Calculate geometric centroids for each zone
5. Clean invalid geometry (remove corrupt polygon rings)
6. Generate SVG paths using D3 projection (pre-rendered for performance)
7. Initialize database schema
8. Insert zones into `places` table
9. Pre-fill `routes` table with Cartesian product (all zones → all zones × 3 periods)
10. Store metadata about the fetch operation

---

## Current Implementation

**File:** `src/fetch_zones.ts:1-392`

### Key Functions

**Lines 42-48:** `createProjection()` - D3 Mercator projection setup
- Center: [24.93, 60.17]
- Scale: 120000
- Must match MAP_CONFIG in opas BackgroundMap.vue

**Lines 51-76:** `projectGeometry()` - Manual coordinate projection
- Avoids D3's spherical clipping artifacts
- Handles Polygon and MultiPolygon types

**Lines 78-84:** `generateSvgPath()` - Pre-render SVG paths
- Projects geometry then generates path string
- Reduces runtime overhead in opas UI

**Lines 87-118:** `getVisibleAreaBounds()` - Calculate visible map area
- Inverse projects viewBox corners to lat/lon
- Used to filter out zones outside visible area

**Lines 121-147:** `isGeometryInVisibleArea()` - Check if zone is visible
- Tests if any point of geometry is within bounds
- Reduces dataset size significantly

**Lines 165-198:** `cleanGeometry()` - Remove invalid polygon rings
- Filters rings outside reasonable WGS84 bounds
- Prevents corrupt data from breaking rendering

**Lines 200-260:** `initDb()` - Initialize database schema
- **DROPS existing places and routes tables** (destructive!)
- Creates tables: places, routes, metadata, deciles
- Creates indexes for performance
- Returns open database connection

**Lines 262-392:** `main()` - Main workflow
1. Initialize DB (line 263)
2. Fetch WFS data (line 267)
3. Calculate visible bounds (lines 277-279)
4. Process features:
   - Filter to postal codes 00/01/02 (line 289)
   - Calculate centroids (line 298)
   - Clean geometry (line 305)
   - Filter to visible area (line 312)
   - Generate SVG paths (line 317)
5. Test mode: limit to 5 zones (lines 338-341)
6. Insert into DB via transaction (lines 355-371)
7. Pre-fill routes Cartesian product (lines 361-368)
8. Store metadata (lines 373-380)

### Constants

**Lines 31-41:** SVG projection parameters
- Must exactly match opas MAP_CONFIG
- Any mismatch causes visual misalignment

**Line 149-152:** WFS URL and paths
- `WFS_URL`: Tilastokeskus postal code data (2024)
- `DB_PATH`: ../opas/public/varikko.db

**Line 154-155:** Test mode and time periods
- `IS_TEST`: --test flag check
- `TIME_PERIODS`: ['MORNING', 'EVENING', 'MIDNIGHT']

**Lines 158-163:** Helsinki bounds
- minLon: 24.0, maxLon: 25.5
- minLat: 59.9, maxLat: 60.5

### Data Flow

```
WFS API (Tilastokeskus)
  ↓ Download GeoJSON
Filter by postal code (00/01/02)
  ↓
Calculate geometric centroid
  ↓
Clean geometry (remove invalid rings)
  ↓
Filter to visible area
  ↓
Generate SVG path (D3 projection)
  ↓
Insert into places table
  ↓
Pre-fill routes table (Cartesian product)
  ↓
Store metadata
```

### Pain Points in Current Code

1. **Destructive initialization:** `DROP TABLE` without confirmation
2. **No progress feedback:** Long-running operation with minimal output
3. **Test mode inconsistent:** Hard-coded 5 zones
4. **No resume capability:** Must start over if interrupted
5. **Error handling limited:** Entire operation fails if one zone has issues
6. **Projection params duplicated:** Same values in multiple places

---

## Target Architecture

### File Structure

```
src/
├── lib/
│   └── zones.ts              # Business logic
└── tui/
    └── screens/
        └── fetch-zones.tsx   # TUI screen
```

### Business Logic API

**File:** `src/lib/zones.ts`

```typescript
import type { ProgressEmitter } from './events';
import type Database from 'better-sqlite3';

export interface FetchZonesOptions {
  testMode?: boolean;
  testLimit?: number;
  emitter?: ProgressEmitter;
}

export interface ZoneData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  geometry: string;  // JSON string
  svg_path: string;
}

/**
 * Fetch zones from WFS and populate database
 */
export async function fetchZones(
  db: Database.Database,
  options: FetchZonesOptions = {}
): Promise<{ zoneCount: number; routeCount: number }>;

/**
 * Download zones from WFS
 */
export async function downloadZonesFromWFS(): Promise<any>;

/**
 * Process raw WFS features into ZoneData
 */
export function processZones(
  features: any[],
  options: { testMode?: boolean; testLimit?: number }
): ZoneData[];

/**
 * Initialize database schema (destructive!)
 */
export function initializeSchema(db: Database.Database): void;

/**
 * Insert zones and pre-fill routes
 */
export function insertZones(
  db: Database.Database,
  zones: ZoneData[],
  emitter?: ProgressEmitter
): void;
```

---

## Implementation Steps

### Step 1: Write Tests

**File:** `src/tests/lib/zones.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDB, seedDB, getDBSnapshot } from '../helpers/db';
import { assertRecordCount } from '../helpers/assertions';
import {
  fetchZones,
  downloadZonesFromWFS,
  processZones,
  initializeSchema,
  insertZones,
} from '../../lib/zones';
import axios from 'axios';

// Mock axios for WFS requests
vi.mock('axios');

describe('zones - downloadZonesFromWFS', () => {
  it('should download zones from WFS', async () => {
    const mockData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { postinumeroalue: '00100', nimi: 'Kaartinkaupunki' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]],
          },
        },
      ],
    };

    vi.mocked(axios.get).mockResolvedValue({ data: mockData });

    const result = await downloadZonesFromWFS();

    expect(result.features).toHaveLength(1);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('geo.stat.fi'),
      expect.any(Object)
    );
  });

  it('should handle network errors', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

    await expect(downloadZonesFromWFS()).rejects.toThrow('Network error');
  });
});

describe('zones - processZones', () => {
  it('should filter to Helsinki postal codes only', () => {
    const features = [
      {
        type: 'Feature',
        properties: { postinumeroalue: '00100', nimi: 'Helsinki' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]],
        },
      },
      {
        type: 'Feature',
        properties: { postinumeroalue: '33100', nimi: 'Tampere' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[23.0, 61.0], [23.1, 61.0], [23.1, 61.1], [23.0, 61.1], [23.0, 61.0]]],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe('00100');
  });

  it('should calculate geometric centroids', () => {
    const features = [
      {
        type: 'Feature',
        properties: { postinumeroalue: '00100', nimi: 'Helsinki' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[24.0, 60.0], [25.0, 60.0], [25.0, 61.0], [24.0, 61.0], [24.0, 60.0]]],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones[0].lat).toBeCloseTo(60.5, 1);
    expect(zones[0].lon).toBeCloseTo(24.5, 1);
  });

  it('should generate SVG paths', () => {
    const features = [
      {
        type: 'Feature',
        properties: { postinumeroalue: '00100', nimi: 'Helsinki' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones[0].svg_path).toBeTruthy();
    expect(zones[0].svg_path).toMatch(/^M/);  // SVG path starts with M
  });

  it('should limit zones in test mode', () => {
    const features = Array.from({ length: 50 }, (_, i) => ({
      type: 'Feature',
      properties: { postinumeroalue: `001${i.toString().padStart(2, '0')}`, nimi: `Zone ${i}` },
      geometry: {
        type: 'Polygon',
        coordinates: [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]],
      },
    }));

    const zones = processZones(features, { testMode: true, testLimit: 5 });

    expect(zones.length).toBeLessThanOrEqual(5);
  });

  it('should clean invalid geometry', () => {
    const features = [
      {
        type: 'Feature',
        properties: { postinumeroalue: '00100', nimi: 'Helsinki' },
        geometry: {
          type: 'Polygon',
          // Invalid coordinates (way outside bounds)
          coordinates: [[[100.0, 80.0], [110.0, 80.0], [110.0, 85.0], [100.0, 85.0], [100.0, 80.0]]],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones).toHaveLength(0);  // Should be filtered out
  });
});

describe('zones - initializeSchema', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should create all required tables', () => {
    initializeSchema(testDB.db);

    const tables = testDB.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tables.map(t => t.name)).toEqual(
      expect.arrayContaining(['places', 'routes', 'metadata', 'deciles'])
    );
  });

  it('should create indexes', () => {
    initializeSchema(testDB.db);

    const indexes = testDB.db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(indexes.map(i => i.name)).toEqual(
      expect.arrayContaining(['idx_routes_to', 'idx_routes_status', 'idx_deciles_number'])
    );
  });

  it('should drop existing tables (destructive)', () => {
    // Create a table first
    testDB.db.exec('CREATE TABLE places (id TEXT PRIMARY KEY)');
    testDB.db.exec("INSERT INTO places (id) VALUES ('test')");

    // Initialize schema
    initializeSchema(testDB.db);

    // Old data should be gone
    const count = testDB.db.prepare('SELECT COUNT(*) as count FROM places').get() as { count: number };
    expect(count.count).toBe(0);
  });
});

describe('zones - insertZones', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
    initializeSchema(testDB.db);
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should insert zones into places table', () => {
    const zones: ZoneData[] = [
      {
        id: '00100',
        name: 'Kaartinkaupunki',
        lat: 60.1653,
        lon: 24.9497,
        geometry: '{"type":"Polygon","coordinates":[[[24.945,60.163],[24.953,60.163],[24.953,60.167],[24.945,60.167],[24.945,60.163]]]}',
        svg_path: 'M 480 240 L 520 240 L 520 260 L 480 260 Z',
      },
      {
        id: '00120',
        name: 'Punavuori',
        lat: 60.1618,
        lon: 24.9401,
        geometry: '{"type":"Polygon","coordinates":[[[24.935,60.159],[24.945,60.159],[24.945,60.164],[24.935,60.164],[24.935,60.159]]]}',
        svg_path: 'M 450 235 L 480 235 L 480 255 L 450 255 Z',
      },
    ];

    insertZones(testDB.db, zones);

    assertRecordCount(testDB.db, 'places', 2);

    const place = testDB.db.prepare('SELECT * FROM places WHERE id = ?').get('00100') as any;
    expect(place.name).toBe('Kaartinkaupunki');
    expect(place.lat).toBeCloseTo(60.1653, 4);
    expect(place.lon).toBeCloseTo(24.9497, 4);
  });

  it('should pre-fill routes Cartesian product', () => {
    const zones: ZoneData[] = [
      { id: '00100', name: 'Zone 1', lat: 60.1, lon: 24.9, geometry: '{}', svg_path: 'M 0 0' },
      { id: '00120', name: 'Zone 2', lat: 60.2, lon: 24.95, geometry: '{}', svg_path: 'M 0 0' },
      { id: '00130', name: 'Zone 3', lat: 60.15, lon: 24.92, geometry: '{}', svg_path: 'M 0 0' },
    ];

    insertZones(testDB.db, zones);

    // Should create: 3 zones × 2 destinations (excluding self) × 3 periods = 18 routes
    assertRecordCount(testDB.db, 'routes', 18);

    const routes = testDB.db.prepare('SELECT * FROM routes WHERE from_id = ? AND to_id = ?').all('00100', '00120') as any[];
    expect(routes).toHaveLength(3);  // 3 time periods
    expect(routes.map(r => r.time_period)).toEqual(expect.arrayContaining(['MORNING', 'EVENING', 'MIDNIGHT']));
    expect(routes.every(r => r.status === 'PENDING')).toBe(true);
  });

  it('should skip self-routes', () => {
    const zones: ZoneData[] = [
      { id: '00100', name: 'Zone 1', lat: 60.1, lon: 24.9, geometry: '{}', svg_path: 'M 0 0' },
    ];

    insertZones(testDB.db, zones);

    const selfRoutes = testDB.db.prepare('SELECT * FROM routes WHERE from_id = to_id').all();
    expect(selfRoutes).toHaveLength(0);
  });

  it('should emit progress events', () => {
    const zones: ZoneData[] = Array.from({ length: 10 }, (_, i) => ({
      id: `001${i.toString().padStart(2, '0')}`,
      name: `Zone ${i}`,
      lat: 60.1,
      lon: 24.9,
      geometry: '{}',
      svg_path: 'M 0 0',
    }));

    const events: any[] = [];
    const emitter = createProgressEmitter();
    emitter.on('progress', (event) => events.push(event));

    insertZones(testDB.db, zones, emitter);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('start');
    expect(events.some(e => e.type === 'progress')).toBe(true);
    expect(events[events.length - 1].type).toBe('complete');
  });
});

describe('zones - fetchZones (integration)', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        type: 'FeatureCollection',
        features: Array.from({ length: 10 }, (_, i) => ({
          type: 'Feature',
          properties: { postinumeroalue: `001${i.toString().padStart(2, '0')}`, nimi: `Zone ${i}` },
          geometry: {
            type: 'Polygon',
            coordinates: [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]],
          },
        })),
      },
    });
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should fetch and insert zones end-to-end', async () => {
    const result = await fetchZones(testDB.db, { testMode: true, testLimit: 5 });

    expect(result.zoneCount).toBeLessThanOrEqual(5);
    expect(result.routeCount).toBeGreaterThan(0);

    assertRecordCount(testDB.db, 'places', result.zoneCount);
  });

  it('should store metadata', async () => {
    await fetchZones(testDB.db, { testMode: true });

    const metadata = testDB.db.prepare("SELECT value FROM metadata WHERE key = 'last_fetch'").get() as { value: string };
    expect(metadata).toBeDefined();

    const parsed = JSON.parse(metadata.value);
    expect(parsed.date).toBeTruthy();
    expect(parsed.zoneCount).toBeGreaterThan(0);
    expect(parsed.isTest).toBe(true);
  });
});
```

---

### Step 2: Implement Business Logic

**File:** `src/lib/zones.ts`

Extract logic from `fetch_zones.ts:1-392` into testable functions:

```typescript
import axios from 'axios';
import * as turf from '@turf/turf';
import * as d3 from 'd3-geo';
import type Database from 'better-sqlite3';
import type { Geometry, Position, Polygon, MultiPolygon, Feature } from 'geojson';
import type { ProgressEmitter } from './events';

// Constants (extracted from fetch_zones.ts)
const WFS_URL = 'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';

const TIME_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];

const HELSINKI_BOUNDS = {
  minLon: 24.0,
  maxLon: 25.5,
  minLat: 59.9,
  maxLat: 60.5,
};

// SVG projection parameters (must match MAP_CONFIG in opas)
const ZOOM_LEVEL = 1.2;
const BASE_WIDTH = 800;
const BASE_HEIGHT = 800;
const WIDTH = BASE_WIDTH * ZOOM_LEVEL;
const HEIGHT = BASE_HEIGHT * ZOOM_LEVEL;
const VIEW_BOX_X = -(WIDTH - BASE_WIDTH) / 2 + 60;
const VIEW_BOX_Y = -120 - (HEIGHT - BASE_HEIGHT);

// ... (copy all helper functions from fetch_zones.ts)
// - createProjection()
// - projectGeometry()
// - generateSvgPath()
// - getVisibleAreaBounds()
// - isGeometryInVisibleArea()
// - isValidRing()
// - cleanGeometry()

export interface FetchZonesOptions {
  testMode?: boolean;
  testLimit?: number;
  emitter?: ProgressEmitter;
}

export interface ZoneData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  geometry: string;
  svg_path: string;
}

/**
 * Download zones from WFS service
 */
export async function downloadZonesFromWFS(): Promise<any> {
  const response = await axios.get(WFS_URL, {
    responseType: 'json',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response.data;
}

/**
 * Process raw WFS features into ZoneData
 */
export function processZones(
  features: any[],
  options: { testMode?: boolean; testLimit?: number } = {}
): ZoneData[] {
  const projection = createProjection();
  const visibleBounds = getVisibleAreaBounds(projection);

  let processed = features
    .map((feature: Feature<Geometry, any>) => {
      const props = feature.properties;
      const code = props.postinumeroalue || props.posti_alue;
      const name = props.nimi;

      // Filter to Helsinki postal codes
      if (!code || !code.match(/^(00|01|02)/)) return null;

      // Calculate geometric centroid
      let centroid: [number, number] | null = null;
      try {
        const center = turf.centroid(feature);
        centroid = center.geometry.coordinates as [number, number];
      } catch {
        return null;
      }

      // Clean geometry
      const cleanedGeometry = cleanGeometry(feature.geometry);
      if (!cleanedGeometry) return null;

      // Filter to visible area
      if (!isGeometryInVisibleArea(cleanedGeometry, visibleBounds)) {
        return null;
      }

      // Generate SVG path
      const svgPath = generateSvgPath(cleanedGeometry, projection);
      if (!svgPath) return null;

      return {
        id: code,
        name: name || '',
        lat: centroid[1],
        lon: centroid[0],
        geometry: JSON.stringify(cleanedGeometry),
        svg_path: svgPath,
      };
    })
    .filter((z): z is ZoneData => z !== null);

  // Apply test mode limit
  if (options.testMode && options.testLimit) {
    processed = processed.slice(0, options.testLimit);
  }

  return processed;
}

/**
 * Initialize database schema (DESTRUCTIVE - drops existing tables)
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS routes;
    DROP TABLE IF EXISTS places;
    CREATE TABLE places (
      id TEXT PRIMARY KEY,
      name TEXT,
      lat REAL,
      lon REAL,
      geometry TEXT,
      svg_path TEXT,
      routing_lat REAL,
      routing_lon REAL,
      routing_source TEXT,
      geocoding_error TEXT
    );

    CREATE TABLE IF NOT EXISTS routes (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      time_period TEXT NOT NULL,
      duration INTEGER,
      numberOfTransfers INTEGER,
      walkDistance REAL,
      legs TEXT,
      status TEXT DEFAULT 'PENDING',
      PRIMARY KEY (from_id, to_id, time_period),
      FOREIGN KEY (from_id) REFERENCES places(id),
      FOREIGN KEY (to_id) REFERENCES places(id)
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS deciles (
      id INTEGER PRIMARY KEY,
      decile_number INTEGER NOT NULL UNIQUE,
      min_duration INTEGER NOT NULL,
      max_duration INTEGER NOT NULL,
      color_hex TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_routes_to ON routes(to_id, time_period);
    CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
    CREATE INDEX IF NOT EXISTS idx_deciles_number ON deciles(decile_number);
  `);
}

/**
 * Insert zones and pre-fill routes
 */
export function insertZones(
  db: Database.Database,
  zones: ZoneData[],
  emitter?: ProgressEmitter
): void {
  emitter?.emitStart('fetch_zones', zones.length, 'Inserting zones...');

  const insertPlace = db.prepare(`
    INSERT OR REPLACE INTO places (id, name, lat, lon, geometry, svg_path)
    VALUES (@id, @name, @lat, @lon, @geometry, @svg_path)
  `);

  const insertRoute = db.prepare(`
    INSERT OR IGNORE INTO routes (from_id, to_id, time_period, status)
    VALUES (?, ?, ?, 'PENDING')
  `);

  const transaction = db.transaction(() => {
    // Insert zones
    for (const zone of zones) {
      insertPlace.run(zone);
    }

    // Pre-fill routes Cartesian product
    let routeCount = 0;
    const totalRoutes = zones.length * (zones.length - 1) * TIME_PERIODS.length;

    for (const fromZone of zones) {
      for (const toZone of zones) {
        if (fromZone.id === toZone.id) continue;

        for (const period of TIME_PERIODS) {
          insertRoute.run(fromZone.id, toZone.id, period);
          routeCount++;

          if (routeCount % 100 === 0) {
            emitter?.emitProgress('fetch_zones', routeCount, totalRoutes, 'Pre-filling routes...');
          }
        }
      }
    }
  });

  transaction();

  emitter?.emitComplete('fetch_zones', 'Zones inserted successfully', {
    zoneCount: zones.length,
    routeCount: zones.length * (zones.length - 1) * TIME_PERIODS.length,
  });
}

/**
 * Fetch zones from WFS and populate database
 */
export async function fetchZones(
  db: Database.Database,
  options: FetchZonesOptions = {}
): Promise<{ zoneCount: number; routeCount: number }> {
  const emitter = options.emitter;

  emitter?.emitStart('fetch_zones', undefined, 'Downloading zones from WFS...');

  // Download from WFS
  const geojson = await downloadZonesFromWFS();

  emitter?.emitProgress('fetch_zones', 0, 100, `Downloaded ${geojson.features.length} features`);

  // Process zones
  const zones = processZones(geojson.features, {
    testMode: options.testMode,
    testLimit: options.testLimit || 5,
  });

  // Initialize schema
  initializeSchema(db);

  // Insert zones
  insertZones(db, zones, emitter);

  // Store metadata
  db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
    'last_fetch',
    JSON.stringify({
      date: new Date().toISOString(),
      zoneCount: zones.length,
      isTest: options.testMode || false,
    })
  );

  const routeCount = zones.length * (zones.length - 1) * TIME_PERIODS.length;

  return { zoneCount: zones.length, routeCount };
}
```

---

### Step 3: Implement TUI Screen

**File:** `src/tui/screens/fetch-zones.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProgressBar } from '../components/ProgressBar';
import { Spinner } from '../components/Spinner';
import { openDB } from '../../lib/db';
import { fetchZones } from '../../lib/zones';
import { createProgressEmitter, type ProgressEvent } from '../../lib/events';
import { colors, symbols } from '../theme';

interface FetchZonesScreenProps {
  testMode: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

export function FetchZonesScreen({ testMode, onComplete, onCancel }: FetchZonesScreenProps) {
  const { exit } = useApp();
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<{ zoneCount: number; routeCount: number } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (status !== 'idle') return;

    const run = async () => {
      setStatus('running');

      const db = openDB();
      const emitter = createProgressEmitter();

      emitter.on('progress', (event) => {
        setProgress(event);
      });

      try {
        const result = await fetchZones(db, {
          testMode,
          testLimit: 5,
          emitter,
        });

        setResult(result);
        setStatus('complete');
      } catch (err) {
        setError(err as Error);
        setStatus('error');
      } finally {
        db.close();
      }
    };

    run();
  }, [status, testMode]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="FETCH ZONES"
        subtitle={testMode ? 'Test Mode (5 zones)' : 'Full Run'}
        width={80}
      />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {status === 'running' && (
          <>
            {progress && (
              <>
                {progress.type === 'start' && (
                  <Box>
                    <Spinner label={progress.message || 'Starting...'} />
                  </Box>
                )}

                {progress.type === 'progress' && progress.current && progress.total && (
                  <ProgressBar
                    current={progress.current}
                    total={progress.total}
                    label={progress.message || 'Processing...'}
                  />
                )}
              </>
            )}
          </>
        )}

        {status === 'complete' && result && (
          <Box flexDirection="column">
            <Text color="green">
              {symbols.success} Zones fetched successfully!
            </Text>
            <Box marginTop={1}>
              <Text>Zones: </Text>
              <Text color="cyan">{result.zoneCount}</Text>
            </Box>
            <Box>
              <Text>Routes: </Text>
              <Text color="cyan">{result.routeCount.toLocaleString()}</Text>
              <Text color="gray"> (Cartesian product pre-filled)</Text>
            </Box>
          </Box>
        )}

        {status === 'error' && error && (
          <Box flexDirection="column">
            <Text color="red">
              {symbols.error} Error fetching zones
            </Text>
            <Text color="gray" marginTop={1}>
              {error.message}
            </Text>
          </Box>
        )}
      </Box>

      <Footer
        shortcuts={
          status === 'complete' || status === 'error'
            ? [{ key: 'Enter', label: 'Continue' }]
            : []
        }
      />
    </Box>
  );
}
```

---

### Step 4: Implement CLI Command

**File:** `src/cli.ts` (add action to existing command)

```typescript
import { openDB } from './lib/db';
import { fetchZones } from './lib/zones';
import { createProgressEmitter } from './lib/events';

// In the 'fetch' command action:
program
  .command('fetch')
  .description('Fetch postal code zones from WFS')
  .option('-t, --test', 'Test mode (5 zones only)')
  .action(async (options) => {
    const db = openDB();
    const emitter = createProgressEmitter();

    emitter.on('progress', (event) => {
      if (event.type === 'start' || event.type === 'progress') {
        console.log(event.message || '');
      } else if (event.type === 'complete') {
        console.log('✓', event.message || 'Complete');
      } else if (event.type === 'error') {
        console.error('✗', event.message || 'Error', event.error);
      }
    });

    try {
      const result = await fetchZones(db, {
        testMode: options.test,
        testLimit: 5,
        emitter,
      });

      console.log(`\nZones: ${result.zoneCount}`);
      console.log(`Routes: ${result.routeCount}`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      db.close();
    }
  });
```

---

## Acceptance Criteria

### Must Pass Before Phase 04

- ✅ All tests in `zones.test.ts` pass
- ✅ `pnpm test --coverage` shows 80%+ coverage for `lib/zones.ts`
- ✅ TUI screen launches and fetches zones
- ✅ CLI command `varikko fetch` works
- ✅ CLI command `varikko fetch --test` limits to 5 zones
- ✅ Progress events emit correctly during fetch
- ✅ Database schema created correctly
- ✅ Routes pre-filled with Cartesian product
- ✅ Metadata stored with timestamp

### Quality Gates

- ✅ WFS download works (test with real API)
- ✅ Zone filtering works (only Helsinki postal codes)
- ✅ SVG paths generated correctly
- ✅ Geometry cleaning works (no corrupt data)
- ✅ Visible area filtering reduces dataset
- ✅ Test mode works identically to current `--test` flag

---

## Manual Testing Checklist

- [ ] Run `pnpm test` - all zones tests pass
- [ ] Run `varikko fetch --test` - fetches 5 zones
- [ ] Verify DB has 5 zones in `places` table
- [ ] Verify DB has routes pre-filled (5×4×3 = 60 routes)
- [ ] Run `varikko fetch` (full) - fetches all ~279 zones
- [ ] Verify zone count matches current implementation
- [ ] Verify SVG paths are non-null
- [ ] Verify geometric centroids are within Helsinki bounds
- [ ] Check logs - progress messages appear
- [ ] Compare DB schema with old implementation (should be identical)

---

## Migration Notes

- **After this phase:** Can delete `src/fetch_zones.ts`
- **Update package.json:** Remove `fetch:zones` script (use `varikko fetch`)

---

## Rollback Plan

If this phase fails:
1. Keep `src/fetch_zones.ts` (don't delete yet)
2. Remove `src/lib/zones.ts` and `src/tui/screens/fetch-zones.tsx`
3. Revert `src/cli.ts` changes
4. Continue using `pnpm fetch:zones`

---

## Next Phase

After fetch zones workflow is complete, proceed to:
- **Phase 04:** Geocode Zones (optional enhancement to routing points)

---

## References

- **Current Implementation:** `src/fetch_zones.ts:1-392`
- **Tilastokeskus WFS:** https://geo.stat.fi/geoserver/
- **Turf.js:** https://turfjs.org
- **D3 Geo:** https://github.com/d3/d3-geo
- **GeoJSON Spec:** https://geojson.org
