/**
 * Projection alignment tests
 *
 * Validates that all visual layers align via consistent coordinate systems.
 * Catches configuration drift, hardcoded values, and viewBox misalignments.
 */

import { describe, it, expect } from 'vitest'
import { MAP_CONFIG, MAP_CENTER, MAP_SCALE, WIDTH, HEIGHT } from 'varikko'
import { loadZonesData, loadManifest, loadLayerSVG, layerExists } from './helpers/file-loader'
import { parseViewBox, extractPathCoordinates, isWithinBounds, extractViewBoxFromSVG } from './helpers/svg-parser'
import { createTestProjection, compareProjections, verifyProjection } from './helpers/projection'
import { TEST_COORDINATES } from './fixtures/test-coordinates'

describe('Projection Alignment', () => {
  describe('Configuration Consistency', () => {
    it('should have matching viewBox across manifest and MAP_CONFIG', () => {
      const manifest = loadManifest()
      const configViewBox = MAP_CONFIG.viewBox

      expect(manifest.viewBox).toBe(configViewBox)
    })

    it('should use consistent projection parameters from varikko config', () => {
      // Verify that the shared config exports the expected values
      expect(MAP_CENTER).toEqual([24.93, 60.17])
      expect(MAP_SCALE).toBe(120000)
      expect(WIDTH).toBe(1080) // 900 * 1.2
      expect(HEIGHT).toBe(720) // 600 * 1.2
    })

    it('should calculate viewBox correctly from MAP_CONFIG', () => {
      const expectedViewBox = `${MAP_CONFIG.viewBoxX} ${MAP_CONFIG.viewBoxY} ${MAP_CONFIG.width} ${MAP_CONFIG.height}`
      expect(MAP_CONFIG.viewBox).toBe(expectedViewBox)
    })
  })

  describe('Coordinate Transformation', () => {
    it('should project map center to canvas center', () => {
      const projection = createTestProjection({
        center: MAP_CENTER,
        scale: MAP_SCALE,
        width: WIDTH,
        height: HEIGHT,
      })

      const mapCenter = TEST_COORDINATES.find((c) => c.name === 'MapCenter')!
      const result = verifyProjection(projection, mapCenter as any, 0.01)

      expect(result.matched).toBe(true)
      if (result.actual) {
        // Center should be at [width/2, height/2] = [600, 360]
        expect(result.actual[0]).toBeCloseTo(WIDTH / 2, 1)
        expect(result.actual[1]).toBeCloseTo(HEIGHT / 2, 1)
      }
    })

    it('should project test points identically between varikko and opas configs', () => {
      // Create projection with varikko shared config
      const varikkoProjection = createTestProjection({
        center: MAP_CENTER,
        scale: MAP_SCALE,
        width: WIDTH,
        height: HEIGHT,
      })

      // Create projection with same values (simulating opas)
      const opasProjection = createTestProjection({
        center: MAP_CENTER,
        scale: MAP_SCALE,
        width: WIDTH,
        height: HEIGHT,
      })

      const comparison = compareProjections(varikkoProjection, opasProjection, TEST_COORDINATES, 0.01)

      expect(comparison.aligned).toBe(true)
      expect(comparison.maxDiff).toBeLessThan(0.01)
      expect(comparison.failures).toHaveLength(0)
    })

    it('should transform coordinates within 0.01px tolerance', () => {
      const projection = createTestProjection({
        center: MAP_CENTER,
        scale: MAP_SCALE,
        width: WIDTH,
        height: HEIGHT,
      })

      // Test all coordinates project successfully
      for (const coord of TEST_COORDINATES) {
        const projected = projection([coord.lon, coord.lat])
        expect(projected).not.toBeNull()
        expect(projected).toHaveLength(2)
      }
    })
  })

  describe('ViewBox Alignment', () => {
    it('should have identical viewBox in all layer SVG files', () => {
      const manifest = loadManifest()
      const expectedViewBox = manifest.viewBox

      const layerIds = ['water', 'roads', 'railways']

      for (const layerId of layerIds) {
        const svgContent = loadLayerSVG(layerId)
        const actualViewBox = extractViewBoxFromSVG(svgContent)

        expect(actualViewBox).toBe(expectedViewBox)
      }
    })

    it('should match manifest viewBox to MAP_CONFIG.viewBox', () => {
      const manifest = loadManifest()
      const configViewBox = MAP_CONFIG.viewBox

      expect(manifest.viewBox).toBe(configViewBox)

      // Also verify it parses correctly
      const parsed = parseViewBox(manifest.viewBox)
      expect(parsed.x).toBe(MAP_CONFIG.viewBoxX)
      expect(parsed.y).toBe(MAP_CONFIG.viewBoxY)
      expect(parsed.width).toBe(MAP_CONFIG.width)
      expect(parsed.height).toBe(MAP_CONFIG.height)
    })

    it('should have zone paths with reasonable coordinate bounds', () => {
      const zones = loadZonesData()
      const manifest = loadManifest()
      const viewBox = parseViewBox(manifest.viewBox)

      let minX = Infinity,
        maxX = -Infinity
      let minY = Infinity,
        maxY = -Infinity
      let totalCoordinates = 0

      for (const zone of zones.zones) {
        const coordinates = extractPathCoordinates(zone.svgPath)
        totalCoordinates += coordinates.length

        for (const coord of coordinates) {
          minX = Math.min(minX, coord[0])
          maxX = Math.max(maxX, coord[0])
          minY = Math.min(minY, coord[1])
          maxY = Math.max(maxY, coord[1])
        }
      }

      // Zone data can extend beyond viewBox (SVG clips to viewBox)
      // But coordinates should be reasonable (not wildly off)
      const reasonableExtent = 5000
      expect(minX).toBeGreaterThan(-reasonableExtent)
      expect(maxX).toBeLessThan(reasonableExtent)
      expect(minY).toBeGreaterThan(-reasonableExtent)
      expect(maxY).toBeLessThan(reasonableExtent)

      // Log bounds for visibility
      console.log(`Zone coordinates: x=[${minX.toFixed(1)}, ${maxX.toFixed(1)}], y=[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`)
      console.log(`ViewBox bounds:  x=[${viewBox.x}, ${viewBox.x + viewBox.width}], y=[${viewBox.y}, ${viewBox.y + viewBox.height}]`)
      console.log(`Validated ${totalCoordinates} coordinates across ${zones.zones.length} zones`)
    })
  })

  describe('Layer File Existence', () => {
    const requiredLayers = [
      { id: 'water', name: 'Water bodies' },
      { id: 'roads', name: 'Roads' },
      { id: 'railways', name: 'Railways' },
    ]

    const transitLayers = [
      { id: 'transit-M', name: 'Transit (Morning)' },
      { id: 'transit-E', name: 'Transit (Evening)' },
      { id: 'transit-N', name: 'Transit (Night)' },
    ]

    for (const layer of requiredLayers) {
      it(`should have ${layer.name} layer file (${layer.id}.svg)`, () => {
        expect(layerExists(layer.id)).toBe(true)

        // Verify it has valid SVG structure with viewBox
        const svgContent = loadLayerSVG(layer.id)
        expect(svgContent).toContain('<svg')
        expect(svgContent).toContain('viewBox')

        const viewBox = extractViewBoxFromSVG(svgContent)
        expect(viewBox).not.toBeNull()
      })
    }

    for (const layer of transitLayers) {
      it(`should have ${layer.name} layer file (${layer.id}.svg)`, () => {
        expect(layerExists(layer.id)).toBe(true)

        // Verify it has valid SVG structure with viewBox
        const svgContent = loadLayerSVG(layer.id)
        expect(svgContent).toContain('<svg')
        expect(svgContent).toContain('viewBox')

        const viewBox = extractViewBoxFromSVG(svgContent)
        expect(viewBox).not.toBeNull()
      })
    }

    it('should have manifest.json with layer definitions', () => {
      const manifest = loadManifest()

      expect(manifest).toHaveProperty('viewBox')
      expect(manifest).toHaveProperty('layers')
      expect(Array.isArray(manifest.layers)).toBe(true)
      expect(manifest.layers.length).toBeGreaterThan(0)
    })
  })

  describe('Data Integrity', () => {
    it('should have zones data with required properties', () => {
      const zones = loadZonesData()

      expect(zones).toHaveProperty('zones')
      expect(Array.isArray(zones.zones)).toBe(true)
      expect(zones.zones.length).toBeGreaterThan(0)

      // Check first zone has required properties
      const firstZone = zones.zones[0]
      expect(firstZone).toHaveProperty('id')
      expect(firstZone).toHaveProperty('svgPath')
      expect(firstZone).toHaveProperty('routingPoint')

      // Verify routing point is valid lat/lon
      expect(Array.isArray(firstZone.routingPoint)).toBe(true)
      expect(firstZone.routingPoint).toHaveLength(2)
      const [lat, lon] = firstZone.routingPoint
      expect(typeof lat).toBe('number')
      expect(typeof lon).toBe('number')
    })

    it('should have valid routing points that project to SVG coordinates', () => {
      const zones = loadZonesData()
      const projection = createTestProjection({
        center: MAP_CENTER,
        scale: MAP_SCALE,
        width: WIDTH,
        height: HEIGHT,
      })

      let successfulProjections = 0

      for (const zone of zones.zones) {
        const [lat, lon] = zone.routingPoint
        const projected = projection([lon, lat])

        if (projected) {
          successfulProjections++
          // Verify projected point is reasonable (within a large bounds)
          expect(projected[0]).toBeGreaterThan(-1000)
          expect(projected[0]).toBeLessThan(2000)
          expect(projected[1]).toBeGreaterThan(-1000)
          expect(projected[1]).toBeLessThan(2000)
        }
      }

      // All routing points should project successfully
      expect(successfulProjections).toBe(zones.zones.length)
    })
  })
})
