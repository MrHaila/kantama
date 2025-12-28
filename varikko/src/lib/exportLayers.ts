import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import type { Feature } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { ProgressEmitter } from './events';
import {
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  VIEWBOX,
  MAP_CENTER,
  MAP_SCALE,
} from '../shared/config';

// Re-export for use in SVG generation
export { VIEWBOX_X, VIEWBOX_Y, WIDTH, HEIGHT };

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
}

export interface ExportLayersOptions {
  topoJsonPath: string;
  outputDir: string;
  emitter?: ProgressEmitter;
}

/**
 * Create D3 Mercator projection matching opas BackgroundMap.vue
 */
function createProjection() {
  return d3
    .geoMercator()
    .center(MAP_CENTER)
    .scale(MAP_SCALE)
    .translate([WIDTH / 2, HEIGHT / 2]);
}

/**
 * Generate layer manifest with layer metadata
 * Note: Themes are defined in Opas frontend, not here
 */
function generateManifest(): LayerManifest {
  return {
    viewBox: VIEWBOX,
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
      {
        id: 'railways',
        file: 'railways.svg',
        description: 'Railway network',
        zIndex: 20,
      },
      {
        id: 'ferries',
        file: 'ferries.svg',
        description: 'Ferry routes',
        zIndex: 30,
      },
    ],
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
      svg += `    <path d="${path}" fill="none"/>\n`;
    }
  });

  svg += `  </g>\n</svg>`;

  const outputPath = path.join(outputDir, 'roads.svg');
  fs.writeFileSync(outputPath, svg, 'utf-8');
}

/**
 * Export railways layer as separate SVG file
 */
async function exportRailwaysLayer(
  topology: Topology,
  outputDir: string,
  projection: d3.GeoProjection
): Promise<void> {
  if (!topology.objects.railways) {
    throw new Error('Railways layer not found in TopoJSON');
  }

  const pathGenerator = d3.geoPath().projection(projection);
  const railwayGeoJson = topojson.feature(topology, topology.objects.railways) as {
    features: unknown[];
  };

  let svg = `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <g id="railways">\n`;

  railwayGeoJson.features.forEach((feature) => {
    const path = pathGenerator(feature as Feature);
    if (path) {
      svg += `    <path d="${path}" fill="none"/>\n`;
    }
  });

  svg += `  </g>\n</svg>`;

  const outputPath = path.join(outputDir, 'railways.svg');
  fs.writeFileSync(outputPath, svg, 'utf-8');
}

/**
 * Export ferries layer as separate SVG file
 */
async function exportFerriesLayer(
  topology: Topology,
  outputDir: string,
  projection: d3.GeoProjection
): Promise<void> {
  if (!topology.objects.ferries) {
    throw new Error('Ferries layer not found in TopoJSON');
  }

  const pathGenerator = d3.geoPath().projection(projection);
  const ferryGeoJson = topojson.feature(topology, topology.objects.ferries) as {
    features: unknown[];
  };

  let svg = `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `  <g id="ferries">\n`;

  ferryGeoJson.features.forEach((feature) => {
    const path = pathGenerator(feature as Feature);
    if (path) {
      svg += `    <path d="${path}" fill="none"/>\n`;
    }
  });

  svg += `  </g>\n</svg>`;

  const outputPath = path.join(outputDir, 'ferries.svg');
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
export async function exportLayers(options: ExportLayersOptions): Promise<void> {
  const { topoJsonPath, outputDir, emitter } = options;

  emitter?.emitStart('export_layers', 6, 'Exporting layered SVG files...');

  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 1: Load TopoJSON
    emitter?.emitProgress('export_layers', 1, 6, 'Loading TopoJSON...');

    if (!fs.existsSync(topoJsonPath)) {
      throw new Error(`TopoJSON file not found: ${topoJsonPath}`);
    }

    const topology: Topology = JSON.parse(fs.readFileSync(topoJsonPath, 'utf-8'));
    const projection = createProjection();

    // Step 2: Export water layer
    emitter?.emitProgress('export_layers', 2, 6, 'Exporting water layer...');
    await exportWaterLayer(topology, outputDir, projection);

    const waterStats = fs.statSync(path.join(outputDir, 'water.svg'));
    const waterSizeKB = (waterStats.size / 1024).toFixed(2);

    // Step 3: Export roads layer
    emitter?.emitProgress('export_layers', 3, 6, 'Exporting roads layer...');
    await exportRoadsLayer(topology, outputDir, projection);

    const roadStats = fs.statSync(path.join(outputDir, 'roads.svg'));
    const roadSizeKB = (roadStats.size / 1024).toFixed(2);

    // Step 4: Export railways layer
    emitter?.emitProgress('export_layers', 4, 6, 'Exporting railways layer...');
    await exportRailwaysLayer(topology, outputDir, projection);

    const railwayStats = fs.statSync(path.join(outputDir, 'railways.svg'));
    const railwaySizeKB = (railwayStats.size / 1024).toFixed(2);

    // Step 5: Export ferries layer
    emitter?.emitProgress('export_layers', 5, 6, 'Exporting ferries layer...');
    await exportFerriesLayer(topology, outputDir, projection);

    const ferryStats = fs.statSync(path.join(outputDir, 'ferries.svg'));
    const ferrySizeKB = (ferryStats.size / 1024).toFixed(2);

    // Step 6: Generate and save manifest
    emitter?.emitProgress('export_layers', 6, 6, 'Generating manifest...');

    const manifest = generateManifest();
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    emitter?.emitComplete(
      'export_layers',
      `Layers exported (water: ${waterSizeKB} KB, roads: ${roadSizeKB} KB, railways: ${railwaySizeKB} KB, ferries: ${ferrySizeKB} KB)`,
      {
        outputDir,
        waterSizeKB,
        roadSizeKB,
        railwaySizeKB,
        ferrySizeKB,
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
