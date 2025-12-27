import mapshaper from 'mapshaper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProgressEmitter } from './events';
import { exportLayers } from './exportLayers';

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
  { name: 'ferries', file: 'L4L_VesiliikenneViiva.shp', type: 'line' },
];

// Helsinki bounding box (minx, miny, maxx, maxy)
const CLIP_BBOX_COORDS = [24.5, 60.0, 25.3, 60.5];

export interface ProcessMapOptions {
  dataDir?: string;
  outputPath?: string;
  emitter?: ProgressEmitter;
}

/**
 * Process shapefiles to TopoJSON
 *
 * Steps:
 * 1. Load all shapefiles from data directory
 * 2. Filter to Helsinki region using bbox
 * 3. Transform to WGS84 (EPSG:4326)
 * 4. Export as TopoJSON
 *
 * @param options Configuration options
 */
export async function processMap(options: ProcessMapOptions = {}): Promise<void> {
  const dataDir = options.dataDir || DEFAULT_DATA_DIR;
  const outputPath = options.outputPath || path.join(DEFAULT_OUTPUT_DIR, 'background_map.json');
  const emitter = options.emitter;

  emitter?.emitStart('process_map', 4, 'Processing map data...');

  try {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      throw new Error(`Data directory not found: ${dataDir}`);
    }

    // Step 1: Create clipping mask
    emitter?.emitProgress('process_map', 1, 4, 'Creating clipping mask...');

    // Step 2: Build mapshaper command for all layers
    emitter?.emitProgress('process_map', 2, 4, 'Loading shapefiles...');
    
    const inputFiles = LAYERS.map(layer => path.join(dataDir, layer.file)).join(' ');
    
    // Check all files exist
    for (const layer of LAYERS) {
      const inputPath = path.join(dataDir, layer.file);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Shapefile not found: ${inputPath}`);
      }
    }

    // Step 3: Process and combine
    emitter?.emitProgress('process_map', 3, 4, 'Processing and combining layers...');

    const command = `${inputFiles} -clip bbox=${CLIP_BBOX_COORDS.join(',')} -proj EPSG:4326 -combine -o format=topojson ${outputPath}`;

    // Execute mapshaper
    await new Promise<void>((resolve, reject) => {
      mapshaper.runCommands(command, (err, data) => {
        if (err) {
          reject(new Error(`Mapshaper error: ${err.message || err}`));
        } else {
          resolve();
        }
      });
    });

    // Get output file size
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    emitter?.emitComplete('process_map', `TopoJSON created (${sizeMB} MB)`, {
      outputPath,
      sizeMB,
    });
  } catch (error) {
    emitter?.emitError(
      'process_map',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to process map'
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
