# Phase 01: Testing Setup

**Status:** Ready for implementation
**Dependencies:** None
**Estimated Effort:** 1-2 days
**Priority:** CRITICAL (foundation for all other phases)

---

## Overview

Establish comprehensive testing infrastructure before any refactoring begins. This phase creates the foundation for validating that new TUI implementation produces identical results to current scripts.

---

## Current State

**File:** `vitest.config.ts:1-9`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**Current Usage:**
- Vitest already in dependencies (v4)
- Minimal config (run mode only)
- No existing test files
- No test fixtures or helpers

**Pain Points:**
- No way to validate refactor correctness
- Manual testing only
- No regression protection
- Can't confidently refactor complex logic

---

## Target Architecture

### Test Organization

```
src/tests/
├── setup.ts                      # Global test setup
├── helpers/
│   ├── db.ts                     # Test DB creation/cleanup
│   ├── assertions.ts             # Custom matchers
│   └── fixtures.ts               # Data loading utilities
│
├── fixtures/                     # Sample data
│   ├── zones/
│   │   ├── 5-zones.json         # Small dataset (test mode)
│   │   ├── 50-zones.json        # Medium dataset
│   │   └── full-zones.json      # Full dataset (279 zones)
│   ├── routes/
│   │   ├── sample-routes.json
│   │   └── edge-cases.json      # NO_ROUTE, ERROR cases
│   ├── deciles/
│   │   └── expected-deciles.json
│   └── db/
│       ├── schema.sql            # DB schema
│       └── seed-data.sql         # Minimal seed data
│
├── lib/                          # Unit tests (per workflow)
│   ├── zones.test.ts
│   ├── geocoding.test.ts
│   ├── routing.test.ts
│   ├── clearing.test.ts
│   ├── deciles.test.ts
│   ├── maps.test.ts
│   └── export.test.ts
│
└── integration/                  # End-to-end tests
    ├── workflow.test.ts          # Full pipeline
    └── cli.test.ts               # CLI interface
```

---

## Implementation Steps

### Step 1: Enhance Vitest Configuration

**File:** `vitest.config.ts`

**Changes:**
1. Add coverage configuration
2. Add test timeouts for long-running operations
3. Add setup file reference
4. Add globals for better DX

**New Config:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/tests/**',
        'src/tui/**',  // UI tests separate concern
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 30000,  // 30s for route calculation tests
    hookTimeout: 10000,
  },
});
```

**Install Coverage Provider:**
```bash
pnpm add -D @vitest/coverage-v8
pnpm add -D @vitest/ui  # Optional: nice browser UI for tests
```

---

### Step 2: Create Test Setup File

**File:** `src/tests/setup.ts`

**Purpose:**
- Global test configuration
- Environment variables for testing
- Cleanup hooks

**Implementation:**
```typescript
import { afterAll, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Test database path (in-memory or temp file)
export const TEST_DB_PATH = ':memory:';  // Or path.join(process.cwd(), 'test-varikko.db');

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.USE_LOCAL_OTP = 'true';  // Always use local in tests

  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
});

afterAll(() => {
  // Cleanup: remove test database if file-based
  if (TEST_DB_PATH !== ':memory:' && fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});
```

---

### Step 3: Create Test Database Helpers

**File:** `src/tests/helpers/db.ts`

**Purpose:**
- Create fresh test databases
- Seed with fixture data
- Clean up after tests

**Implementation:**
```typescript
import Database from 'better-sqlite3';
import { TEST_DB_PATH } from '../setup';

export interface TestDB {
  db: Database.Database;
  cleanup: () => void;
}

/**
 * Create a fresh test database with schema
 */
export function createTestDB(path: string = TEST_DB_PATH): TestDB {
  const db = new Database(path);

  // Enable WAL mode (same as production)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema (extracted from fetch_zones.ts logic)
  db.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      geometry TEXT NOT NULL,
      svg_path TEXT NOT NULL,
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
      status TEXT NOT NULL DEFAULT 'PENDING',
      PRIMARY KEY (from_id, to_id, time_period),
      FOREIGN KEY (from_id) REFERENCES places(id),
      FOREIGN KEY (to_id) REFERENCES places(id)
    );

    CREATE INDEX IF NOT EXISTS idx_routes_to ON routes(to_id, time_period);
    CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);

    CREATE TABLE IF NOT EXISTS deciles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decile_number INTEGER UNIQUE NOT NULL,
      min_duration INTEGER NOT NULL,
      max_duration INTEGER NOT NULL,
      color_hex TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_deciles_number ON deciles(decile_number);

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return {
    db,
    cleanup: () => {
      db.close();
      if (path !== ':memory:' && require('fs').existsSync(path)) {
        require('fs').unlinkSync(path);
      }
    },
  };
}

/**
 * Seed database with fixture data
 */
export function seedDB(db: Database.Database, fixtures: {
  places?: any[];
  routes?: any[];
  deciles?: any[];
  metadata?: Record<string, any>;
}): void {
  if (fixtures.places) {
    const insertPlace = db.prepare(`
      INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon, routing_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const place of fixtures.places) {
      insertPlace.run(
        place.id,
        place.name,
        place.lat,
        place.lon,
        JSON.stringify(place.geometry),
        place.svg_path,
        place.routing_lat || null,
        place.routing_lon || null,
        place.routing_source || null
      );
    }
  }

  if (fixtures.routes) {
    const insertRoute = db.prepare(`
      INSERT INTO routes (from_id, to_id, time_period, duration, numberOfTransfers, walkDistance, legs, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const route of fixtures.routes) {
      insertRoute.run(
        route.from_id,
        route.to_id,
        route.time_period,
        route.duration || null,
        route.numberOfTransfers || null,
        route.walkDistance || null,
        route.legs ? JSON.stringify(route.legs) : null,
        route.status || 'PENDING'
      );
    }
  }

  if (fixtures.deciles) {
    const insertDecile = db.prepare(`
      INSERT INTO deciles (decile_number, min_duration, max_duration, color_hex, label)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const decile of fixtures.deciles) {
      insertDecile.run(
        decile.decile_number,
        decile.min_duration,
        decile.max_duration,
        decile.color_hex,
        decile.label
      );
    }
  }

  if (fixtures.metadata) {
    const insertMetadata = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');

    for (const [key, value] of Object.entries(fixtures.metadata)) {
      insertMetadata.run(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
}

/**
 * Get all data from database (for assertions)
 */
export function getDBSnapshot(db: Database.Database) {
  return {
    places: db.prepare('SELECT * FROM places ORDER BY id').all(),
    routes: db.prepare('SELECT * FROM routes ORDER BY from_id, to_id, time_period').all(),
    deciles: db.prepare('SELECT * FROM deciles ORDER BY decile_number').all(),
    metadata: db.prepare('SELECT * FROM metadata ORDER BY key').all(),
  };
}
```

---

### Step 4: Create Fixture Data Files

**File:** `src/tests/fixtures/zones/5-zones.json`

**Purpose:** Small dataset for fast tests (matches `--test` mode)

**Data:**
```json
[
  {
    "id": "00100",
    "name": "Kaartinkaupunki",
    "lat": 60.1653,
    "lon": 24.9497,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]]
    },
    "svg_path": "M 480 240 L 520 240 L 520 260 L 480 260 Z",
    "routing_lat": null,
    "routing_lon": null,
    "routing_source": null
  },
  {
    "id": "00120",
    "name": "Punavuori",
    "lat": 60.1618,
    "lon": 24.9401,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[24.935, 60.159], [24.945, 60.159], [24.945, 60.164], [24.935, 60.164], [24.935, 60.159]]]
    },
    "svg_path": "M 450 235 L 480 235 L 480 255 L 450 255 Z",
    "routing_lat": null,
    "routing_lon": null,
    "routing_source": null
  },
  {
    "id": "00130",
    "name": "Kaivopuisto",
    "lat": 60.1555,
    "lon": 24.9520,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[24.945, 60.152], [24.959, 60.152], [24.959, 60.159], [24.945, 60.159], [24.945, 60.152]]]
    },
    "svg_path": "M 480 220 L 510 220 L 510 235 L 480 235 Z",
    "routing_lat": null,
    "routing_lon": null,
    "routing_source": null
  },
  {
    "id": "00140",
    "name": "Kaartinkaupunki",
    "lat": 60.1618,
    "lon": 24.9554,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[24.950, 60.159], [24.961, 60.159], [24.961, 60.164], [24.950, 60.164], [24.950, 60.159]]]
    },
    "svg_path": "M 485 235 L 515 235 L 515 255 L 485 255 Z",
    "routing_lat": null,
    "routing_lon": null,
    "routing_source": null
  },
  {
    "id": "00150",
    "name": "Eira",
    "lat": 60.1573,
    "lon": 24.9351,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[24.928, 60.154], [24.942, 60.154], [24.942, 60.160], [24.928, 60.160], [24.928, 60.154]]]
    },
    "svg_path": "M 440 225 L 470 225 L 470 240 L 440 240 Z",
    "routing_lat": null,
    "routing_lon": null,
    "routing_source": null
  }
]
```

**File:** `src/tests/fixtures/routes/sample-routes.json`

**Purpose:** Sample successful route results

**Data:**
```json
[
  {
    "from_id": "00100",
    "to_id": "00120",
    "time_period": "MORNING",
    "duration": 600,
    "numberOfTransfers": 0,
    "walkDistance": 800,
    "status": "OK",
    "legs": [
      {
        "from": {"name": "Kaartinkaupunki", "lat": 60.1653, "lon": 24.9497},
        "to": {"name": "Punavuori", "lat": 60.1618, "lon": 24.9401},
        "mode": "WALK",
        "duration": 600,
        "distance": 800
      }
    ]
  },
  {
    "from_id": "00100",
    "to_id": "00130",
    "time_period": "MORNING",
    "duration": 1200,
    "numberOfTransfers": 1,
    "walkDistance": 450,
    "status": "OK",
    "legs": [
      {
        "from": {"name": "Kaartinkaupunki", "lat": 60.1653, "lon": 24.9497},
        "to": {"name": "Stop 1234", "lat": 60.164, "lon": 24.948},
        "mode": "WALK",
        "duration": 300,
        "distance": 250
      },
      {
        "from": {"name": "Stop 1234", "lat": 60.164, "lon": 24.948},
        "to": {"name": "Stop 5678", "lat": 60.157, "lon": 24.950},
        "mode": "BUS",
        "duration": 720,
        "distance": 1200,
        "route": "23",
        "headsign": "Kaivopuisto"
      },
      {
        "from": {"name": "Stop 5678", "lat": 60.157, "lon": 24.950},
        "to": {"name": "Kaivopuisto", "lat": 60.1555, "lon": 24.9520},
        "mode": "WALK",
        "duration": 180,
        "distance": 200
      }
    ]
  }
]
```

**File:** `src/tests/fixtures/routes/edge-cases.json`

**Purpose:** Edge cases (NO_ROUTE, ERROR)

**Data:**
```json
[
  {
    "from_id": "00100",
    "to_id": "00150",
    "time_period": "MIDNIGHT",
    "duration": null,
    "numberOfTransfers": null,
    "walkDistance": null,
    "status": "NO_ROUTE",
    "legs": null
  },
  {
    "from_id": "00120",
    "to_id": "00140",
    "time_period": "MORNING",
    "duration": null,
    "numberOfTransfers": null,
    "walkDistance": null,
    "status": "ERROR",
    "legs": "{\"error\": \"OTP timeout\"}"
  }
]
```

---

### Step 5: Create Custom Assertion Helpers

**File:** `src/tests/helpers/assertions.ts`

**Purpose:** Domain-specific assertions for cleaner tests

**Implementation:**
```typescript
import { expect } from 'vitest';
import type Database from 'better-sqlite3';

/**
 * Assert that database has expected number of records
 */
export function assertRecordCount(
  db: Database.Database,
  table: string,
  expected: number,
  message?: string
) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  expect(result.count, message || `Expected ${expected} records in ${table}`).toBe(expected);
}

/**
 * Assert that all routes have specific status
 */
export function assertAllRoutesStatus(
  db: Database.Database,
  status: string,
  period?: string
) {
  const query = period
    ? db.prepare('SELECT COUNT(*) as count FROM routes WHERE time_period = ? AND status != ?')
    : db.prepare('SELECT COUNT(*) as count FROM routes WHERE status != ?');

  const params = period ? [period, status] : [status];
  const result = query.get(...params) as { count: number };

  expect(result.count).toBe(0);
}

/**
 * Assert that zone has routing coordinates set
 */
export function assertZoneHasRoutingCoords(
  db: Database.Database,
  zoneId: string
) {
  const zone = db.prepare('SELECT routing_lat, routing_lon, routing_source FROM places WHERE id = ?')
    .get(zoneId) as any;

  expect(zone).toBeDefined();
  expect(zone.routing_lat).not.toBeNull();
  expect(zone.routing_lon).not.toBeNull();
  expect(zone.routing_source).not.toBeNull();
}

/**
 * Assert deciles are correctly calculated
 */
export function assertDecilesValid(db: Database.Database) {
  const deciles = db.prepare('SELECT * FROM deciles ORDER BY decile_number').all() as any[];

  // Should have 10 deciles
  expect(deciles).toHaveLength(10);

  // Decile numbers should be 1-10
  expect(deciles.map(d => d.decile_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Ranges should be continuous (no gaps)
  for (let i = 0; i < deciles.length - 1; i++) {
    expect(deciles[i].max_duration).toBe(deciles[i + 1].min_duration - 1);
  }

  // Last decile should have max_duration = -1 (open-ended)
  expect(deciles[9].max_duration).toBe(-1);

  // All should have colors and labels
  for (const decile of deciles) {
    expect(decile.color_hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(decile.label).toBeTruthy();
  }
}

/**
 * Compare two database snapshots (for regression testing)
 */
export function assertDBMatches(actual: any, expected: any, options?: {
  ignoredFields?: string[];
  tables?: string[];
}) {
  const tables = options?.tables || ['places', 'routes', 'deciles', 'metadata'];
  const ignored = options?.ignoredFields || ['created_at'];

  for (const table of tables) {
    const actualRecords = actual[table] || [];
    const expectedRecords = expected[table] || [];

    expect(actualRecords.length, `${table} record count mismatch`).toBe(expectedRecords.length);

    for (let i = 0; i < actualRecords.length; i++) {
      const actualRecord = { ...actualRecords[i] };
      const expectedRecord = { ...expectedRecords[i] };

      // Remove ignored fields
      for (const field of ignored) {
        delete actualRecord[field];
        delete expectedRecord[field];
      }

      expect(actualRecord, `${table}[${i}] mismatch`).toEqual(expectedRecord);
    }
  }
}
```

---

### Step 6: Create Fixture Loading Utilities

**File:** `src/tests/helpers/fixtures.ts`

**Purpose:** Load fixture data from JSON files

**Implementation:**
```typescript
import fs from 'fs';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

export function loadFixture<T = any>(relativePath: string): T {
  const fullPath = path.join(FIXTURES_DIR, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${relativePath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

export function loadZonesFixture(name: '5-zones' | '50-zones' | 'full-zones') {
  return loadFixture(`zones/${name}.json`);
}

export function loadRoutesFixture(name: 'sample-routes' | 'edge-cases') {
  return loadFixture(`routes/${name}.json`);
}
```

---

## Testing Strategy

### Unit Tests (lib/)

**Test each business logic function in isolation:**

1. **zones.test.ts**
   - ✅ Fetch zones from WFS (mock HTTP)
   - ✅ Calculate geometric centroids
   - ✅ Generate SVG paths
   - ✅ Filter to Helsinki area only
   - ✅ Initialize database schema
   - ✅ Pre-fill routes table

2. **geocoding.test.ts**
   - ✅ Geocode single zone (mock API)
   - ✅ Fallback strategies (postal → name → postal+Helsinki)
   - ✅ Fallback to geometric centroid on failure
   - ✅ Rate limiting (100ms between requests)
   - ✅ Update database with routing coords

3. **routing.test.ts**
   - ✅ Calculate single route (mock OTP)
   - ✅ Handle successful routes (OK status)
   - ✅ Handle no route found (NO_ROUTE status)
   - ✅ Handle errors (ERROR status)
   - ✅ Parse OTP response to route format
   - ✅ Multi-period support
   - ✅ Progress tracking

4. **clearing.test.ts**
   - ✅ Reset routes to PENDING
   - ✅ Clear all data
   - ✅ Clear specific tables
   - ✅ VACUUM after clearing

5. **deciles.test.ts**
   - ✅ Calculate deciles from routes
   - ✅ Generate correct color palette
   - ✅ Generate human-readable labels
   - ✅ Handle edge cases (< 10 routes)

6. **maps.test.ts**
   - ✅ Process shapefile to TopoJSON (mock mapshaper)
   - ✅ Reproject coordinates
   - ✅ Clip to bounding box
   - ✅ Simplify geometries

7. **export.test.ts**
   - ✅ Export routes to JSON
   - ✅ Nested format (from → to → duration)
   - ✅ Filter by period

### Integration Tests

**File:** `src/tests/integration/workflow.test.ts`

**Test full workflows:**
- ✅ Fetch zones → Geocode → Build routes → Calculate deciles (full pipeline)
- ✅ Clear data → Refetch zones (reset workflow)
- ✅ Process map → Generate SVG (map workflow)

---

## Acceptance Criteria

### Must Pass Before Phase 02

- ✅ Vitest config expanded with coverage
- ✅ All test helper files created
- ✅ All fixture files created
- ✅ Sample test for each workflow (even if just structure)
- ✅ `pnpm test` runs without errors
- ✅ Coverage report generates successfully

### Quality Gates

- ✅ Test execution time < 10s (with small fixtures)
- ✅ All helpers have TSDoc comments
- ✅ Fixtures cover both happy path and edge cases
- ✅ No test database files left after cleanup

---

## Manual Testing Checklist

- [ ] Run `pnpm test` - all tests pass
- [ ] Run `pnpm test --coverage` - generates HTML report
- [ ] Run `pnpm test --ui` - browser UI works (if installed)
- [ ] Verify test DB cleanup (no leftover files)
- [ ] Verify fixtures load correctly
- [ ] Test helper functions work in isolation

---

## Dependencies

**Install via pnpm:**

```bash
pnpm add -D @vitest/coverage-v8
pnpm add -D @vitest/ui
```

---

## Files to Create

```
src/tests/
├── setup.ts
├── helpers/
│   ├── db.ts
│   ├── assertions.ts
│   └── fixtures.ts
├── fixtures/
│   ├── zones/
│   │   └── 5-zones.json
│   ├── routes/
│   │   ├── sample-routes.json
│   │   └── edge-cases.json
│   └── .gitkeep
└── lib/
    ├── zones.test.ts        # Skeleton only
    ├── geocoding.test.ts    # Skeleton only
    ├── routing.test.ts      # Skeleton only
    ├── clearing.test.ts     # Skeleton only
    ├── deciles.test.ts      # Skeleton only
    ├── maps.test.ts         # Skeleton only
    └── export.test.ts       # Skeleton only
```

**Skeleton test example:**
```typescript
import { describe, it, expect } from 'vitest';

describe('zones', () => {
  it.todo('should fetch zones from WFS');
  it.todo('should calculate geometric centroids');
  // ... more test cases
});
```

---

## Migration Notes

- No migration needed (new files only)
- Current scripts unchanged
- Tests will guide refactoring in later phases

---

## Rollback Plan

If this phase fails:
1. Delete `src/tests/` directory
2. Revert `vitest.config.ts` to original
3. Remove test dependencies from `package.json`

---

## Next Phase

After completing testing setup, proceed to:
- **Phase 02:** Foundation (CLI parser, TUI framework, shared components)

---

## References

- **Vitest Docs:** https://vitest.dev
- **better-sqlite3:** https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- **Vitest Coverage:** https://vitest.dev/guide/coverage
