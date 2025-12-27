import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDB, seedDB, getDBSnapshot } from '../helpers/db';
import { assertRecordCount } from '../helpers/assertions';
import {
  fetchZones,
  downloadZonesFromWFS,
  processZones,
  initializeSchema,
  validateSchema,
  insertZones,
  type ZoneData,
} from '../../lib/zones';
import { createProgressEmitter } from '../../lib/events';
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
            coordinates: [
              [
                [24.945, 60.163],
                [24.953, 60.163],
                [24.953, 60.167],
                [24.945, 60.167],
                [24.945, 60.163],
              ],
            ],
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
          coordinates: [
            [
              [24.945, 60.163],
              [24.953, 60.163],
              [24.953, 60.167],
              [24.945, 60.167],
              [24.945, 60.163],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { postinumeroalue: '33100', nimi: 'Tampere' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [23.0, 61.0],
              [23.1, 61.0],
              [23.1, 61.1],
              [23.0, 61.1],
              [23.0, 61.0],
            ],
          ],
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
          coordinates: [
            [
              [24.92, 60.16],
              [24.94, 60.16],
              [24.94, 60.18],
              [24.92, 60.18],
              [24.92, 60.16],
            ],
          ],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones.length).toBeGreaterThan(0);
    expect(zones[0].lat).toBeCloseTo(60.17, 1);
    expect(zones[0].lon).toBeCloseTo(24.93, 1);
  });

  it('should generate SVG paths', () => {
    const features = [
      {
        type: 'Feature',
        properties: { postinumeroalue: '00100', nimi: 'Helsinki' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [24.945, 60.163],
              [24.953, 60.163],
              [24.953, 60.167],
              [24.945, 60.167],
              [24.945, 60.163],
            ],
          ],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones[0].svg_path).toBeTruthy();
    expect(zones[0].svg_path).toMatch(/^M/); // SVG path starts with M
  });

  it('should limit zones in test mode', () => {
    const features = Array.from({ length: 50 }, (_, i) => ({
      type: 'Feature',
      properties: {
        postinumeroalue: `001${i.toString().padStart(2, '0')}`,
        nimi: `Zone ${i}`,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [24.945, 60.163],
            [24.953, 60.163],
            [24.953, 60.167],
            [24.945, 60.167],
            [24.945, 60.163],
          ],
        ],
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
          coordinates: [
            [
              [100.0, 80.0],
              [110.0, 80.0],
              [110.0, 85.0],
              [100.0, 85.0],
              [100.0, 80.0],
            ],
          ],
        },
      },
    ];

    const zones = processZones(features, {});

    expect(zones).toHaveLength(0); // Should be filtered out
  });
});

describe('zones - validateSchema', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should return true when schema is initialized', () => {
    initializeSchema(testDB.db);
    expect(validateSchema(testDB.db)).toBe(true);
  });

  it('should return false when schema is not initialized', () => {
    // Create empty database
    const emptyDB = createTestDB(':memory:');
    // Drop all tables created by createTestDB
    emptyDB.db.exec('DROP TABLE IF EXISTS places');
    emptyDB.db.exec('DROP TABLE IF EXISTS routes');
    emptyDB.db.exec('DROP TABLE IF EXISTS metadata');
    emptyDB.db.exec('DROP TABLE IF EXISTS deciles');

    expect(validateSchema(emptyDB.db)).toBe(false);
    emptyDB.cleanup();
  });

  it('should return false when only some tables exist', () => {
    const partialDB = createTestDB(':memory:');
    // Drop all tables created by createTestDB
    partialDB.db.exec('DROP TABLE IF EXISTS places');
    partialDB.db.exec('DROP TABLE IF EXISTS routes');
    partialDB.db.exec('DROP TABLE IF EXISTS metadata');
    partialDB.db.exec('DROP TABLE IF EXISTS deciles');

    // Create only some tables
    partialDB.db.exec('CREATE TABLE places (id TEXT)');
    partialDB.db.exec('CREATE TABLE routes (id TEXT)');

    expect(validateSchema(partialDB.db)).toBe(false);
    partialDB.cleanup();
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

    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['places', 'routes', 'metadata', 'deciles'])
    );
  });

  it('should create indexes', () => {
    initializeSchema(testDB.db);

    const indexes = testDB.db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(indexes.map((i) => i.name)).toEqual(
      expect.arrayContaining([
        'idx_routes_to',
        'idx_routes_status',
        'idx_deciles_number',
      ])
    );
  });

  it('should drop existing tables (destructive)', () => {
    // Insert some test data first
    testDB.db.exec("INSERT INTO places (id, name, lat, lon, geometry, svg_path) VALUES ('test', 'Test', 60.0, 24.0, '{}', 'M 0 0')");

    // Verify data exists
    let count = testDB.db
      .prepare('SELECT COUNT(*) as count FROM places')
      .get() as { count: number };
    expect(count.count).toBe(1);

    // Re-initialize schema (should drop and recreate)
    initializeSchema(testDB.db);

    // Old data should be gone
    count = testDB.db
      .prepare('SELECT COUNT(*) as count FROM places')
      .get() as { count: number };
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
        geometry:
          '{"type":"Polygon","coordinates":[[[24.945,60.163],[24.953,60.163],[24.953,60.167],[24.945,60.167],[24.945,60.163]]]}',
        svg_path: 'M 480 240 L 520 240 L 520 260 L 480 260 Z',
      },
      {
        id: '00120',
        name: 'Punavuori',
        lat: 60.1618,
        lon: 24.9401,
        geometry:
          '{"type":"Polygon","coordinates":[[[24.935,60.159],[24.945,60.159],[24.945,60.164],[24.935,60.164],[24.935,60.159]]]}',
        svg_path: 'M 450 235 L 480 235 L 480 255 L 450 255 Z',
      },
    ];

    insertZones(testDB.db, zones);

    assertRecordCount(testDB.db, 'places', 2);

    const place = testDB.db
      .prepare('SELECT * FROM places WHERE id = ?')
      .get('00100') as any;
    expect(place.name).toBe('Kaartinkaupunki');
    expect(place.lat).toBeCloseTo(60.1653, 4);
    expect(place.lon).toBeCloseTo(24.9497, 4);
  });

  it('should pre-fill routes Cartesian product', () => {
    const zones: ZoneData[] = [
      {
        id: '00100',
        name: 'Zone 1',
        lat: 60.1,
        lon: 24.9,
        geometry: '{}',
        svg_path: 'M 0 0',
      },
      {
        id: '00120',
        name: 'Zone 2',
        lat: 60.2,
        lon: 24.95,
        geometry: '{}',
        svg_path: 'M 0 0',
      },
      {
        id: '00130',
        name: 'Zone 3',
        lat: 60.15,
        lon: 24.92,
        geometry: '{}',
        svg_path: 'M 0 0',
      },
    ];

    insertZones(testDB.db, zones);

    // Should create: 3 zones × 2 destinations (excluding self) × 3 periods = 18 routes
    assertRecordCount(testDB.db, 'routes', 18);

    const routes = testDB.db
      .prepare('SELECT * FROM routes WHERE from_id = ? AND to_id = ?')
      .all('00100', '00120') as any[];
    expect(routes).toHaveLength(3); // 3 time periods
    expect(routes.map((r) => r.time_period)).toEqual(
      expect.arrayContaining(['MORNING', 'EVENING', 'MIDNIGHT'])
    );
    expect(routes.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('should skip self-routes', () => {
    const zones: ZoneData[] = [
      {
        id: '00100',
        name: 'Zone 1',
        lat: 60.1,
        lon: 24.9,
        geometry: '{}',
        svg_path: 'M 0 0',
      },
    ];

    insertZones(testDB.db, zones);

    const selfRoutes = testDB.db
      .prepare('SELECT * FROM routes WHERE from_id = to_id')
      .all();
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
    expect(events.some((e) => e.type === 'progress')).toBe(true);
    expect(events[events.length - 1].type).toBe('complete');
  });
});

describe('zones - fetchZones (integration)', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
    // Initialize schema before fetching
    initializeSchema(testDB.db);

    vi.mocked(axios.get).mockResolvedValue({
      data: {
        type: 'FeatureCollection',
        features: Array.from({ length: 10 }, (_, i) => ({
          type: 'Feature',
          properties: {
            postinumeroalue: `001${i.toString().padStart(2, '0')}`,
            nimi: `Zone ${i}`,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [24.945, 60.163],
                [24.953, 60.163],
                [24.953, 60.167],
                [24.945, 60.167],
                [24.945, 60.163],
              ],
            ],
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

    const metadata = testDB.db
      .prepare("SELECT value FROM metadata WHERE key = 'last_fetch'")
      .get() as { value: string };
    expect(metadata).toBeDefined();

    const parsed = JSON.parse(metadata.value);
    expect(parsed.date).toBeTruthy();
    expect(parsed.zoneCount).toBeGreaterThan(0);
    expect(parsed.isTest).toBe(true);
  });

  it('should fail if schema not initialized', async () => {
    // Create a new DB without schema
    const uninitializedDB = createTestDB(':memory:');
    // Drop all tables to simulate uninitialized state
    uninitializedDB.db.exec('DROP TABLE IF EXISTS places');
    uninitializedDB.db.exec('DROP TABLE IF EXISTS routes');
    uninitializedDB.db.exec('DROP TABLE IF EXISTS metadata');
    uninitializedDB.db.exec('DROP TABLE IF EXISTS deciles');

    await expect(fetchZones(uninitializedDB.db, { testMode: true })).rejects.toThrow(
      'Database schema not initialized'
    );

    uninitializedDB.cleanup();
  });
});
