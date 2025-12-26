import initSqlJs, { type Database } from 'sql.js'

export interface Place {
  id: string
  name: string
  lat: number              // Geometric centroid (for visualization)
  lon: number              // Geometric centroid (for visualization)
  svgPath: string
  routingLat?: number      // Address-based routing point (if geocoded)
  routingLon?: number      // Address-based routing point (if geocoded)
  routingSource?: string   // Source of routing point (e.g., "geocoded:postal code")
}

export interface Decile {
  id: number
  decile_number: number
  min_duration: number
  max_duration: number
  color_hex: string
  label: string
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

    const stmt = this.db.prepare(`
      SELECT
        id, name, lat, lon, svg_path,
        routing_lat, routing_lon, routing_source
      FROM places
    `)
    const places: Place[] = []

    while (stmt.step()) {
      const row = stmt.getAsObject()
      if (!row.svg_path) continue

      places.push({
        id: row.id as string,
        name: row.name as string,
        lat: row.lat as number,
        lon: row.lon as number,
        svgPath: row.svg_path as string,
        routingLat: row.routing_lat !== null ? (row.routing_lat as number) : undefined,
        routingLon: row.routing_lon !== null ? (row.routing_lon as number) : undefined,
        routingSource: row.routing_source !== null ? (row.routing_source as string) : undefined,
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

  getDeciles(): Decile[] {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT * FROM deciles ORDER BY decile_number ASC')
    const deciles: Decile[] = []

    while (stmt.step()) {
      const row = stmt.getAsObject()
      deciles.push({
        id: row.id as number,
        decile_number: row.decile_number as number,
        min_duration: row.min_duration as number,
        max_duration: row.max_duration as number,
        color_hex: row.color_hex as string,
        label: row.label as string,
      })
    }
    stmt.free()
    return deciles
  }
}

export const dbService = new DatabaseService()
