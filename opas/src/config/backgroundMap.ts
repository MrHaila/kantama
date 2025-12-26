// Configuration for background map styling
export interface BackgroundMapConfig {
  waterColor: string
  roadColor: string
  backgroundColor: string
  roadWidth: number
}

// Vintage color scheme
export const vintageScheme: BackgroundMapConfig = {
  waterColor: '#2A4D69', // Deep blue
  roadColor: '#8B7355', // Sepia brown
  backgroundColor: '#FDFBF7', // Vintage cream
  roadWidth: 0.5,
}

// Alternative schemes can be added here
export const modernScheme: BackgroundMapConfig = {
  waterColor: '#4A90E2', // Bright blue
  roadColor: '#666666', // Gray
  backgroundColor: '#FFFFFF', // White
  roadWidth: 0.8,
}

export const defaultConfig = vintageScheme
