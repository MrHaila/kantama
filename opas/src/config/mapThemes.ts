/**
 * Map layer theme definitions
 * Separated from backend (Varikko) to keep design opinions in frontend
 */

export type MapThemeName = 'morning' | 'evening' | 'midnight'
export type LayerId = 'water' | 'roads' | 'railways' | 'transit-M' | 'transit-E' | 'transit-N'

export interface LayerStyles {
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface WaterGradient {
  type: 'radial' | 'solid'
  // For radial gradients: [centerColor, edgeColor]
  // Radiates from map center outward
  colors?: [string, string]
  // For solid: just the fill color (from layers.water.fill)
}

export interface MapTheme {
  name: MapThemeName
  description: string
  layers: Record<LayerId, LayerStyles>
  timeBucketColors: string[]
  zoneBorderColor: string
  selectedZoneColor: string
  backgroundColor: string
  waterGradient: WaterGradient
}

export const mapThemes: Record<MapThemeName, MapTheme> = {
  morning: {
    name: 'morning',
    description: 'Bright daylight palette (08:30)',
    layers: {
      water: { fill: '#4a90e2' },
      'transit-M': { stroke: '#ff6b6b', strokeWidth: 1.0 },
      'transit-E': { stroke: '#d1d5db50', strokeWidth: 1.0 },
      'transit-N': { stroke: '#d1d5db50', strokeWidth: 1.0 },
      roads: { stroke: '#a8998a', strokeWidth: 0.4 },
      railways: { stroke: '#6b7280', strokeWidth: 0.8 },
    },
    timeBucketColors: [
      '#22c55e', // Green - 0-15min
      '#84cc16', // Lime - 15-30min
      '#eab308', // Yellow - 30-45min
      '#7dd3fc', // Light cyan - 45-60min
      '#38bdf8', // Sky - 60-75min
      '#0284c7', // Darker blue - 75-90min+
    ],
    zoneBorderColor: '#264653',
    selectedZoneColor: '#fef9c3', // Very light yellow (near white)
    backgroundColor: '#334155', // Neutral slate
    waterGradient: {
      type: 'radial',
      colors: ['#93c5fd', '#1e40af'], // Light center → darker edges
    },
  },
  evening: {
    name: 'evening',
    description: 'Warm transitional palette (17:30)',
    layers: {
      water: { fill: '#2a4d69' },
      'transit-M': { stroke: '#d1d5db50', strokeWidth: 1.0 },
      'transit-E': { stroke: '#ffd43b', strokeWidth: 1.0 },
      'transit-N': { stroke: '#d1d5db50', strokeWidth: 1.0 },
      roads: { stroke: '#8b7d6b', strokeWidth: 0.4 },
      railways: { stroke: '#57534e', strokeWidth: 0.8 },
    },
    timeBucketColors: [
      '#2dd4bf', // Teal - 0-15min
      '#a3e635', // Lime - 15-30min
      '#fbbf24', // Amber - 30-45min
      '#fb923c', // Orange - 45-60min
      '#f472b6', // Pink - 60-75min
      '#a855f7', // Purple - 75-90min+
    ],
    zoneBorderColor: '#264653',
    selectedZoneColor: '#fef3c7', // Light warm yellow (near white)
    backgroundColor: '#374151', // Neutral gray
    waterGradient: {
      type: 'radial',
      colors: ['#475569', '#1e293b'], // Lighter center → darker edges
    },
  },
  midnight: {
    name: 'midnight',
    description: 'Dark night palette (23:30)',
    layers: {
      water: { fill: '#0c1929' },
      'transit-M': { stroke: '#4b556350', strokeWidth: 1.0 },
      'transit-E': { stroke: '#4b556350', strokeWidth: 1.0 },
      'transit-N': { stroke: '#c4b5fd', strokeWidth: 1.0 },
      roads: { stroke: '#4a4a4a', strokeWidth: 0.5 },
      railways: { stroke: '#6b7280', strokeWidth: 0.9 },
    },
    timeBucketColors: [
      '#4ade80', // Bright green - 0-15min
      '#a3e635', // Lime - 15-30min
      '#facc15', // Bright yellow - 30-45min
      '#67e8f9', // Bright cyan - 45-60min
      '#22d3ee', // Cyan - 60-75min
      '#06b6d4', // Teal - 75-90min+
    ],
    zoneBorderColor: '#264653',
    selectedZoneColor: '#fffbeb', // Very light cream (near white)
    backgroundColor: '#1e293b', // Dark slate
    waterGradient: {
      type: 'solid', // Uniform dark blue at night
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

/**
 * Get time bucket colors for a theme
 */
export function getTimeBucketColors(themeName: MapThemeName): string[] {
  return mapThemes[themeName]?.timeBucketColors || mapThemes.morning.timeBucketColors
}

/**
 * Get zone border color for a theme
 */
export function getZoneBorderColor(themeName: MapThemeName): string {
  return mapThemes[themeName]?.zoneBorderColor || '#264653'
}

/**
 * Get water gradient for a theme
 */
export function getWaterGradient(themeName: MapThemeName): WaterGradient {
  return mapThemes[themeName]?.waterGradient || { type: 'solid' }
}

/**
 * Get selected zone color for a theme
 */
export function getSelectedZoneColor(themeName: MapThemeName): string {
  return mapThemes[themeName]?.selectedZoneColor || '#fbbf24'
}

/**
 * Get background color for a theme
 */
export function getBackgroundColor(themeName: MapThemeName): string {
  return mapThemes[themeName]?.backgroundColor || '#334155'
}
