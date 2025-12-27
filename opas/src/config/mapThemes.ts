/**
 * Map layer theme definitions
 * Separated from backend (Varikko) to keep design opinions in frontend
 */

export type MapThemeName = 'vintage' | 'modern' | 'dark' | 'contrast' | 'yle'
export type LayerId = 'water' | 'roads' | 'railways' | 'ferries'

export interface LayerStyles {
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface MapTheme {
  name: MapThemeName
  description: string
  layers: Record<LayerId, LayerStyles>
}

export const mapThemes: Record<MapThemeName, MapTheme> = {
  vintage: {
    name: 'vintage',
    description: 'Classic vintage map aesthetic',
    layers: {
      water: { fill: '#2a4d69' },
      roads: { stroke: '#8b7355', strokeWidth: 0.5 },
      railways: { stroke: '#4a5568', strokeWidth: 1.2 },
      ferries: { stroke: '#87CEEB', strokeWidth: 1.0 },
    },
  },
  modern: {
    name: 'modern',
    description: 'Clean modern design',
    layers: {
      water: { fill: '#4a90e2' },
      roads: { stroke: '#666666', strokeWidth: 0.8 },
      railways: { stroke: '#2d3748', strokeWidth: 1.0 },
      ferries: { stroke: '#3182ce', strokeWidth: 1.2 },
    },
  },
  dark: {
    name: 'dark',
    description: 'Dark mode with high contrast',
    layers: {
      water: { fill: '#1a3a52' },
      roads: { stroke: '#d4af37', strokeWidth: 0.6 },
      railways: { stroke: '#9ca3af', strokeWidth: 1.2 },
      ferries: { stroke: '#60a5fa', strokeWidth: 1.0 },
    },
  },
  contrast: {
    name: 'contrast',
    description: 'Maximum contrast for accessibility',
    layers: {
      water: { fill: '#000000' },
      roads: { stroke: '#ff0000', strokeWidth: 1 },
      railways: { stroke: '#00ff00', strokeWidth: 1.2 },
      ferries: { stroke: '#ffff00', strokeWidth: 1.5 },
    },
  },
  yle: {
    name: 'yle',
    description: 'YLE weather map style',
    layers: {
      water: { fill: '#6b9bc3' },
      roads: { stroke: '#3d5a50', strokeWidth: 0.6 },
      railways: { stroke: '#5a5a5a', strokeWidth: 1.2 },
      ferries: { stroke: '#4169e1', strokeWidth: 1.0 },
    },
  },
}

/**
 * Get theme styles for a specific layer
 */
export function getLayerStyles(themeName: MapThemeName, layerId: LayerId): LayerStyles {
  return mapThemes[themeName]?.layers[layerId] || {}
}

/**
 * Get all available theme names
 */
export function getMapThemeNames(): MapThemeName[] {
  return Object.keys(mapThemes) as MapThemeName[]
}
