export interface ThemeColors {
  name: string
  background: string
  border: string
  title: string
  text: string
  decileColors: string[]
}

export const themes: Record<string, ThemeColors> = {
  vintage: {
    name: 'Vintage',
    background: 'rgba(253, 251, 247, 0.95)',
    border: '#8B7355',
    title: '#2A4D69',
    text: '#333',
    decileColors: [
      '#1a9850', // Dark Green - Fastest (Good)
      '#66bd63', // Medium Green
      '#a6d96a', // Light Green
      '#d9ef8b', // Very Light Green
      '#fee08b', // Yellow - Mid range
      '#fdae61', // Light Orange
      '#f46d43', // Orange
      '#d73027', // Red-Orange
      '#a50026', // Dark Red
      '#8b0000', // Very Dark Red - Slowest (Bad)
    ],
  },
  dark: {
    name: 'Dark',
    background: 'rgba(42, 77, 105, 0.95)',
    border: '#2A9D8F',
    title: '#FDFBF7',
    text: '#FDFBF7',
    decileColors: [
      '#1a9850', // Dark Green - Fastest (Good)
      '#66bd63', // Medium Green
      '#a6d96a', // Light Green
      '#d9ef8b', // Very Light Green
      '#fee08b', // Yellow - Mid range
      '#fdae61', // Light Orange
      '#f46d43', // Orange
      '#d73027', // Red-Orange
      '#a50026', // Dark Red
      '#8b0000', // Very Dark Red - Slowest (Bad)
    ],
  },
  ocean: {
    name: 'Ocean',
    background: 'rgba(240, 248, 255, 0.95)',
    border: '#4682B4',
    title: '#1E3A5F',
    text: '#2C3E50',
    decileColors: [
      '#1a9850', // Dark Green - Fastest (Good)
      '#66bd63', // Medium Green
      '#a6d96a', // Light Green
      '#d9ef8b', // Very Light Green
      '#fee08b', // Yellow - Mid range
      '#fdae61', // Light Orange
      '#f46d43', // Orange
      '#d73027', // Red-Orange
      '#a50026', // Dark Red
      '#8b0000', // Very Dark Red - Slowest (Bad)
    ],
  },
}

export const defaultTheme = 'vintage'
