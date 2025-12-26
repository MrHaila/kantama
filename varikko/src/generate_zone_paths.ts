import * as d3 from 'd3-geo'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { Geometry, Position, Polygon, MultiPolygon } from 'geojson'

const DB_PATH = path.join(__dirname, '../../opas/public/varikko.db')
const OUTPUT_FILE = path.join(__dirname, '../../opas/public/zone_paths.json')

// SVG dimensions - must match generate_svg.ts and MAP_CONFIG
const zoomLevel = 1.2
const baseWidth = 800
const baseHeight = 800
const width = baseWidth * zoomLevel
const height = baseHeight * zoomLevel

// Create projection function (returns [x, y] from [lon, lat])
function createProjection() {
  return d3
    .geoMercator()
    .center([24.93, 60.17])
    .scale(120000)
    .translate([width / 2, height / 2])
}

interface ZonePath {
  id: string
  name: string
  path: string
}

// Manually project coordinates to avoid D3's spherical clipping artifacts
function projectGeometry(
  geometry: Geometry,
  proj: d3.GeoProjection
): Geometry | null {
  const projectRing = (ring: Position[]): Position[] => {
    return ring.map((coord) => {
      const projected = proj(coord as [number, number])
      return projected ? [projected[0], projected[1]] : coord
    })
  }

  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon
    return {
      type: 'Polygon',
      coordinates: poly.coordinates.map(projectRing),
    }
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon
    return {
      type: 'MultiPolygon',
      coordinates: multi.coordinates.map((polygon) => polygon.map(projectRing)),
    }
  }

  return null
}

function generateZonePaths() {
  console.log('Generating zone SVG paths...')

  if (!fs.existsSync(DB_PATH)) {
    console.error('Database not found. Run pnpm fetch:zones first.')
    process.exit(1)
  }

  const db = new Database(DB_PATH, { readonly: true })
  const projection = createProjection()
  // Use geoPath without projection - we'll project coordinates manually
  const pathGenerator = d3.geoPath()

  const zones: ZonePath[] = []

  const stmt = db.prepare('SELECT id, name, geometry FROM places')
  for (const row of stmt.iterate() as Iterable<{ id: string; name: string; geometry: string }>) {
    const geometry: Geometry = JSON.parse(row.geometry)

    // Project coordinates manually to avoid D3's clipping
    const projectedGeometry = projectGeometry(geometry, projection)
    if (!projectedGeometry) continue

    const svgPath = pathGenerator(projectedGeometry)
    if (svgPath) {
      zones.push({
        id: row.id,
        name: row.name,
        path: svgPath,
      })
    }
  }

  db.close()

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(zones, null, 2), 'utf-8')

  console.log(`Generated ${zones.length} zone paths`)
  console.log(`Output: ${OUTPUT_FILE}`)

  const stats = fs.statSync(OUTPUT_FILE)
  console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`)
}

generateZonePaths()
