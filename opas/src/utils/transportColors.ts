/**
 * Transport mode colors matching the map polylines
 */
export const modeColors: Record<string, string> = {
  WALK: '#8B7355',
  BUS: '#007AC9',
  TRAM: '#00985F',
  METRO: '#FF6319',
  FERRY: '#00B9E4',
  RAIL: '#8C4799',
}

/**
 * Get color for a transport mode
 */
export function getModeColor(mode: string): string {
  return modeColors[mode.toUpperCase()] || modeColors[mode.toLowerCase()] || '#666666'
}
