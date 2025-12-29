# Varikko Data Model Refactor Plan

## Executive Summary

**Goal**: Eliminate the SQLite database and establish the export format (`opas/public/data/`) as the single source of truth, eliminating data duplication and the need for a separate "export" step.

**Impact**:
- **Disk space**: 47MB → 5MB (89% reduction)
- **Architecture**: Simpler file-based data layer, no DB dependency
- **Developer experience**: No export step needed, data always ready to serve
- **Opas**: No changes required (data format remains identical)

## Current Architecture (Before Refactor)

### Data Flow
```
Source APIs (WFS, City APIs)
    ↓
[varikko fetch] → writes to DB
    ↓
opas/public/varikko.db (42MB)
├─ places table: zones with geometries + SVG paths
├─ routes table: all route calculations
├─ time_buckets table: heatmap color definitions
└─ metadata table: pipeline state
    ↓
[varikko geocode] → updates DB
    ↓
[varikko routes] → queries DB, calls OTP API, updates DB
    ↓
[varikko time-buckets] → updates DB
    ↓
[varikko export] → reads DB, writes files
    ↓
opas/public/data/ (~5MB)
├─ zones.json
├─ routes/*.msgpack
└─ manifest.json
    ↓
[Opas app] → reads zones.json + msgpack files
```

**Total disk usage**: 42MB (DB) + 5MB (export) = **47MB**

### Duplication Analysis

| Data | In DB | In Export | Duplicated? |
|------|-------|-----------|-------------|
| Zone SVG paths | ✓ | ✓ | **Yes** |
| Zone metadata (name, city) | ✓ | ✓ | **Yes** |
| Routing points | ✓ | ✓ | **Yes** |
| Route calculations | ✓ | ✓ | **Yes** |
| Time buckets | ✓ | ✓ | **Yes** |
| Full GeoJSON geometries | ✓ | ✗ | No (not used after SVG generation) |
| Pipeline metadata | ✓ | ✗ | No (not exported) |

**Result**: 95% of data is duplicated on disk.

## New Architecture (After Refactor)

### Data Flow
```
Source APIs (WFS, City APIs)
    ↓
[varikko fetch] → writes directly to opas/public/data/
    ↓
opas/public/data/ (5MB) ← SINGLE SOURCE OF TRUTH
├─ zones.json: all zone metadata + time buckets
├─ routes/*.msgpack: route calculations (with PENDING status)
├─ manifest.json: export metadata
└─ pipeline.json: pipeline state (NEW)
    ↓
[varikko geocode] → updates zones.json directly
    ↓
[varikko routes] → reads pending routes, calls OTP, updates msgpack files
    ↓
[varikko time-buckets] → updates zones.json directly
    ↓
[Opas app] → reads zones.json + msgpack files (NO CHANGES)
```

**Total disk usage**: 5MB (export format is source of truth)

### File Structure

```
opas/public/data/
├── zones.json                      # All zone metadata + time buckets
│   {
│     version: 1,
│     timeBuckets: [...],           # Color definitions for heatmap
│     zones: [                      # All zones
│       {
│         id: string,
│         name: string,
│         city: string,
│         svgPath: string,          # Pre-projected for rendering
│         routingPoint: [lat, lon]  # Geocoded or centroid
│       }
│     ]
│   }
│
├── routes/                         # Per-zone route files
│   ├── {zoneId}-morning.msgpack    # Binary msgpack format
│   ├── {zoneId}-evening.msgpack
│   └── {zoneId}-midnight.msgpack
│
│   Each msgpack file contains:
│   {
│     f: string,                    # fromId
│     p: string,                    # period (M/E/N)
│     r: CompactRoute[]             # routes
│   }
│
│   Where CompactRoute:
│   {
│     i: string,                    # toId
│     d: number | null,             # duration (minutes)
│     t: number | null,             # numberOfTransfers
│     s: RouteStatus,               # 0=OK, 1=NO_ROUTE, 2=ERROR, 3=PENDING
│     l?: CompactLeg[]              # legs (only if status=OK)
│   }
│
├── manifest.json                   # Export statistics
│   {
│     version: 1,
│     generated: "ISO timestamp",
│     zones: number,
│     routeFiles: number,
│     totalSize: number,
│     errors: number
│   }
│
└── pipeline.json                   # Pipeline execution state (NEW)
    {
      lastFetch: {
        timestamp: "ISO timestamp",
        zoneCount: number,
        limit?: number,
        cities: string[],
        filteringStats: {...}
      },
      lastGeocoding: {
        timestamp: "ISO timestamp",
        processed: number,
        successful: number,
        failed: number
      },
      lastRouteCalculation: {
        timestamp: "ISO timestamp",
        periods: string[],
        processed: number,
        OK: number,
        NO_ROUTE: number,
        ERROR: number,
        PENDING: number
      },
      timeBucketsCalculatedAt?: "ISO timestamp"
    }
```

## Implementation Plan

### Phase 1: Create File-Based Data Layer

**New file**: `varikko/src/lib/datastore.ts`

This replaces SQL queries with file operations, providing the same interface as current DB functions.

#### Core Functions

```typescript
// Zone operations
export function readZones(): ZonesData | null
export function writeZones(data: ZonesData): void
export function updateZone(zoneId: string, updates: Partial<Zone>): void

// Route operations
export function readZoneRoutes(zoneId: string, period: TimePeriod): ZoneRoutesData | null
export function writeZoneRoutes(zoneId: string, period: TimePeriod, data: ZoneRoutesData): void
export function updateRoute(fromId: string, toId: string, period: TimePeriod, route: CompactRoute): void
export function getAllPendingRoutes(): Map<TimePeriod, Set<string>> // Returns zone IDs with pending routes

// Pipeline state
export function readPipelineState(): PipelineState | null
export function writePipelineState(state: PipelineState): void
export function updatePipelineMetadata(key: keyof PipelineState, value: any): void

// Manifest
export function updateManifest(): void // Regenerates manifest.json from current data
```

#### Key Design Decisions

1. **Atomic writes**: Use temp files + rename for atomic updates
2. **Error handling**: Graceful degradation if files are missing
3. **Locking**: Simple file-based locking for concurrent writes (unlikely but safe)
4. **Performance**: Minimize file reads by caching in memory during operations

### Phase 2: Update Zone Management

**File**: `varikko/src/lib/zones.ts`

#### Changes

1. **Remove DB schema creation** (lines 314-368)
2. **Update `fetchZones()`**:
   - Remove DB parameter
   - Write directly to `zones.json` using `datastore.writeZones()`
   - Initialize empty route files for each zone × period
   - Update pipeline state

3. **Remove `initSchema()`** function (no longer needed)

4. **Keep geometry processing logic**:
   - WFS fetching
   - Geometry validation
   - SVG path projection
   - Inside point calculation

   These don't change, just write to different destination.

### Phase 3: Update Route Calculation

**File**: `varikko/src/lib/routing.ts`

#### Changes

1. **Remove DB parameter from all functions**
2. **Update `calculateRoutes()`**:
   - Read pending routes from msgpack files (status === RouteStatus.PENDING)
   - Query OTP API
   - Update msgpack files directly using `datastore.updateRoute()`
   - Update pipeline state with progress

3. **Update `initializeRoutes()`**:
   - Called by fetch command
   - Creates msgpack files with all routes marked as PENDING
   - Uses Cartesian product of zones × zones × periods

4. **Progress tracking**:
   - Count PENDING routes by scanning msgpack files (cached in memory)
   - Update pipeline.json with stats

### Phase 4: Update Geocoding

**File**: `varikko/src/lib/geocoding.ts`

#### Changes

1. **Remove DB parameter**
2. **Update `geocodeZones()`**:
   - Read zones from `zones.json`
   - Call geocoding APIs
   - Update `routingPoint` in zones.json using `datastore.updateZone()`
   - Track failed geocoding in pipeline state (not in zone data)

### Phase 5: Update Time Buckets

**File**: `varikko/src/lib/timeBuckets.ts`

#### Changes

1. **Remove DB parameter**
2. **Update `calculateTimeBuckets()`**:
   - Read all route files to get duration distribution
   - Calculate 6 buckets based on percentiles
   - Update `timeBuckets` array in `zones.json`
   - Update pipeline state with calculation timestamp

### Phase 6: Remove/Repurpose Export

**File**: `varikko/src/lib/export.ts`

#### Option A: Delete entirely
- No export step needed, data is already in final format

#### Option B: Repurpose as validation
- Rename to `validate.ts`
- Check data integrity (all zones have route files, no missing data)
- Regenerate manifest.json
- Useful for debugging but not required in normal workflow

**Recommendation**: Option B - keep as validation tool

### Phase 7: Update CLI

**File**: `varikko/src/cli.ts`

#### Changes to Commands

```diff
// 1. fetch command (lines ~100-250)
- const db = getDatabase(dbPath);
- initSchema(db);
- fetchZones(db, options);
+ fetchZones(options); // writes directly to zones.json + initializes route files

// 2. geocode command (lines ~300-400)
- const db = getDatabase(dbPath);
- geocodeZones(db, options);
+ geocodeZones(options); // updates zones.json

// 3. routes command (lines ~450-600)
- const db = getDatabase(dbPath);
- calculateRoutes(db, options);
+ calculateRoutes(options); // updates msgpack files

// 4. time-buckets command (lines ~650-700)
- const db = getDatabase(dbPath);
- calculateTimeBuckets(db);
+ calculateTimeBuckets(); // updates zones.json

// 5. export command (lines ~706-790)
- exportAll(db, options);
+ validateData(options); // Optional: validate data integrity
// OR remove entirely

// 6. Remove getDatabase() helper function
```

### Phase 8: Update Types

**File**: `varikko/src/shared/types.ts`

#### Add Pipeline State Types

```typescript
export interface FetchMetadata {
  timestamp: string;
  zoneCount: number;
  limit?: number;
  cities: string[];
  filteringStats: {
    total: number;
    insidePointFailed: number;
    geometryInvalid: number;
    outsideVisibleArea: number;
    svgPathFailed: number;
    passed: number;
  };
}

export interface GeocodingMetadata {
  timestamp: string;
  processed: number;
  successful: number;
  failed: number;
}

export interface RouteCalculationMetadata {
  timestamp: string;
  periods: string[];
  processed: number;
  OK: number;
  NO_ROUTE: number;
  ERROR: number;
  PENDING: number;
}

export interface PipelineState {
  lastFetch?: FetchMetadata;
  lastGeocoding?: GeocodingMetadata;
  lastRouteCalculation?: RouteCalculationMetadata;
  timeBucketsCalculatedAt?: string;
}
```

### Phase 9: Update Tests

**Files**: `varikko/src/tests/lib/*.test.ts`

#### Changes

1. **Remove DB setup/teardown** from all tests
2. **Use temp directories** for test data files
3. **Mock file operations** where appropriate
4. **Update assertions** to check file contents instead of DB queries

Example:
```diff
- const db = new Database(':memory:');
- initSchema(db);
- fetchZones(db, options);
- const zones = db.prepare('SELECT * FROM places').all();
+ const testDataDir = '/tmp/varikko-test-' + Date.now();
+ fetchZones({ ...options, outputDir: testDataDir });
+ const zonesData = JSON.parse(fs.readFileSync(path.join(testDataDir, 'zones.json'), 'utf-8'));
+ const zones = zonesData.zones;
```

### Phase 10: Update Documentation

**Files to update**:
- `varikko/README.md`: Remove DB references, update architecture diagrams
- `varikko/REFACTOR_PLAN.md`: Mark this refactor as complete
- `varikko/AGENTS.md`: Update data flow descriptions
- `opas/README.md`: Clarify that data directory is source of truth

### Phase 11: Remove Dependencies

**File**: `varikko/package.json`

```diff
{
  "dependencies": {
-   "better-sqlite3": "^x.x.x",
    "@msgpack/msgpack": "^x.x.x",
    ...
  }
}
```

## Migration Strategy

Since you confirmed no migration is needed, the approach is:

1. **Implement refactor on feature branch** (current branch)
2. **Test with fresh data**:
   ```bash
   rm -rf opas/public/data/*
   pnpm --filter varikko exec tsx src/cli.ts fetch
   pnpm --filter varikko exec tsx src/cli.ts geocode
   pnpm --filter varikko exec tsx src/cli.ts routes
   pnpm --filter varikko exec tsx src/cli.ts time-buckets
   # No export step needed!
   ```
3. **Verify opas still works** (data format unchanged, so it should work seamlessly)
4. **Merge to main**
5. **Delete old varikko.db** after confirming everything works

## Files Modified Summary

| Category | Files | Changes |
|----------|-------|---------|
| **New** | `varikko/src/lib/datastore.ts` | File-based data operations |
| **Major Changes** | `varikko/src/lib/zones.ts` | Remove DB, write to files |
| | `varikko/src/lib/routing.ts` | Remove DB, read/write msgpack |
| | `varikko/src/lib/geocoding.ts` | Remove DB, update zones.json |
| | `varikko/src/lib/timeBuckets.ts` | Remove DB, update zones.json |
| | `varikko/src/cli.ts` | Remove DB initialization |
| **Minor Changes** | `varikko/src/shared/types.ts` | Add PipelineState types |
| | `varikko/src/lib/export.ts` | Repurpose as validation or delete |
| | All test files | Update to use file-based tests |
| **Remove** | `varikko/package.json` | Remove better-sqlite3 dependency |
| **Documentation** | README.md, REFACTOR_PLAN.md, etc. | Update architecture docs |
| **No Changes** | `opas/**` | Opas unchanged (data format identical) |

## Benefits

### Immediate
- ✅ **89% less disk space** (47MB → 5MB)
- ✅ **No export step** - data always ready to serve
- ✅ **Single source of truth** - no sync issues
- ✅ **Simpler architecture** - no DB layer to maintain

### Long-term
- ✅ **Easier debugging** - zones.json is human-readable
- ✅ **Better version control** - can commit data files if needed
- ✅ **Faster CI/CD** - no DB setup in tests
- ✅ **Cloud-friendly** - easier to deploy (no DB file to manage)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| File corruption | Atomic writes (temp file + rename) |
| Concurrent writes | File locking mechanism in datastore |
| Performance degradation | Cache parsed data in memory during operations |
| Missing SQL analysis tools | Can build temp DB from files if needed for analysis |
| Harder to find PENDING routes | Track in memory during route calculation; scan files on init |

## Success Criteria

- [ ] All varikko commands work without DB
- [ ] Opas loads and displays data correctly (unchanged behavior)
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Disk usage reduced to ~5MB
- [ ] No export step required
- [ ] Pipeline state tracked in pipeline.json

## Timeline Estimate

| Phase | Effort | Duration |
|-------|--------|----------|
| 1-2: Datastore + Zones | Medium | 2-3 hours |
| 3-4: Routes + Geocoding | Medium | 2-3 hours |
| 5-6: Time buckets + Export | Small | 1 hour |
| 7-8: CLI + Types | Small | 1 hour |
| 9: Tests | Medium | 2-3 hours |
| 10-11: Docs + Cleanup | Small | 1 hour |
| **Total** | | **~10 hours** |

## Next Steps

1. Review and approve this plan
2. Implement Phase 1 (datastore.ts) and test thoroughly
3. Proceed through phases sequentially
4. Test each phase before moving to next
5. Run full integration test after Phase 7
6. Update tests and docs in final phases

---

**Questions? Concerns? Ready to proceed?**
