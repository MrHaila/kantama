import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { clipZoneWithWater } from '../../lib/coastline';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

describe('clipZoneWithWater', () => {
  // Mock data setup
  // Square zone from (0,0) to (10,10)
  const zoneGeometry: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  };

  // Water mask covering the right half: (5, -1) to (11, 11)
  const waterMask: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [5, -1],
          [11, -1],
          [11, 11],
          [5, 11],
          [5, -1],
        ],
      ],
    },
  };

  it('should remove water area from the zone and prevent land area regressions', () => {
    // 1. Validate original state: overlaps water
    const originalWaterPoint = turf.point([7.5, 5]);
    const originalLandPoint = turf.point([2.5, 5]);

    expect(turf.booleanPointInPolygon(originalWaterPoint, turf.feature(zoneGeometry))).toBe(true);
    expect(turf.booleanPointInPolygon(originalLandPoint, turf.feature(zoneGeometry))).toBe(true);

    // 2. Perform transformation
    const result = clipZoneWithWater(zoneGeometry, waterMask);

    expect(result).not.toBeNull();
    const resultFeature = turf.feature(result as Polygon | MultiPolygon);

    // 3. Validate result: water removed, land remains
    // Sample water point (was inside, should be outside)
    expect(turf.booleanPointInPolygon(originalWaterPoint, resultFeature)).toBe(false);

    // Sample land point (was inside, should still be inside - NO REGRESSION)
    expect(turf.booleanPointInPolygon(originalLandPoint, resultFeature)).toBe(true);

    // Sample another land point further from the cut line to be safe
    const safeLandPoint = turf.point([1, 1]);
    expect(turf.booleanPointInPolygon(safeLandPoint, resultFeature)).toBe(true);

    // 4. Check area reduction is reasonable
    const originalArea = turf.area(turf.feature(zoneGeometry));
    const resultArea = turf.area(resultFeature);
    expect(resultArea).toBeLessThan(originalArea);
    expect(resultArea).toBeCloseTo(originalArea / 2, -2); // Roughly half since we cut at x=5
  });

  it('should handle zones entirely in water', () => {
    const seaZone: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [6, 2],
          [9, 2],
          [9, 8],
          [6, 8],
          [6, 2],
        ],
      ],
    };

    const result = clipZoneWithWater(seaZone, waterMask);
    // If entirely subtracted, turf.difference might return null
    expect(result).toBeNull();
  });

  it('should handle zones entirely on land', () => {
    const landZone: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [1, 1],
          [4, 1],
          [4, 4],
          [1, 4],
          [1, 1],
        ],
      ],
    };

    const result = clipZoneWithWater(landZone, waterMask);
    expect(result).not.toBeNull();
    // Should be equivalent to original
    expect(turf.area(turf.feature(result as Polygon))).toBeCloseTo(
      turf.area(turf.feature(landZone))
    );
  });

  it('should handle MultiPolygon geometries', () => {
    const multiZone: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [1, 1],
            [4, 1],
            [4, 4],
            [1, 4],
            [1, 1],
          ],
        ], // Land island
        [
          [
            [6, 1],
            [9, 1],
            [9, 4],
            [6, 4],
            [6, 1],
          ],
        ], // Water island
      ],
    };

    const result = clipZoneWithWater(multiZone, waterMask);
    expect(result).not.toBeNull();

    // Result should only contain the land island
    const landPoint = turf.point([2, 2]);
    const waterPoint = turf.point([7, 2]);

    const resultFeature = turf.feature(result as Polygon | MultiPolygon);
    expect(turf.booleanPointInPolygon(landPoint, resultFeature)).toBe(true);
    expect(turf.booleanPointInPolygon(waterPoint, resultFeature)).toBe(false);
  });
});
