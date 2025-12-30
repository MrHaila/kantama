/**
 * Projection utilities for alignment tests
 *
 * Provides functions to create D3 projections and compare their outputs
 * to validate coordinate transformation consistency.
 */

import type { GeoProjection } from 'd3-geo'
import { geoMercator } from 'd3-geo'

export interface ProjectionConfig {
  center: [number, number]
  scale: number
  width: number
  height: number
}

export interface ProjectionComparison {
  testPoint: string
  lat: number
  lon: number
  projection1: [number, number] | null
  projection2: [number, number] | null
  diff: number
  aligned: boolean
}

export interface AlignmentReport {
  aligned: boolean
  maxDiff: number
  failures: ProjectionComparison[]
  allResults: ProjectionComparison[]
}

/**
 * Create a D3 Mercator projection with the given configuration
 *
 * @param config - Projection configuration (center, scale, width, height)
 * @returns Configured D3 GeoProjection
 */
export function createTestProjection(config: ProjectionConfig): GeoProjection {
  return geoMercator()
    .center(config.center)
    .scale(config.scale)
    .translate([config.width / 2, config.height / 2])
}

/**
 * Project a lat/lon coordinate to SVG coordinates
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @param projection - D3 GeoProjection
 * @returns [x, y] SVG coordinates or null if projection fails
 */
export function projectCoordinate(
  lat: number,
  lon: number,
  projection: GeoProjection
): [number, number] | null {
  return projection([lon, lat])
}

/**
 * Calculate distance between two points
 *
 * @param p1 - First point [x, y]
 * @param p2 - Second point [x, y]
 * @returns Euclidean distance
 */
function distance(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0]
  const dy = p1[1] - p2[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Compare two projections across test coordinates
 *
 * Tests whether both projections produce identical (within tolerance) results
 * for the same input coordinates.
 *
 * @param p1 - First projection
 * @param p2 - Second projection
 * @param testCoords - Array of {name, lat, lon} test coordinates
 * @param tolerance - Maximum allowed distance difference (default: 0.01px)
 * @returns Alignment report with detailed results
 */
export function compareProjections(
  p1: GeoProjection,
  p2: GeoProjection,
  testCoords: Array<{ name: string; lat: number; lon: number }>,
  tolerance = 0.01
): AlignmentReport {
  const results: ProjectionComparison[] = []
  let maxDiff = 0

  for (const coord of testCoords) {
    const proj1 = projectCoordinate(coord.lat, coord.lon, p1)
    const proj2 = projectCoordinate(coord.lat, coord.lon, p2)

    let diff = 0
    let aligned = true

    if (proj1 && proj2) {
      diff = distance(proj1, proj2)
      aligned = diff <= tolerance
      maxDiff = Math.max(maxDiff, diff)
    } else if (proj1 !== proj2) {
      // One succeeded, one failed - definitely not aligned
      aligned = false
      diff = Infinity
      maxDiff = Infinity
    }

    results.push({
      testPoint: coord.name,
      lat: coord.lat,
      lon: coord.lon,
      projection1: proj1,
      projection2: proj2,
      diff,
      aligned,
    })
  }

  const failures = results.filter((r) => !r.aligned)

  return {
    aligned: failures.length === 0,
    maxDiff,
    failures,
    allResults: results,
  }
}

/**
 * Verify a projection produces expected output for known coordinates
 *
 * @param projection - D3 GeoProjection to test
 * @param expectedCoord - {name, lat, lon, expectedSVG} coordinate with expected projection
 * @param tolerance - Maximum allowed distance difference (default: 0.01px)
 * @returns true if projection matches expected output within tolerance
 */
export function verifyProjection(
  projection: GeoProjection,
  expectedCoord: {
    name: string
    lat: number
    lon: number
    expectedSVG: readonly [number, number]
  },
  tolerance = 0.01
): { matched: boolean; actual: [number, number] | null; expected: readonly [number, number]; diff: number } {
  const actual = projectCoordinate(expectedCoord.lat, expectedCoord.lon, projection)

  if (!actual) {
    return {
      matched: false,
      actual: null,
      expected: expectedCoord.expectedSVG,
      diff: Infinity,
    }
  }

  const diff = distance(actual, expectedCoord.expectedSVG as [number, number])
  const matched = diff <= tolerance

  return {
    matched,
    actual,
    expected: expectedCoord.expectedSVG,
    diff,
  }
}
