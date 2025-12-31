import axios from 'axios';
import * as d3 from 'd3-geo';
import fs from 'fs';
import path from 'path';
import type { FeatureCollection, Feature, Geometry, Position, Polygon, MultiPolygon } from 'geojson';
import type { ProgressEmitter } from './events';
import type { LayerManifest } from './exportLayers';
import {
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  MAP_CENTER,
  MAP_SCALE,
} from '../shared/config';

// HSL Fare Zones dataset from Helsinki Region Infoshare
const TICKET_ZONES_URL =
  'https://opendata.arcgis.com/datasets/89b6b5142a9b4bb9a5c5f4404ff28963_0.geojson';

// Output paths
const OUTPUT_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'opas',
  'public',
  'layers'
);
const TICKET_ZONES_SVG_PATH = path.join(OUTPUT_DIR, 'ticket-zones.svg');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

// Stroke widths for different zones
const ZONE_STROKE_WIDTHS: Record<string, number> = {
  A: 1.0,
  B: 1.5,
  C: 2.0,
  D: 2.5,
};

interface TicketZoneProperties {
  tunnus: string; // Zone identifier (A, B, C, D)
  [key: string]: unknown;
}

interface ZoneGroup {
  zone: string;
  features: Feature<Geometry, TicketZoneProperties>[];
}

/**
 * Create D3 Mercator projection matching the map configuration
 */
function createProjection(): d3.GeoProjection {
  return d3
    .geoMercator()
    .center(MAP_CENTER)
    .scale(MAP_SCALE)
    .translate([WIDTH / 2, HEIGHT / 2]);
}

/**
 * Download HSL ticket zone boundaries from HRI
 */
export async function downloadTicketZones(
  emitter?: ProgressEmitter
): Promise<FeatureCollection<Geometry, TicketZoneProperties>> {
  emitter?.emitProgress('fetch_ticket_zones', 1, 5, 'Downloading ticket zones from HRI...');

  const response = await axios.get<FeatureCollection<Geometry, TicketZoneProperties>>(
    TICKET_ZONES_URL,
    {
      responseType: 'json',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  return response.data;
}

/**
 * Group features by zone identifier (A, B, C, D)
 */
export function groupByZone(
  features: Feature<Geometry, TicketZoneProperties>[]
): ZoneGroup[] {
  const groups = new Map<string, Feature<Geometry, TicketZoneProperties>[]>();

  for (const feature of features) {
    const zone = feature.properties.tunnus;
    if (!zone) continue;

    if (!groups.has(zone)) {
      groups.set(zone, []);
    }
    groups.get(zone)!.push(feature);
  }

  // Convert to array and sort by zone letter (A, B, C, D)
  return Array.from(groups.entries())
    .map(([zone, features]) => ({ zone, features }))
    .sort((a, b) => a.zone.localeCompare(b.zone));
}

/**
 * Manually project geometry coordinates using Mercator projection
 */
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

/**
 * Generate SVG path from projected geometry
 */
function generateSvgPath(geometry: Geometry, projection: d3.GeoProjection): string | null {
  const projectedGeometry = projectGeometry(geometry, projection);
  if (!projectedGeometry) return null;

  const pathGenerator = d3.geoPath();
  return pathGenerator(projectedGeometry) || null;
}

/**
 * Generate complete ticket zones SVG with grouped zones
 */
export function generateTicketZonesSVG(
  geojson: FeatureCollection<Geometry, TicketZoneProperties>,
  emitter?: ProgressEmitter
): string {
  emitter?.emitProgress('fetch_ticket_zones', 2, 5, 'Grouping zones...');

  const zoneGroups = groupByZone(geojson.features);
  const projection = createProjection();

  emitter?.emitProgress('fetch_ticket_zones', 3, 5, 'Generating SVG paths...');

  let svg = `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">\n`;

  for (const group of zoneGroups) {
    const strokeWidth = ZONE_STROKE_WIDTHS[group.zone] || 1.5;
    svg += `  <g id="zone-${group.zone}" class="ticket-zone" data-stroke-width="${strokeWidth}">\n`;

    for (const feature of group.features) {
      const svgPath = generateSvgPath(feature.geometry, projection);
      if (svgPath) {
        svg += `    <path d="${svgPath}" />\n`;
      }
    }

    svg += `  </g>\n`;
  }

  svg += `</svg>`;

  return svg;
}

/**
 * Write ticket zones SVG to opas/public/layers/
 */
export function writeTicketZonesLayer(svg: string, emitter?: ProgressEmitter): void {
  emitter?.emitProgress('fetch_ticket_zones', 4, 5, 'Writing SVG file...');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(TICKET_ZONES_SVG_PATH, svg, 'utf-8');

  const stats = fs.statSync(TICKET_ZONES_SVG_PATH);
  const sizeKB = (stats.size / 1024).toFixed(2);

  emitter?.emitProgress(
    'fetch_ticket_zones',
    4,
    5,
    `Wrote ticket-zones.svg (${sizeKB} KB)`
  );
}

/**
 * Update manifest.json to include ticket zones layer
 */
export function updateManifest(emitter?: ProgressEmitter): void {
  emitter?.emitProgress('fetch_ticket_zones', 5, 5, 'Updating manifest...');

  let manifest: LayerManifest;

  // Read existing manifest or create new one
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    manifest = JSON.parse(manifestContent);
  } else {
    manifest = {
      viewBox: `${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}`,
      layers: [],
    };
  }

  // Check if ticketZones layer already exists
  const existingIndex = manifest.layers.findIndex((layer) => layer.id === 'ticketZones');

  const ticketZonesLayer = {
    id: 'ticketZones',
    file: 'ticket-zones.svg',
    description: 'HSL fare zone boundaries',
    zIndex: 15,
  };

  if (existingIndex >= 0) {
    // Update existing layer
    manifest.layers[existingIndex] = ticketZonesLayer;
  } else {
    // Add new layer and sort by zIndex
    manifest.layers.push(ticketZonesLayer);
    manifest.layers.sort((a, b) => a.zIndex - b.zIndex);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

  emitter?.emitProgress('fetch_ticket_zones', 5, 5, 'Manifest updated');
}

/**
 * Main function to fetch and generate ticket zones layer
 */
export async function fetchTicketZones(emitter?: ProgressEmitter): Promise<void> {
  emitter?.emitStart('fetch_ticket_zones', 5, 'Fetching HSL ticket zones...');

  try {
    // Download GeoJSON
    const geojson = await downloadTicketZones(emitter);

    // Generate SVG
    const svg = generateTicketZonesSVG(geojson, emitter);

    // Write to file
    writeTicketZonesLayer(svg, emitter);

    // Update manifest
    updateManifest(emitter);

    emitter?.emitComplete(
      'fetch_ticket_zones',
      'Ticket zones layer created successfully',
      {
        featureCount: geojson.features.length,
        outputPath: TICKET_ZONES_SVG_PATH,
      }
    );
  } catch (error) {
    emitter?.emitError(
      'fetch_ticket_zones',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to fetch ticket zones'
    );
    throw error;
  }
}
