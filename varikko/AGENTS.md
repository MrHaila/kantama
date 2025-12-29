# Varikko Data Pipeline Module

## Purpose

This module serves as the **Data Pipeline** for Kantama. It provides a unified TUI (Terminal User Interface) for fetching geospatial zone data, calculating routes and travel times using the OTP (OpenTripPlanner) instance, and managing the local SQLite database (`varikko.db`) that stores all project data.

## Architecture

Varikko is built with a clean separation of concerns:

```
varikko/
├── src/
│   ├── main.ts              # Entry point (TUI)
│   ├── cli.ts               # CLI parser (Commander)
│   ├── lib/                 # Pure business logic
│   │   ├── db.ts            # Database utilities
│   │   ├── zones.ts         # Zone fetching (multi-city support)
│   │   ├── geocoding.ts     # Geocoding logic
│   │   ├── routing.ts       # Route calculation
│   │   ├── clearing.ts      # Data clearing
│   │   ├── deciles.ts       # Decile calculation
│   │   ├── maps.ts          # Map processing
│   │   ├── types.ts         # Type definitions
│   │   ├── city-fetchers.ts # City-specific zone fetchers
│   │   └── gml-parser.ts    # GML XML parser for Espoo
│   └── tui/                 # Interactive UI
│       ├── app.tsx          # Root component
│       ├── dashboard.tsx    # Main menu
│       └── screens/         # Workflow screens
├── data/                    # Shapefiles
└── plans/                   # Development docs
```

## Data Schema (`varikko.db`)

Everything is consolidated into a single SQLite database:

- **`places`**: Stores zone metadata.
  - `id`: Zone ID with city prefix (e.g., "HEL-101", "VAN-51", "ESP-1").
  - `name`: Name of the area (Finnish).
  - `city`: City name (Helsinki, Vantaa, Espoo).
  - `name_se`: Swedish name (optional).
  - `admin_level`: Administrative level (osa-alue, kaupunginosa, tilastollinen_alue).
  - `lat`, `lon`: Centroid coordinates (geometric).
  - `routing_lat`, `routing_lon`: Geocoded routing points.
  - `geometry`: GeoJSON polygon string.
  - `svg_path`: Pre-rendered SVG path data.
  - `source_layer`: Source WFS layer name.

- **`routes`**: Stores pre-calculated transit metadata between places.
  - `from_id`, `to_id`, `time_period`: Unique identifier for a route at a specific time (MORNING, EVENING, MIDNIGHT).
  - `duration`: Travel time in seconds.
  - `numberOfTransfers`: Number of transit transfers.
  - `walkDistance`: Total walking distance in meters.
  - `legs`: Detailed JSON blob of the journey steps (from, to, mode, duration, distance).
  - `status`: Processing state (`PENDING`, `OK`, `NO_ROUTE`, `ERROR`).

- **`deciles`**: Heatmap color distribution.
  - `time_period`: MORNING, EVENING, or MIDNIGHT.
  - `decile_number`: 0-9 (10 equal quantiles).
  - `min_duration`, `max_duration`: Duration range in minutes.
  - `color_hex`: Vintage color palette (#E76F51 to #355C7D).
  - `label`: Human-readable range ("8-15 min", ">60 min").

- **`metadata`**: Key-value store for run progress and timestamps.

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

- Selective clearing: routes, places, metadata, deciles

- Confirmation prompt for safety

- Non-destructive (never drops tables)

### 5. Calculate Deciles

- Generates heatmap color distribution

- 10 equal quantiles with vintage color palette

- Per time period

### 6. Process Maps

- Converts shapefiles to TopoJSON

- Generates pre-rendered SVG with projection

- Water and road layers for background visualization

## Environment Variables

```bash
# Database path (default: ../opas/public/varikko.db)
DB_PATH=/path/to/varikko.db

# OTP Configuration
OTP_URL=http://localhost:8080
DIGITRANSIT_API_KEY=your_api_key
HSL_API_KEY=your_api_key

# Map output paths
TOPOJSON_OUTPUT=/path/to/background_map.json
SVG_OUTPUT=/path/to/background_map.svg
```

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
5. **Relational Consolidation**: Single SQLite database for all persistence
6. **Multi-Period Support**: Routes calculated for different times of day
7. **Rich Metadata**: Store full OTP leg information in JSON columns
8. **Multi-City Support**: Modular fetcher pattern for different administrative levels
9. **Partial Success**: Continues processing even if some cities fail
10. **Backward Compatibility**: Original postal code system preserved

## Known Requirements

1. **OTP Instance**: Local OTP needs Docker container running, or use remote Digitransit API
2. **API Keys**: Geocoding and remote OTP require API keys (optional)
3. **Large Dataset**: Full route calculation (310 zones) takes several hours
4. **Terminal Size**: TUI requires minimum 80x24 terminal
5. **Dependencies**: `fast-xml-parser` and `proj4` for Espoo GML parsing

## Migration Guide

### From Postal Codes to Multi-City Zones

1. **Backup Existing Data**:

   ```bash
   cp ../opas/public/varikko.db ../opas/public/varikko.db.backup
   ```

2. **Clear Existing Zones**:
   - Use TUI option 4 (Clear Data) → Clear places and routes

3. **Fetch Multi-City Zones**:
   - Use TUI option 1 (Fetch Zones) → Runs in multi-city mode by default

4. **Update Visualizations**:
   - Zone IDs changed from postal codes (e.g., "00100") to city-prefixed (e.g., "HEL-101")

   - Update any hardcoded postal code references in Opas

5. **Rebuild Routes**:
   - Clear and rebuild all routes due to zone changes

### Rollback

To rollback to postal codes:

1. Restore backup: `cp ../opas/public/varikko.db.backup ../opas/public/varikko.db`
2. Use original `fetchZones()` function (still available in zones.ts)
