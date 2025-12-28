/**
 * Map projection configuration
 *
 * IMPORTANT: This is the single source of truth for map projection settings.
 * Used by:
 * - varikko: SVG generation, coordinate projection, layer export
 * - opas: Map rendering, zone display, route visualization
 *
 * Any changes here affect both data generation and visualization.
 */

// ============================================================================
// SVG Viewport Configuration
// ============================================================================

export const MAP_CONFIG = {
  // Base dimensions
  baseWidth: 800,
  baseHeight: 800,

  // Current zoom level (1.0 = 100%, 1.2 = 20% zoom out)
  zoomLevel: 1.2,

  // Calculated dimensions
  get width() {
    return this.baseWidth * this.zoomLevel;
  },

  get height() {
    return this.baseHeight * this.zoomLevel;
  },

  // ViewBox offsets to keep bottom edge fixed while expanding
  get viewBoxX() {
    // Center horizontally when zooming out, then move 60px right
    return -(this.width - this.baseWidth) / 2 + 60;
  },

  get viewBoxY() {
    // Keep bottom edge fixed by moving up more than we expand
    const baseOffset = -120;
    const additionalExpansion = this.height - this.baseHeight;
    return baseOffset - additionalExpansion;
  },

  // Full viewBox string
  get viewBox() {
    return `${this.viewBoxX} ${this.viewBoxY} ${this.width} ${this.height}`;
  },
} as const;

// Export individual values for convenience
export const BASE_WIDTH = MAP_CONFIG.baseWidth;
export const BASE_HEIGHT = MAP_CONFIG.baseHeight;
export const ZOOM_LEVEL = MAP_CONFIG.zoomLevel;
export const WIDTH = MAP_CONFIG.width;
export const HEIGHT = MAP_CONFIG.height;
export const VIEWBOX_X = MAP_CONFIG.viewBoxX;
export const VIEWBOX_Y = MAP_CONFIG.viewBoxY;
export const VIEWBOX = MAP_CONFIG.viewBox;

// ============================================================================
// Geographic Configuration
// ============================================================================

/** Map center coordinates (Helsinki metropolitan area center) */
export const MAP_CENTER: [number, number] = [24.93, 60.17];

/** Map scale for d3-geo projection */
export const MAP_SCALE = 120000;

/** Extended metro area bounds for coordinate validation */
export const METRO_AREA_BOUNDS = {
  minLon: 23.5,
  maxLon: 26.5,
  minLat: 59.5,
  maxLat: 61.0,
} as const;

/** Bounding box for map clipping (used in shapefile processing) */
export const CLIP_BBOX: [number, number, number, number] = [24.5, 60.0, 25.3, 60.5];
