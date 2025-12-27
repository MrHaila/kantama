# Varikko

> Transit route data pipeline with interactive TUI

Varikko is a terminal-based data pipeline tool for the Chrono-Map project. It fetches geospatial zone data, calculates transit routes via OpenTripPlanner, and manages a SQLite database with route metadata.

## Features

- **Interactive TUI**: Keyboard-driven interface with real-time progress
- **6 Workflows**: Fetch zones, geocode, build routes, clear data, calculate deciles, process maps
- **Test Mode**: Quick validation with subset of data
- **Event-Driven**: Real-time progress visualization for long-running operations
- **Type-Safe**: Full TypeScript implementation with comprehensive test coverage

## Quick Start

```bash
# Install dependencies
pnpm install

# Run interactive TUI
pnpm dev
```

Navigate with keyboard:
- **1-6**: Quick select workflows
- **↑/↓** or **j/k**: Navigate menu
- **Enter**: Execute workflow
- **t**: Toggle test mode
- **?**: Help screen
- **q**: Quit

## Workflows

### 1. Fetch Zones

Fetches postal code polygons from WFS service, calculates centroids, pre-renders SVG paths, and pre-fills routes table.

Test mode fetches only 5 zones for quick validation.

### 2. Geocode Zones

Resolves street addresses for better routing points using Digitransit API. Falls back to geometric centroids if geocoding fails.

Requires: `DIGITRANSIT_API_KEY` or `HSL_API_KEY` (optional)

### 3. Build Routes

Calculates transit routes via OTP for all zone pairs.

Time periods:
- **MORNING**: 08:30 on next Tuesday
- **EVENING**: 17:30 on next Tuesday
- **MIDNIGHT**: 23:30 on next Tuesday

Test mode processes only 10 random routes for quick validation.

### 4. Clear Data

Selectively clear database tables:
- Routes (reset to PENDING status)
- Places (cascades to routes)
- Metadata
- Deciles

Includes confirmation prompt for safety.

### 5. Calculate Deciles

Generates heatmap color distribution for visualization.

Creates 10 equal quantiles with vintage color palette (#E76F51 to #355C7D).

### 6. Process Maps

Converts ESRI shapefiles to TopoJSON and generates pre-rendered SVG for background visualization.

## Configuration

Create `.env` file in varikko directory:

```bash
# Database path (default: ../opas/public/varikko.db)
DB_PATH=/path/to/varikko.db

# OTP Configuration
OTP_URL=http://localhost:8080
DIGITRANSIT_API_KEY=your_api_key
HSL_API_KEY=your_api_key

# Map output paths
TOPOJSON_OUTPUT=../opas/public/background_map.json
SVG_OUTPUT=../opas/public/background_map.svg
```

## Database Schema

### `places` Table

- `id`: Postal code (e.g., "00100")
- `name`: Area name
- `lat`, `lon`: Geometric centroid
- `routing_lat`, `routing_lon`: Geocoded routing point
- `geometry`: GeoJSON polygon
- `svg_path`: Pre-rendered SVG path

### `routes` Table

- `from_id`, `to_id`, `time_period`: Route identifier
- `duration`: Travel time in seconds
- `numberOfTransfers`: Transit transfers
- `walkDistance`: Walking distance in meters
- `legs`: Detailed journey steps (JSON)
- `status`: `PENDING` | `OK` | `NO_ROUTE` | `ERROR`

### `deciles` Table

- `time_period`: MORNING | EVENING | MIDNIGHT
- `decile_number`: 0-9
- `min_duration`, `max_duration`: Duration range in minutes
- `color_hex`: Vintage palette color
- `label`: Human-readable range

### `metadata` Table

Key-value store for progress tracking and timestamps.

## Development

```bash
# Run in dev mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Lint
pnpm lint

# Clean build artifacts
pnpm clean
```

## Architecture

```
varikko/
├── src/
│   ├── main.ts              # Entry point
│   ├── cli.ts               # CLI parser (Commander)
│   ├── lib/                 # Business logic
│   │   ├── db.ts            # Database utilities
│   │   ├── zones.ts         # Zone fetching
│   │   ├── geocoding.ts     # Geocoding
│   │   ├── routing.ts       # Route calculation
│   │   ├── clearing.ts      # Data clearing
│   │   ├── deciles.ts       # Decile calculation
│   │   └── maps.ts          # Map processing
│   └── tui/                 # Interactive UI (Ink/React)
│       ├── app.tsx          # Root component
│       ├── dashboard.tsx    # Main menu
│       └── screens/         # Workflow screens
├── data/                    # ESRI shapefiles
└── plans/                   # Development docs
```

## Requirements

- Node.js 18+
- pnpm 8+
- OpenTripPlanner instance (local or remote)
- Terminal with minimum 80x24 size (for TUI)

### Local OTP Setup (Optional)

```bash
# Run OTP in Docker
docker run -p 8080:8080 \
  -v $(pwd)/data:/data \
  opentripplanner/opentripplanner:latest \
  --build --serve /data
```

Or use remote Digitransit API with API key.

## Performance

- **Startup time**: < 1s
- **Full route calculation**: Several hours for 279 zones (77,562 routes × 3 periods)
- **Test mode**: 30-60 seconds for validation
- **Memory usage**: < 500MB

## Troubleshooting

### OTP Connection Failed

Ensure OTP is running:
```bash
curl http://localhost:8080/otp/routers/default
```

Or set `DIGITRANSIT_API_KEY` for remote API.

### Geocoding Timeout

Rate limiting (100ms delay) prevents API throttling.

### Terminal Too Small

TUI requires minimum 80x24. Resize terminal.

## Contributing

1. Read `plans/00-overview.md` for architecture details
2. Write tests for new features (Vitest)
3. Follow existing code patterns (TypeScript strict mode)
4. Run `pnpm test` and `pnpm lint` before committing

## Related Projects

- [Chrono-Map](../opas) - Web visualization frontend
- [OpenTripPlanner](https://www.opentripplanner.org/) - Transit routing engine
- [Digitransit](https://digitransit.fi/) - HSL transit data platform
