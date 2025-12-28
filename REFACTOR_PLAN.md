# Varikko Data Model Refactor Plan

## Current State Analysis

### Data Volumes
- **262 zones** across 4 cities (Helsinki, Vantaa, Espoo, Kauniainen)
- **205,146 routes** (262 × 261 × 3 time periods)
- **~40MB database** before route calculation
- Database grows significantly larger after calculating routes with leg data

### Current Architecture
```
varikko (build-time)          opas (runtime)
┌─────────────────────┐       ┌─────────────────────┐
│ Fetch zones (WFS)   │       │ Load varikko.db     │
│ Process geometry    │       │ (full 40MB+ file)   │
│ Geocode zones       │──────▶│                     │
│ Calculate routes    │       │ Query in-memory     │
│ Generate SVG paths  │       │ SQLite via sql.js   │
│ Save to SQLite      │       │                     │
└─────────────────────┘       └─────────────────────┘
```

### Storage Breakdown (Current)
| Table | Content | Size Impact |
|-------|---------|-------------|
| `places` | 262 zones with GeoJSON geometry, SVG paths | ~5-10MB |
| `routes` | 205,146 routes with JSON leg data | ~30-100MB+ |
| `time_buckets` | 6 fixed buckets | Negligible |
| `metadata` | Key-value pairs | Negligible |

### Pain Points
1. **Monolithic load**: Entire database transferred to browser on page load
2. **Redundant data**: Full geometry stored but only SVG paths used at runtime
3. **Large leg data**: Each route stores complete OTP leg details as JSON
4. **Cartesian explosion**: N×(N-1)×3 routes scale quadratically
5. **No incremental updates**: Any change requires full rebuild

---

## Proposed Architecture

### Core Insight
Routes are accessed by **origin zone + time period**. When a user selects zone A, we only need routes FROM zone A. This enables location-based segmentation.

### New Architecture
```
varikko (build-time)                    opas (runtime)
┌────────────────────────┐              ┌──────────────────────────────┐
│ Fetch & process zones  │              │ 1. Load zones.json (~200KB)  │
│ Calculate all routes   │──────────────│    - IDs, names, SVG paths   │
│ Generate:              │              │    - Basic metadata          │
│  - zones.json          │              │                              │
│  - routes/             │              │ 2. On zone select, load:     │
│    - HEL-001.bin       │              │    routes/{zone-id}.bin      │
│    - HEL-002.bin       │              │    (~0.5-2KB per zone)       │
│    - ...               │              │                              │
│  - legs/               │              │ 3. On hover, load:           │
│    - {hash}.bin        │              │    legs/{hash}.bin           │
│    (deduplicated)      │              │    (on-demand, cached)       │
└────────────────────────┘              └──────────────────────────────┘
```

---

## Phase 1: Zone Data Optimization

### 1.1 Separate zones.json
Extract minimal zone data needed for map rendering:

```typescript
interface ZonesFile {
  version: number;
  generated: string;
  timeBuckets: TimeBucket[];  // Move here - static data
  zones: CompactZone[];
}

interface CompactZone {
  id: string;           // "HEL-001"
  name: string;         // "Kamppi"
  city: string;         // "Helsinki"
  svgPath: string;      // Pre-computed SVG path
  routingPoint: [number, number];  // [lat, lon] - for route display
}
```

**Estimated size**: ~200-300KB for 262 zones (SVG paths are the bulk)

### 1.2 Remove Geometry from Runtime
- GeoJSON geometry only needed at build time for:
  - Water clipping
  - Inside point calculation
  - Coordinate validation
- SVG paths already pre-computed
- **Action**: Don't include geometry in output files

---

## Phase 2: Route Data Segmentation

### 2.1 Per-Zone Route Files
Create one file per zone containing all outbound routes:

```
/routes/
  HEL-001.bin    # All routes FROM zone HEL-001
  HEL-002.bin
  VAN-001.bin
  ...
```

### 2.2 Compact Binary Route Format
Use MessagePack or custom binary format:

```typescript
interface ZoneRoutes {
  fromId: string;
  period: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  routes: CompactRoute[];
}

interface CompactRoute {
  toId: string;          // 2-byte index or string
  duration: number;      // 2-byte unsigned (max 18h in seconds)
  transfers: number;     // 1-byte (0-255)
  walkDistance: number;  // 2-byte unsigned (max 65km in meters)
  bucketIndex: number;   // 1-byte (pre-computed color bucket)
  legsHash?: string;     // Optional: hash to lookup detailed legs
}
```

**Per-route size**: ~10-15 bytes (vs ~100-500 bytes JSON)
**Per-zone file**: ~3-4KB for 261 destinations × 3 periods

### 2.3 Time Period Strategy
Options:
1. **Separate files per period**: `HEL-001-MORNING.bin`, `HEL-001-EVENING.bin`
2. **Combined with period sections**: Single file with all periods
3. **Default period only**: Only store MORNING, derive others if patterns exist

**Recommendation**: Combined file with period sections (single fetch per zone selection)

---

## Phase 3: Leg Data Optimization

### 3.1 Analysis of Leg Data
Current leg structure per route:
```json
{
  "from": { "name": "...", "lat": 60.1, "lon": 24.9 },
  "to": { "name": "...", "lat": 60.2, "lon": 24.8 },
  "mode": "BUS",
  "duration": 600,
  "distance": 2500,
  "legGeometry": { "points": "encoded_polyline_string" },
  "route": { "shortName": "550", "longName": "Itäkeskus-Westendinasema" }
}
```

### 3.2 Leg Deduplication
Many routes share common leg segments (same bus lines, same walking paths).

**Strategy**: Content-addressable storage
```
/legs/
  {hash}.bin    # Unique leg data, referenced by hash
```

### 3.3 Compact Leg Format
```typescript
interface CompactLeg {
  mode: number;           // 1-byte enum (WALK=0, BUS=1, TRAM=2, etc.)
  duration: number;       // 2-byte
  routeShortName?: string; // Only for transit modes
  geometry: Uint8Array;   // Raw polyline bytes (skip JSON encoding)
}
```

### 3.4 Lazy Loading Strategy
- Don't include legs in main route files
- Load legs only on hover (user wants to see the route)
- Cache loaded legs in memory (LRU cache)

---

## Phase 4: Build Pipeline Changes

### 4.1 New Varikko Output Structure
```
opas/public/
  data/
    zones.json           # Zone metadata + time buckets
    routes/
      index.json         # Optional: manifest with checksums
      HEL-001.msgpack    # Routes from zone HEL-001
      HEL-002.msgpack
      ...
    legs/
      abc123.msgpack     # Deduplicated leg data
      def456.msgpack
      ...
```

### 4.2 Build Steps
1. Fetch zones (unchanged)
2. Process zones → generate zones.json
3. Calculate routes (unchanged)
4. For each zone:
   - Extract routes where from_id = zone
   - Compress to binary format
   - Write to routes/{zone-id}.msgpack
5. Deduplicate legs:
   - Hash each unique leg combination
   - Write to legs/{hash}.msgpack
   - Store hash reference in route data

### 4.3 Incremental Builds (Future)
- Store checksums of source data
- Only recalculate changed zones
- Use file modification times

---

## Phase 5: Opas Runtime Changes

### 5.1 New Data Service
```typescript
class DataService {
  private zones: Map<string, CompactZone>;
  private routeCache: Map<string, ZoneRoutes>;
  private legCache: LRUCache<string, CompactLeg[]>;

  async init(): Promise<void> {
    const response = await fetch('/data/zones.json');
    const data = await response.json();
    this.zones = new Map(data.zones.map(z => [z.id, z]));
    this.timeBuckets = data.timeBuckets;
  }

  async getRoutesFrom(zoneId: string): Promise<ZoneRoutes> {
    if (this.routeCache.has(zoneId)) {
      return this.routeCache.get(zoneId)!;
    }
    const response = await fetch(`/data/routes/${zoneId}.msgpack`);
    const routes = decode(await response.arrayBuffer());
    this.routeCache.set(zoneId, routes);
    return routes;
  }

  async getLegs(legsHash: string): Promise<CompactLeg[]> {
    // LRU cache with lazy loading
  }
}
```

### 5.2 UI Changes
- Show loading indicator when switching zones
- Prefetch adjacent zones (optional optimization)
- Handle offline/cached state gracefully

---

## Size Estimates

### Current
| Component | Size |
|-----------|------|
| varikko.db (initial) | ~40MB |
| varikko.db (with routes) | ~100MB+ |

### Proposed
| Component | Size | Notes |
|-----------|------|-------|
| zones.json | ~200KB | Gzipped: ~50KB |
| routes/* (all zones) | ~1MB | 262 zones × ~4KB each |
| legs/* (deduplicated) | ~5-20MB | Depends on dedup ratio |
| **Total initial load** | **~200KB** | Just zones.json |
| **Per zone selection** | **~4KB** | Route file only |

### Improvement
- **Initial load**: 40MB → 200KB (99.5% reduction)
- **Per interaction**: Lazy loading instead of upfront
- **Total data**: Potentially smaller due to deduplication

---

## Implementation Phases

### Phase 1: Foundation (zones.json)
- [ ] Create zones.json export in varikko
- [ ] Update opas to load zones.json
- [ ] Remove sql.js dependency
- [ ] Verify map rendering works

### Phase 2: Route Segmentation
- [ ] Add MessagePack dependency
- [ ] Create per-zone route file generator
- [ ] Implement route file loader in opas
- [ ] Add loading states to UI

### Phase 3: Leg Optimization
- [ ] Implement leg deduplication in varikko
- [ ] Create leg file generator
- [ ] Implement lazy leg loading in opas
- [ ] Add LRU cache for legs

### Phase 4: Polish
- [ ] Add build manifest with checksums
- [ ] Implement prefetching (optional)
- [ ] Add offline support with service worker (optional)
- [ ] Performance profiling and optimization

---

## Alternative Approaches Considered

### 1. Keep SQLite, Split Files
- Multiple smaller .db files
- Still requires sql.js WASM (~300KB)
- Less flexible than custom format

### 2. IndexedDB Storage
- Store binary data in browser IndexedDB
- Persist across sessions
- More complex implementation

### 3. GraphQL with Backend
- Move route queries to server
- Requires running backend
- Defeats "offline-first" goal

### 4. Protocol Buffers
- More efficient than MessagePack
- Requires schema compilation
- Overkill for this use case

**Chosen approach**: MessagePack for simplicity and good size/speed balance

---

## Technical Decisions

### Format Choice: MessagePack
- **Why not JSON**: 30-50% larger, slower to parse
- **Why not Protobuf**: Requires schema compilation, complexity
- **Why not FlatBuffers**: Zero-copy but complex, overkill here
- **Why MessagePack**: Simple, well-supported, ~30% smaller than JSON

### Libraries
- **varikko**: `msgpack-lite` or `@msgpack/msgpack` for encoding
- **opas**: `@msgpack/msgpack` for decoding (tree-shakeable)

### Compression
- Let HTTP compression (gzip/brotli) handle it
- MessagePack + gzip gives excellent results
- Avoid double-compression complexity

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Increased request count | Latency | Prefetch, HTTP/2 multiplexing |
| Cache invalidation | Stale data | Version in zones.json, checksum in manifest |
| Complex build process | Maintainability | Good abstractions, tests |
| Browser compatibility | Limited reach | MessagePack has wide support |

---

## Success Metrics

1. **Initial load time**: < 500ms (from ~2-5s currently)
2. **Zone switch time**: < 100ms (route file load)
3. **Total data transferred**: 90%+ reduction
4. **Build time**: Should not significantly increase
5. **Code complexity**: Manageable increase

---

## Questions to Resolve

1. Should legs be loaded eagerly with routes or lazily on hover?
   - **Recommendation**: Lazy (significant size savings)

2. Should we support offline mode with service worker?
   - **Recommendation**: Future phase, not MVP

3. Should route files include all 3 time periods or separate?
   - **Recommendation**: Combined (typical user stays on one period)

4. What LRU cache size for legs?
   - **Recommendation**: 50-100 entries (~1-2MB memory)
