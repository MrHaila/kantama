import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { getNextTuesday, getOTPConfig, fetchRoute, buildRoutes } from '../../lib/routing';
import { createTestDB } from '../helpers/db';
import { ProgressEmitter } from '../../lib/events';

vi.mock('axios');

describe('routing', () => {
  describe('getNextTuesday', () => {
    it('returns a date string in YYYY-MM-DD format', () => {
      const result = getNextTuesday();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns a Tuesday', () => {
      const result = getNextTuesday();
      const date = new Date(result);
      expect(date.getDay()).toBe(2); // 2 = Tuesday
    });

    it('returns future date (today or later)', () => {
      const result = getNextTuesday();
      const resultDate = new Date(result);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(resultDate >= today).toBe(true);
    });
  });

  describe('getOTPConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns local config by default', () => {
      delete process.env.USE_LOCAL_OTP;
      const config = getOTPConfig();

      expect(config.isLocal).toBe(true);
      expect(config.url).toBe('http://localhost:9080/otp/gtfs/v1');
      expect(config.concurrency).toBe(10);
      expect(config.rateLimitDelay).toBe(0);
    });

    it('returns remote config when USE_LOCAL_OTP=false', () => {
      process.env.USE_LOCAL_OTP = 'false';
      const config = getOTPConfig();

      expect(config.isLocal).toBe(false);
      expect(config.url).toBe('https://api.digitransit.fi/routing/v2/hsl/gtfs/v1');
      expect(config.concurrency).toBe(1);
      expect(config.rateLimitDelay).toBe(200);
    });

    it('includes API key from HSL_API_KEY', () => {
      process.env.HSL_API_KEY = 'test-hsl-key';
      const config = getOTPConfig();

      expect(config.apiKey).toBe('test-hsl-key');
    });

    it('includes API key from DIGITRANSIT_API_KEY', () => {
      process.env.DIGITRANSIT_API_KEY = 'test-digitransit-key';
      const config = getOTPConfig();

      expect(config.apiKey).toBe('test-digitransit-key');
    });

    it('prefers HSL_API_KEY over DIGITRANSIT_API_KEY', () => {
      process.env.HSL_API_KEY = 'hsl-key';
      process.env.DIGITRANSIT_API_KEY = 'digitransit-key';
      const config = getOTPConfig();

      expect(config.apiKey).toBe('hsl-key');
    });
  });

  describe('fetchRoute', () => {
    const mockConfig = {
      url: 'http://localhost:9080/otp/gtfs/v1',
      isLocal: true,
      concurrency: 10,
      rateLimitDelay: 0,
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns OK status with route data on successful response', async () => {
      const mockResponse = {
        data: {
          data: {
            plan: {
              itineraries: [
                {
                  duration: 1800,
                  numberOfTransfers: 2,
                  walkDistance: 500,
                  legs: [{ mode: 'WALK' }, { mode: 'BUS' }],
                },
              ],
            },
          },
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('OK');
      expect(result.duration).toBe(1800);
      expect(result.numberOfTransfers).toBe(2);
      expect(result.walkDistance).toBe(500);
      expect(result.legs).toHaveLength(2);
    });

    it('picks fastest itinerary when multiple exist', async () => {
      const mockResponse = {
        data: {
          data: {
            plan: {
              itineraries: [
                { duration: 2000, numberOfTransfers: 1, walkDistance: 300, legs: [] },
                { duration: 1500, numberOfTransfers: 2, walkDistance: 500, legs: [] }, // Fastest
                { duration: 1800, numberOfTransfers: 1, walkDistance: 400, legs: [] },
              ],
            },
          },
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('OK');
      expect(result.duration).toBe(1500);
    });

    it('returns NO_ROUTE when no itineraries found', async () => {
      const mockResponse = {
        data: {
          data: {
            plan: {
              itineraries: [],
            },
          },
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('NO_ROUTE');
      expect(result.duration).toBeUndefined();
    });

    it('returns ERROR status when OTP returns GraphQL errors', async () => {
      const mockResponse = {
        data: {
          errors: [
            {
              message: 'Invalid coordinates',
              path: ['plan', 'itineraries'],
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('ERROR');
      expect(result.data).toContain('Invalid coordinates');
    });

    it('returns ERROR status when response is missing plan data', async () => {
      const mockResponse = {
        data: {
          data: {},
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('ERROR');
      expect(result.data).toContain('missing plan data');
    });

    it('handles network errors', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network timeout'));

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('ERROR');
      expect(result.data).toContain('Network timeout');
    });

    it('handles HTTP errors', async () => {
      const error = new Error('Request failed') as Error & { response: { status: number } };
      error.response = { status: 500 };

      vi.mocked(axios.post).mockRejectedValue(error);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('ERROR');
      expect(result.data).toContain('HTTP 500');
    });

    it('retries on 429 rate limit error', async () => {
      const error = new Error('Rate limited') as Error & { response: { status: number } };
      error.response = { status: 429 };

      const mockSuccess = {
        data: {
          data: {
            plan: {
              itineraries: [
                { duration: 1800, numberOfTransfers: 2, walkDistance: 500, legs: [] },
              ],
            },
          },
        },
      };

      vi.mocked(axios.post)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockSuccess);

      const result = await fetchRoute(60.17, 24.93, 60.18, 24.94, '08:30:00', mockConfig);

      expect(result.status).toBe('OK');
      expect(axios.post).toHaveBeenCalledTimes(2);
    }, 10000); // Increased timeout for retry delay
  });

  describe('buildRoutes', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('processes pending routes and updates database', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        // Insert test places
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertPlace.run('00100', 'Test Zone 1', 60.17, 24.93, '{}', 'M0,0', 60.17, 24.93);
        insertPlace.run('00200', 'Test Zone 2', 60.18, 24.94, '{}', 'M0,0', 60.18, 24.94);

        // Insert test routes
        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        insertRoute.run('00100', '00200', 'MORNING', 'PENDING');
        insertRoute.run('00200', '00100', 'MORNING', 'PENDING');

        // Mock successful OTP response
        const mockResponse = {
          data: {
            data: {
              plan: {
                itineraries: [
                  { duration: 1800, numberOfTransfers: 2, walkDistance: 500, legs: [{ mode: 'BUS' }] },
                ],
              },
            },
          },
        };

        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        const result = await buildRoutes(db, {
          period: 'MORNING',
        });

        expect(result.processed).toBe(2);
        expect(result.ok).toBe(2);
        expect(result.noRoute).toBe(0);
        expect(result.errors).toBe(0);

        // Verify database updates
        const routes = db.prepare('SELECT * FROM routes WHERE time_period = ? AND status = ?').all('MORNING', 'OK') as unknown[];
        expect(routes).toHaveLength(2);
      } finally {
        cleanup();
      }
    });

    it('handles NO_ROUTE responses', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        // Insert test places and routes
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertPlace.run('00100', 'Test Zone 1', 60.17, 24.93, '{}', 'M0,0', 60.17, 24.93);
        insertPlace.run('00200', 'Test Zone 2', 60.18, 24.94, '{}', 'M0,0', 60.18, 24.94);

        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        insertRoute.run('00100', '00200', 'MORNING', 'PENDING');

        // Mock NO_ROUTE response
        const mockResponse = {
          data: {
            data: {
              plan: {
                itineraries: [],
              },
            },
          },
        };

        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        const result = await buildRoutes(db, {
          period: 'MORNING',
        });

        expect(result.processed).toBe(1);
        expect(result.ok).toBe(0);
        expect(result.noRoute).toBe(1);
        expect(result.errors).toBe(0);

        // Verify database status
        const routes = db.prepare('SELECT * FROM routes WHERE time_period = ? AND status = ?').all('MORNING', 'NO_ROUTE') as unknown[];
        expect(routes).toHaveLength(1);
      } finally {
        cleanup();
      }
    });

    it('handles ERROR responses', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        // Insert test places and routes
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertPlace.run('00100', 'Test Zone 1', 60.17, 24.93, '{}', 'M0,0', 60.17, 24.93);
        insertPlace.run('00200', 'Test Zone 2', 60.18, 24.94, '{}', 'M0,0', 60.18, 24.94);

        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        insertRoute.run('00100', '00200', 'MORNING', 'PENDING');

        // Mock error response
        vi.mocked(axios.post).mockRejectedValue(new Error('Network timeout'));

        const result = await buildRoutes(db, {
          period: 'MORNING',
        });

        expect(result.processed).toBe(1);
        expect(result.ok).toBe(0);
        expect(result.noRoute).toBe(0);
        expect(result.errors).toBe(1);

        // Verify database status
        const routes = db.prepare('SELECT * FROM routes WHERE time_period = ? AND status = ?').all('MORNING', 'ERROR') as unknown[];
        expect(routes).toHaveLength(1);
      } finally {
        cleanup();
      }
    });

    it('processes multiple periods when no period specified', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        // Insert test places
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertPlace.run('00100', 'Test Zone 1', 60.17, 24.93, '{}', 'M0,0', 60.17, 24.93);
        insertPlace.run('00200', 'Test Zone 2', 60.18, 24.94, '{}', 'M0,0', 60.18, 24.94);

        // Insert routes for all periods
        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        insertRoute.run('00100', '00200', 'MORNING', 'PENDING');
        insertRoute.run('00100', '00200', 'EVENING', 'PENDING');
        insertRoute.run('00100', '00200', 'MIDNIGHT', 'PENDING');

        // Mock successful responses
        const mockResponse = {
          data: {
            data: {
              plan: {
                itineraries: [
                  { duration: 1800, numberOfTransfers: 2, walkDistance: 500, legs: [] },
                ],
              },
            },
          },
        };

        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        const result = await buildRoutes(db, {
          testMode: false,
        });

        expect(result.processed).toBe(3);
        expect(result.ok).toBe(3);
      } finally {
        cleanup();
      }
    });

    it('limits routes in test mode', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        // Insert test places (need more zones for 10 unique routes)
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (let i = 0; i < 12; i++) {
          const id = `00${100 + i}`;
          insertPlace.run(id, `Test Zone ${i}`, 60.17 + i * 0.01, 24.93 + i * 0.01, '{}', 'M0,0', 60.17 + i * 0.01, 24.93 + i * 0.01);
        }

        // Insert 10 unique routes (varying from_id and to_id)
        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        for (let i = 0; i < 10; i++) {
          const fromId = `00${100 + i}`;
          const toId = `00${100 + ((i + 1) % 12)}`;
          insertRoute.run(fromId, toId, 'MORNING', 'PENDING');
        }

        // Mock successful responses
        const mockResponse = {
          data: {
            data: {
              plan: {
                itineraries: [
                  { duration: 1800, numberOfTransfers: 2, walkDistance: 500, legs: [] },
                ],
              },
            },
          },
        };

        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        const result = await buildRoutes(db, {
          period: 'MORNING',
          limit: 5,
        });

        // Should only process 5 routes (limit)
        expect(result.processed).toBe(5);
      } finally {
        cleanup();
      }
    });

    it('emits progress events', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        const emitter = new ProgressEmitter();

        // Track emitted events
        let startEmitted = false;
        let progressEmitted = false;
        let completeEmitted = false;

        emitter.on('progress', (event) => {
          if (event.type === 'start') startEmitted = true;
          if (event.type === 'progress') progressEmitted = true;
          if (event.type === 'complete') completeEmitted = true;
        });

        // Insert test data
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertPlace.run('00100', 'Test Zone 1', 60.17, 24.93, '{}', 'M0,0', 60.17, 24.93);
        insertPlace.run('00200', 'Test Zone 2', 60.18, 24.94, '{}', 'M0,0', 60.18, 24.94);

        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        insertRoute.run('00100', '00200', 'MORNING', 'PENDING');

        // Mock successful response
        const mockResponse = {
          data: {
            data: {
              plan: {
                itineraries: [
                  { duration: 1800, numberOfTransfers: 2, walkDistance: 500, legs: [] },
                ],
              },
            },
          },
        };

        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        await buildRoutes(db, {
          period: 'MORNING',
          testMode: false,
          emitter,
        });

        // Verify events were emitted
        expect(startEmitted).toBe(true);
        expect(progressEmitted).toBe(true);
        expect(completeEmitted).toBe(true);
      } finally {
        cleanup();
      }
    });

    it('stores metadata after completion', async () => {
      const { db, cleanup } = createTestDB(':memory:');

      try {
        // Insert test places
        const insertPlace = db.prepare('INSERT INTO places (id, name, lat, lon, geometry, svg_path, routing_lat, routing_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertPlace.run('00100', 'Test Zone 1', 60.17, 24.93, '{}', 'M0,0', 60.17, 24.93);
        insertPlace.run('00200', 'Test Zone 2', 60.18, 24.94, '{}', 'M0,0', 60.18, 24.94);

        const insertRoute = db.prepare(
          'INSERT INTO routes (from_id, to_id, time_period, status) VALUES (?, ?, ?, ?)'
        );
        insertRoute.run('00100', '00200', 'MORNING', 'PENDING');

        // Mock successful response
        const mockResponse = {
          data: {
            data: {
              plan: {
                itineraries: [
                  { duration: 1800, numberOfTransfers: 2, walkDistance: 500, legs: [] },
                ],
              },
            },
          },
        };

        vi.mocked(axios.post).mockResolvedValue(mockResponse);

        await buildRoutes(db, {
          period: 'MORNING',
          testMode: false,
        });

        // Verify metadata was stored
        const metadata = db.prepare('SELECT value FROM metadata WHERE key = ?').get('last_route_calculation') as { value: string } | undefined;
        expect(metadata).toBeDefined();

        if (metadata) {
          const data = JSON.parse(metadata.value);
          expect(data.periods).toEqual(['MORNING']);
          expect(data.processed).toBe(1);
          expect(data.ok).toBe(1);
        }
      } finally {
        cleanup();
      }
    });

    it('throws error when remote API key missing', async () => {
      const { db, cleanup } = createTestDB(':memory:');
      const originalEnv = process.env.USE_LOCAL_OTP;

      try {
        process.env.USE_LOCAL_OTP = 'false';
        delete process.env.HSL_API_KEY;
        delete process.env.DIGITRANSIT_API_KEY;

        await expect(buildRoutes(db, { period: 'MORNING' })).rejects.toThrow(
          'Missing HSL_API_KEY or DIGITRANSIT_API_KEY'
        );
      } finally {
        process.env.USE_LOCAL_OTP = originalEnv;
        cleanup();
      }
    });
  });
});
