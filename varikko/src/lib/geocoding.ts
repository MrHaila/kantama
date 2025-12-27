import type Database from 'better-sqlite3';
import type { ProgressEmitter } from './events';
import axios from 'axios';

const GEOCODING_API = 'https://api.digitransit.fi/geocoding/v1/search';
const RATE_LIMIT_DELAY = 100; // 100ms between requests = max 10 req/sec

// Helsinki area boundaries (same as in zones.ts)
const BOUNDS = {
  minLon: 24.0,
  maxLon: 25.5,
  minLat: 59.9,
  maxLat: 60.5,
};

interface GeocodingFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    name: string;
    postalcode?: string;
    locality?: string;
    layer: string;
    distance?: number;
    label?: string;
  };
}

interface GeocodingResponse {
  type: string;
  features: GeocodingFeature[];
}

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

interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Ensure database schema has geocoding columns
 * Non-destructive migration - adds columns if missing
 */
export function ensureGeocodingSchema(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(places)').all() as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes('routing_lat')) {
    db.prepare('ALTER TABLE places ADD COLUMN routing_lat REAL').run();
  }

  if (!columnNames.includes('routing_lon')) {
    db.prepare('ALTER TABLE places ADD COLUMN routing_lon REAL').run();
  }

  if (!columnNames.includes('routing_source')) {
    db.prepare('ALTER TABLE places ADD COLUMN routing_source TEXT').run();
  }

  if (!columnNames.includes('geocoding_error')) {
    db.prepare('ALTER TABLE places ADD COLUMN geocoding_error TEXT').run();
  }
}

/**
 * Geocode a single zone using multiple strategies
 * Tries: postal code → zone name → postal code + Helsinki
 */
export async function geocodeZone(
  zoneId: string,
  zoneName: string,
  apiKey?: string
): Promise<GeocodeResult> {
  try {
    // Try multiple search strategies
    const searchStrategies = [
      // Strategy 1: Postal code only
      {
        text: zoneId,
        description: 'postal code',
      },
      // Strategy 2: Zone name
      {
        text: zoneName,
        description: 'zone name',
        layers: 'neighbourhood,locality,address',
      },
      // Strategy 3: Postal code + Helsinki
      {
        text: `${zoneId} Helsinki`,
        description: 'postal code + Helsinki',
      },
    ];

    for (const strategy of searchStrategies) {
      const params: Record<string, string> = {
        text: strategy.text,
        size: '1',
        'boundary.rect.min_lat': BOUNDS.minLat.toString(),
        'boundary.rect.max_lat': BOUNDS.maxLat.toString(),
        'boundary.rect.min_lon': BOUNDS.minLon.toString(),
        'boundary.rect.max_lon': BOUNDS.maxLon.toString(),
      };

      if (strategy.layers) {
        params.layers = strategy.layers;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['digitransit-subscription-key'] = apiKey;
      }

      const response = await axios.get<GeocodingResponse>(GEOCODING_API, {
        params,
        headers,
      });

      if (response.data.features && response.data.features.length > 0) {
        const feature = response.data.features[0];
        const [lon, lat] = feature.geometry.coordinates;

        return {
          success: true,
          lat,
          lon,
          source: `geocoded:${strategy.description}`,
        };
      }
    }

    // No results from any strategy
    return {
      success: false,
      error: 'No geocoding results found',
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      return {
        success: false,
        error: `HTTP ${status}: ${message}`,
      };
    }
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Update zone with geocoding results
 * Falls back to geometric centroid if geocoding failed
 */
export function updateZoneRouting(
  db: Database.Database,
  zoneId: string,
  result: GeocodeResult,
  fallbackLat: number,
  fallbackLon: number
): void {
  const updatePlace = db.prepare(`
    UPDATE places
    SET routing_lat = ?,
        routing_lon = ?,
        routing_source = ?,
        geocoding_error = ?
    WHERE id = ?
  `);

  if (result.success && result.lat && result.lon) {
    updatePlace.run(result.lat, result.lon, result.source, null, zoneId);
  } else {
    // Fallback to geometric centroid
    updatePlace.run(
      fallbackLat,
      fallbackLon,
      'fallback:geometric',
      result.error || null,
      zoneId
    );
  }
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode all zones (main entry point)
 */
export async function geocodeZones(
  db: Database.Database,
  options: GeocodeOptions
): Promise<{
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const { testMode, testLimit = 5, emitter, apiKey } = options;

  // Ensure schema has geocoding columns
  ensureGeocodingSchema(db);

  // Get all zones
  let zones = db.prepare('SELECT id, name, lat, lon FROM places ORDER BY id').all() as Place[];

  if (testMode) {
    zones = zones.slice(0, testLimit);
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>,
  };

  emitter?.emitStart('geocode_zones', zones.length, 'Starting geocoding...');

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];

    const result = await geocodeZone(zone.id, zone.name, apiKey);

    updateZoneRouting(db, zone.id, result, zone.lat, zone.lon);

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({
        id: zone.id,
        error: result.error || 'Unknown error',
      });
    }

    emitter?.emitProgress(
      'geocode_zones',
      i + 1,
      zones.length,
      `Geocoded ${zone.id} (${zone.name})`
    );

    // Rate limiting - wait before next request (except for last one)
    if (i < zones.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  emitter?.emitComplete(
    'geocode_zones',
    `Geocoded ${results.success}/${zones.length} zones (${results.failed} fallbacks)`
  );

  return results;
}
