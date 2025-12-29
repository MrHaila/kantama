# Bike Routing Implementation Plan

**Date**: 2025-12-29
**Goal**: Add bicycle routing as a complement to existing walking routes, enabling exploration of Helsinki using bikes combined with public transport.

## Executive Summary

This plan outlines how to add bike routing support to Kantama, allowing users to explore the city using bicycles in combination with public transport. The implementation will:

- **Complement** existing walking routes (not replace them)
- Store bike and walking routes side-by-side in the database
- Provide a UI toggle to switch between transport modes
- Maintain backward compatibility with existing data
- Use OpenTripPlanner's built-in bike routing capabilities

**Estimated Database Size**: ~2× current size (40.5 MB → 81 MB)
**Estimated Build Time**: ~2× current time for full recalculation
**Implementation Phases**: 8 phases over ~4-5 weeks

---

## Current System Analysis

### Architecture Overview

**Backend (Varikko)**:
- Routes stored in SQLite: `(from_id, to_id, time_period)` primary key
- OTP GraphQL queries currently have **NO transport mode filtering**
- Data exported as msgpack: `{zoneId}-{period}.msgpack`
- 3 time periods: MORNING (08:30), EVENING (17:30), MIDNIGHT (23:30)

**Frontend (OPAS)**:
- Vue 3 application with Pinia stores
- Time period selector in bottom-right corner
- Route visualization with color-coded transport modes
- Supports: WALK, BUS, TRAM, SUBWAY, FERRY, RAIL
- **Missing**: BICYCLE mode color/icon

**Key Finding**: Current OTP queries return whatever OTP considers optimal by default (usually walking + transit). To get bike routes, we need to explicitly specify `transportModes: [{mode: BICYCLE}, {mode: TRANSIT}]`.

---

## Implementation Plan

### Phase 1: Database Schema Extension

**Decision**: Add `transport_mode` column to routes table

**Rationale**:
- Allows storing walking and bike routes for the same origin-destination-time
- Enables future transport modes (car, scooter, etc.)
- Maintains backward compatibility
- Clean separation of concerns

**Database Migration**:

```sql
-- New schema
CREATE TABLE routes (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  time_period TEXT NOT NULL,
  transport_mode TEXT NOT NULL DEFAULT 'WALK',  -- NEW
  duration INTEGER,
  numberOfTransfers INTEGER,
  walkDistance REAL,
  legs TEXT,
  status TEXT DEFAULT 'PENDING',
  PRIMARY KEY (from_id, to_id, time_period, transport_mode),
  FOREIGN KEY (from_id) REFERENCES places(id),
  FOREIGN KEY (to_id) REFERENCES places(id)
);

CREATE INDEX idx_routes_to ON routes(to_id, time_period, transport_mode);
CREATE INDEX idx_routes_status ON routes(status);
```

**Migration Strategy**:
1. Create new table with transport_mode column
2. Migrate existing routes with `transport_mode = 'WALK'`
3. Pre-fill BICYCLE routes with `status = 'PENDING'`
4. Drop old table, rename new table

**Files to Modify**:
- `/home/user/kantama/varikko/src/lib/zones.ts` - Add migration function and update schema

---

### Phase 2: Backend OTP Query Updates

**Decision**: Add `transportModes` parameter to GraphQL queries

**OTP Query Enhancement**:

```graphql
plan(
  from: {lat: X, lon: Y}
  to: {lat: X, lon: Y}
  date: "YYYY-MM-DD"
  time: "HH:MM:SS"
  numItineraries: 3
  transportModes: [{mode: BICYCLE}, {mode: TRANSIT}]  # NEW
  bikeSpeed: 5.0                                      # NEW (m/s, ~18 km/h)
  bikeSwitchTime: 120                                 # NEW (2 min to park)
  bikeSwitchCost: 600                                 # NEW (10 min penalty)
)
```

**Transport Mode Configuration**:

```typescript
export type TransportMode = 'WALK' | 'BICYCLE';

const TRANSPORT_MODE_CONFIG = {
  WALK: {
    modes: '[{mode: WALK}, {mode: TRANSIT}]',
    bikeSpeed: null,
    bikeSwitchTime: null,
    bikeSwitchCost: null,
  },
  BICYCLE: {
    modes: '[{mode: BICYCLE}, {mode: TRANSIT}]',
    bikeSpeed: 5.0,        // m/s (~18 km/h)
    bikeSwitchTime: 120,   // 2 min to park/unpark
    bikeSwitchCost: 600,   // 10 min penalty for switches
  },
} as const;
```

**Function Updates**:

```typescript
export async function fetchRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  targetTime: string,
  config: OTPConfig,
  transportMode: TransportMode = 'WALK'  // NEW parameter
): Promise<RouteResult>
```

**Files to Modify**:
- `/home/user/kantama/varikko/src/lib/routing.ts` - Add transport mode parameter and OTP query updates
- `/home/user/kantama/varikko/src/shared/types.ts` - Add TransportMode type

---

### Phase 3: Data Export Updates

**Decision**: Create separate msgpack files per transport mode

**File Naming Convention**:

- **Old (backward compatible)**: `00100-morning.msgpack` (WALK routes)
- **New**: `00100-morning-bicycle.msgpack` (BICYCLE routes)

**Export Logic**:

```typescript
export function exportZoneRoutes(
  db: Database.Database,
  zoneId: string,
  outputDir: string,
  transportMode: TransportMode = 'WALK'
): { routes: number; size: number } {
  // Query routes for specific mode
  const routes = db.prepare(`
    SELECT to_id, duration, numberOfTransfers, status, legs
    FROM routes
    WHERE from_id = ? AND time_period = ? AND transport_mode = ?
  `).all(zoneId, periodName, transportMode);

  // Generate filename with mode suffix
  const modeSuffix = transportMode === 'WALK' ? '' : `-${transportMode.toLowerCase()}`;
  const filename = `${zoneId}-${periodSuffix}${modeSuffix}.msgpack`;

  // Export as before
}
```

**Backward Compatibility**:
- Old frontend requests `{zone}-morning.msgpack` → still exists (WALK)
- New frontend requests `{zone}-morning-bicycle.msgpack` → new file
- Graceful degradation if bike routes unavailable

**Files to Modify**:
- `/home/user/kantama/varikko/src/lib/export.ts` - Update export logic for multiple modes

---

### Phase 4: Frontend Implementation

#### 4.1 Store Updates

**Add transport mode state** (`mapData.ts`):

```typescript
const currentTransportMode = ref<TransportMode>('WALK');

watch([activeZoneId, currentTimePeriod, currentTransportMode], async () => {
  const routes = await dataService.loadRoutesForZone(
    activeZoneId.value,
    currentTimePeriod.value,
    currentTransportMode.value  // NEW
  );
});
```

#### 4.2 Data Service Updates

**Update route loading** (`DataService.ts`):

```typescript
async loadRoutesForZone(
  zoneId: string,
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): Promise<CompactRoute[] | null> {
  const modeSuffix = mode === 'WALK' ? '' : `-${mode.toLowerCase()}`;
  const response = await fetch(
    `${this.baseUrl}/routes/${zoneId}-${period}${modeSuffix}.msgpack`
  );
  // ... decode and cache
}
```

#### 4.3 UI Updates

**Add BICYCLE styling** (`transportColors.ts`):

```typescript
export const modeColors: Record<string, string> = {
  WALK: '#8B7355',
  BICYCLE: '#00A651',  // NEW: Green for bikes
  BUS: '#007AC9',
  TRAM: '#00985F',
  SUBWAY: '#FF4200',
  FERRY: '#00B9E4',
  RAIL: '#8C4799',
}
```

**Add bike icon** (`JourneyDetails.vue`):

```typescript
const getTransportIcon = (mode: string): string => {
  switch (mode.toLowerCase()) {
    case 'walk': return '🚶'
    case 'bicycle': return '🚴'  // NEW
    case 'bus': return '🚌'
    // ...
  }
}
```

**Add transport mode toggle** (`App.vue`):

```vue
<!-- Transport Mode Toggle - Top Right -->
<div class="fixed top-6 right-6 z-20">
  <div class="flex border-2 border-vintage-dark shadow-[3px_3px_0px_rgba(38,70,83,1)] bg-vintage-cream">
    <button
      v-for="mode in ['WALK', 'BICYCLE']"
      :key="mode"
      :class="store.currentTransportMode === mode ? 'bg-vintage-dark text-vintage-cream' : 'bg-vintage-cream text-vintage-dark'"
      @click="store.currentTransportMode = mode"
    >
      {{ mode === 'WALK' ? '🚶 WALK' : '🚴 BIKE' }}
    </button>
  </div>
</div>
```

**Files to Modify**:
- `/home/user/kantama/opas/src/stores/mapData.ts` - Add transport mode state
- `/home/user/kantama/opas/src/services/DataService.ts` - Update route loading
- `/home/user/kantama/opas/src/utils/transportColors.ts` - Add BICYCLE color
- `/home/user/kantama/opas/src/components/JourneyDetails.vue` - Add bike icon
- `/home/user/kantama/opas/src/App.vue` - Add transport mode toggle UI

---

### Phase 5: OTP Configuration Verification

**CRITICAL**: Verify OTP instance supports bike routing before implementation.

**Requirements**:
1. OTP version 2.0+ (supports bike routing)
2. OSM data with bike infrastructure (paths, lanes, roads)
3. OTP graph built with bike routing enabled

**Verification Test**:

```bash
curl -X POST http://localhost:9080/otp/gtfs/v1 \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ plan(from: {lat: 60.17, lon: 24.93}, to: {lat: 60.18, lon: 24.94}, transportModes: [{mode: BICYCLE}]) { itineraries { duration legs { mode } } } }"
  }'
```

**Expected**: Should return bike routes with `mode: "BICYCLE"` legs.

**If Not Available**:
- Document requirement in README
- Add error handling for unsupported mode
- Show user-friendly error in frontend

---

### Phase 6: Testing Strategy

#### Backend Tests

```typescript
describe('bike routing', () => {
  it('should query OTP with BICYCLE transport mode', async () => {
    const result = await fetchRoute(
      60.17, 24.93, 60.18, 24.94,
      '08:30:00', mockConfig, 'BICYCLE'
    );
    expect(result.status).toBe('OK');
    expect(result.legs[0].mode).toBe('BICYCLE');
  });

  it('should handle bike+transit combinations', async () => {
    // Test multimodal routes
  });
});
```

#### Integration Tests

**Manual Test Scenarios**:
1. **Short distances**: BICYCLE faster than WALK
2. **Long distances**: BICYCLE+transit competitive
3. **All time periods**: Test MORNING, EVENING, MIDNIGHT
4. **Edge cases**: Islands, restricted areas, very short distances

**Performance Metrics**:
- Route calculation time (bike vs. walk)
- Database size increase (~2×)
- Export time (~2×)
- Frontend bundle size (minimal change)

---

### Phase 7: Migration & Rollout

**Incremental Rollout Plan**:

**Week 1**: Backend implementation
- Database migration
- OTP query updates
- Route calculation for BICYCLE mode

**Week 2**: Data generation
- Calculate bike routes for 5-10 test zones
- Verify route quality
- Compare with walking routes

**Week 3**: Frontend implementation
- Transport mode selector UI
- DataService updates
- BICYCLE styling

**Week 4**: Full deployment
- Calculate all bike routes
- Export all data
- Deploy frontend

**Week 5**: Monitoring & refinement
- User feedback
- Performance monitoring
- Parameter tuning if needed

**Migration Command**:

```bash
# Migrate database
pnpm --filter varikko exec tsx src/cli.ts migrate

# Calculate bike routes (test mode)
pnpm --filter varikko exec tsx src/cli.ts routes --mode BICYCLE --test

# Calculate all bike routes
pnpm --filter varikko exec tsx src/cli.ts routes --mode BICYCLE

# Export data
pnpm --filter varikko exec tsx src/cli.ts export
```

---

### Phase 8: Challenges & Solutions

#### Challenge 1: Route Quality

**Issue**: Bike routes might use dangerous roads

**Solutions**:
- Review OSM bike infrastructure tags
- Tune OTP bike safety parameters
- Add elevation reluctance for hills
- Monitor user feedback

**OTP Parameter Tuning**:

```typescript
const BICYCLE_CONFIG = {
  bikeSpeed: 5.0,           // Adjust based on terrain
  bikeSwitchTime: 120,      // Time to park/unlock
  bikeSwitchCost: 600,      // Discourage frequent switches
  bikeReluctance: 2.0,      // Prefer transit for long rides
  bikeSafetyFactor: 1.0,    // Prefer bike lanes/paths
};
```

#### Challenge 2: Database Size

**Current**: ~40.5 MB
**Expected**: ~81 MB (acceptable for SQLite)

**Solution**: Run VACUUM after migration to optimize.

#### Challenge 3: Build Time

**Current**: 2-3 hours local, 12-15 hours remote
**Expected**: ~2× for sequential calculation

**Solution**: Calculate WALK and BICYCLE in parallel where possible.

#### Challenge 4: Bikes on Transit

**Issue**: Metro restricts bikes during rush hour

**Solution**:
- OTP should respect `bikes_allowed` from GTFS
- Verify HSL GTFS includes restrictions
- Document known limitations

---

## Implementation Checklist

### Backend (Varikko)

#### Database
- [ ] Add `transport_mode` column to schema
- [ ] Update primary key to include transport_mode
- [ ] Create `migrateToTransportModes()` function
- [ ] Add CLI command `varikko migrate`
- [ ] Update indexes

#### Routing
- [ ] Add `TransportMode` type to shared types
- [ ] Update OTP GraphQL query with bike parameters
- [ ] Add `transportMode` parameter to `fetchRoute()`
- [ ] Define `TRANSPORT_MODE_CONFIG` constants
- [ ] Update `buildRoutes()` for multiple modes

#### Export
- [ ] Update `exportZoneRoutes()` for mode parameter
- [ ] Implement new filename pattern
- [ ] Update `exportAll()` to export both modes
- [ ] Maintain backward compatibility

#### Testing
- [ ] Add bike routing test cases
- [ ] Test database migration
- [ ] Integration test full workflow

### Frontend (OPAS)

#### Data Layer
- [ ] Update `DataService.loadRoutesForZone()` with mode
- [ ] Update cache keys to include mode
- [ ] Add feature detection for bike routing

#### Store
- [ ] Add `currentTransportMode` state
- [ ] Update watchers to include transport mode
- [ ] Expose transport mode in store API

#### UI
- [ ] Add BICYCLE color (#00A651)
- [ ] Add bike icon (🚴)
- [ ] Create transport mode toggle in App.vue
- [ ] Match vintage aesthetic
- [ ] Test responsive design

#### Testing
- [ ] Test transport mode selector
- [ ] Test route loading with different modes
- [ ] Visual regression testing
- [ ] Test backward compatibility

### Documentation

- [ ] Update varikko README with bike routing
- [ ] Document OTP requirements
- [ ] Add migration guide
- [ ] Update API documentation
- [ ] Add troubleshooting section

---

## Rollback Plan

If issues arise:

**Database Rollback**:
```sql
CREATE TABLE routes_old AS
SELECT from_id, to_id, time_period, duration, numberOfTransfers, walkDistance, legs, status
FROM routes WHERE transport_mode = 'WALK';

DROP TABLE routes;
ALTER TABLE routes_old RENAME TO routes;
```

**Frontend Rollback**:
- Revert DataService changes
- Remove transport mode toggle
- Deploy previous version

**Data Rollback**:
- Delete `*-bicycle.msgpack` files
- Keep `*-{period}.msgpack` files (WALK routes)

---

## Critical Files Reference

| File | Purpose | Changes |
|------|---------|---------|
| `varikko/src/lib/zones.ts` | Database schema | Add transport_mode column and migration |
| `varikko/src/lib/routing.ts` | OTP queries | Add bike mode configuration and parameters |
| `varikko/src/lib/export.ts` | Data export | New filename pattern with mode suffix |
| `varikko/src/shared/types.ts` | Shared types | Add TransportMode type |
| `opas/src/stores/mapData.ts` | State management | Add currentTransportMode state |
| `opas/src/services/DataService.ts` | Data loading | Support transport mode parameter |
| `opas/src/App.vue` | Main UI | Add transport mode toggle |
| `opas/src/utils/transportColors.ts` | Styling | Add BICYCLE color |
| `opas/src/components/JourneyDetails.vue` | Route display | Add bike icon |

---

## Next Steps

1. **Verify OTP bike routing capability** (Phase 5)
2. **Implement database migration** (Phase 1)
3. **Update backend routing logic** (Phase 2)
4. **Test with sample zones** (Week 2)
5. **Implement frontend UI** (Week 3)
6. **Full deployment** (Week 4)

---

**Questions or Concerns?**

Before implementation, consider:
- Is the OTP instance configured for bike routing?
- Do we have OSM data with bike infrastructure?
- What's the acceptable database size?
- Should we add more transport modes in the future (e-scooter, car)?
