import type Database from 'better-sqlite3';
import type { ProgressEmitter } from './events';
import axios from 'axios';
import { CITY_NAME_MAP } from './types';
import * as turf from '@turf/turf';

const GEOCODING_API = 'https://api.digitransit.fi/geocoding/v1/search';
const REVERSE_GEOCODING_API = 'https://api.digitransit.fi/geocoding/v1/reverse';
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
  limit?: number;
  emitter?: ProgressEmitter;
  apiKey?: string;
}

export interface GeocodeResult {
  success: boolean;
  lat?: number;
  lon?: number;
  source?: string;
  error?: string;
  distance?: number; // Distance from POI in meters
  insideZone?: boolean; // Whether point is inside zone polygon
}

interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city?: string;
  name_se?: string;
  geometry: string; // GeoJSON geometry as string
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
 * Extract city from zone ID
 */
function getCityFromZoneId(zoneId: string): string | undefined {
  const cityCode = zoneId.split('-')[0];
  return CITY_NAME_MAP[cityCode];
}

/**
 * Geocode a single zone using reverse geocoding from POI
 * Progressive strategy:
 * 1. Reverse geocode from POI with 500m radius
 * 2. Expand to 1km radius
 * 3. Expand to 2km radius
 * 4. Try broader layer types (venue, locality)
 * 5. Use POI as fallback if all fail
 *
 * Validates results are inside zone polygon
 */
export async function geocodeZone(
  poiLat: number,
  poiLon: number,
  geometry: any, // GeoJSON geometry
  apiKey?: string
): Promise<GeocodeResult> {
  try {
    // Progressive radius expansion: 500m → 1km → 2km
    const radiusStrategies = [
      { radius: 0.5, layers: 'address,street', description: 'address 500m' },
      { radius: 1.0, layers: 'address,street', description: 'address 1km' },
      { radius: 2.0, layers: 'address,street', description: 'address 2km' },
      { radius: 2.0, layers: 'address,street,venue', description: 'venue 2km' },
      { radius: 2.0, layers: 'address,street,venue,locality', description: 'locality 2km' },
    ];

    for (const strategy of radiusStrategies) {
      const params: Record<string, string> = {
        'point.lat': poiLat.toString(),
        'point.lon': poiLon.toString(),
        size: '5', // Get multiple results to find best one
        layers: strategy.layers,
        'boundary.circle.radius': strategy.radius.toString(),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['digitransit-subscription-key'] = apiKey;
      }

      const response = await axios.get<GeocodingResponse>(REVERSE_GEOCODING_API, {
        params,
        headers,
      });

      if (response.data.features && response.data.features.length > 0) {
        // Try to find a result that's inside the zone polygon
        for (const feature of response.data.features) {
          const [lon, lat] = feature.geometry.coordinates;
          const point = turf.point([lon, lat]);
          const polygon = turf.feature(geometry);

          const isInside = turf.booleanPointInPolygon(point, polygon);
          const distance = turf.distance(
            turf.point([poiLon, poiLat]),
            point,
            { units: 'meters' }
          );

          if (isInside) {
            return {
              success: true,
              lat,
              lon,
              source: `reverse:${strategy.description}`,
              distance: Math.round(distance),
              insideZone: true,
            };
          }
        }

        // If no result is inside, use the closest one and mark as outside
        const feature = response.data.features[0];
        const [lon, lat] = feature.geometry.coordinates;
        const point = turf.point([lon, lat]);
        const distance = turf.distance(
          turf.point([poiLon, poiLat]),
          point,
          { units: 'meters' }
        );

        return {
          success: true,
          lat,
          lon,
          source: `reverse:${strategy.description}:outside`,
          distance: Math.round(distance),
          insideZone: false,
        };
      }
    }

    // No results from any strategy - use POI as fallback
    return {
      success: false,
      error: 'No reverse geocoding results found',
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
 * Falls back to POI (inside point) if geocoding failed
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
    // Add metadata to source: distance and validation status
    let source = result.source || 'reverse:unknown';
    if (result.distance !== undefined) {
      source += `:${result.distance}m`;
    }
    if (result.insideZone === false) {
      // Already marked with :outside suffix, but add warning to error column
      const warning = `Point outside zone (${result.distance}m from POI)`;
      updatePlace.run(result.lat, result.lon, source, warning, zoneId);
    } else {
      updatePlace.run(result.lat, result.lon, source, null, zoneId);
    }
  } else {
    // Fallback to POI (inside point)
    updatePlace.run(
      fallbackLat,
      fallbackLon,
      'fallback:inside_point',
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
  insideZone: number;
  outsideZone: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const { limit, emitter, apiKey } = options;

  // Ensure schema has geocoding columns
  ensureGeocodingSchema(db);

  // Get all zones including geometry for validation
  // Use COALESCE for optional columns that may not exist in all schemas
  let zones = db.prepare(`
    SELECT
      id,
      name,
      lat,
      lon,
      geometry,
      city,
      name_se
    FROM places
    ORDER BY id
  `).all() as Place[];

  if (limit) {
    zones = zones.slice(0, limit);
  }

  const results = {
    success: 0,
    failed: 0,
    insideZone: 0,
    outsideZone: 0,
    errors: [] as Array<{ id: string; error: string }>,
  };

  emitter?.emitStart('geocode_zones', zones.length, 'Starting reverse geocoding from POI...');

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];

    // Parse geometry for validation
    const geometry = JSON.parse(zone.geometry);

    // Use reverse geocoding from POI (lat/lon are inside points)
    const result = await geocodeZone(zone.lat, zone.lon, geometry, apiKey);

    updateZoneRouting(db, zone.id, result, zone.lat, zone.lon);

    if (result.success) {
      results.success++;
      if (result.insideZone) {
        results.insideZone++;
      } else {
        results.outsideZone++;
      }
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
    `Geocoded ${results.success}/${zones.length} zones (${results.insideZone} inside, ${results.outsideZone} outside, ${results.failed} fallbacks)`
  );

  return results;
}
