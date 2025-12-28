export interface ThemeColors {
  name: string
  background: string
  border: string
  title: string
  text: string
  timeBucketColors: string[]
}

export const themes: Record<string, ThemeColors> = {
  vintage: {
    name: 'Vintage',
    background: 'rgba(253, 251, 247, 0.95)',
    border: '#8B7355',
    title: '#2A4D69',
    text: '#333',
    timeBucketColors: [
      '#1b9e77', // Vibrant Green - 0-15min (Fastest/Good)
      '#66c2a5', // Light Green - 15-30min
      '#fc8d62', // Light Orange - 30-45min
      '#8da0cb', // Soft Blue - 45-60min
      '#4574b4', // Medium Blue - 60-75min
      '#1e3a8a', // Deep Blue - 75-90min+ (Slowest/Far)
    ],
  },
  dark: {
    name: 'Dark',
    background: 'rgba(42, 77, 105, 0.95)',
    border: '#2A9D8F',
    title: '#FDFBF7',
    text: '#FDFBF7',
    timeBucketColors: [
      '#1b9e77', // Vibrant Green - 0-15min (Fastest/Good)
      '#66c2a5', // Light Green - 15-30min
      '#fc8d62', // Light Orange - 30-45min
      '#8da0cb', // Soft Blue - 45-60min
      '#4574b4', // Medium Blue - 60-75min
      '#1e3a8a', // Deep Blue - 75-90min+ (Slowest/Far)
    ],
  },
  ocean: {
    name: 'Ocean',
    background: 'rgba(240, 248, 255, 0.95)',
    border: '#4682B4',
    title: '#1E3A5F',
    text: '#2C3E50',
    timeBucketColors: [
      '#1b9e77', // Vibrant Green - 0-15min (Fastest/Good)
      '#66c2a5', // Light Green - 15-30min
      '#fc8d62', // Light Orange - 30-45min
      '#8da0cb', // Soft Blue - 45-60min
      '#4574b4', // Medium Blue - 60-75min
      '#1e3a8a', // Deep Blue - 75-90min+ (Slowest/Far)
    ],
  },
}

export const defaultTheme = 'vintage'
