import mapshaper from 'mapshaper';
import path from 'path';
import fs from 'fs';
import { generateSVG } from './generate_svg';

const DATA_DIR = path.join(__dirname, '../data/maastokartta_esri');
const OUTPUT_DIR = path.join(__dirname, '../../opas/public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'background_map.json');

// Helsinki center coordinates (approx)
// ETRS-TM35FIN coordinates for Helsinki might be needed if the source data is in that projection.
// Checking Maanmittauslaitos data, it is usually ETRS-TM35FIN (EPSG:3067).
// Let's assume the source is properly defined or we might need to reproject.
// For now, we will assume the source files have .prj files or are known system.
// Actually, for web use we want WGS84 or Web Mercator. mapshaper can handle projection if we tell it.
// The user wants to render it in browser as background. TopoJSON with WGS84 (EPSG:4326) is standard for D3.

const LAYERS = [
  { name: 'water', file: 'L4L_VesiAlue.shp', type: 'polygon' },
  { name: 'roads', file: 'L4L_TieViiva.shp', type: 'line' },
  // { name: 'land', file: 'L4L_MaaAlue.shp', type: 'polygon' } // extensive, maybe skip for now and just use background color
];

// Coordinate system:
// Maanmittauslaitos data is usually EUREF-FIN (ETRS-TM35FIN).
// We should reproject to WGS84 for web use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SOURCE_CRS = 'EPSG:3067'; // TODO: Use this for reprojection when needed
const TARGET_CRS = 'EPSG:4326';

async function run() {
  console.log('Starting map processing...');

  // ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const tempFiles: string[] = [];
  // Ensure absolute path for clip mask
  const CLIP_MASK_FILE = path.join(__dirname, 'clip_mask.json');
  const CLIP_BBOX_COORDS = [24.5, 60.0, 25.3, 60.5]; // minx, miny, maxx, maxy

  try {
    // 1. Create a projected clipping mask
    console.log('Creating clipping mask...');
    await mapshaper.runCommands(
      `-rectangle bbox=${CLIP_BBOX_COORDS.join(',')} name=clip_mask -proj init=${TARGET_CRS} -o ${CLIP_MASK_FILE}`
    );

    // 2. Process each layer individually using the mask
    for (const layer of LAYERS) {
      const inputFile = path.join(DATA_DIR, layer.file);
      const tempFile = path.join(__dirname, `temp_${layer.name}.json`);

      // We load the input file AND the clip mask.
      // Then we reproject the input file (target is 4326).
      // Then we clip using the mask layer.
      // Note: -proj affects all layers unless target is specified.
      // But strict CRS checking might fail if we load them together and one is 3067 and other is 4326.
      // BETTER: Load input, reproject. THEN properties of the current dataset are 4326.
      // THEN load the clip mask (which is 4326).
      // THEN clip.

      const cmd = [
        `-i ${inputFile}`,
        `-proj ${TARGET_CRS}`,
        `-rename-layers ${layer.name}`,
        `-clip ${CLIP_MASK_FILE}`, // Clip using file directly, avoiding layer projection merge checks
        `-simplify 80% keep-shapes`,
        `-o ${tempFile} format=topojson`,
      ].join(' ');

      console.log(`Processing ${layer.name}...`);
      await mapshaper.runCommands(cmd);
      tempFiles.push(tempFile);
    }

    // Combine result
    console.log('Combining layers...');
    const combineCmd = [
      `-i ${tempFiles.join(' ')} combine-files`,
      `-o ${OUTPUT_FILE} format=topojson`,
    ].join(' ');

    await mapshaper.runCommands(combineCmd);

    // Cleanup temp files
    for (const f of tempFiles) {
      fs.unlinkSync(f);
    }
    if (fs.existsSync(CLIP_MASK_FILE)) fs.unlinkSync(CLIP_MASK_FILE);

    console.log(`Successfully created ${OUTPUT_FILE}`);

    // Check size
    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`Output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Generate SVG from the TopoJSON
    console.log('\nGenerating SVG from TopoJSON...');
    generateSVG();
  } catch (e) {
    console.error('Error running mapshaper:', e);
    // Cleanup on error
    for (const f of tempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (fs.existsSync(CLIP_MASK_FILE)) fs.unlinkSync(CLIP_MASK_FILE);
  }
}

run();
