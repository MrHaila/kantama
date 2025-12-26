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
      '#E76F51', // Deep Orange - Fastest
      '#F4A261', // Light Orange
      '#F9C74F', // Yellow
      '#90BE6D', // Light Green
      '#43AA8B', // Teal
      '#277DA1', // Blue
      '#4D5061', // Dark Blue-Gray
      '#6C5B7B', // Purple
      '#8B5A8C', // Dark Purple
      '#355C7D', // Very Dark Blue - Slowest
    ],
  },
  dark: {
    name: 'Dark',
    background: 'rgba(42, 77, 105, 0.95)',
    border: '#2A9D8F',
    title: '#FDFBF7',
    text: '#FDFBF7',
    decileColors: [
      '#FF6B6B', // Light Red - Fastest
      '#FFA07A', // Light Salmon
      '#FFD700', // Gold
      '#98D8C8', // Mint
      '#6BB6D6', // Sky Blue
      '#4A90E2', // Blue
      '#5A67D8', // Indigo
      '#7048E8', // Purple
      '#9F7AEA', // Light Purple
      '#553C9A', // Dark Purple - Slowest
    ],
  },
  ocean: {
    name: 'Ocean',
    background: 'rgba(240, 248, 255, 0.95)',
    border: '#4682B4',
    title: '#191970',
    text: '#2F4F4F',
    decileColors: [
      '#00CED1', // Dark Turquoise - Fastest
      '#48D1CC', // Medium Turquoise
      '#40E0D0', // Turquoise
      '#00BFFF', // Deep Sky Blue
      '#1E90FF', // Dodger Blue
      '#4169E1', // Royal Blue
      '#0000CD', // Medium Blue
      '#00008B', // Dark Blue
      '#191970', // Midnight Blue
      '#0F0F3D', // Very Dark Blue - Slowest
    ],
  },
}

export const defaultTheme = 'vintage'
