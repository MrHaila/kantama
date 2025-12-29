# Bike Routing Implementation Plan (Updated for File-Based Architecture)

**Date**: 2025-12-29
**Goal**: Add bicycle routing as a complement to existing walking routes, enabling exploration of Helsinki using bikes combined with public transport.

**Updated**: Rebased to work with new file-based data architecture (no SQLite database)

## Executive Summary

This plan outlines how to add bike routing support to Kantama, allowing users to explore the city using bicycles in combination with public transport. The implementation will:

- **Complement** existing walking routes (not replace them)
- Store bike and walking routes in separate msgpack files
- Provide a UI toggle to switch between transport modes
- Maintain backward compatibility with existing data
- Use OpenTripPlanner's built-in bike routing capabilities

**Estimated Data Size**: ~2× current size (route files doubled)
**Estimated Build Time**: ~2× current time for full recalculation
**Implementation Phases**: 6 phases over ~3-4 weeks

---

## Current System Analysis

### Architecture Overview

**Backend (Varikko)** - File-based storage:
- **No database** - eliminated in recent refactor
- Data stored in `opas/public/data/` as single source of truth
- `zones.json` contains all zone metadata and time buckets
- `routes/{zoneId}-{period}.msgpack` files for route data (period = M, E, or N)
- `pipeline.json` tracks pipeline execution state
- OTP GraphQL queries currently have **NO transport mode filtering**

**Frontend (OPAS)** - Vue 3 application:
- Time period selector UI
- Route visualization with color-coded transport modes
- Supports: WALK, BUS, TRAM, SUBWAY, FERRY, RAIL
- **Missing**: BICYCLE mode color/icon

**Key Finding**: Current OTP queries return whatever OTP considers optimal by default (usually walking + transit). To get bike routes, we need to explicitly specify `transportModes: [{mode: BICYCLE}, {mode: TRANSIT}]`.

---

## Implementation Plan

### Phase 1: Data Model Extension

**Decision**: Add transport mode to file naming convention

**Rationale**:
- Allows storing walking and bike routes for the same origin-destination-time
- Maintains backward compatibility
- Clean separation of concerns
- Enables future transport modes (scooter, car, etc.)

**File Naming Convention**:

**Current** (walking routes):
- `00100-M.msgpack` (Morning)
- `00100-E.msgpack` (Evening)
- `00100-N.msgpack` (Midnight)

**New** (with transport mode):
- `00100-M.msgpack` (Walking - Morning, backward compatible)
- `00100-M-bicycle.msgpack` (Bicycle - Morning)
- `00100-E.msgpack` (Walking - Evening, backward compatible)
- `00100-E-bicycle.msgpack` (Bicycle - Evening)
- etc.

**Backward Compatibility**: Old filenames remain unchanged for WALK mode, ensuring existing frontend continues to work.

**Files to Modify**:
- `/home/user/kantama/varikko/src/lib/datastore.ts` - Add transport mode parameter to route file functions
- `/home/user/kantama/varikko/src/shared/types.ts` - Add TransportMode type

**Changes Required**:

#### 1.1 Update Shared Types

```typescript
// Add to varikko/src/shared/types.ts
export type TransportMode = 'WALK' | 'BICYCLE';

// Update ZoneRoutesData to include mode (optional for backward compat)
export interface ZoneRoutesData {
  f: string; // fromId
  p: string; // period (M, E, N)
  m?: TransportMode; // NEW: transport mode (optional, defaults to WALK)
  r: CompactRoute[]; // routes
}
```

#### 1.2 Update Datastore Functions

```typescript
// In varikko/src/lib/datastore.ts

// Update getRoutePath function
function getRoutePath(zoneId: string, period: TimePeriod, mode: TransportMode = 'WALK'): string {
  const periodSuffix = period.charAt(0); // M, E, or N
  const modeSuffix = mode === 'WALK' ? '' : `-${mode.toLowerCase()}`;
  return path.join(getRoutesDir(), `${zoneId}-${periodSuffix}${modeSuffix}.msgpack`);
}

// Update readZoneRoutes
export function readZoneRoutes(
  zoneId: string,
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): ZoneRoutesData | null {
  const filePath = getRoutePath(zoneId, period, mode);
  return readMsgpackFile<ZoneRoutesData>(filePath);
}

// Update writeZoneRoutes
export function writeZoneRoutes(
  zoneId: string,
  period: TimePeriod,
  data: ZoneRoutesData,
  mode: TransportMode = 'WALK'
): void {
  const filePath = getRoutePath(zoneId, period, mode);
  writeMsgpackFile(filePath, data);
}

// Update initializeRoutes
export function initializeRoutes(
  zoneIds: string[],
  periods: TimePeriod[],
  modes: TransportMode[] = ['WALK']
): void {
  ensureDirectoryExists(getRoutesDir());

  for (const fromId of zoneIds) {
    for (const period of periods) {
      for (const mode of modes) {
        const routes: CompactRoute[] = zoneIds.map((toId) => ({
          i: toId,
          d: null,
          t: null,
          s: RouteStatus.PENDING,
        }));

        const routesData: ZoneRoutesData = {
          f: fromId,
          p: period.charAt(0), // M, E, or N
          m: mode, // NEW: include transport mode
          r: routes,
        };

        writeZoneRoutes(fromId, period, routesData, mode);
      }
    }
  }
}

// Add helper to get pending routes by mode
export function getZonesWithPendingRoutes(
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): string[] {
  const zoneIds = getAllZoneIds();
  const zonesWithPending: string[] = [];

  for (const zoneId of zoneIds) {
    const routesData = readZoneRoutes(zoneId, period, mode);
    if (!routesData) continue;

    const hasPending = routesData.r.some((r) => r.s === RouteStatus.PENDING);
    if (hasPending) {
      zonesWithPending.push(zoneId);
    }
  }

  return zonesWithPending;
}

// Add helper to count routes by status and mode
export function countRoutesByStatus(
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): Record<RouteStatus, number> {
  const zoneIds = getAllZoneIds();
  const counts: Record<RouteStatus, number> = {
    [RouteStatus.OK]: 0,
    [RouteStatus.NO_ROUTE]: 0,
    [RouteStatus.ERROR]: 0,
    [RouteStatus.PENDING]: 0,
  };

  for (const zoneId of zoneIds) {
    const routesData = readZoneRoutes(zoneId, period, mode);
    if (!routesData) continue;

    for (const route of routesData.r) {
      counts[route.s]++;
    }
  }

  return counts;
}
```

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

**Files to Modify**:
- `/home/user/kantama/varikko/src/lib/routing.ts` - Add transport mode configuration

**Changes Required**:

#### 2.1 Add Transport Mode Configuration

```typescript
// In varikko/src/lib/routing.ts

import { TransportMode } from '../shared/types';

// Add transport mode config
const TRANSPORT_MODE_CONFIG = {
  WALK: {
    modes: '[{mode: WALK}, {mode: TRANSIT}]',
    bikeSpeed: null,
    bikeSwitchTime: null,
    bikeSwitchCost: null,
  },
  BICYCLE: {
    modes: '[{mode: BICYCLE}, {mode: TRANSIT}]',
    bikeSpeed: 5.0,        // m/s (~18 km/h, reasonable city speed)
    bikeSwitchTime: 120,   // seconds to park/unpark bike
    bikeSwitchCost: 600,   // 10-min penalty to discourage frequent switches
  },
} as const;

// Update BuildRoutesOptions
export interface BuildRoutesOptions {
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  mode?: TransportMode; // NEW
  zones?: number;
  limit?: number;
  emitter?: ProgressEmitter;
}

// Update fetchRoute signature
export async function fetchRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  targetTime: string,
  config: OTPConfig,
  mode: TransportMode = 'WALK' // NEW parameter
): Promise<RouteResult>
```

#### 2.2 Update GraphQL Query

```typescript
// In fetchRoute function, update the query
export async function fetchRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  targetTime: string,
  config: OTPConfig,
  mode: TransportMode = 'WALK'
): Promise<RouteResult> {
  const targetDate = getNextTuesday();
  const modeConfig = TRANSPORT_MODE_CONFIG[mode];

  // Build optional bike parameters
  const bikeParams = mode === 'BICYCLE'
    ? `bikeSpeed: ${modeConfig.bikeSpeed}
       bikeSwitchTime: ${modeConfig.bikeSwitchTime}
       bikeSwitchCost: ${modeConfig.bikeSwitchCost}`
    : '';

  const query = `
    {
      plan(
        from: {lat: ${fromLat}, lon: ${fromLon}}
        to: {lat: ${toLat}, lon: ${toLon}}
        date: "${targetDate}"
        time: "${targetTime}"
        numItineraries: 3
        transportModes: ${modeConfig.modes}
        ${bikeParams}
      ) {
        itineraries {
          duration
          numberOfTransfers
          walkDistance
          legs {
            from { name lat lon }
            to { name lat lon }
            mode
            duration
            distance
            legGeometry { points }
            route { shortName longName }
          }
        }
      }
    }
  `;

  // ... rest of function
}
```

#### 2.3 Update buildRoutes Function

```typescript
export async function buildRoutes(
  options: BuildRoutesOptions = {}
): Promise<BuildRoutesResult> {
  const {
    period,
    mode = 'WALK', // NEW: default to WALK
    zones: zoneLimit,
    limit: routeLimit,
    emitter
  } = options;

  const periodsToRun = period ? [period] : ALL_PERIODS;
  const config = getOTPConfig();
  const zonesData = readZones();

  if (!zonesData) {
    throw new Error('No zones data found - run fetch first');
  }

  // ... process routes for the specified mode

  // When fetching route, pass the mode
  const result = await fetchRoute(
    fromLat, fromLon, toLat, toLon,
    targetTime, config,
    mode // Pass transport mode
  );

  // ... write result using mode-aware functions
  writeZoneRoutes(fromId, period, routesData, mode);
}
```

---

### Phase 3: CLI Updates

**Decision**: Add `--mode` flag to routes command

**Files to Modify**:
- `/home/user/kantama/varikko/src/cli.ts` - Add mode flag to routes command

**Changes Required**:

```typescript
// In varikko/src/cli.ts

program
  .command('routes')
  .description('Calculate transit routes between zones')
  .option('--period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
  .option('--mode <mode>', 'Transport mode (WALK, BICYCLE)', 'WALK') // NEW
  .option('--limit <number>', 'Limit routes to calculate (for testing)')
  .option('--zones <number>', 'Limit zones to process (for testing)')
  .action(async (options) => {
    const emitter = createProgressEmitter();

    // Validate mode
    const validModes = ['WALK', 'BICYCLE'];
    if (options.mode && !validModes.includes(options.mode.toUpperCase())) {
      console.error(`Invalid mode: ${options.mode}. Must be WALK or BICYCLE.`);
      process.exit(1);
    }

    console.log(`\n🚌 CALCULATING ROUTES (${options.mode || 'WALK'} mode)`);
    console.log('━'.repeat(50));

    const result = await buildRoutes({
      period: options.period,
      mode: options.mode?.toUpperCase() || 'WALK',
      zones: options.zones ? parseInt(options.zones) : undefined,
      limit: options.limit ? parseInt(options.limit) : undefined,
      emitter,
    });

    // Display results
    console.log('\n' + '━'.repeat(50));
    console.log('SUMMARY');
    console.log('━'.repeat(50));
    console.log(`✓ Successful:     ${result.ok} routes`);
    console.log(`⊘ No route found: ${result.noRoute} routes`);
    console.log(`✗ Errors:         ${result.errors} routes`);
  });

// Update fetch command to initialize both modes
program
  .command('fetch')
  .description('Fetch postal code zones from WFS APIs')
  .option('--limit <number>', 'Limit number of zones (for testing)')
  .action(async (options) => {
    // ... existing fetch logic ...

    // Initialize route files for both WALK and BICYCLE modes
    console.log('\n📦 Initializing route files...');
    const zoneIds = zonesData.zones.map((z) => z.id);
    const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT'];
    const modes: TransportMode[] = ['WALK', 'BICYCLE']; // Initialize both

    initializeRoutes(zoneIds, periods, modes);

    console.log(`✓ Created route files for ${zoneIds.length} zones × 3 periods × 2 modes`);
  });

// Update status command to show stats for both modes
program
  .command('status')
  .description('Show pipeline status')
  .action(() => {
    console.log('\n📊 VARIKKO STATUS');
    console.log('━'.repeat(50));

    const zonesData = readZones();
    if (!zonesData) {
      console.log('⚠️  No zones data found. Run "varikko fetch" first.');
      return;
    }

    console.log(`\n📍 ZONES: ${zonesData.zones.length}`);

    // Show stats for each mode
    for (const mode of ['WALK', 'BICYCLE']) {
      console.log(`\n🚶 ROUTES (${mode} mode):`);

      for (const period of ['MORNING', 'EVENING', 'MIDNIGHT']) {
        const counts = countRoutesByStatus(period as TimePeriod, mode as TransportMode);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        console.log(`  ${period}:`);
        console.log(`    Total: ${total}`);
        console.log(`    ✓ OK: ${counts[RouteStatus.OK]}`);
        console.log(`    ⊘ Pending: ${counts[RouteStatus.PENDING]}`);
        console.log(`    ⊘ No Route: ${counts[RouteStatus.NO_ROUTE]}`);
        console.log(`    ✗ Errors: ${counts[RouteStatus.ERROR]}`);
      }
    }
  });
```

---

### Phase 4: Frontend Implementation

#### 4.1 Update Shared Types Export

**Files to Modify**:
- `/home/user/kantama/varikko/src/shared/types.ts` - Ensure TransportMode is exported
- `/home/user/kantama/opas/src/services/DataService.ts` - Import and re-export TransportMode

```typescript
// In opas/src/services/DataService.ts
import type {
  Zone, TimeBucket, ZonesData, CompactLeg, CompactRoute,
  ZoneRoutesData, TimePeriod, TransportMode // Add TransportMode
} from 'varikko'

// Re-export
export type {
  Zone, TimeBucket, ZonesData, CompactLeg, CompactRoute,
  ZoneRoutesData, TimePeriod, TransportMode // Add TransportMode
}
```

#### 4.2 Data Service Updates

**Files to Modify**:
- `/home/user/kantama/opas/src/services/DataService.ts` - Add mode parameter to route loading

```typescript
// In DataService class

/**
 * Get cache key for a zone, period, and mode
 */
private getCacheKey(zoneId: string, period: TimePeriod, mode: TransportMode = 'WALK'): string {
  return `${zoneId}-${period}-${mode}`
}

/**
 * Load routes for a specific zone, period, and transport mode
 */
async loadRoutesForZone(
  zoneId: string,
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): Promise<CompactRoute[] | null> {
  const cacheKey = this.getCacheKey(zoneId, period, mode)

  // Check cache first
  if (this.routeCache.has(cacheKey)) {
    return this.routeCache.get(cacheKey)!
  }

  try {
    // Map period to file suffix
    const periodMap: Record<TimePeriod, string> = {
      MORNING: 'M',
      EVENING: 'E',
      MIDNIGHT: 'N',
    }

    const periodSuffix = periodMap[period]
    const modeSuffix = mode === 'WALK' ? '' : `-${mode.toLowerCase()}`
    const filename = `${zoneId}-${periodSuffix}${modeSuffix}.msgpack`

    const response = await fetch(`${this.baseUrl}/routes/${filename}`)

    if (!response.ok) {
      // If bicycle routes not found, gracefully degrade
      if (mode === 'BICYCLE' && response.status === 404) {
        console.warn(`Bicycle routes not available for zone ${zoneId}. Falling back to walk mode.`)
        return this.loadRoutesForZone(zoneId, period, 'WALK')
      }

      this.state.routeErrors.set(cacheKey, {
        type: 'routes_not_found',
        message: `Routes not found for zone ${zoneId}`,
        details: `File: ${filename}`,
      })
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const data = decode(new Uint8Array(arrayBuffer)) as ZoneRoutesData

    // Validate and cache
    if (!data.r || !Array.isArray(data.r)) {
      this.state.routeErrors.set(cacheKey, {
        type: 'parse_error',
        message: 'Invalid route data format',
      })
      return null
    }

    this.routeCache.set(cacheKey, data.r)
    return data.r
  } catch (error) {
    this.state.routeErrors.set(cacheKey, {
      type: 'network_error',
      message: 'Failed to load routes',
      details: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Get route costs for heatmap (used by store)
 */
getRouteCosts(
  fromZoneId: string,
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): Map<string, number> {
  const cacheKey = this.getCacheKey(fromZoneId, period, mode)
  const routes = this.routeCache.get(cacheKey)

  if (!routes) {
    return new Map()
  }

  const costs = new Map<string, number>()
  for (const route of routes) {
    if (route.s === RouteStatus.OK && route.d !== null) {
      costs.set(route.i, route.d)
    }
  }

  return costs
}

/**
 * Get route details for journey panel
 */
getRouteDetails(
  fromZoneId: string,
  toZoneId: string,
  period: TimePeriod,
  mode: TransportMode = 'WALK'
): CompactRoute | null {
  const cacheKey = this.getCacheKey(fromZoneId, period, mode)
  const routes = this.routeCache.get(cacheKey)

  if (!routes) {
    return null
  }

  return routes.find((r) => r.i === toZoneId) || null
}
```

#### 4.3 Store Updates

**Files to Modify**:
- `/home/user/kantama/opas/src/stores/mapData.ts` - Add transport mode state

```typescript
// In opas/src/stores/mapData.ts

import type { TransportMode } from '../services/DataService'

export const useMapDataStore = defineStore('mapData', () => {
  // Existing state
  const currentTimePeriod = ref<TimePeriod>('MORNING')
  const activeZoneId = ref<string | null>(null)
  const currentCosts = ref<Map<string, number>>(new Map())

  // NEW: Transport mode state
  const currentTransportMode = ref<TransportMode>('WALK')

  // Watch for changes in zone, period, OR mode
  watch([activeZoneId, currentTimePeriod, currentTransportMode], async () => {
    if (!activeZoneId.value) {
      currentCosts.value = new Map()
      return
    }

    // Load routes for current mode
    const routes = await dataService.loadRoutesForZone(
      activeZoneId.value,
      currentTimePeriod.value,
      currentTransportMode.value // Pass mode
    )

    if (routes) {
      currentCosts.value = dataService.getRouteCosts(
        activeZoneId.value,
        currentTimePeriod.value,
        currentTransportMode.value // Pass mode
      )
    } else {
      currentCosts.value = new Map()
    }
  })

  // Computed property for current route details
  const currentRoute = computed(() => {
    if (!activeZoneId.value || !selectedDestinationId.value) {
      return null
    }

    return dataService.getRouteDetails(
      activeZoneId.value,
      selectedDestinationId.value,
      currentTimePeriod.value,
      currentTransportMode.value // Pass mode
    )
  })

  return {
    // ... existing exports
    currentTransportMode, // NEW export
  }
})
```

#### 4.4 UI Updates

**Files to Modify**:
- `/home/user/kantama/opas/src/utils/transportColors.ts` - Add BICYCLE color
- `/home/user/kantama/opas/src/components/JourneyDetails.vue` - Add bike icon
- `/home/user/kantama/opas/src/App.vue` - Add transport mode toggle

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

export function getModeColor(mode: string): string {
  return modeColors[mode.toUpperCase()] || '#666666'
}
```

**Add bike icon** (`JourneyDetails.vue`):

```typescript
const getTransportIcon = (mode: string): string => {
  switch (mode.toLowerCase()) {
    case 'walk': return '🚶'
    case 'bicycle': return '🚴'  // NEW
    case 'bus': return '🚌'
    case 'tram': return '🚊'
    case 'subway': return '🚇'
    case 'ferry': return '⛴️'
    case 'rail': return '🚆'
    default: return '➜'
  }
}

const getModeLabel = (mode: string): string => {
  switch (mode.toLowerCase()) {
    case 'walk': return 'Walk'
    case 'bicycle': return 'Bike'  // NEW
    case 'bus': return 'Bus'
    case 'tram': return 'Tram'
    case 'subway': return 'Metro'
    case 'ferry': return 'Ferry'
    case 'rail': return 'Train'
    default: return mode
  }
}
```

**Add transport mode toggle** (`App.vue`):

```vue
<template>
  <div class="min-h-screen w-full bg-vintage-cream relative">
    <!-- Title (unchanged) -->

    <!-- Transport Mode Toggle - Top Right (NEW) -->
    <div class="fixed top-6 right-6 z-20">
      <div class="flex border-2 border-vintage-dark shadow-[3px_3px_0px_rgba(38,70,83,1)] bg-vintage-cream">
        <button
          v-for="mode in transportModes"
          :key="mode.value"
          class="px-4 py-2 font-sans text-xs tracking-widest uppercase transition-colors"
          :class="store.currentTransportMode === mode.value
            ? 'bg-vintage-dark text-vintage-cream'
            : 'bg-vintage-cream text-vintage-dark hover:bg-vintage-dark/10'"
          @click="store.currentTransportMode = mode.value"
        >
          {{ mode.icon }} {{ mode.label }}
        </button>
      </div>
    </div>

    <!-- Period Toggle - Bottom Right (existing, unchanged) -->
    <div class="fixed bottom-6 right-6 z-20">
      <!-- ... existing time period toggle ... -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMapDataStore } from './stores/mapData'

const store = useMapDataStore()

const transportModes = [
  { value: 'WALK', label: 'WALK', icon: '🚶' },
  { value: 'BICYCLE', label: 'BIKE', icon: '🚴' },
]
</script>
```

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
- Add error handling in fetchRoute() to detect unsupported mode
- Show user-friendly error in frontend when bike routes unavailable

---

### Phase 6: Testing & Deployment

#### Backend Tests

**Files to Create/Modify**:
- `/home/user/kantama/varikko/src/tests/lib/routing.test.ts` - Add bike mode tests

```typescript
describe('bike routing', () => {
  it('should query OTP with BICYCLE transport mode', async () => {
    const result = await fetchRoute(
      60.17, 24.93, 60.18, 24.94,
      '08:30:00', mockConfig, 'BICYCLE'
    );

    expect(result.status).toBe('OK');
    // Should have BICYCLE legs
  });

  it('should create separate files for bike and walk routes', () => {
    const zoneIds = ['00100', '00200'];
    const periods: TimePeriod[] = ['MORNING'];
    const modes: TransportMode[] = ['WALK', 'BICYCLE'];

    initializeRoutes(zoneIds, periods, modes);

    // Check both files exist
    expect(fs.existsSync('00100-M.msgpack')).toBe(true);
    expect(fs.existsSync('00100-M-bicycle.msgpack')).toBe(true);
  });
});
```

#### Integration Testing

**Manual Test Scenarios**:
1. **Calculate bike routes**: `pnpm --filter varikko exec tsx src/cli.ts routes --mode BICYCLE --limit 10`
2. **Verify files created**: Check `opas/public/data/routes/` for `-bicycle.msgpack` files
3. **Frontend toggle**: Switch between WALK and BICYCLE modes in UI
4. **Route comparison**: Compare bike vs. walk durations

**Performance Metrics**:
- Route calculation time (bike vs. walk)
- File size increase (should be ~2×)
- Frontend load time (should be minimal)

#### Deployment Steps

```bash
# 1. Calculate bike routes (test mode)
pnpm --filter varikko exec tsx src/cli.ts routes --mode BICYCLE --limit 10

# 2. Verify results
pnpm --filter varikko exec tsx src/cli.ts status

# 3. Calculate all bike routes (full dataset)
pnpm --filter varikko exec tsx src/cli.ts routes --mode BICYCLE

# 4. Verify data files
ls -lh opas/public/data/routes/*-bicycle.msgpack

# 5. Test frontend
pnpm --filter opas dev
# Open browser, test transport mode toggle
```

---

## Implementation Checklist

### Backend (Varikko)

#### Data Types
- [ ] Add `TransportMode` type to shared types
- [ ] Update `ZoneRoutesData` to include optional mode field

#### Datastore Layer
- [ ] Update `getRoutePath()` to support mode suffix
- [ ] Add mode parameter to `readZoneRoutes()`
- [ ] Add mode parameter to `writeZoneRoutes()`
- [ ] Update `initializeRoutes()` to support multiple modes
- [ ] Add `getZonesWithPendingRoutes()` with mode parameter
- [ ] Add `countRoutesByStatus()` with mode parameter

#### Routing Layer
- [ ] Add `TRANSPORT_MODE_CONFIG` constants
- [ ] Add mode parameter to `fetchRoute()`
- [ ] Update OTP GraphQL query with bike parameters
- [ ] Add mode parameter to `BuildRoutesOptions`
- [ ] Update `buildRoutes()` to support mode

#### CLI
- [ ] Add `--mode` flag to `routes` command
- [ ] Update `fetch` command to initialize both modes
- [ ] Update `status` command to show stats for both modes
- [ ] Add validation for mode parameter

#### Testing
- [ ] Add bike routing test cases
- [ ] Test file naming with mode suffix
- [ ] Integration test for full workflow

### Frontend (OPAS)

#### Data Layer
- [ ] Import and re-export `TransportMode`
- [ ] Update `getCacheKey()` to include mode
- [ ] Add mode parameter to `loadRoutesForZone()`
- [ ] Add mode parameter to `getRouteCosts()`
- [ ] Add mode parameter to `getRouteDetails()`
- [ ] Add graceful fallback for missing bike routes

#### Store Layer
- [ ] Add `currentTransportMode` state
- [ ] Update watchers to include transport mode
- [ ] Pass mode to all DataService calls
- [ ] Expose transport mode in store API

#### UI Components
- [ ] Add BICYCLE color to `transportColors.ts`
- [ ] Add bike icon to `JourneyDetails.vue`
- [ ] Add bike label to mode label function
- [ ] Create transport mode toggle in `App.vue`
- [ ] Match vintage aesthetic in toggle design

#### Testing
- [ ] Test transport mode selector
- [ ] Test route loading with different modes
- [ ] Test backward compatibility (graceful degradation)
- [ ] Visual testing for bike routes
- [ ] Test all icon/color combinations

### Documentation

- [ ] Update varikko README with bike routing
- [ ] Document OTP requirements
- [ ] Update API documentation
- [ ] Add troubleshooting section
- [ ] Document bike routing parameters

---

## Success Criteria

### Functional Requirements
- [ ] Bike routes calculated via OTP
- [ ] Separate msgpack files for WALK and BICYCLE modes
- [ ] CLI supports `--mode` flag
- [ ] Frontend toggle switches between modes
- [ ] Backward compatibility maintained

### Non-Functional Requirements
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Data size increase acceptable (~2×)
- [ ] Frontend performance maintained

### Quality Requirements
- [ ] Bike routes use appropriate OTP parameters
- [ ] UI clearly indicates current mode
- [ ] Error messages are actionable
- [ ] Documentation is complete

---

## Timeline Estimate

| Phase | Description | Effort | Duration |
|-------|-------------|--------|----------|
| 1 | Data model extension | Small | 1-2 hours |
| 2 | Backend OTP updates | Medium | 2-3 hours |
| 3 | CLI updates | Small | 1-2 hours |
| 4 | Frontend implementation | Medium | 3-4 hours |
| 5 | OTP verification | Small | 1 hour |
| 6 | Testing & deployment | Medium | 2-3 hours |
| **Total** | | | **10-15 hours** |

---

## Benefits

### Immediate
- ✅ **Explore new modality**: Users can see bike+transit routes
- ✅ **Complementary data**: Walking routes remain available
- ✅ **Simple architecture**: File-based storage makes it straightforward
- ✅ **Backward compatible**: Old frontend works with walking routes

### Long-term
- ✅ **Extensible**: Easy to add more modes (scooter, car, etc.)
- ✅ **User insights**: Compare bike vs. walk accessibility
- ✅ **Better coverage**: Some areas are faster by bike
- ✅ **Future-proof**: Clean separation of transport modes

---

## Potential Challenges & Solutions

### Challenge 1: OTP Bike Routing Quality

**Issue**: Bike routes might use dangerous roads

**Solutions**:
- Review OSM bike infrastructure tags
- Tune OTP parameters: `bikeSpeed`, `bikeSwitchTime`, `bikeSwitchCost`
- Add `bikeReluctance` to prefer transit for long distances
- Add `bikeSafetyFactor` to prefer bike lanes

### Challenge 2: Data Size Growth

**Current**: ~5 MB
**Expected**: ~10 MB (acceptable)

**Solution**: Monitor and optimize if needed

### Challenge 3: Build Time Increase

**Current**: 2-3 hours local
**Expected**: 4-6 hours for both modes

**Solution**: Calculate modes in parallel where possible

### Challenge 4: Bikes on Transit Restrictions

**Issue**: Metro restricts bikes during rush hour

**Solution**:
- OTP should respect `bikes_allowed` from GTFS
- Verify HSL GTFS includes restrictions
- Document known limitations

---

## Critical Files Reference

| File | Purpose | Changes |
|------|---------|---------|
| `varikko/src/lib/datastore.ts` | File-based data operations | Add mode parameter to route functions |
| `varikko/src/lib/routing.ts` | OTP queries | Add bike mode configuration and parameters |
| `varikko/src/shared/types.ts` | Shared types | Add TransportMode type |
| `varikko/src/cli.ts` | CLI commands | Add --mode flag to routes command |
| `opas/src/stores/mapData.ts` | State management | Add currentTransportMode state |
| `opas/src/services/DataService.ts` | Data loading | Support transport mode parameter |
| `opas/src/App.vue` | Main UI | Add transport mode toggle |
| `opas/src/utils/transportColors.ts` | Styling | Add BICYCLE color |
| `opas/src/components/JourneyDetails.vue` | Route display | Add bike icon |

---

## Next Steps

1. **Verify OTP bike routing capability** (Phase 5)
2. **Implement data model changes** (Phase 1)
3. **Update backend routing logic** (Phase 2)
4. **Update CLI** (Phase 3)
5. **Test with sample routes**
6. **Implement frontend UI** (Phase 4)
7. **Full deployment** (Phase 6)

---

**Questions or Concerns?**

Before implementation, verify:
- Is the OTP instance configured for bike routing?
- Do we have OSM data with bike infrastructure?
- What's the acceptable data size increase?
- Should we support more transport modes in the future?
