/**
 * Transport mode colors matching the map polylines
 */
export const modeColors: Record<string, string> = {
  WALK: '#8B7355',
  BICYCLE: '#00A651',
  BUS: '#007AC9',
  TRAM: '#00985F',
  SUBWAY: '#FF4200',
  FERRY: '#00B9E4',
  RAIL: '#8C4799',
}

/**
 * Get color for a transport mode
 */
export function getModeColor(mode: string): string {
  // Log a warning if an unknown mode is used
  if (!modeColors[mode.toUpperCase()]) {
    console.warn(`Unknown transport mode: ${mode}`)

    return '#666666'
  }

  return modeColors[mode.toUpperCase()] || '#666666'
}
