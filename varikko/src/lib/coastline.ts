import mapshaper from 'mapshaper';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data/maastokartta_esri');
const WATER_SHAPEFILE = path.join(DATA_DIR, 'L4L_VesiAlue.shp');
const TARGET_CRS = 'EPSG:4326';

/**
 * Generate a water mask from the shapefile.
 * Converts to GeoJSON, reprojects to WGS84, and dissolves into a single geometry.
 */
export async function getWaterMask(): Promise<Feature<Polygon | MultiPolygon> | null> {
  // Check if shapefile exists
  if (!fs.existsSync(WATER_SHAPEFILE)) {
    console.warn(`Water shapefile not found at ${WATER_SHAPEFILE}`);
    return null;
  }

  try {
    // We use a temporary output file
    const tempFile = path.join(__dirname, `temp_water_mask_${Date.now()}.json`);

    // Convert to GeoJSON and reproject
    // -i input
    // -proj target crs
    // -dissolve to merge all water areas into one feature (performance optimization for clipping)
    // -o output
    const cmd = [
      `-i ${WATER_SHAPEFILE}`,
      `-proj ${TARGET_CRS}`,
      `-dissolve`,
      `-o ${tempFile} format=geojson`
    ].join(' ');

    await mapshaper.runCommands(cmd);

    if (!fs.existsSync(tempFile)) {
      throw new Error('Failed to generate water mask GeoJSON');
    }

    const content = fs.readFileSync(tempFile, 'utf-8');
    fs.unlinkSync(tempFile); // Cleanup

    const geojson = JSON.parse(content);
    
    // mapshaper output is usually a FeatureCollection
    if (geojson.type === 'FeatureCollection' && geojson.features.length > 0) {
      return geojson.features[0] as Feature<Polygon | MultiPolygon>;
    }

    return null;
  } catch (error) {
    console.error('Error generating water mask:', error);
    // Ensure cleanup
    try {
      const tempFile = path.join(__dirname, 'temp_water_mask.json');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
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
