import initSqlJs, { type Database } from 'sql.js'
import type { Geometry, Position, Polygon, MultiPolygon } from 'geojson'

export interface Place {
  id: string
  name: string
  lat: number
  lon: number
  geometry: Geometry
}

// Helsinki area bounds in WGS84
const BOUNDS = {
  minLon: 24.0,
  maxLon: 25.5,
  minLat: 59.9,
  maxLat: 60.5,
}

function isValidRing(ring: Position[]): boolean {
  // Check if all coordinates in the ring are within reasonable WGS84 bounds
  return ring.every((coord) => {
    const lon = coord[0]
    const lat = coord[1]
    if (lon === undefined || lat === undefined) return false
    return lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon && lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat
  })
}

function cleanGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === 'Polygon') {
    const poly = geometry as Polygon
    const validRings = poly.coordinates.filter(isValidRing)
    if (validRings.length === 0) return null
    return { type: 'Polygon', coordinates: validRings }
  }

  if (geometry.type === 'MultiPolygon') {
    const multi = geometry as MultiPolygon
    const validPolygons = multi.coordinates
      .map((polygon) => polygon.filter(isValidRing))
      .filter((polygon) => polygon.length > 0)
    if (validPolygons.length === 0) return null
    if (validPolygons.length === 1 && validPolygons[0]) {
      return { type: 'Polygon', coordinates: validPolygons[0] }
    }
    return { type: 'MultiPolygon', coordinates: validPolygons }
  }

  return geometry
}

class DatabaseService {
  private db: Database | null = null
  private isInitialized = false

  async init(dbUrl: string = '/varikko.db') {
    if (this.isInitialized) return

    try {
      // Load the SQL.js WASM
      // Note: We expect sql-wasm.wasm to be available at the root or configured path.
      // If using default Vite setup, we might need to point to the correct location or let it resolve.
      // Usually passing `locateFile` helps if it's not in root.
      const SQL = await initSqlJs({
        locateFile: (file) => `/assets/${file}`,
      })

      const response = await fetch(dbUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch database: ${response.statusText}`)
      }

      const buffer = await response.arrayBuffer()
      this.db = new SQL.Database(new Uint8Array(buffer))
      this.isInitialized = true
      console.log('Database initialized successfully')
    } catch (error) {
      console.error('Failed to initialize database:', error)
      throw error
    }
  }

  getPlaces(): Place[] {
    if (!this.db) throw new Error('Database not initialized')

    // Select all places
    const stmt = this.db.prepare('SELECT id, name, lat, lon, geometry FROM places')
    const places: Place[] = []

    while (stmt.step()) {
      const row = stmt.getAsObject()
      const rawGeometry = JSON.parse(row.geometry as string) as Geometry
      const cleaned = cleanGeometry(rawGeometry)
      if (!cleaned) continue // Skip places with invalid geometry

      places.push({
        id: row.id as string,
        name: row.name as string,
        lat: row.lat as number,
        lon: row.lon as number,
        geometry: cleaned,
      })
    }
    stmt.free()
    return places
  }

  getRouteCosts(fromId: string, period: string): Map<string, number> {
    if (!this.db) throw new Error('Database not initialized')

    // We want to map to_id -> duration
    // Query routes where from_id matches
    const stmt = this.db.prepare('SELECT to_id, duration FROM routes WHERE from_id = $fromId AND time_period = $period')
    stmt.bind({ $fromId: fromId, $period: period })

    const costs = new Map<string, number>()

    while (stmt.step()) {
      const row = stmt.getAsObject()
      if (row.duration !== null) {
        costs.set(row.to_id as string, row.duration as number)
      }
    }
    stmt.free()
    return costs
  }
}

export const dbService = new DatabaseService()
