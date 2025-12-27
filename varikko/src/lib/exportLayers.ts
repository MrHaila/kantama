import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import type { Feature } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { ProgressEmitter } from './events';

// Default paths
const DEFAULT_TOPOJSON_PATH = path.join(__dirname, '../../opas/public/background_map.json');
const DEFAULT_LAYERS_DIR = path.join(__dirname, '../../opas/public/layers');

// SVG projection parameters - must match opas MAP_CONFIG
const ZOOM_LEVEL = 1.2; // 20% zoom out
const BASE_WIDTH = 800;
const BASE_HEIGHT = 800;
const WIDTH = BASE_WIDTH * ZOOM_LEVEL;
const HEIGHT = BASE_HEIGHT * ZOOM_LEVEL;
const VIEWBOX_X = -(WIDTH - BASE_WIDTH) / 2 + 60; // Center horizontally, then move 60px right
const VIEWBOX_Y = -120 - (HEIGHT - BASE_HEIGHT); // Keep bottom fixed

export interface LayerDefinition {
  id: string;
  file: string;
  description: string;
  zIndex: number;
}

export interface ThemeStyles {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LayerManifest {
  viewBox: string;
  layers: LayerDefinition[];
  themes: Record<string, Record<string, ThemeStyles>>;
}

export interface ExportLayersOptions {
  topoJsonPath?: string;
  outputDir?: string;
  emitter?: ProgressEmitter;
}

/**
 * Create D3 Mercator projection matching opas BackgroundMap.vue
 */
function createProjection() {
  return d3
    .geoMercator()
    .center([24.93, 60.17]) // Helsinki center
    .scale(120000)
    .translate([WIDTH / 2, HEIGHT / 2]);
}

/**
 * Generate layer manifest with metadata and theme definitions
 */
function generateManifest(): LayerManifest {
  return {
    viewBox: `${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}`,
    layers: [
      {
        id: 'water',
        file: 'water.svg',
        description: 'Water bodies (sea, lakes)',
        zIndex: 0,
      },
      {
        id: 'roads',
        file: 'roads.svg',
        description: 'Road network',
        zIndex: 10,
      },
    ],
    themes: {
      vintage: {
        water: { fill: '#2a4d69' },
        roads: { stroke: '#8b7355', strokeWidth: 0.5 },
      },
      yle: {
        water: { fill: '#6b9bc3' },
        roads: { stroke: '#3d5a50', strokeWidth: 0.6 },
      },
    },
  };
}

/**
 * Export water layer as separate SVG file
 */
async function exportWaterLayer(
  topology: Topology,
  outputDir: string,
  projection: d3.GeoProjection
): Promise<void> {
  if (!topology.objects.water) {
    throw new Error('Water layer not found in TopoJSON');
  }

  const pathGenerator = d3.geoPath().projection(projection);
  const waterGeoJson = topojson.feature(topology, topology.objects.water) as {
    features: unknown[];
  };

  let svg = `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <g id="water">\n`;

  waterGeoJson.features.forEach((feature) => {
    const path = pathGenerator(feature as Feature);
    if (path) {
      svg += `    <path d="${path}"/>\n`;
    }
  });

  svg += `  </g>\n</svg>`;

  const outputPath = path.join(outputDir, 'water.svg');
  fs.writeFileSync(outputPath, svg, 'utf-8');
}

/**
 * Export roads layer as separate SVG file
 */
async function exportRoadsLayer(
  topology: Topology,
  outputDir: string,
  projection: d3.GeoProjection
): Promise<void> {
  if (!topology.objects.roads) {
    throw new Error('Roads layer not found in TopoJSON');
  }

  const pathGenerator = d3.geoPath().projection(projection);
  const roadGeoJson = topojson.feature(topology, topology.objects.roads) as {
    features: unknown[];
  };

  let svg = `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <g id="roads">\n`;

  roadGeoJson.features.forEach((feature) => {
    const path = pathGenerator(feature as Feature);
    if (path) {
      svg += `    <path d="${path}"/>\n`;
    }
  });

  svg += `  </g>\n</svg>`;

  const outputPath = path.join(outputDir, 'roads.svg');
  fs.writeFileSync(outputPath, svg, 'utf-8');
}

/**
 * Export individual layer SVG files and manifest from TopoJSON
 *
 * Creates:
 * - opas/public/layers/water.svg
 * - opas/public/layers/roads.svg
 * - opas/public/layers/manifest.json
 *
 * Each layer SVG is minimal (no embedded styles), with styling
 * defined in manifest themes.
 *
 * @param options Configuration options
 */
export async function exportLayers(options: ExportLayersOptions = {}): Promise<void> {
  const {
    topoJsonPath = DEFAULT_TOPOJSON_PATH,
    outputDir = DEFAULT_LAYERS_DIR,
    emitter,
  } = options;

  emitter?.emitStart('export_layers', 4, 'Exporting layered SVG files...');

  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 1: Load TopoJSON
    emitter?.emitProgress('export_layers', 1, 4, 'Loading TopoJSON...');

    if (!fs.existsSync(topoJsonPath)) {
      throw new Error(`TopoJSON file not found: ${topoJsonPath}`);
    }

    const topology: Topology = JSON.parse(fs.readFileSync(topoJsonPath, 'utf-8'));
    const projection = createProjection();

    // Step 2: Export water layer
    emitter?.emitProgress('export_layers', 2, 4, 'Exporting water layer...');
    await exportWaterLayer(topology, outputDir, projection);

    const waterStats = fs.statSync(path.join(outputDir, 'water.svg'));
    const waterSizeKB = (waterStats.size / 1024).toFixed(2);

    // Step 3: Export roads layer
    emitter?.emitProgress('export_layers', 3, 4, 'Exporting roads layer...');
    await exportRoadsLayer(topology, outputDir, projection);

    const roadStats = fs.statSync(path.join(outputDir, 'roads.svg'));
    const roadSizeKB = (roadStats.size / 1024).toFixed(2);

    // Step 4: Generate and save manifest
    emitter?.emitProgress('export_layers', 4, 4, 'Generating manifest...');

    const manifest = generateManifest();
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    emitter?.emitComplete(
      'export_layers',
      `Layers exported (water: ${waterSizeKB} KB, roads: ${roadSizeKB} KB)`,
      {
        outputDir,
        waterSizeKB,
        roadSizeKB,
      }
    );
  } catch (error) {
    emitter?.emitError(
      'export_layers',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to export layers'
    );
    throw error;
  }
}
