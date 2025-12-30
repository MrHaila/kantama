/**
 * SVG parsing utilities for alignment tests
 *
 * Provides functions to parse SVG viewBox attributes and path data
 * to validate coordinate alignment without requiring browser rendering.
 */

export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Parse SVG viewBox string into structured data
 *
 * @param viewBoxStr - viewBox attribute value (e.g., "-20 -280 960 960")
 * @returns Parsed viewBox object
 */
export function parseViewBox(viewBoxStr: string): ViewBox {
  const parts = viewBoxStr.trim().split(/\s+/)
  if (parts.length !== 4) {
    throw new Error(`Invalid viewBox format: "${viewBoxStr}". Expected 4 values.`)
  }

  const numbers = parts.map(Number)

  if (numbers.some(isNaN)) {
    throw new Error(`Invalid viewBox values: "${viewBoxStr}". All values must be numbers.`)
  }

  const [x, y, width, height] = numbers

  return { x: x!, y: y!, width: width!, height: height! }
}

/**
 * Extract all coordinate pairs from an SVG path d attribute
 *
 * Supports M (moveto), L (lineto), C (cubic bezier), Q (quadratic bezier) commands.
 * Ignores Z (closepath) commands.
 *
 * @param pathD - SVG path d attribute value
 * @returns Array of [x, y] coordinate pairs
 */
export function extractPathCoordinates(pathD: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = []

  // Match all coordinate pairs in the path
  // SVG paths use commands like M, L, C, Q followed by coordinates
  // Remove command letters and split by whitespace/commas
  const normalized = pathD
    .replace(/[MLHVCSQTAZ]/gi, ' ') // Replace commands with space
    .replace(/,/g, ' ') // Replace commas with space
    .replace(/-/g, ' -') // Separate negative numbers
    .trim()

  const numbers = normalized.split(/\s+/).filter(Boolean).map(Number)

  // Extract coordinate pairs (x, y)
  for (let i = 0; i < numbers.length; i += 2) {
    if (i + 1 < numbers.length) {
      coordinates.push([numbers[i]!, numbers[i + 1]!])
    }
  }

  return coordinates
}

/**
 * Check if a coordinate is within viewBox bounds
 *
 * @param coord - [x, y] coordinate pair
 * @param viewBox - ViewBox bounds
 * @returns true if coordinate is within bounds
 */
export function isWithinBounds(coord: [number, number], viewBox: ViewBox): boolean {
  const [x, y] = coord
  return (
    x >= viewBox.x &&
    x <= viewBox.x + viewBox.width &&
    y >= viewBox.y &&
    y <= viewBox.y + viewBox.height
  )
}

/**
 * Extract viewBox attribute from SVG content string
 *
 * @param svgContent - SVG file content as string
 * @returns viewBox attribute value or null if not found
 */
export function extractViewBoxFromSVG(svgContent: string): string | null {
  const match = svgContent.match(/viewBox=["']([^"']+)["']/)
  return match?.[1] ?? null
}
