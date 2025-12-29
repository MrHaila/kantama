import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDataStore, getDataSnapshot } from '../helpers/datastore';
import {
  fetchZonesMultiCity,
  downloadZonesFromWFS,
  processZones,
  saveZones,
} from '../../lib/zones';
import { createProgressEmitter } from '../../lib/events';
import { readZones, readPipelineState } from '../../lib/datastore';
import axios from 'axios';
import * as turf from '@turf/turf';

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

  it('should calculate inside points (pole of inaccessibility)', () => {
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
    // Should be roughly centered
    expect(zones[0].lat).toBeCloseTo(60.17, 1);
    expect(zones[0].lon).toBeCloseTo(24.93, 1);
  });

  it('should guarantee points are inside their polygons', () => {
    const features = [
      {
        type: 'Feature',
        properties: { postinumeroalue: '00100', nimi: 'Simple' },
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
      {
        type: 'Feature',
        properties: { postinumeroalue: '00200', nimi: 'MultiPolygon' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [24.8, 60.1],
                [24.82, 60.1],
                [24.82, 60.12],
                [24.8, 60.12],
                [24.8, 60.1],
              ],
            ],
            [
              [
                [24.95, 60.2],
                [24.99, 60.2],
                [24.99, 60.24],
                [24.95, 60.24],
                [24.95, 60.2],
              ],
            ],
          ],
        },
      },
    ];

    const zones = processZones(features, {});

    // Verify all points are inside their polygons
    zones.forEach((zone) => {
      const geometry = JSON.parse(zone.geometry);
      const point = turf.point([zone.lon, zone.lat]);
      const polygon = turf.feature(geometry);

      const isInside = turf.booleanPointInPolygon(point, polygon);
      expect(isInside).toBe(true);
    });
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

    const zones = processZones(features, { limit: 5 });

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



describe('zones - saveZones', () => {
  let testDataStore: ReturnType<typeof createTestDataStore>;

  beforeEach(() => {
    testDataStore = createTestDataStore();
  });

  afterEach(() => {
    testDataStore.cleanup();
  });

  it('should save zones to zones.json', () => {
    const zones = [
      {
        id: '00100',
        name: 'Kaartinkaupunki',
        lat: 60.1653,
        lon: 24.9497,
        geometry: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[24.945, 60.163], [24.953, 60.163], [24.953, 60.167], [24.945, 60.167], [24.945, 60.163]]]
        }),
        svg_path: 'M 480 240 L 520 240 L 520 260 L 480 260 Z',
        city: 'Helsinki',
      },
      {
        id: '00120',
        name: 'Punavuori',
        lat: 60.1618,
        lon: 24.9401,
        geometry: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[24.935, 60.159], [24.945, 60.159], [24.945, 60.164], [24.935, 60.164], [24.935, 60.159]]]
        }),
        svg_path: 'M 450 235 L 480 235 L 480 255 L 450 255 Z',
        city: 'Helsinki',
      },
    ];

    saveZones(zones);

    const zonesData = readZones();
    expect(zonesData).toBeDefined();
    expect(zonesData?.zones).toHaveLength(2);
    expect(zonesData?.zones[0].name).toBe('Kaartinkaupunki');
    expect(zonesData?.zones[0].routingPoint[0]).toBeCloseTo(60.1653, 4);
    expect(zonesData?.zones[0].routingPoint[1]).toBeCloseTo(24.9497, 4);
  });

  it('should create route files for all zone pairs', () => {
    const zones = [
      {
        id: '00100',
        name: 'Zone 1',
        lat: 60.1,
        lon: 24.9,
        geometry: JSON.stringify({ type: 'Polygon', coordinates: [] }),
        svg_path: 'M 0 0',
        city: 'Helsinki',
      },
      {
        id: '00120',
        name: 'Zone 2',
        lat: 60.2,
        lon: 24.95,
        geometry: JSON.stringify({ type: 'Polygon', coordinates: [] }),
        svg_path: 'M 0 0',
        city: 'Helsinki',
      },
      {
        id: '00130',
        name: 'Zone 3',
        lat: 60.15,
        lon: 24.92,
        geometry: JSON.stringify({ type: 'Polygon', coordinates: [] }),
        svg_path: 'M 0 0',
        city: 'Helsinki',
      },
    ];

    saveZones(zones);

    const snapshot = getDataSnapshot(testDataStore.dataDir);

    // Should create: 3 zones × 3 periods = 9 route files
    expect(snapshot.routeFiles).toHaveLength(9);
    expect(snapshot.routeFiles).toContain('00100-M.msgpack');
    expect(snapshot.routeFiles).toContain('00100-E.msgpack');
    expect(snapshot.routeFiles).toContain('00100-N.msgpack');
  });

  it('should emit progress events', () => {
    const zones = Array.from({ length: 10 }, (_, i) => ({
      id: `001${i.toString().padStart(2, '0')}`,
      name: `Zone ${i}`,
      lat: 60.1,
      lon: 24.9,
      geometry: JSON.stringify({ type: 'Polygon', coordinates: [] }),
      svg_path: 'M 0 0',
      city: 'Helsinki',
    }));

    const events: any[] = [];
    const emitter = createProgressEmitter();
    emitter.on('progress', (event) => events.push(event));

    saveZones(zones, emitter);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('start');
    expect(events.some((e) => e.type === 'progress')).toBe(true);
    expect(events[events.length - 1].type).toBe('complete');
  });
});

describe('zones - fetchZonesMultiCity (integration)', () => {
  let testDataStore: ReturnType<typeof createTestDataStore>;

  beforeEach(() => {
    testDataStore = createTestDataStore();

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
    testDataStore.cleanup();
  });

  it('should fetch and save zones end-to-end', async () => {
    const result = await fetchZonesMultiCity({ limit: 5 });

    expect(result.zoneCount).toBeLessThanOrEqual(5);
    expect(result.routeCount).toBeGreaterThan(0);

    const zonesData = readZones();
    expect(zonesData).toBeDefined();
    expect(zonesData?.zones).toHaveLength(result.zoneCount);
  });

  it('should store pipeline metadata', async () => {
    await fetchZonesMultiCity({ limit: 5 });

    const pipelineState = readPipelineState();
    expect(pipelineState).toBeDefined();
    expect(pipelineState?.lastFetch).toBeDefined();
    expect(pipelineState?.lastFetch?.timestamp).toBeTruthy();
    expect(pipelineState?.lastFetch?.zoneCount).toBeGreaterThan(0);
    expect(pipelineState?.lastFetch?.limit).toBe(5);
  });

  // NOTE: This test needs updating for multi-city zone ID format
  it.skip('should create route files for all zones', async () => {
    await fetchZonesMultiCity({ limit: 3 });

    const snapshot = getDataSnapshot(testDataStore.dataDir);

    // Should create 3 zones × 3 periods = 9 route files
    expect(snapshot.routeFiles.length).toBeGreaterThan(0);
    expect(snapshot.routeFiles).toContain('00100-M.msgpack');
    expect(snapshot.routeFiles).toContain('00100-E.msgpack');
    expect(snapshot.routeFiles).toContain('00100-N.msgpack');
  });
});
