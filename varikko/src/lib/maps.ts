import mapshaper from 'mapshaper';
import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Feature } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { ProgressEmitter } from './events';
import { exportLayers } from './exportLayers';
import {
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  MAP_CENTER,
  MAP_SCALE,
  CLIP_BBOX,
} from '../shared/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default paths (can be overridden via options)
const DEFAULT_DATA_DIR = path.join(__dirname, '../../data/maastokartta_esri');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '../../../opas/public');

// Map layers to process
const LAYERS = [
  { name: 'water', file: 'L4L_VesiAlue.shp', type: 'polygon' },
  { name: 'roads', file: 'L4L_TieViiva.shp', type: 'line' },
  { name: 'railways', file: 'L4L_RautatieViiva.shp', type: 'line' },
];

// Coordinate systems
const TARGET_CRS = 'EPSG:4326'; // WGS84 for web use

export interface ProcessMapOptions {
  shapefileDir?: string;
  outputPath?: string;
  emitter?: ProgressEmitter;
}

export interface GenerateSVGOptions {
  topoJsonPath?: string;
  outputPath?: string;
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
 * Process ESRI shapefiles into TopoJSON
 *
 * Steps:
 * 1. Create clipping mask for Helsinki area
 * 2. Process each layer (water, roads):
 *    - Reproject from EPSG:3067 to EPSG:4326
 *    - Clip to Helsinki bounding box
 *    - Simplify geometries (80% reduction)
 *    - Convert to TopoJSON
 * 3. Combine all layers into single TopoJSON file
 *
 * @param options Configuration options
 */
export async function processMap(options: ProcessMapOptions = {}): Promise<void> {
  const {
    shapefileDir = DEFAULT_DATA_DIR,
    outputPath = path.join(DEFAULT_OUTPUT_DIR, 'background_map.json'),
    emitter,
  } = options;

  emitter?.emitStart('process_map', LAYERS.length + 2, 'Processing shapefiles to TopoJSON...');

  const outputDir = path.dirname(outputPath);
  const tempFiles: string[] = [];
  const clipMaskFile = path.join(__dirname, 'clip_mask.json');

  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 1: Create clipping mask
    emitter?.emitProgress('process_map', 1, LAYERS.length + 2, 'Creating clipping mask...');

    await mapshaper.runCommands(
      `-rectangle bbox=${CLIP_BBOX.join(',')} name=clip_mask -proj init=${TARGET_CRS} -o ${clipMaskFile}`
    );

    // Step 2: Process each layer
    let step = 2;
    for (const layer of LAYERS) {
      const inputFile = path.join(shapefileDir, layer.file);
      const tempFile = path.join(__dirname, `temp_${layer.name}.json`);

      emitter?.emitProgress(
        'process_map',
        step,
        LAYERS.length + 2,
        `Processing ${layer.name} layer...`
      );

      // Verify input file exists
      if (!fs.existsSync(inputFile)) {
        throw new Error(`Shapefile not found: ${inputFile}`);
      }

      // Process: load → reproject → clip → simplify → export
      const cmd = [
        `-i ${inputFile}`,
        `-proj ${TARGET_CRS}`,
        `-rename-layers ${layer.name}`,
        `-clip ${clipMaskFile}`,
        `-simplify 80% keep-shapes`,
        `-o ${tempFile} format=topojson`,
      ].join(' ');

      await mapshaper.runCommands(cmd);
      tempFiles.push(tempFile);
      step++;
    }

    // Step 3: Combine layers
    emitter?.emitProgress('process_map', step, LAYERS.length + 2, 'Combining layers...');

    const combineCmd = [
      `-i ${tempFiles.join(' ')} combine-files`,
      `-o ${outputPath} format=topojson`,
    ].join(' ');

    await mapshaper.runCommands(combineCmd);

    // Cleanup temporary files
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
    if (fs.existsSync(clipMaskFile)) {
      fs.unlinkSync(clipMaskFile);
    }

    // Get output file size
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    emitter?.emitComplete('process_map', `TopoJSON created (${sizeMB} MB)`, {
      outputPath,
      sizeMB,
    });
  } catch (error) {
    // Cleanup on error
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
    if (fs.existsSync(clipMaskFile)) {
      fs.unlinkSync(clipMaskFile);
    }

    emitter?.emitError(
      'process_map',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to process map'
    );
    throw error;
  }
}

/**
 * Generate SVG from TopoJSON file
 *
 * Steps:
 * 1. Load TopoJSON file
 * 2. Create D3 Mercator projection
 * 3. Extract features from each layer
 * 4. Generate SVG paths
 * 5. Write SVG file with CSS classes
 *
 * @param options Configuration options
 */
export async function generateSVG(options: GenerateSVGOptions = {}): Promise<void> {
  const {
    topoJsonPath = path.join(DEFAULT_OUTPUT_DIR, 'background_map.json'),
    outputPath = path.join(DEFAULT_OUTPUT_DIR, 'background_map.svg'),
    emitter,
  } = options;

  emitter?.emitStart('generate_svg', 3, 'Generating SVG from TopoJSON...');

  try {
    const outputDir = path.dirname(outputPath);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 1: Load TopoJSON
    emitter?.emitProgress('generate_svg', 1, 3, 'Loading TopoJSON...');

    if (!fs.existsSync(topoJsonPath)) {
      throw new Error(`TopoJSON file not found: ${topoJsonPath}`);
    }

    const topology: Topology = JSON.parse(fs.readFileSync(topoJsonPath, 'utf-8'));

    // Step 2: Create projection and path generator
    emitter?.emitProgress('generate_svg', 2, 3, 'Generating SVG paths...');

    const projection = createProjection();
    const pathGenerator = d3.geoPath().projection(projection);

    // Build SVG
    let svg = `<svg viewBox="${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">\n`;

    // Add CSS styles with CSS variables
    svg += `  <defs>
    <style>
      .background-rect { fill: var(--bg-color, #FDFBF7); }
      .water-layer {
        fill: var(--water-color, #2A4D69);
        stroke: none;
      }
      .road-layer {
        fill: none;
        stroke: var(--road-color, #8B7355);
        stroke-width: var(--road-width, 0.5);
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    </style>
  </defs>\n`;

    // Add background rectangle
    svg += `  <rect class="background-rect" x="${VIEWBOX_X}" y="${VIEWBOX_Y}" width="${WIDTH}" height="${HEIGHT}"/>\n`;

    // Add main group
    svg += `  <g>\n`;

    // Extract and render water layer
    if (topology.objects.water) {
      const waterGeoJson = topojson.feature(topology, topology.objects.water) as {
        features: unknown[];
      };

      svg += `    <g class="water-layer">\n`;
      waterGeoJson.features.forEach((feature, index) => {
        const path = pathGenerator(feature as Feature);
        if (path) {
          svg += `      <path d="${path}" data-index="${index}"/>\n`;
        }
      });
      svg += `    </g>\n`;
    }

    // Extract and render road layer
    if (topology.objects.roads) {
      const roadGeoJson = topojson.feature(topology, topology.objects.roads) as {
        features: unknown[];
      };

      svg += `    <g class="road-layer">\n`;
      roadGeoJson.features.forEach((feature, index) => {
        const path = pathGenerator(feature as Feature);
        if (path) {
          svg += `      <path d="${path}" data-index="${index}"/>\n`;
        }
      });
      svg += `    </g>\n`;
    }

    // Close SVG
    svg += `  </g>\n</svg>`;

    // Step 3: Write SVG file
    emitter?.emitProgress('generate_svg', 3, 3, 'Writing SVG file...');

    fs.writeFileSync(outputPath, svg, 'utf-8');

    // Get output file size
    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    emitter?.emitComplete('generate_svg', `SVG generated (${sizeKB} KB)`, {
      outputPath,
      sizeKB,
    });
  } catch (error) {
    emitter?.emitError(
      'generate_svg',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to generate SVG'
    );
    throw error;
  }
}

/**
 * Process map and export layers
 */
export async function processMaps(options: ProcessMapOptions = {}): Promise<void> {
  const outputPath = options.outputPath || path.join(DEFAULT_OUTPUT_DIR, 'background_map.json');

  // Step 1: Process shapefiles to TopoJSON
  await processMap(options);

  // Step 2: Export individual layer files
  await exportLayers({
    topoJsonPath: outputPath,
    outputDir: path.join(path.dirname(outputPath), 'layers'),
    emitter: options.emitter,
  });
}
