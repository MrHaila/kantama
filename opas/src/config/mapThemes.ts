/**
 * Map layer theme definitions
 * Separated from backend (Varikko) to keep design opinions in frontend
 */

export type MapThemeName = 'morning' | 'evening' | 'midnight'
export type LayerId = 'water' | 'roads' | 'railways' | 'ferries' | 'transit-M' | 'transit-E' | 'transit-N'

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
  morning: {
    name: 'morning',
    description: 'Bright daylight palette (08:30)',
    layers: {
      water: { fill: '#4a90e2' },
      'transit-M': { stroke: '#e85d75', strokeWidth: 1.0 },
      'transit-E': { stroke: '#cccccc', strokeWidth: 1.0 },
      'transit-N': { stroke: '#cccccc', strokeWidth: 1.0 },
      roads: { stroke: '#8b7355', strokeWidth: 0.5 },
      railways: { stroke: '#4a5568', strokeWidth: 1.2 },
      ferries: { stroke: '#3182ce', strokeWidth: 1.0 },
    },
  },
  evening: {
    name: 'evening',
    description: 'Warm transitional palette (17:30)',
    layers: {
      water: { fill: '#2a4d69' },
      'transit-M': { stroke: '#cccccc', strokeWidth: 1.0 },
      'transit-E': { stroke: '#f4a261', strokeWidth: 1.0 },
      'transit-N': { stroke: '#cccccc', strokeWidth: 1.0 },
      roads: { stroke: '#a67c52', strokeWidth: 0.5 },
      railways: { stroke: '#5a5568', strokeWidth: 1.2 },
      ferries: { stroke: '#87CEEB', strokeWidth: 1.0 },
    },
  },
  midnight: {
    name: 'midnight',
    description: 'Dark night palette (23:30)',
    layers: {
      water: { fill: '#1a3a52' },
      'transit-M': { stroke: '#cccccc', strokeWidth: 1.0 },
      'transit-E': { stroke: '#cccccc', strokeWidth: 1.0 },
      'transit-N': { stroke: '#a78bfa', strokeWidth: 1.0 },
      roads: { stroke: '#9b8b6b', strokeWidth: 0.6 },
      railways: { stroke: '#9ca3af', strokeWidth: 1.2 },
      ferries: { stroke: '#87CEEB', strokeWidth: 1.0 },
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
