# Phase 04: Geocode Zones Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 03 (Fetch Zones)
**Estimated Effort:** 2 days
**Priority:** MEDIUM (optional enhancement, improves routing accuracy)

---

## Overview

Geocode zones to resolve street addresses for accurate routing points. The fetch_zones workflow uses geometric centroids which may fall in invalid locations (water, parks, forests). This workflow enhances zones with address-based coordinates that guarantee valid street locations.

**What it does:**
1. Check/update database schema (add routing columns if missing)
2. For each zone, attempt geocoding via Digitransit API using 3 strategies:
   - Strategy 1: Postal code only (e.g., "00100")
   - Strategy 2: Zone name (e.g., "Kaartinkaupunki")
   - Strategy 3: Postal code + Helsinki (e.g., "00100 Helsinki")
3. Update `places` table with routing coordinates
4. Fallback to geometric centroid if geocoding fails
5. Store error details for failed geocoding
6. Rate limit to 100ms between requests (10 req/sec max)

---

## Current Implementation

**File:** `src/geocode_zones.ts:1-288`

### Key Components

**Lines 64-92:** `updateSchema()` - Add columns if missing
- `routing_lat`, `routing_lon`, `routing_source`, `geocoding_error`
- Uses `ALTER TABLE` (non-destructive schema migration)

**Lines 94-181:** `geocodeZone()` - Geocode single zone
- **Lines 103-120:** Three search strategies
  - Postal code only
  - Zone name (with layers filter: neighbourhood, locality, address)
  - Postal code + Helsinki
- **Lines 136-142:** API key handling (digitransit-subscription-key header)
- **Lines 149-159:** Return first successful result
- **Lines 162-180:** Error handling (network errors, HTTP errors, no results)

**Lines 187-287:** `main()` - Main workflow
- Update schema (line 188)
- Load all zones (line 191)
- Test mode: limit to 5 zones (lines 193-196)
- Progress bar with cli-progress (lines 200-206)
- Process each zone with rate limiting (lines 223-248)
  - Success: Update with geocoded coordinates
  - Failure: Fallback to geometric centroid
- Display results summary (lines 252-282)

### Constants

**Line 37-40:** API config
- `GEOCODING_API`: https://api.digitransit.fi/geocoding/v1/search
- `RATE_LIMIT_DELAY`: 100ms (10 req/sec max)
- `API_KEY`: From env (DIGITRANSIT_API_KEY or HSL_API_KEY)

**Lines 46-51:** Helsinki bounds (for geocoding boundary filter)

### Pain Points

1. **Schema migration fragile:** Checks each column individually, verbose
2. **Progress bar library:** Uses cli-progress (different from other workflows)
3. **No resume capability:** Must restart if interrupted
4. **Rate limiting simplistic:** Fixed 100ms delay, no adaptive throttling
5. **Test mode inconsistent:** Shows detailed output in test mode but not in normal mode
6. **API key warning:** Only shown at end, should be upfront

---

## Target Architecture

### Business Logic API

**File:** `src/lib/geocoding.ts`

```typescript
import type Database from 'better-sqlite3';
import type { ProgressEmitter } from './events';

export interface GeocodeOptions {
  testMode?: boolean;
  testLimit?: number;
  emitter?: ProgressEmitter;
  apiKey?: string;
}

export interface GeocodeResult {
  success: boolean;
  lat?: number;
  lon?: number;
  source?: string;
  error?: string;
}

/**
 * Geocode all zones (main entry point)
 */
export async function geocodeZones(
  db: Database.Database,
  options: GeocodeOptions
): Promise<{ success: number; failed: number; errors: Array<{id: string; error: string}> }>;

/**
 * Geocode single zone using multiple strategies
 */
export async function geocodeZone(
  zoneId: string,
  zoneName: string,
  apiKey?: string
): Promise<GeocodeResult>;

/**
 * Update database schema (add routing columns)
 */
export function ensureGeocodingSchema(db: Database.Database): void;

/**
 * Update zone with geocoding results
 */
export function updateZoneRouting(
  db: Database.Database,
  zoneId: string,
  result: GeocodeResult,
  fallbackLat: number,
  fallbackLon: number
): void;
```

---

## Implementation Steps

### Step 1: Write Tests

**File:** `src/tests/lib/geocoding.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDB, seedDB } from '../helpers/db';
import { loadZonesFixture } from '../helpers/fixtures';
import { assertZoneHasRoutingCoords } from '../helpers/assertions';
import {
  geocodeZones,
  geocodeZone,
  ensureGeocodingSchema,
  updateZoneRouting,
} from '../../lib/geocoding';
import axios from 'axios';

vi.mock('axios');

describe('geocoding - ensureGeocodingSchema', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should add routing columns if missing', () => {
    // Remove routing columns
    testDB.db.exec('ALTER TABLE places DROP COLUMN routing_lat');

    ensureGeocodingSchema(testDB.db);

    const columns = testDB.db
      .prepare('PRAGMA table_info(places)')
      .all() as Array<{ name: string }>;

    expect(columns.map(c => c.name)).toEqual(
      expect.arrayContaining(['routing_lat', 'routing_lon', 'routing_source', 'geocoding_error'])
    );
  });

  it('should not fail if columns already exist', () => {
    ensureGeocodingSchema(testDB.db);
    expect(() => ensureGeocodingSchema(testDB.db)).not.toThrow();
  });
});

describe('geocoding - geocodeZone', () => {
  it('should try postal code first', async () => {
    const mockResponse = {
      data: {
        type: 'FeatureCollection',
        features: [
          {
            geometry: { coordinates: [24.9497, 60.1653] },
            properties: { name: 'Kaartinkaupunki' },
          },
        ],
      },
    };

    vi.mocked(axios.get).mockResolvedValue(mockResponse);

    const result = await geocodeZone('00100', 'Kaartinkaupunki', 'test-key');

    expect(result.success).toBe(true);
    expect(result.lat).toBeCloseTo(60.1653, 4);
    expect(result.lon).toBeCloseTo(24.9497, 4);
    expect(result.source).toContain('postal code');

    // Should have called API with postal code
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('digitransit.fi'),
      expect.objectContaining({
        params: expect.objectContaining({ text: '00100' }),
      })
    );
  });

  it('should try zone name if postal code fails', async () => {
    vi.mocked(axios.get)
      // First call (postal code) fails
      .mockResolvedValueOnce({ data: { features: [] } })
      // Second call (zone name) succeeds
      .mockResolvedValueOnce({
        data: {
          features: [
            {
              geometry: { coordinates: [24.9401, 60.1618] },
              properties: { name: 'Punavuori' },
            },
          ],
        },
      });

    const result = await geocodeZone('00120', 'Punavuori', 'test-key');

    expect(result.success).toBe(true);
    expect(result.source).toContain('zone name');
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('should try postal code + Helsinki as last resort', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { features: [] } })  // Postal code fails
      .mockResolvedValueOnce({ data: { features: [] } })  // Zone name fails
      .mockResolvedValueOnce({  // Postal + Helsinki succeeds
        data: {
          features: [
            {
              geometry: { coordinates: [24.9520, 60.1555] },
              properties: { name: 'Kaivopuisto' },
            },
          ],
        },
      });

    const result = await geocodeZone('00130', 'Kaivopuisto', 'test-key');

    expect(result.success).toBe(true);
    expect(result.source).toContain('Helsinki');
    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  it('should return failure if all strategies fail', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { features: [] } });

    const result = await geocodeZone('00140', 'Unknown', 'test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(axios.get).toHaveBeenCalledTimes(3);  // All 3 strategies tried
  });

  it('should handle network errors', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Network timeout'));

    const result = await geocodeZone('00150', 'Eira', 'test-key');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network timeout');
  });

  it('should include API key in headers if provided', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { features: [] } });

    await geocodeZone('00100', 'Test', 'my-api-key');

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'digitransit-subscription-key': 'my-api-key',
        }),
      })
    );
  });
});

describe('geocoding - updateZoneRouting', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
    ensureGeocodingSchema(testDB.db);
    seedDB(testDB.db, {
      places: loadZonesFixture('5-zones'),
    });
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should update zone with geocoding results', () => {
    const result = {
      success: true,
      lat: 60.1700,
      lon: 24.9550,
      source: 'geocoded:postal code',
    };

    updateZoneRouting(testDB.db, '00100', result, 60.1653, 24.9497);

    assertZoneHasRoutingCoords(testDB.db, '00100');

    const zone = testDB.db
      .prepare('SELECT routing_lat, routing_lon, routing_source, geocoding_error FROM places WHERE id = ?')
      .get('00100') as any;

    expect(zone.routing_lat).toBeCloseTo(60.1700, 4);
    expect(zone.routing_lon).toBeCloseTo(24.9550, 4);
    expect(zone.routing_source).toBe('geocoded:postal code');
    expect(zone.geocoding_error).toBeNull();
  });

  it('should use fallback if geocoding failed', () => {
    const result = {
      success: false,
      error: 'No results found',
    };

    updateZoneRouting(testDB.db, '00100', result, 60.1653, 24.9497);

    const zone = testDB.db
      .prepare('SELECT routing_lat, routing_lon, routing_source, geocoding_error FROM places WHERE id = ?')
      .get('00100') as any;

    expect(zone.routing_lat).toBeCloseTo(60.1653, 4);  // Fallback to geometric
    expect(zone.routing_lon).toBeCloseTo(24.9497, 4);
    expect(zone.routing_source).toBe('fallback:geometric');
    expect(zone.geocoding_error).toBe('No results found');
  });
});

describe('geocoding - geocodeZones (integration)', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
    seedDB(testDB.db, {
      places: loadZonesFixture('5-zones'),
    });

    // Mock successful geocoding for all zones
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        features: [
          {
            geometry: { coordinates: [24.95, 60.17] },
            properties: { name: 'Test' },
          },
        ],
      },
    });
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should geocode all zones', async () => {
    const result = await geocodeZones(testDB.db, {
      testMode: true,
      testLimit: 5,
      apiKey: 'test-key',
    });

    expect(result.success).toBe(5);
    expect(result.failed).toBe(0);

    // All zones should have routing coords
    const zones = testDB.db.prepare('SELECT id FROM places').all() as Array<{ id: string }>;
    for (const zone of zones) {
      assertZoneHasRoutingCoords(testDB.db, zone.id);
    }
  });

  it('should handle partial failures', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { features: [{ geometry: { coordinates: [24.95, 60.17] }, properties: {} }] } })
      .mockResolvedValueOnce({ data: { features: [] } })  // Fail second zone
      .mockResolvedValueOnce({ data: { features: [{ geometry: { coordinates: [24.95, 60.17] }, properties: {} }] } })
      .mockResolvedValueOnce({ data: { features: [{ geometry: { coordinates: [24.95, 60.17] }, properties: {} }] } })
      .mockResolvedValueOnce({ data: { features: [{ geometry: { coordinates: [24.95, 60.17] }, properties: {} }] } });

    const result = await geocodeZones(testDB.db, {
      testMode: true,
      testLimit: 5,
      apiKey: 'test-key',
    });

    expect(result.success).toBe(4);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('should respect rate limiting', async () => {
    const startTime = Date.now();

    await geocodeZones(testDB.db, {
      testMode: true,
      testLimit: 3,
      apiKey: 'test-key',
    });

    const elapsed = Date.now() - startTime;

    // Should take at least 200ms (2 delays × 100ms) for 3 zones
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });
});
```

---

### Step 2: Implement Business Logic

**File:** `src/lib/geocoding.ts`

Extract logic from `geocode_zones.ts`, focusing on clean separation and testability. (Implementation similar to zones.ts - extract functions, add progress events, handle errors gracefully)

---

### Step 3: Implement TUI Screen

**File:** `src/tui/screens/geocode.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ProgressBar } from '../components/ProgressBar';
import { Spinner } from '../components/Spinner';
import { openDB } from '../../lib/db';
import { geocodeZones } from '../../lib/geocoding';
import { createProgressEmitter, type ProgressEvent } from '../../lib/events';
import { colors, symbols } from '../theme';

interface GeocodeScreenProps {
  testMode: boolean;
  apiKey?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function GeocodeScreen({ testMode, apiKey, onComplete, onCancel }: GeocodeScreenProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (status !== 'idle') return;

    const run = async () => {
      setStatus('running');

      const db = openDB();
      const emitter = createProgressEmitter();

      emitter.on('progress', setProgress);

      try {
        const result = await geocodeZones(db, {
          testMode,
          testLimit: 5,
          apiKey,
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
  }, [status, testMode, apiKey]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="GEOCODE ZONES"
        subtitle={testMode ? 'Test Mode (5 zones)' : 'Full Run'}
        width={80}
      />

      <Box flexDirection="column" marginTop={1}>
        {status === 'running' && progress && progress.current && progress.total && (
          <ProgressBar
            current={progress.current}
            total={progress.total}
            label="Geocoding zones..."
          />
        )}

        {status === 'complete' && result && (
          <Box flexDirection="column">
            <Text color="green">{symbols.success} Geocoding complete!</Text>
            <Box marginTop={1}>
              <Text>Success: </Text>
              <Text color="green">{result.success}</Text>
              <Text> | Failed: </Text>
              <Text color="yellow">{result.failed}</Text>
              <Text color="gray"> (fallback to geometric)</Text>
            </Box>
            {result.errors.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color="gray">Sample errors (first 3):</Text>
                {result.errors.slice(0, 3).map((err: any) => (
                  <Text key={err.id} color="gray">  • {err.id}: {err.error}</Text>
                ))}
              </Box>
            )}
          </Box>
        )}

        {status === 'error' && error && (
          <Text color="red">{symbols.error} {error.message}</Text>
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

Add action to `src/cli.ts` for `geocode` subcommand (similar to fetch command).

---

## Acceptance Criteria

- ✅ All tests pass
- ✅ CLI command `varikko geocode` works
- ✅ CLI command `varikko geocode --test` limits to 5 zones
- ✅ TUI screen shows real-time progress
- ✅ Geocoding tries 3 strategies before giving up
- ✅ Fallback to geometric centroid works
- ✅ Rate limiting works (100ms between requests)
- ✅ API key properly passed in headers
- ✅ Schema migration non-destructive
- ✅ Results identical to current implementation

---

## Manual Testing Checklist

- [ ] Run `pnpm test` - all geocoding tests pass
- [ ] Run `varikko geocode --test` - geocodes 5 zones
- [ ] Verify routing_lat/routing_lon updated in DB
- [ ] Verify routing_source shows geocoding strategy
- [ ] Test without API key - should still work (may fail geocoding)
- [ ] Test with invalid API key - should show errors but complete
- [ ] Compare results with old implementation

---

## Migration Notes

- After this phase: Delete `src/geocode_zones.ts`
- Update package.json: Remove `geocode:zones` and `geocode:test` scripts

---

## Rollback Plan

Keep `src/geocode_zones.ts` until validation complete. Can revert to old script if issues arise.

---

## Next Phase

**Phase 05:** Build Routes (route calculation via OTP)

---

## References

- **Current Implementation:** `src/geocode_zones.ts:1-288`
- **Digitransit Geocoding API:** https://digitransit.fi/en/developers/apis/2-geocoding-api/
- **GEOCODING.md:** Project geocoding documentation
