import { decode } from '@msgpack/msgpack';
// Import shared types from varikko
import type {
  Zone,
  TimeBucket,
  ZonesData,
  CompactLeg,
  CompactRoute,
  ZoneRoutesData,
  TimePeriod,
} from 'varikko';

// Re-export types for backwards compatibility
export type { Zone, TimeBucket, ZonesData, CompactLeg, CompactRoute, ZoneRoutesData, TimePeriod };

// ============================================================================
// Opas-specific types
// ============================================================================

/** Route status mapping to match varikko export (as const for opas usage) */
export const RouteStatus = {
  OK: 0,
  NO_ROUTE: 1,
  ERROR: 2,
  PENDING: 3,
} as const;

export type RouteStatusType = (typeof RouteStatus)[keyof typeof RouteStatus];

export interface DataServiceError {
  type: 'zones_not_found' | 'routes_not_found' | 'parse_error' | 'network_error';
  message: string;
  details?: string;
}

export interface DataServiceState {
  initialized: boolean;
  zonesLoaded: boolean;
  zonesError: DataServiceError | null;
  routeErrors: Map<string, DataServiceError>;
}

// ============================================================================
// Data Service
// ============================================================================

class DataService {
  private zones: Map<string, Zone> = new Map();
  private timeBuckets: TimeBucket[] = [];
  private routeCache: Map<string, CompactRoute[]> = new Map();
  private state: DataServiceState = {
    initialized: false,
    zonesLoaded: false,
    zonesError: null,
    routeErrors: new Map(),
  };
  private baseUrl: string = '/data';

  /**
   * Get cache key for a zone and period
   */
  private getCacheKey(zoneId: string, period: TimePeriod): string {
    return `${zoneId}-${period}`;
  }

  /**
   * Initialize the data service by loading zones.json
   * Returns state indicating success/failure with actionable error info
   */
  async init(baseUrl: string = '/data'): Promise<DataServiceState> {
    this.baseUrl = baseUrl;

    if (this.state.initialized) {
      return this.state;
    }

    try {
      const response = await fetch(`${this.baseUrl}/zones.json`);

      if (!response.ok) {
        if (response.status === 404) {
          this.state.zonesError = {
            type: 'zones_not_found',
            message: 'Zone data not found',
            details: 'Run "varikko export" to generate the data files, then restart the dev server.',
          };
        } else {
          this.state.zonesError = {
            type: 'network_error',
            message: `Failed to fetch zones: ${response.status} ${response.statusText}`,
            details: 'Check that the dev server is running and data files exist in public/data/',
          };
        }
        this.state.initialized = true;
        return this.state;
      }

      const data: ZonesData = await response.json();

      // Validate data structure
      if (!data.zones || !Array.isArray(data.zones)) {
        this.state.zonesError = {
          type: 'parse_error',
          message: 'Invalid zones.json format',
          details: 'The zones.json file is corrupted or in an unexpected format. Re-run "varikko export".',
        };
        this.state.initialized = true;
        return this.state;
      }

      // Load zones into map
      this.zones = new Map(data.zones.map((z) => [z.id, z]));
      this.timeBuckets = data.timeBuckets || [];
      this.state.zonesLoaded = true;
      this.state.initialized = true;

      console.log(`DataService: Loaded ${this.zones.size} zones, ${this.timeBuckets.length} time buckets`);
      return this.state;
    } catch (error) {
      this.state.zonesError = {
        type: 'network_error',
        message: 'Failed to load zone data',
        details: error instanceof Error ? error.message : String(error),
      };
      this.state.initialized = true;
      return this.state;
    }
  }

  /**
   * Get current service state for UI feedback
   */
  getState(): DataServiceState {
    return { ...this.state };
  }

  /**
   * Check if data is available and ready
   */
  isReady(): boolean {
    return this.state.zonesLoaded && this.zones.size > 0;
  }

  /**
   * Get all zones
   */
  getZones(): Zone[] {
    return Array.from(this.zones.values());
  }

  /**
   * Get a specific zone by ID
   */
  getZone(id: string): Zone | undefined {
    return this.zones.get(id);
  }

  /**
   * Get time buckets for coloring
   */
  getTimeBuckets(): TimeBucket[] {
    return this.timeBuckets;
  }

  /**
   * Load routes for a specific zone and period
   * Returns null if routes not available, with error info in state
   */
  async loadRoutesForZone(zoneId: string, period: TimePeriod): Promise<CompactRoute[] | null> {
    const cacheKey = this.getCacheKey(zoneId, period);

    // Check cache first
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    // Clear any previous error for this zone
    this.state.routeErrors.delete(zoneId);

    const suffix = period === 'MORNING' ? 'morning' : period === 'EVENING' ? 'evening' : 'midnight';

    try {
      const response = await fetch(`${this.baseUrl}/routes/${zoneId}-${suffix}.msgpack`);

      if (!response.ok) {
        if (response.status === 404) {
          this.state.routeErrors.set(zoneId, {
            type: 'routes_not_found',
            message: `Routes for zone ${zoneId} (${period}) not found`,
            details: 'This zone may not have been exported yet. Run "varikko export" to update.',
          });
        } else {
          this.state.routeErrors.set(zoneId, {
            type: 'network_error',
            message: `Failed to fetch routes: ${response.status}`,
          });
        }
        return null;
      }

      const buffer = await response.arrayBuffer();
      const data = decode(new Uint8Array(buffer)) as ZoneRoutesData;

      // Validate data structure
      if (!data.r || !data.f) {
        this.state.routeErrors.set(zoneId, {
          type: 'parse_error',
          message: 'Invalid route file format',
          details: 'The route file is corrupted. Re-run "varikko export".',
        });
        return null;
      }

      // Cache the routes
      this.routeCache.set(cacheKey, data.r);
      return data.r;
    } catch (error) {
      this.state.routeErrors.set(zoneId, {
        type: 'parse_error',
        message: 'Failed to parse route data',
        details: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get route costs (duration map) for a zone and period
   * Returns empty map if routes not loaded
   */
  getRouteCosts(zoneId: string, period: TimePeriod): Map<string, number> {
    const costs = new Map<string, number>();
    const cacheKey = this.getCacheKey(zoneId, period);
    const routes = this.routeCache.get(cacheKey);

    if (!routes) {
      return costs;
    }

    for (const route of routes) {
      if (route.s === RouteStatus.OK && route.d !== null) {
        costs.set(route.i, route.d);
      }
    }

    return costs;
  }

  /**
   * Get route details between two zones
   */
  getRouteDetails(fromId: string, toId: string, period: TimePeriod): CompactRoute | null {
    const cacheKey = this.getCacheKey(fromId, period);
    const routes = this.routeCache.get(cacheKey);
    if (!routes) {
      return null;
    }

    return routes.find((r) => r.i === toId) || null;
  }

  /**
   * Get error for a specific zone's routes
   */
  getRouteError(zoneId: string): DataServiceError | null {
    return this.state.routeErrors.get(zoneId) || null;
  }

  /**
   * Check if routes are loaded for a zone and period
   */
  hasRoutesLoaded(zoneId: string, period: TimePeriod): boolean {
    return this.routeCache.has(this.getCacheKey(zoneId, period));
  }

  /**
   * Clear route cache (useful for memory management)
   */
  clearRouteCache(): void {
    this.routeCache.clear();
    this.state.routeErrors.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { zones: number; cachedRoutes: number } {
    return {
      zones: this.zones.size,
      cachedRoutes: this.routeCache.size,
    };
  }
}

// Export singleton instance
export const dataService = new DataService();
