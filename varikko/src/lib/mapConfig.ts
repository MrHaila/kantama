/**
 * Map projection configuration
 *
 * IMPORTANT: These values MUST match the source of truth in opas:
 * opas/src/config/mapConfig.ts
 *
 * This defines the SVG viewBox and projection parameters used for
 * rendering zones and background map layers.
 */

// Base dimensions
export const BASE_WIDTH = 800;
export const BASE_HEIGHT = 800;

// Zoom level (1.0 = 100%, 1.2 = 20% zoom out to show more area)
export const ZOOM_LEVEL = 1.2;

// Calculated dimensions
export const WIDTH = BASE_WIDTH * ZOOM_LEVEL;
export const HEIGHT = BASE_HEIGHT * ZOOM_LEVEL;

// ViewBox offsets (keeps bottom edge fixed while expanding view)
export const VIEWBOX_X = -(WIDTH - BASE_WIDTH) / 2 + 60; // Center horizontally, then shift right
export const VIEWBOX_Y = -120 - (HEIGHT - BASE_HEIGHT); // Keep bottom fixed

// Full viewBox string for SVG elements
export const VIEWBOX = `${VIEWBOX_X} ${VIEWBOX_Y} ${WIDTH} ${HEIGHT}`;

// Map center coordinates (Helsinki metropolitan area center)
export const MAP_CENTER: [number, number] = [24.93, 60.17];
export const MAP_SCALE = 120000;

// Extended metro area bounds for coordinate validation
// Covers Helsinki, Espoo, Vantaa, and surrounding areas
export const METRO_AREA_BOUNDS = {
  minLon: 23.5,
  maxLon: 26.5,
  minLat: 59.5,
  maxLat: 61.0,
};

// Bounding box for map clipping (used in shapefile processing)
export const CLIP_BBOX: [number, number, number, number] = [24.5, 60.0, 25.3, 60.5];
