import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  downloadTicketZones,
  groupByZone,
  generateTicketZonesSVG,
  updateManifest,
  writeTicketZonesLayer,
} from '../../lib/ticketZones';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Mock axios and fs
vi.mock('axios');
vi.mock('fs');

describe('ticketZones - downloadTicketZones', () => {
  it('should download ticket zones from HRI', async () => {
    const mockData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { tunnus: 'A' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [24.85, 60.15],
                [24.95, 60.15],
                [24.95, 60.20],
                [24.85, 60.20],
                [24.85, 60.15],
              ],
            ],
          },
        },
      ],
    };

    vi.mocked(axios.get).mockResolvedValue({ data: mockData });

    const result = await downloadTicketZones();

    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.tunnus).toBe('A');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('opendata.arcgis.com'),
      expect.any(Object)
    );
  });

  it('should handle network errors', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

    await expect(downloadTicketZones()).rejects.toThrow('Network error');
  });
});

describe('ticketZones - groupByZone', () => {
  it('should group features by zone tunnus', () => {
    const features = [
      {
        type: 'Feature',
        properties: { tunnus: 'A' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: { tunnus: 'B' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: { tunnus: 'A' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: { tunnus: 'C' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
    ] as any;

    const groups = groupByZone(features);

    expect(groups).toHaveLength(3);
    expect(groups[0].zone).toBe('A');
    expect(groups[0].features).toHaveLength(2);
    expect(groups[1].zone).toBe('B');
    expect(groups[1].features).toHaveLength(1);
    expect(groups[2].zone).toBe('C');
    expect(groups[2].features).toHaveLength(1);
  });

  it('should sort zones alphabetically', () => {
    const features = [
      {
        type: 'Feature',
        properties: { tunnus: 'D' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: { tunnus: 'B' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: { tunnus: 'A' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: { tunnus: 'C' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
    ] as any;

    const groups = groupByZone(features);

    expect(groups.map((g) => g.zone)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should skip features without tunnus', () => {
    const features = [
      {
        type: 'Feature',
        properties: { tunnus: 'A' },
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[]]] },
      },
    ] as any;

    const groups = groupByZone(features);

    expect(groups).toHaveLength(1);
    expect(groups[0].zone).toBe('A');
  });
});

describe('ticketZones - generateTicketZonesSVG', () => {
  it('should generate SVG with grouped zones', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { tunnus: 'A' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [24.85, 60.15],
                [24.95, 60.15],
                [24.95, 60.20],
                [24.85, 60.20],
                [24.85, 60.15],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { tunnus: 'B' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [24.90, 60.10],
                [25.00, 60.10],
                [25.00, 60.15],
                [24.90, 60.15],
                [24.90, 60.10],
              ],
            ],
          },
        },
      ],
    } as any;

    const svg = generateTicketZonesSVG(geojson);

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('id="zone-A"');
    expect(svg).toContain('id="zone-B"');
    expect(svg).toContain('class="ticket-zone"');
    expect(svg).toContain('data-stroke-width="1"'); // Zone A (1.0 becomes "1")
    expect(svg).toContain('data-stroke-width="1.5"'); // Zone B
    expect(svg).toContain('<path d=');
    expect(svg).toContain('</svg>');
  });

  it('should include all four zones if present', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: ['A', 'B', 'C', 'D'].map((zone) => ({
        type: 'Feature',
        properties: { tunnus: zone },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [24.85, 60.15],
              [24.95, 60.15],
              [24.95, 60.20],
              [24.85, 60.20],
              [24.85, 60.15],
            ],
          ],
        },
      })),
    } as any;

    const svg = generateTicketZonesSVG(geojson);

    expect(svg).toContain('id="zone-A"');
    expect(svg).toContain('id="zone-B"');
    expect(svg).toContain('id="zone-C"');
    expect(svg).toContain('id="zone-D"');
  });
});

describe('ticketZones - writeTicketZonesLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should write SVG to opas/public/layers/', () => {
    const svg = '<svg viewBox="0 0 100 100"><path d="M0,0 L100,100"/></svg>';

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

    writeTicketZonesLayer(svg);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('ticket-zones.svg'),
      svg,
      'utf-8'
    );
  });

  it('should create output directory if it does not exist', () => {
    const svg = '<svg></svg>';

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => '');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.statSync).mockReturnValue({ size: 512 } as any);

    writeTicketZonesLayer(svg);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('layers'),
      { recursive: true }
    );
  });
});

describe('ticketZones - updateManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add ticketZones layer to existing manifest', () => {
    const existingManifest = {
      viewBox: '-30 -190 1080 720',
      layers: [
        { id: 'water', file: 'water.svg', description: 'Water', zIndex: 0 },
        { id: 'roads', file: 'roads.svg', description: 'Roads', zIndex: 10 },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingManifest));
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    updateManifest();

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updatedManifest = JSON.parse(writeCall[1] as string);

    expect(updatedManifest.layers).toHaveLength(3);
    expect(updatedManifest.layers.some((l: any) => l.id === 'ticketZones')).toBe(true);

    const ticketZonesLayer = updatedManifest.layers.find((l: any) => l.id === 'ticketZones');
    expect(ticketZonesLayer.file).toBe('ticket-zones.svg');
    expect(ticketZonesLayer.zIndex).toBe(15);
  });

  it('should update existing ticketZones layer if present', () => {
    const existingManifest = {
      viewBox: '-30 -190 1080 720',
      layers: [
        { id: 'water', file: 'water.svg', description: 'Water', zIndex: 0 },
        { id: 'ticketZones', file: 'old-file.svg', description: 'Old', zIndex: 5 },
        { id: 'roads', file: 'roads.svg', description: 'Roads', zIndex: 10 },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingManifest));
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    updateManifest();

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updatedManifest = JSON.parse(writeCall[1] as string);

    expect(updatedManifest.layers).toHaveLength(3);

    const ticketZonesLayer = updatedManifest.layers.find((l: any) => l.id === 'ticketZones');
    expect(ticketZonesLayer.file).toBe('ticket-zones.svg');
    expect(ticketZonesLayer.zIndex).toBe(15);
    expect(ticketZonesLayer.description).toBe('HSL fare zone boundaries');
  });

  it('should create new manifest if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    updateManifest();

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const newManifest = JSON.parse(writeCall[1] as string);

    expect(newManifest.viewBox).toBeTruthy();
    expect(newManifest.layers).toHaveLength(1);
    expect(newManifest.layers[0].id).toBe('ticketZones');
  });

  it('should sort layers by zIndex', () => {
    const existingManifest = {
      viewBox: '-30 -190 1080 720',
      layers: [
        { id: 'railways', file: 'railways.svg', description: 'Railways', zIndex: 20 },
        { id: 'water', file: 'water.svg', description: 'Water', zIndex: 0 },
        { id: 'roads', file: 'roads.svg', description: 'Roads', zIndex: 10 },
      ],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingManifest));
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});

    updateManifest();

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const updatedManifest = JSON.parse(writeCall[1] as string);

    const zIndexes = updatedManifest.layers.map((l: any) => l.zIndex);
    expect(zIndexes).toEqual([0, 10, 15, 20]);
  });
});
