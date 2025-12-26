// Shared map configuration to keep layers perfectly aligned
export const MAP_CONFIG = {
  // Base dimensions
  baseWidth: 800,
  baseHeight: 800,

  // Current zoom level (1.0 = 100%, 1.2 = 20% zoom out)
  zoomLevel: 1.2,

  // Calculated dimensions
  get width() {
    return this.baseWidth * this.zoomLevel
  },

  get height() {
    return this.baseHeight * this.zoomLevel
  },

  // ViewBox offsets to keep bottom edge fixed while expanding
  get viewBoxX() {
    // Center horizontally when zooming out, then move 60px right
    return -(this.width - this.baseWidth) / 2 + 60
  },

  get viewBoxY() {
    // Keep bottom edge fixed by moving up more than we expand
    // Start with -120 offset (moved up from -140), then subtract additional expansion
    const baseOffset = -120
    const additionalExpansion = this.height - this.baseHeight
    return baseOffset - additionalExpansion
  },

  // Full viewBox string
  get viewBox() {
    return `${this.viewBoxX} ${this.viewBoxY} ${this.width} ${this.height}`
  },
} as const
