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
    // Remove routing columns to simulate old schema
    testDB.db.exec('ALTER TABLE places DROP COLUMN routing_lat');
    testDB.db.exec('ALTER TABLE places DROP COLUMN routing_lon');
    testDB.db.exec('ALTER TABLE places DROP COLUMN routing_source');
    testDB.db.exec('ALTER TABLE places DROP COLUMN geocoding_error');

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
  const testGeometry = {
    type: 'Polygon',
    coordinates: [[
      [24.94, 60.16],
      [24.96, 60.16],
      [24.96, 60.18],
      [24.94, 60.18],
      [24.94, 60.16],
    ]],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reverse geocode from POI coordinates', async () => {
    const mockResponse = {
      data: {
        type: 'FeatureCollection',
        features: [
          {
            geometry: { coordinates: [24.9497, 60.1653] },
            properties: { name: 'Mannerheimintie 2' },
          },
        ],
      },
    };

    vi.mocked(axios.get).mockResolvedValue(mockResponse);

    const result = await geocodeZone(60.17, 24.95, testGeometry, 'test-key');

    expect(result.success).toBe(true);
    expect(result.lat).toBeCloseTo(60.1653, 4);
    expect(result.lon).toBeCloseTo(24.9497, 4);
    expect(result.source).toContain('reverse:');

    // Should have called reverse geocoding API
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/reverse'),
      expect.objectContaining({
        params: expect.objectContaining({
          'point.lat': '60.17',
          'point.lon': '24.95',
        }),
      })
    );
  });

  it('should expand radius if first attempt fails', async () => {
    vi.mocked(axios.get)
      // First call (500m) fails
      .mockResolvedValueOnce({ data: { features: [] } })
      // Second call (1km) succeeds
      .mockResolvedValueOnce({
        data: {
          features: [
            {
              geometry: { coordinates: [24.9401, 60.1618] },
              properties: { name: 'Nearby Street' },
            },
          ],
        },
      });

    const result = await geocodeZone(60.16, 24.94, testGeometry, 'test-key');

    expect(result.success).toBe(true);
    expect(result.source).toContain('1km');
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('should validate results are inside zone polygon', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        features: [
          {
            geometry: { coordinates: [24.9500, 60.1700] },  // Inside test polygon
            properties: { name: 'Inside Address' },
          },
        ],
      },
    });

    const result = await geocodeZone(60.17, 24.95, testGeometry, 'test-key');

    expect(result.success).toBe(true);
    expect(result.insideZone).toBe(true);
    expect(result.distance).toBeDefined();
  });

  it('should return failure if all strategies fail', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { features: [] } });

    const result = await geocodeZone(60.17, 24.95, testGeometry, 'test-key');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(axios.get).toHaveBeenCalledTimes(5);  // All 5 radius strategies tried
  });

  it('should handle network errors', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Network timeout'));

    const result = await geocodeZone(60.17, 24.95, testGeometry, 'test-key');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network timeout');
  });

  it('should include API key in headers if provided', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { features: [] } });

    await geocodeZone(60.17, 24.95, testGeometry, 'my-api-key');

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
      source: 'reverse:address 500m',
      distance: 45,
      insideZone: true,
    };

    updateZoneRouting(testDB.db, '00100', result, 60.1653, 24.9497);

    assertZoneHasRoutingCoords(testDB.db, '00100');

    const zone = testDB.db
      .prepare('SELECT routing_lat, routing_lon, routing_source, geocoding_error FROM places WHERE id = ?')
      .get('00100') as any;

    expect(zone.routing_lat).toBeCloseTo(60.1700, 4);
    expect(zone.routing_lon).toBeCloseTo(24.9550, 4);
    expect(zone.routing_source).toContain('reverse:address 500m');
    expect(zone.routing_source).toContain('45m');
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

    expect(zone.routing_lat).toBeCloseTo(60.1653, 4);  // Fallback to inside point (POI)
    expect(zone.routing_lon).toBeCloseTo(24.9497, 4);
    expect(zone.routing_source).toBe('fallback:inside_point');
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
    expect(result.insideZone + result.outsideZone).toBe(5);

    // All zones should have routing coords
    const zones = testDB.db.prepare('SELECT id FROM places').all() as Array<{ id: string }>;
    for (const zone of zones) {
      assertZoneHasRoutingCoords(testDB.db, zone.id);
    }
  });

  it('should handle partial failures', async () => {
    // First zone succeeds, second zone fails all 5 attempts, rest succeed
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { features: [{ geometry: { coordinates: [24.95, 60.17] }, properties: {} }] } })
      // Zone 2: fail all 5 radius strategies
      .mockResolvedValueOnce({ data: { features: [] } })
      .mockResolvedValueOnce({ data: { features: [] } })
      .mockResolvedValueOnce({ data: { features: [] } })
      .mockResolvedValueOnce({ data: { features: [] } })
      .mockResolvedValueOnce({ data: { features: [] } })
      // Remaining zones succeed
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

  it('should emit progress events', async () => {
    const progressEvents: Array<{ type: string; stage: string }> = [];
    const emitter = {
      emitStart: (stage: string) => {
        progressEvents.push({ type: 'start', stage });
      },
      emitProgress: (stage: string) => {
        progressEvents.push({ type: 'progress', stage });
      },
      emitComplete: (stage: string) => {
        progressEvents.push({ type: 'complete', stage });
      },
    };

    await geocodeZones(testDB.db, {
      testMode: true,
      testLimit: 3,
      apiKey: 'test-key',
      emitter: emitter as any,
    });

    expect(progressEvents.some(e => e.type === 'start')).toBe(true);
    expect(progressEvents.some(e => e.type === 'progress')).toBe(true);
    expect(progressEvents.some(e => e.type === 'complete')).toBe(true);
    expect(progressEvents.every(e => e.stage === 'geocode_zones')).toBe(true);
  });
});
