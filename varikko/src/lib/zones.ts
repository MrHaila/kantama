import axios from 'axios';
import * as turf from '@turf/turf';
import * as d3 from 'd3-geo';
import type { Geometry, Position, Polygon, MultiPolygon, Feature, FeatureCollection } from 'geojson';
import type { ProgressEmitter } from './events';
import { ALL_FETCHERS, generateZoneId } from './city-fetchers';
import type { StandardZone, ZoneData } from './types';
import polylabel from 'polylabel';
import { getWaterMask, clipZoneWithWater } from './coastline';
import {
  writeZones,
  initializeRoutes,
  ensureDataDirectoryStructure,
  updatePipelineMetadata,
} from './datastore';
import type { Zone, ZonesData, TimePeriod, FetchMetadata } from '../shared/types';

import {
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  MAP_CENTER,
  MAP_SCALE,
  METRO_AREA_BOUNDS,
} from '../shared/config';

// Constants
const WFS_URL =
  'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto_2024&outputFormat=json&srsName=EPSG:4326';

const TIME_PERIODS = ['MORNING', 'EVENING', 'MIDNIGHT'];

/**
 * Blacklist of zone IDs that should be permanently excluded from processing.
 * These zones have been identified as having routing failures or other issues
 * that prevent them from being included in the route network.
 */
const ZONE_BLACKLIST: Set<string> = new Set([
  'HEL-500',
  'HEL-532',
  'HEL-531',
  'ESP-316',
]);

interface FeatureProperties {
  postinumeroalue?: string;
  posti_alue?: string;
  nimi?: string;
}

export interface FetchZonesOptions {
  limit?: number;
  emitter?: ProgressEmitter;
}

/**
 * Calculate pole of inaccessibility - the most distant internal point from polygon edges.
 * Guaranteed to be inside the polygon and visually centered.
 * For multi-polygons, uses the largest polygon by area.
 */
function calculateInsidePoint(geometry: Geometry): [number, number] | null {
  try {
    // For MultiPolygon, find the largest polygon by area
    if (geometry.type === 'MultiPolygon') {
      const multiPoly = geometry as MultiPolygon;
      let largestPolygon: Polygon | null = null;
      let maxArea = 0;

      for (const coords of multiPoly.coordinates) {
        const polygon: Polygon = { type: 'Polygon', coordinates: coords };
        const area = turf.area(polygon);
        if (area > maxArea) {
          maxArea = area;
          largestPolygon = polygon;
        }
      }

      if (!largestPolygon) return null;
      geometry = largestPolygon;
    }

    // For Polygon, calculate pole of inaccessibility
    if (geometry.type === 'Polygon') {
      const poly = geometry as Polygon;
      // polylabel expects array of rings: [[lon, lat], [lon, lat], ...]
      // Precision: 0.0001 degrees ≈ 11 meters (good balance for postal zones)
      const point = polylabel(poly.coordinates, 0.0001);
      return [point[0], point[1]]; // [lon, lat]
    }

    return null;
  } catch {
    // If polylabel fails, return null (geometry is likely invalid)
    return null;
  }
}

function createProjection() {
  return d3
    .geoMercator()
    .center(MAP_CENTER)
    .scale(MAP_SCALE)
    .translate([WIDTH / 2, HEIGHT / 2]);
}

// Manually project coordinates to avoid D3's spherical clipping artifacts
function projectGeometry(geometry: Geometry, proj: d3.GeoProjection): Geometry | null {
  const projectRing = (ring: Position[]): Position[] => {
    return ring.map((coord) => {
      const projected = proj(coord as [number, number]);
      return projected ? [projected[0], projected[1]] : coord;
    });
  };

  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    return {
      type: 'Polygon',
      coordinates: poly.coordinates.map(projectRing),
    };
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    return {
      type: 'MultiPolygon',
      coordinates: multi.coordinates.map((polygon) => polygon.map(projectRing)),
    };
  }

  return null;
}

function generateSvgPath(geometry: Geometry, projection: d3.GeoProjection): string | null {
  const projectedGeometry = projectGeometry(geometry, projection);
  if (!projectedGeometry) return null;

  const pathGenerator = d3.geoPath();
  return pathGenerator(projectedGeometry) || null;
}

// Calculate the visible area bounding box in lat/lon coordinates
function getVisibleAreaBounds(projection: d3.GeoProjection): {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} {
  // Get the four corners of the visible viewBox in SVG coordinates
  const topLeft = [VIEWBOX_X, VIEWBOX_Y];
  const topRight = [VIEWBOX_X + WIDTH, VIEWBOX_Y];
  const bottomLeft = [VIEWBOX_X, VIEWBOX_Y + HEIGHT];
  const bottomRight = [VIEWBOX_X + WIDTH, VIEWBOX_Y + HEIGHT];

  // Inverse project to get lat/lon coordinates
  const corners = [topLeft, topRight, bottomLeft, bottomRight]
    .map((coord) => projection.invert!(coord as [number, number]))
    .filter((coord): coord is [number, number] => coord !== null);

  if (corners.length === 0) {
    throw new Error('Failed to calculate visible area bounds');
  }

  // Find the bounding box
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);

  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

// Check if any point of a geometry is inside the visible area
function isGeometryInVisibleArea(
  geometry: Geometry,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }
): boolean {
  const isPointInBounds = (coord: Position): boolean => {
    const [lon, lat] = coord;
    return (
      lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat
    );
  };

  const checkRing = (ring: Position[]): boolean => {
    return ring.some(isPointInBounds);
  };

  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    return poly.coordinates.some(checkRing);
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    return multi.coordinates.some((polygon) => polygon.some(checkRing));
  }

  return false;
}

function isValidRing(ring: Position[]): boolean {
  // Check if coordinates are valid WGS84 (basic sanity check)
  // Geographic filtering is handled separately by isGeometryInVisibleArea
  return ring.every((coord) => {
    const lon = coord[0];
    const lat = coord[1];
    if (lon === undefined || lat === undefined) return false;
    // Use metro area bounds for sanity check (catches projection errors)
    return (
      lon >= METRO_AREA_BOUNDS.minLon && lon <= METRO_AREA_BOUNDS.maxLon &&
      lat >= METRO_AREA_BOUNDS.minLat && lat <= METRO_AREA_BOUNDS.maxLat &&
      !isNaN(lon) && !isNaN(lat)
    );
  });
}

function cleanGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon;
    const validRings = poly.coordinates.filter(isValidRing);
    if (validRings.length === 0) return null;
    return { type: 'Polygon', coordinates: validRings };
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon;
    const validPolygons = multi.coordinates
      .map((polygon) => polygon.filter(isValidRing))
      .filter((polygon) => polygon.length > 0);
    if (validPolygons.length === 0) return null;
    if (validPolygons.length === 1 && validPolygons[0]) {
      return { type: 'Polygon', coordinates: validPolygons[0] };
    }
    return { type: 'MultiPolygon', coordinates: validPolygons };
  }

  return geometry;
}

/**
 * Download zones from WFS service
 */
export async function downloadZonesFromWFS(): Promise<FeatureCollection<Geometry, FeatureProperties>> {
  const response = await axios.get(WFS_URL, {
    responseType: 'json',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response.data as FeatureCollection<Geometry, FeatureProperties>;
}

/**
 * Process raw WFS features into ZoneData
 */
export function processZones(
  features: Feature<Geometry, FeatureProperties>[],
  options: { limit?: number } = {}
): ZoneData[] {
  const projection = createProjection();
  const visibleBounds = getVisibleAreaBounds(projection);

  let processed = features
    .map((feature) => {
      const props = feature.properties;
      const code = props.postinumeroalue || props.posti_alue;
      const name = props.nimi;

      // Filter to Helsinki postal codes
      if (!code || !code.match(/^(00|01|02)/)) return null;

      // Clean geometry first (needed for inside point calculation)
      const cleanedGeometry = cleanGeometry(feature.geometry);
      if (!cleanedGeometry) return null;

      // Calculate pole of inaccessibility (guaranteed inside point)
      const insidePoint = calculateInsidePoint(cleanedGeometry);
      if (!insidePoint) return null;

      // Filter to visible area
      if (!isGeometryInVisibleArea(cleanedGeometry, visibleBounds)) {
        return null;
      }

      // Generate SVG path
      const svgPath = generateSvgPath(cleanedGeometry, projection);
      if (!svgPath) return null;

      return {
        id: code,
        name: name || '',
        lat: insidePoint[1],
        lon: insidePoint[0],
        geometry: JSON.stringify(cleanedGeometry),
        svg_path: svgPath,
      };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

  // Apply limit if specified
  if (options.limit) {
    processed = processed.slice(0, options.limit);
  }

  return processed;
}

/**
 * Write zones to file storage and initialize route files
 */
export function saveZones(
  zones: ZoneData[],
  emitter?: ProgressEmitter
): void {
  emitter?.emitStart('fetch_zones', zones.length, 'Saving zones...');

  // Ensure data directory exists
  ensureDataDirectoryStructure();

  // Convert ZoneData to Zone format (removing intermediate geometry data)
  const zoneRecords: Zone[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    city: z.city || 'Unknown',
    svgPath: z.svg_path,
    routingPoint: [z.lat, z.lon],
  }));

  // Create zones data structure (time buckets will be added later by time-buckets command)
  const zonesData: ZonesData = {
    version: 1,
    timeBuckets: [], // Will be populated by calculateTimeBuckets
    zones: zoneRecords,
  };

  // Write zones.json
  writeZones(zonesData);

  emitter?.emitProgress('fetch_zones', zones.length, zones.length * 2, 'Initializing route files...');

  // Initialize empty route files (all routes marked as PENDING)
  // Create route files
  const zoneIds = zones.map((z) => z.id);
  const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT'];
  initializeRoutes(zoneIds, periods);

  const routeCount = zones.length * zones.length * TIME_PERIODS.length;

  emitter?.emitComplete('fetch_zones', 'Zones saved successfully', {
    zoneCount: zones.length,
    routeCount,
  });
}

/**
 * Download zones from all cities
 */
export async function downloadZonesMultiCity(
  emitter?: ProgressEmitter
): Promise<StandardZone[]> {
  emitter?.emitStart('fetch_zones', ALL_FETCHERS.length, 'Fetching from multiple cities...');

  const allZones: StandardZone[] = [];
  const totalCities = ALL_FETCHERS.length;

  for (let i = 0; i < ALL_FETCHERS.length; i++) {
    const fetcher = ALL_FETCHERS[i];
    try {
      emitter?.emitProgress('fetch_zones', i, totalCities, `Fetching ${fetcher.cityName}...`);

      const features = await fetcher.fetchFeatures();
      const zones = features.map(f => fetcher.parseFeature(f));

      allZones.push(...zones);

      emitter?.emitProgress('fetch_zones', i + 1, totalCities,
        `Fetched ${zones.length} zones from ${fetcher.cityName}`);
    } catch (error) {
      console.error(`Failed to fetch ${fetcher.cityName}:`, error);
      // Continue with other cities (partial success)
      emitter?.emitProgress('fetch_zones', i + 1, totalCities,
        `Failed to fetch ${fetcher.cityName}, continuing...`);
    }
  }

  return allZones;
}

export interface ProcessingStats {
  total: number;
  blacklisted: number;
  insidePointFailed: number;
  geometryInvalid: number;
  outsideVisibleArea: number;
  svgPathFailed: number;
  passed: number;
}

/**
 * Process standard zones into ZoneData
 */
export async function processZonesMultiCity(
  standardZones: StandardZone[],
  options: { limit?: number } = {}
): Promise<{ zones: ZoneData[]; stats: ProcessingStats }> {
  const projection = createProjection();
  const visibleBounds = getVisibleAreaBounds(projection);

  // Load water mask for coastline clipping (required for all coastal zones)
  const waterMask = await getWaterMask();
  if (!waterMask) {
    throw new Error(
      `Water shapefile missing or failed to process. Required for zone coastline clipping.`
    );
  }

  const stats: ProcessingStats = {
    total: standardZones.length,
    blacklisted: 0,
    insidePointFailed: 0,
    geometryInvalid: 0,
    outsideVisibleArea: 0,
    svgPathFailed: 0,
    passed: 0
  };

  let processed = standardZones
    .map((zone) => {
      // Generate zone ID with city prefix
      const id = generateZoneId(zone.cityCode, zone.originalId);

      // Check if zone is blacklisted
      if (ZONE_BLACKLIST.has(id)) {
        stats.blacklisted++;
        return null;
      }

      // Clean geometry first (needed for inside point calculation)
      const cleanedGeometry = cleanGeometry(zone.geometry);
      if (!cleanedGeometry) {
        stats.geometryInvalid++;
        return null;
      }

      // Apply water clipping to follow coastline (for all regions)
      let processedGeometry = cleanedGeometry;
      if (cleanedGeometry.type === 'Polygon' || cleanedGeometry.type === 'MultiPolygon') {
        const clipped = clipZoneWithWater(cleanedGeometry, waterMask);
        if (clipped) {
          processedGeometry = clipped;
        }
        // If clipping returns null, keep original (shouldn't happen for valid zones)
      }

      // Calculate pole of inaccessibility (guaranteed inside point)
      const insidePoint = calculateInsidePoint(processedGeometry);
      if (!insidePoint) {
        stats.insidePointFailed++;
        return null;
      }

      // Filter to visible area
      if (!isGeometryInVisibleArea(processedGeometry, visibleBounds)) {
        stats.outsideVisibleArea++;
        return null;
      }

      // Generate SVG path
      const svgPath = generateSvgPath(processedGeometry, projection);
      if (!svgPath) {
        stats.svgPathFailed++;
        return null;
      }

      stats.passed++;
      return {
        id,
        name: zone.name,
        lat: insidePoint[1],
        lon: insidePoint[0],
        geometry: JSON.stringify(processedGeometry),
        svg_path: svgPath,
        city: zone.city,
        name_se: zone.nameSe,
        admin_level: zone.adminLevel,
        source_layer: zone.metadata?.sourceLayer
      };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null);

  // Apply limit if specified
  if (options.limit) {
    processed = processed.slice(0, options.limit);
  }

  return { zones: processed, stats };
}

/**
 * Fetch zones using multi-city approach
 */
export async function fetchZonesMultiCity(
  options: FetchZonesOptions = {}
): Promise<{ zoneCount: number; routeCount: number; stats: ProcessingStats }> {
  const emitter = options.emitter;

  // Download from all cities
  const standardZones = await downloadZonesMultiCity(emitter);

  emitter?.emitProgress('fetch_zones', 3, 4,
    `Downloaded ${standardZones.length} zones, processing...`);

  // Process zones
  const { zones, stats } = await processZonesMultiCity(standardZones, {
    limit: options.limit
  });

  // Log filtering summary
  console.log('\n--- Zone Filtering Summary ---');
  console.log(`Total fetched:        ${stats.total}`);
  console.log(`Blacklisted:          ${stats.blacklisted} (excluded - routing failures)`);
  console.log(`Outside visible area: ${stats.outsideVisibleArea} (filtered out)`);
  console.log(`Invalid geometry:     ${stats.geometryInvalid} (filtered out)`);
  console.log(`Inside point failed:  ${stats.insidePointFailed} (filtered out)`);
  console.log(`SVG path failed:      ${stats.svgPathFailed} (filtered out)`);
  console.log(`Passed filtering:     ${stats.passed}`);
  console.log('------------------------------\n');

  emitter?.emitProgress('fetch_zones', 4, 4,
    `Processed ${zones.length} zones (${stats.outsideVisibleArea} filtered as outside visible area), saving...`);

  // Save zones to file storage
  saveZones(zones, emitter);

  // Store pipeline metadata
  const fetchMetadata: FetchMetadata = {
    timestamp: new Date().toISOString(),
    zoneCount: zones.length,
    limit: options.limit,
    cities: ['Helsinki', 'Vantaa', 'Espoo', 'Kauniainen'],
    filteringStats: stats
  };
  updatePipelineMetadata('lastFetch', fetchMetadata);

  const routeCount = zones.length * zones.length * TIME_PERIODS.length;

  return { zoneCount: zones.length, routeCount, stats };
}

/**
 * Fetch zones from WFS (original implementation, kept for compatibility)
 */
export async function fetchZones(
  options: FetchZonesOptions = {}
): Promise<{ zoneCount: number; routeCount: number }> {
  const emitter = options.emitter;

  emitter?.emitStart('fetch_zones', undefined, 'Downloading zones from WFS...');

  // Download from WFS
  const geojson = await downloadZonesFromWFS();

  emitter?.emitProgress(
    'fetch_zones',
    0,
    100,
    `Downloaded ${geojson.features.length} features`
  );

  // Process zones
  const zones = processZones(geojson.features as Feature<Geometry, FeatureProperties>[], {
    limit: options.limit,
  });

  // Save zones to file storage
  saveZones(zones, emitter);

  // Store pipeline metadata
  const fetchMetadata: FetchMetadata = {
    timestamp: new Date().toISOString(),
    zoneCount: zones.length,
    limit: options.limit,
    cities: ['WFS'],
    filteringStats: {
      total: geojson.features.length,
      blacklisted: 0,
      insidePointFailed: 0,
      geometryInvalid: 0,
      outsideVisibleArea: 0,
      svgPathFailed: 0,
      passed: zones.length,
    }
  };
  updatePipelineMetadata('lastFetch', fetchMetadata);

  const routeCount = zones.length * zones.length * TIME_PERIODS.length;

  return { zoneCount: zones.length, routeCount };
}
