import type { ProgressEmitter } from './events';
import axios from 'axios';
import { CITY_NAME_MAP } from './types';
import * as turf from '@turf/turf';
import { readZones, writeZones, updatePipelineMetadata } from './datastore';
import type { GeocodingMetadata } from '../shared/types';

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

// Geocoding no longer needs to track individual zone errors in files
// Errors are tracked in pipeline metadata

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
/**
 * Update zone routing point in zones.json
 */
function updateZoneRouting(
  zoneId: string,
  result: GeocodeResult,
  fallbackLat: number,
  fallbackLon: number
): { error?: string } {
  const zonesData = readZones();
  if (!zonesData) {
    throw new Error('No zones data found');
  }

  const zone = zonesData.zones.find((z) => z.id === zoneId);
  if (!zone) {
    throw new Error(`Zone ${zoneId} not found`);
  }

  if (result.success && result.lat && result.lon) {
    // Update routing point with geocoded coordinates
    zone.routingPoint = [result.lat, result.lon];

    // Return error if point is outside zone
    if (result.insideZone === false) {
      return { error: `Point outside zone (${result.distance}m from POI)` };
    }
    return {};
  } else {
    // Fallback to existing routing point (inside point)
    // Note: routing point already exists from initial fetch, no change needed
    return { error: result.error || 'Geocoding failed' };
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
  options: GeocodeOptions
): Promise<{
  success: number;
  failed: number;
  insideZone: number;
  outsideZone: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const { limit, emitter, apiKey } = options;

  // Read zones from file storage
  const zonesData = readZones();
  if (!zonesData) {
    throw new Error('No zones data found - run fetch first');
  }

  let zonesToGeocode = zonesData.zones;

  if (limit) {
    zonesToGeocode = zonesToGeocode.slice(0, limit);
  }

  const results = {
    success: 0,
    failed: 0,
    insideZone: 0,
    outsideZone: 0,
    errors: [] as Array<{ zoneId: string; error: string }>,
  };

  emitter?.emitStart('geocode_zones', zonesToGeocode.length, 'Starting reverse geocoding from POI...');

  // Note: We don't have geometry in the Zone type anymore
  // Geocoding now only updates routing points based on reverse geocoding
  // without geometry validation (geometry was only used during initial processing)

  for (let i = 0; i < zonesToGeocode.length; i++) {
    const zone = zonesToGeocode[i];

    // Use reverse geocoding from POI (routingPoint is inside point)
    const result = await geocodeZone(zone.routingPoint[0], zone.routingPoint[1], null, apiKey);

    const updateResult = updateZoneRouting(
      zone.id,
      result,
      zone.routingPoint[0],
      zone.routingPoint[1]
    );

    if (result.success) {
      results.success++;
      if (result.insideZone !== false) {
        // If insideZone is true or undefined (no geometry to check), count as inside
        results.insideZone++;
      } else {
        results.outsideZone++;
      }
    } else {
      results.failed++;
    }

    if (updateResult.error) {
      results.errors.push({
        zoneId: zone.id,
        error: updateResult.error,
      });
    }

    emitter?.emitProgress(
      'geocode_zones',
      i + 1,
      zonesToGeocode.length,
      `Geocoded ${zone.id} (${zone.name})`
    );

    // Rate limiting - wait before next request (except for last one)
    if (i < zonesToGeocode.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  // Write updated zones back to file
  writeZones(zonesData);

  // Store pipeline metadata
  const metadata: GeocodingMetadata = {
    timestamp: new Date().toISOString(),
    processed: zonesToGeocode.length,
    successful: results.success,
    failed: results.failed,
    errors: results.errors,
  };
  updatePipelineMetadata('lastGeocoding', metadata);

  emitter?.emitComplete(
    'geocode_zones',
    `Geocoded ${results.success}/${zonesToGeocode.length} zones (${results.insideZone} inside, ${results.outsideZone} outside, ${results.failed} fallbacks)`
  );

  return results;
}
