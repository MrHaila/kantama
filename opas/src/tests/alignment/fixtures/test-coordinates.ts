/**
 * Test coordinate fixtures for alignment validation
 *
 * These coordinates are used to verify that projection transformations
 * produce identical results across varikko (data generation) and opas (runtime).
 */

export interface TestCoordinate {
  readonly name: string
  readonly lat: number
  readonly lon: number
  readonly expectedSVG?: readonly [number, number]
}

/**
 * Known geographic coordinates with their expected SVG projections
 *
 * The map center should project to exactly [540, 360] (center of 1080x720 canvas).
 * Other coordinates don't have exact expected values but should be consistent
 * between varikko and opas projections.
 */
export const TEST_COORDINATES: readonly TestCoordinate[] = [
  {
    name: 'MapCenter',
    lat: 60.17,
    lon: 24.93,
    expectedSVG: [540, 360] as const,
  },
  {
    name: 'Helsinki',
    lat: 60.1699,
    lon: 24.9384,
  },
  {
    name: 'Espoo',
    lat: 60.2055,
    lon: 24.6559,
  },
  {
    name: 'Vantaa',
    lat: 60.2934,
    lon: 25.0378,
  },
  {
    name: 'NorthBound',
    lat: 60.5,
    lon: 24.93,
  },
  {
    name: 'SouthBound',
    lat: 60.0,
    lon: 24.93,
  },
  {
    name: 'EastBound',
    lat: 60.17,
    lon: 25.3,
  },
  {
    name: 'WestBound',
    lat: 60.17,
    lon: 24.5,
  },
] as const
