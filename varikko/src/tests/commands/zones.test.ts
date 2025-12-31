import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listAction } from '../../commands/zones';
import * as datastore from '../../lib/datastore';
import type { ZonesData } from '../../shared/types';

// Mock console.log to capture output
const mockConsoleLog = vi.spyOn(console, 'log');

// Mock datastore
vi.mock('../../lib/datastore', async () => {
  const actual = await vi.importActual<typeof import('../../lib/datastore')>('../../lib/datastore');
  return {
    ...actual,
    readZones: vi.fn(),
  };
});

describe('zones command', () => {
  beforeEach(() => {
    mockConsoleLog.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list action', () => {
    it('should display zones in table format', () => {
      const mockZonesData: ZonesData = {
        version: 1,
        timeBuckets: [],
        zones: [
          {
            id: 'HEL-101',
            name: 'Vilhonvuori',
            city: 'Helsinki',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.181478, 24.960107],
          },
          {
            id: 'ESP-231',
            name: 'Matinkylä',
            city: 'Espoo',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.165230, 24.740890],
          },
          {
            id: 'VAN-41',
            name: 'Ylästö',
            city: 'Vantaa',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.305420, 25.044670],
          },
        ],
      };

      vi.mocked(datastore.readZones).mockReturnValue(mockZonesData);

      listAction({});

      // Should show header
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('ZONES'));

      // Should show total zones count
      const calls = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(calls).toContain('Total zones:');
      expect(calls).toContain('3');

      // Should display all zone IDs
      expect(calls).toContain('HEL-101');
      expect(calls).toContain('ESP-231');
      expect(calls).toContain('VAN-41');

      // Should display zone names
      expect(calls).toContain('Vilhonvuori');
      expect(calls).toContain('Matinkylä');
      expect(calls).toContain('Ylästö');

      // Should display cities
      expect(calls).toContain('Helsinki');
      expect(calls).toContain('Espoo');
      expect(calls).toContain('Vantaa');

      // Should display coordinates
      expect(calls).toContain('60.181478');
      expect(calls).toContain('24.960107');
    });

    it('should respect limit flag', () => {
      const mockZonesData: ZonesData = {
        version: 1,
        timeBuckets: [],
        zones: [
          {
            id: 'HEL-101',
            name: 'Vilhonvuori',
            city: 'Helsinki',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.181478, 24.960107],
          },
          {
            id: 'ESP-231',
            name: 'Matinkylä',
            city: 'Espoo',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.165230, 24.740890],
          },
          {
            id: 'VAN-41',
            name: 'Ylästö',
            city: 'Vantaa',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.305420, 25.044670],
          },
        ],
      };

      vi.mocked(datastore.readZones).mockReturnValue(mockZonesData);

      listAction({ limit: 2 });

      const calls = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');

      // Should show limited message
      expect(calls).toContain('Showing:');
      expect(calls).toContain('2 zones (limited)');

      // Should show first 2 zones
      expect(calls).toContain('HEL-101');
      expect(calls).toContain('ESP-231');

      // Should not show third zone
      expect(calls).not.toContain('VAN-41');

      // Should show "more zones" message
      expect(calls).toContain('and 1 more zone');
    });

    it('should handle no zones available', () => {
      vi.mocked(datastore.readZones).mockReturnValue(null);

      listAction({});

      const calls = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');

      // Should show warning message
      expect(calls).toContain('No zones available');
      expect(calls).toContain('varikko fetch');
    });

    it('should handle empty zones array', () => {
      const mockZonesData: ZonesData = {
        version: 1,
        timeBuckets: [],
        zones: [],
      };

      vi.mocked(datastore.readZones).mockReturnValue(mockZonesData);

      listAction({});

      const calls = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');

      // Should show warning message
      expect(calls).toContain('No zones available');
      expect(calls).toContain('varikko fetch');
    });

    it('should format coordinates to 6 decimal places', () => {
      const mockZonesData: ZonesData = {
        version: 1,
        timeBuckets: [],
        zones: [
          {
            id: 'HEL-101',
            name: 'Vilhonvuori',
            city: 'Helsinki',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.123456789, 24.987654321],
          },
        ],
      };

      vi.mocked(datastore.readZones).mockReturnValue(mockZonesData);

      listAction({});

      const calls = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');

      // Should display coordinates with exactly 6 decimal places
      expect(calls).toContain('60.123457'); // Rounded
      expect(calls).toContain('24.987654');
    });

    it('should display table headers', () => {
      const mockZonesData: ZonesData = {
        version: 1,
        timeBuckets: [],
        zones: [
          {
            id: 'HEL-101',
            name: 'Test Zone',
            city: 'Helsinki',
            svgPath: 'M0,0L10,10',
            routingPoint: [60.0, 24.0],
          },
        ],
      };

      vi.mocked(datastore.readZones).mockReturnValue(mockZonesData);

      listAction({});

      const calls = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');

      // Should show table headers
      expect(calls).toContain('ID');
      expect(calls).toContain('Name');
      expect(calls).toContain('City');
      expect(calls).toContain('Latitude');
      expect(calls).toContain('Longitude');
    });
  });
});
