/**
 * Transit layer generation for visualizing route usage
 *
 * Analyzes pre-computed routes to identify overlapping transit segments
 * and generates SVG visualizations with logarithmic width scaling.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as d3 from 'd3-geo';
import { fileURLToPath } from 'url';
import type { ProgressEmitter } from './events';
import { getAllZoneIds, readZoneRoutes } from './datastore';
import { TimePeriod, RouteStatus, CompactLeg } from '../shared/types';
import {
  MAP_CENTER,
  MAP_SCALE,
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
} from '../shared/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LAYERS_DIR = path.join(__dirname, '../../../opas/public/layers');

// ============================================================================
// Types
// ============================================================================

export interface TransitLayerOptions {
  periods: TimePeriod[];
  emitter?: ProgressEmitter;
}

export interface TransitLayerResult {
  period: string;
  segmentCount: number;
  outputPath: string;
}

interface SegmentKey {
  hash: string;
  points: [number, number][];
  count: number;
  modes: Set<string>;
}

// ============================================================================
// Polyline Decoder (copied from opas/src/utils/polyline.ts)
// ============================================================================

/**
 * Decode Google Encoded Polyline format used by OTP
 * Based on: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    // Decode longitude
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dlon;

    // OTP uses precision of 5 decimal places
    points.push([lat / 1e5, lon / 1e5]);
  }

  return points;
}

// ============================================================================
// Coordinate Projection
// ============================================================================

/**
 * Create D3 Mercator projection matching existing layers
 * Same configuration as exportLayers.ts
 */
function createProjection(): d3.GeoProjection {
  return d3
    .geoMercator()
    .center(MAP_CENTER)
    .scale(MAP_SCALE)
    .translate([WIDTH / 2, HEIGHT / 2]);
}

/**
 * Project lat/lon to SVG coordinates
 * Note: VIEWBOX offsets are NOT added here - they're defined in the SVG viewBox attribute
 */
function latLonToSVG(lat: number, lon: number, projection: d3.GeoProjection): [number, number] {
  const result = projection([lon, lat]);
  if (!result) {
    throw new Error(`Failed to project coordinates: ${lat}, ${lon}`);
  }
  return result;
}

// ============================================================================
// Segment Processing
// ============================================================================

/**
 * Simplify path using Douglas-Peucker algorithm
 * Reduces number of points while preserving visual shape
 *
 * @param points Array of [lat, lon] coordinates
 * @param tolerance Maximum distance threshold (default: 0.0001 ≈ 11m)
 */
function simplifyPath(points: [number, number][], tolerance: number = 0.0001): [number, number][] {
  if (points.length <= 2) return points;

  // Find point with maximum distance from line segment
  let maxDistance = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(points.slice(maxIndex), tolerance);

    // Merge results (remove duplicate middle point)
    return [...left.slice(0, -1), ...right];
  } else {
    // Max distance is less than tolerance - return just endpoints
    return [start, end];
  }
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Handle degenerate case where line segment is a point
  if (dx === 0 && dy === 0) {
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  // Calculate perpendicular distance
  const numerator = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(dx ** 2 + dy ** 2);

  return numerator / denominator;
}

/**
 * Normalize segment for deduplication
 * Rounds coordinates to 4 decimals (~11m precision) and ensures consistent direction
 */
function normalizeSegment(points: [number, number][]): string {
  // Round to 4 decimal places to collapse precision errors
  const rounded = points.map(([lat, lon]) => [
    Math.round(lat * 10000) / 10000,
    Math.round(lon * 10000) / 10000,
  ]);

  // Ensure consistent direction using lexicographic ordering
  const [start, end] = [rounded[0], rounded[rounded.length - 1]];
  const forward = start[0] < end[0] || (start[0] === end[0] && start[1] <= end[1]);

  return JSON.stringify(forward ? rounded : rounded.reverse());
}

/**
 * Calculate logarithmic stroke width based on usage count
 */
function calculateStrokeWidth(usageCount: number): number {
  // Filter count=1 segments at extraction time, so minimum here is 2
  const BASE_WIDTH = 0.3;
  const SCALE_FACTOR = 0.8;
  const MAX_WIDTH = 4.0;

  if (usageCount <= 2) return BASE_WIDTH;

  const width = BASE_WIDTH + Math.log10(usageCount) * SCALE_FACTOR;
  return Math.min(width, MAX_WIDTH);
}

/**
 * Extract and aggregate transit segments from all routes for a period
 */
function extractSegments(period: TimePeriod, emitter?: ProgressEmitter): Map<string, SegmentKey> {
  const zoneIds = getAllZoneIds();
  const segmentMap = new Map<string, SegmentKey>();

  emitter?.emitProgress('extract', 0, zoneIds.length, `Processing ${zoneIds.length} zones...`);

  for (let i = 0; i < zoneIds.length; i++) {
    const zoneId = zoneIds[i];
    const routesData = readZoneRoutes(zoneId, period);
    if (!routesData) continue;

    for (const route of routesData.r) {
      // Only process successful routes with legs
      if (route.s !== RouteStatus.OK || !route.l) continue;

      for (const leg of route.l) {
        // Filter: transit modes only (exclude WALK)
        if (leg.m === 'WALK' || !leg.g) continue;

        // Decode and simplify FIRST, then normalize
        const rawPoints = decodePolyline(leg.g);
        const simplifiedPoints = simplifyPath(rawPoints, 0.0001); // ~11m tolerance
        const key = normalizeSegment(simplifiedPoints);

        if (segmentMap.has(key)) {
          const existing = segmentMap.get(key)!;
          existing.count++;
          existing.modes.add(leg.m);
        } else {
          segmentMap.set(key, {
            hash: key,
            points: simplifiedPoints, // Store simplified points
            count: 1,
            modes: new Set([leg.m]),
          });
        }
      }
    }

    // Progress update every 50 zones
    if (i % 50 === 0 || i === zoneIds.length - 1) {
      emitter?.emitProgress('extract', i + 1, zoneIds.length, `Processed ${i + 1}/${zoneIds.length} zones`);
    }
  }

  emitter?.emitProgress('extract', zoneIds.length, zoneIds.length, `Extracted ${segmentMap.size} unique segments`);

  return segmentMap;
}

/**
 * Filter out segments with count=1 (only used by single route)
 */
function filterSingleUseSegments(segmentMap: Map<string, SegmentKey>): SegmentKey[] {
  const segments = Array.from(segmentMap.values());
  const filtered = segments.filter((s) => s.count > 1);

  return filtered;
}

/**
 * Generate SVG string from segments
 */
function generateSVG(segments: SegmentKey[], period: TimePeriod, projection: d3.GeoProjection): string {
  const periodMap: Record<TimePeriod, string> = {
    MORNING: 'M',
    EVENING: 'E',
    MIDNIGHT: 'N',
  };
  const periodCode = periodMap[period];

  // Sort by count descending (high-usage rendered first, appears underneath)
  segments.sort((a, b) => b.count - a.count);

  const paths = segments.map((seg) => {
    const pathD = seg.points
      .map(([lat, lon], i) => {
        const [x, y] = latLonToSVG(lat, lon, projection);
        return i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('');

    const strokeWidth = calculateStrokeWidth(seg.count);

    return `    <path d="${pathD}" stroke-width="${strokeWidth.toFixed(2)}"/>`;
  });

  return `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <g id="transit-${periodCode}">
${paths.join('\n')}
  </g>
</svg>`;
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Generate transit layer SVG files for specified periods
 *
 * @param options Configuration options
 * @returns Results for each period generated
 */
export function generateTransitLayer(options: TransitLayerOptions): TransitLayerResult[] {
  const { periods, emitter } = options;
  const results: TransitLayerResult[] = [];
  const projection = createProjection();

  // Ensure output directory exists
  if (!fs.existsSync(LAYERS_DIR)) {
    fs.mkdirSync(LAYERS_DIR, { recursive: true });
  }

  emitter?.emitStart('generate_transit_layers', periods.length, `Generating transit layers for ${periods.length} period(s)`);

  for (const period of periods) {
    emitter?.emitProgress('generate', 0, 4, `Processing ${period}...`);

    // Step 1: Extract segments
    emitter?.emitProgress('generate', 1, 4, 'Extracting transit segments...');
    const segmentMap = extractSegments(period, emitter);

    // Step 2: Filter single-use segments
    emitter?.emitProgress('generate', 2, 4, 'Filtering single-use segments...');
    const segments = filterSingleUseSegments(segmentMap);

    // Step 3: Generate SVG
    emitter?.emitProgress('generate', 3, 4, 'Generating SVG...');
    const svg = generateSVG(segments, period, projection);

    // Step 4: Write to file
    emitter?.emitProgress('generate', 4, 4, 'Writing file...');
    const periodMap: Record<TimePeriod, string> = {
      MORNING: 'M',
      EVENING: 'E',
      MIDNIGHT: 'N',
    };
    const filename = `transit-${periodMap[period]}.svg`;
    const outputPath = path.join(LAYERS_DIR, filename);

    fs.writeFileSync(outputPath, svg, 'utf-8');

    results.push({
      period,
      segmentCount: segments.length,
      outputPath,
    });

    emitter?.emitProgress('generate', 4, 4, `✓ ${filename} (${segments.length} segments)`);
  }

  emitter?.emitComplete('generate_transit_layers', `Generated ${results.length} transit layer(s)`);

  return results;
}
