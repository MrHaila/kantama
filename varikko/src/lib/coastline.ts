import mapshaper from 'mapshaper';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { CLIP_BBOX } from './mapConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data/maastokartta_esri');
const WATER_SHAPEFILE = path.join(DATA_DIR, 'L4L_VesiAlue.shp');
const TARGET_CRS = 'EPSG:4326';

/**
 * Generate a water mask from the shapefile.
 * Converts to GeoJSON, reprojects to WGS84, clips to map bounds,
 * simplifies, and dissolves into a single geometry.
 * Uses same settings as map generation (80% simplification, CLIP_BBOX).
 */
export async function getWaterMask(): Promise<Feature<Polygon | MultiPolygon> | null> {
  // Check if shapefile exists
  if (!fs.existsSync(WATER_SHAPEFILE)) {
    console.error(`Water shapefile not found at ${WATER_SHAPEFILE}`);
    return null;
  }

  const tempFile = path.join(__dirname, `temp_water_mask_${Date.now()}.json`);
  const clipMaskFile = path.join(__dirname, `temp_clip_mask_${Date.now()}.json`);

  try {
    // Step 1: Create clipping mask (same as map generation)
    await mapshaper.runCommands(
      `-rectangle bbox=${CLIP_BBOX.join(',')} name=clip_mask -proj init=${TARGET_CRS} -o ${clipMaskFile}`
    );

    // Step 2: Process water shapefile with same settings as map generation
    // -i input
    // -proj target crs
    // -clip to map bounds
    // -simplify 80% keep-shapes (matches map generation)
    // -dissolve to merge all water areas into one feature
    // -o output
    const cmd = [
      `-i ${WATER_SHAPEFILE}`,
      `-proj ${TARGET_CRS}`,
      `-clip ${clipMaskFile}`,
      `-simplify 80% keep-shapes`,
      `-dissolve`,
      `-o ${tempFile} format=geojson`
    ].join(' ');

    await mapshaper.runCommands(cmd);

    if (!fs.existsSync(tempFile)) {
      throw new Error('Failed to generate water mask GeoJSON');
    }

    const content = fs.readFileSync(tempFile, 'utf-8');

    // Cleanup temp files
    fs.unlinkSync(tempFile);
    if (fs.existsSync(clipMaskFile)) fs.unlinkSync(clipMaskFile);

    const geojson = JSON.parse(content);

    // Handle FeatureCollection (typical mapshaper output)
    if (geojson.type === 'FeatureCollection' && geojson.features && geojson.features.length > 0) {
      return geojson.features[0] as Feature<Polygon | MultiPolygon>;
    }

    // Handle GeometryCollection (from dissolve command)
    if (geojson.type === 'GeometryCollection' && geojson.geometries && geojson.geometries.length > 0) {
      // Wrap the first geometry in a Feature
      return {
        type: 'Feature',
        properties: {},
        geometry: geojson.geometries[0]
      } as Feature<Polygon | MultiPolygon>;
    }

    // Handle direct geometry (single Polygon or MultiPolygon)
    if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
      return {
        type: 'Feature',
        properties: {},
        geometry: geojson
      } as Feature<Polygon | MultiPolygon>;
    }

    console.error('Water mask GeoJSON has unexpected format:', geojson.type);
    return null;
  } catch (error) {
    console.error('Error generating water mask:', error);
    // Ensure cleanup
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(clipMaskFile)) fs.unlinkSync(clipMaskFile);
    } catch {
      // ignore cleanup errors
    }
    return null;
  }
}

/**
 * Clip a zone geometry by subtracting the water mask.
 */
export function clipZoneWithWater(
  zoneGeometry: Polygon | MultiPolygon,
  waterMask: Feature<Polygon | MultiPolygon>
): Polygon | MultiPolygon | null {
  try {
    const zoneFeature = turf.feature(zoneGeometry);
    const waterFeature = waterMask;

    // Turf v7 difference takes a FeatureCollection
    // But check if we are on v6 or v7. Package.json says ^7.3.1.
    // In v7: difference(featureCollection([poly1, poly2]))
    // The first polygon is the one to be clipped, the second is the one to subtract.
    
    const clipped = turf.difference(turf.featureCollection([zoneFeature, waterFeature]));
    
    if (!clipped) return null;
    return clipped.geometry;
  } catch (error) {
    // If difference fails (e.g. no intersection), return original
    // But usually difference returns null if completely erased?
    // Or throws if geometries are invalid.
    // For now, if error, we log and return original to be safe, or null?
    // If it fails, likely a topology error.
    console.warn('Error clipping zone with water mask:', error);
    return zoneGeometry; 
  }
}
