# Varikko Data Pipeline Module

## Purpose

This module serves as the **Data Pipeline** for Kantama. It provides a unified TUI (Terminal User Interface) and CLI for fetching geospatial zone data, calculating routes and travel times using the OTP (OpenTripPlanner) instance, and writing data directly to `opas/public/data/` in optimized formats (JSON + MessagePack).

## Architecture

Varikko is built with a clean separation of concerns:

```
varikko/
├── src/
│   ├── main.ts              # Entry point (TUI)
│   ├── cli.ts               # CLI parser (Commander)
│   ├── lib/                 # Pure business logic
│   │   ├── datastore.ts     # File-based data operations
│   │   ├── zones.ts         # Zone fetching (multi-city support)
│   │   ├── geocoding.ts     # Geocoding logic
│   │   ├── routing.ts       # Route calculation
│   │   ├── clearing.ts      # Data clearing
│   │   ├── time-buckets.ts  # Time bucket calculation
│   │   ├── maps.ts          # Map processing
│   │   ├── types.ts         # Type definitions
│   │   ├── city-fetchers.ts # City-specific zone fetchers
│   │   ├── events.ts        # Progress event system
│   │   └── gml-parser.ts    # GML XML parser for Espoo
│   ├── shared/              # Shared types with opas
│   │   ├── types.ts         # Data contract types
│   │   ├── config.ts        # Shared configuration
│   │   └── index.ts         # Public exports
│   └── tui/                 # Interactive UI
│       ├── app.tsx          # Root component
│       ├── dashboard.tsx    # Main menu
│       └── screens/         # Workflow screens
├── data/                    # Shapefiles
└── plans/                   # Development docs
```

## Data Model (File-Based)

Data is written directly to `opas/public/data/` as the single source of truth:

### File Structure

```
opas/public/data/
├── zones.json           # Zone metadata + time buckets
├── pipeline.json        # Pipeline execution state
├── manifest.json        # Data summary for frontend
└── routes/              # Per-zone route files (MessagePack)
    ├── {zoneId}-M.msgpack       # Morning routes (WALK)
    ├── {zoneId}-E.msgpack       # Evening routes (WALK)
    ├── {zoneId}-N.msgpack       # Midnight routes (WALK)
    ├── {zoneId}-M-bicycle.msgpack  # Morning routes (BICYCLE)
    └── ...
```

### Data Formats

**zones.json** (human-readable):
```typescript
{
  version: 1,
  timeBuckets: TimeBucket[],  // Color distribution for heatmap
  zones: Zone[]               // Zone metadata
}

interface Zone {
  id: string                  // e.g., "HEL-101", "VAN-51"
  name: string                // Finnish name
  city: string                // Helsinki, Vantaa, Espoo
  svgPath: string            // Pre-rendered SVG path
  routingPoint: [lat, lon]   // Geocoded routing coordinates
}

interface TimeBucket {
  number: number             // 0-5
  min: number                // Min duration (seconds)
  max: number                // Max duration (seconds)
  color: string              // Hex color
  label: string              // "8-15 min"
}
```

**routes/{zoneId}-{period}.msgpack** (compact binary):
```typescript
interface ZoneRoutesData {
  f: string                   // fromId
  p: string                   // period: "M", "E", "N"
  m?: TransportMode          // mode: "WALK" or "BICYCLE"
  r: CompactRoute[]          // all routes from this zone
}

interface CompactRoute {
  i: string                   // toId
  d: number | null           // duration (seconds)
  t: number | null           // transfers
  s: RouteStatus             // 0=OK, 1=NO_ROUTE, 2=ERROR, 3=PENDING
  l?: CompactLeg[]           // journey legs
}
```

**pipeline.json** (execution metadata):
```typescript
interface PipelineState {
  lastFetch?: {
    timestamp: string
    zoneCount: number
    cities: string[]
    filteringStats: {...}
  }
  lastGeocoding?: {
    timestamp: string
    processed: number
    successful: number
    errors: Array<{zoneId, error}>
  }
  lastRouteCalculation?: {
    timestamp: string
    periods: string[]
    OK: number
    NO_ROUTE: number
    ERROR: number
  }
}
```

## Usage

### Interactive Mode

```bash
pnpm dev
```

Launches the TUI with keyboard-driven navigation:

- **1-6**: Quick select workflows
- **↑/↓ or j/k**: Navigate menu
- **Enter**: Execute workflow
- **t**: Toggle test mode
- **?**: Help screen
- **q**: Quit

## Workflows

### 1. Fetch Zones

- **Multi-City Mode**: Fetches administrative zones from Helsinki, Vantaa, and Espoo
  - Helsinki: osa-alue (sub-regions) - 137 zones

  - Vantaa: kaupunginosa (districts) - 52 zones

  - Espoo: tilastollinen alue (statistical areas) - 121 zones

- **Mixed Granularity**: Uses finest available administrative level for each city

- Calculates geometric centroids

- Pre-renders SVG paths for visualization

- Pre-fills routes table with PENDING status

- **Backward Compatibility**: Original postal code fetching preserved

### 2. Geocode Zones (Optional)

- Resolves street addresses for better routing points

- Uses city-aware geocoding: "Zone Name, City"

- Supports Swedish names for bilingual areas

- Falls back to geometric centroids if geocoding fails

- Uses Digitransit API with rate limiting

### 3. Build Routes

- Calculates transit routes via OTP

- Three time periods: MORNING (08:30), EVENING (17:30), MIDNIGHT (23:30)

- Supports both local and remote OTP instances

- Parallel processing with configurable concurrency

### 4. Clear Data

- Selective clearing: routes, zones, pipeline state, time buckets

- Confirmation prompt for safety

- Deletes files from `opas/public/data/`

### 5. Calculate Time Buckets

- Generates heatmap color distribution based on actual route durations

- 6 equal quantiles with vintage color palette

- Stores in `zones.json` timeBuckets array

### 6. Process Maps

- Converts shapefiles to TopoJSON

- Generates pre-rendered SVG with projection

- Water and road layers for background visualization

## Environment Variables

```bash
# OTP Configuration
OTP_URL=http://localhost:8080
DIGITRANSIT_API_KEY=your_api_key
HSL_API_KEY=your_api_key

# Data output directory (default: ../opas/public/data)
DATA_DIR=/path/to/data

# Map output paths
TOPOJSON_OUTPUT=/path/to/background_map.json
SVG_OUTPUT=/path/to/background_map.svg
```

Note: Data is written directly to `opas/public/data/` by default. Frontend reads from the same location.

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm dev

# Run tests
pnpm test
pnpm test:ui
pnpm test:coverage

# Lint
pnpm lint

# Build for production
pnpm build

# Clean build artifacts
pnpm clean
```

## Multi-City Zoning Architecture

### City Fetcher Pattern

The system uses a modular `CityFetcher` interface to handle city-specific data sources:

```typescript
interface CityFetcher {
  cityCode: CityCode;
  cityName: string;
  fetchFeatures(): Promise<Feature[]>;
  parseFeature(feature: Feature): StandardZone;
}
```

### Data Sources

- **Helsinki**: `https://kartta.hel.fi/ws/geoserver/avoindata/wfs`
  - Layer: `avoindata:Maavesi_osa_alueet`
  - Format: GeoJSON
  - Properties: `tunnus`, `nimi_fi`, `nimi_se`

- **Vantaa**: `https://gis.vantaa.fi/geoserver/wfs`
  - Layer: `indeksit:kaupunginosat`
  - Format: GeoJSON
  - Properties: `kosanimi`, `kosa_ruotsiksi`

- **Espoo**: `https://kartat.espoo.fi/teklaogcweb/wfs.ashx`
  - Layer: `kanta:TilastollinenAlue`
  - Format: GML XML (requires parsing)
  - Coordinate System: EPSG:3879 (converted to EPSG:4326)
  - Properties: `tunnus`, `nimi`, `tyyppi`

### Zone ID Format

- Format: `{CITY_CODE}-{ORIGINAL_ID}`
- Examples: `HEL-101` (Vilhonvuori), `VAN-51` (Ylästö), `ESP-1` (Kunnarla)
- Enables easy identification and filtering by city

## Patterns

1. **Event-Driven Progress**: Business logic emits events for real-time UI updates
2. **Flexible Filtering**: All workflows support --limit and --zones for quick testing
3. **Idempotency**: Operations pick up where they left off (PENDING routes)
4. **Type Safety**: Full TypeScript coverage with strict mode
5. **File-Based Storage**: Direct writes to `opas/public/data/` - single source of truth
6. **Multi-Period Support**: Routes calculated for different times of day
7. **Multi-Transport Modes**: Supports WALK and BICYCLE routing
8. **Compact Binary Format**: MessagePack for efficient route storage
9. **Multi-City Support**: Modular fetcher pattern for different administrative levels
10. **Partial Success**: Continues processing even if some cities fail
11. **Atomic Writes**: Temp files + rename for crash safety
12. **Shared Types**: Contract types in `src/shared/` used by both varikko and opas

## Known Requirements

1. **OTP Instance**: Local OTP needs Docker container running, or use remote Digitransit API
2. **API Keys**: Geocoding and remote OTP require API keys (optional)
3. **Large Dataset**: Full route calculation (310 zones) takes several hours
4. **Terminal Size**: TUI requires minimum 80x24 terminal
5. **Dependencies**: `fast-xml-parser` and `proj4` for Espoo GML parsing

## Data Architecture Benefits

### Why File-Based vs Database?

1. **Single Source of Truth**: Frontend directly reads production data files
2. **No Export Step**: Data written in final format during pipeline
3. **Version Control Friendly**: JSON files can be committed and diffed
4. **Simpler Deployment**: No database migrations or schema management
5. **Optimized for Read**: Frontend only needs file fetch, no SQL queries
6. **Atomic Updates**: Each zone's routes in separate file - parallel processing safe
7. **Transparent**: Human-readable zones.json for debugging
8. **Efficient**: MessagePack binary format for route data (~70% size reduction)

### Trade-offs

- **No Ad-hoc Queries**: Can't SQL query route data (pre-compute what you need)
- **Atomic File Operations**: Updates replace entire zone route files
- **Memory for Processing**: Must load relevant data files into memory for calculations
