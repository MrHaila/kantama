# Varikko

> Transit route data pipeline with high-quality CLI

Varikko is a command-line data pipeline tool for Kantama. It fetches geospatial zone data, calculates transit routes via OpenTripPlanner, and manages a SQLite database with route metadata.

## Features

- **Rich CLI Output**: Beautiful formatted output with colors, progress bars, and emojis
- **Comprehensive Status**: Default command shows full database state and next steps
- **7 Commands**: Fetch zones, geocode, build routes, clear data, calculate time buckets, process maps, show status
- **Flexible Filtering**: Limit zones and routes for quick testing and incremental processing
- **Event-Driven**: Real-time progress visualization for long-running operations
- **Type-Safe**: Full TypeScript implementation with comprehensive test coverage (80%+)

## Quick Start

```bash
# Install dependencies
pnpm install

# Show database status (default command)
pnpm dev

# Run specific command
pnpm dev fetch --test
pnpm dev geocode
pnpm dev routes
```

## Commands

### `status` (default)

Shows comprehensive database status including zones, routes, time buckets, recent errors, and suggested next steps.

```bash
pnpm dev           # Same as: pnpm dev status
pnpm dev status
```

### `init`

Initialize database schema (DESTRUCTIVE - drops existing data).

```bash
pnpm dev init --force
```

### `fetch`

Fetches postal code polygons from WFS service, calculates centroids, pre-renders SVG paths, and pre-fills routes table.

```bash
pnpm dev fetch              # Fetch all zones
pnpm dev fetch --limit 5    # Limit to 5 zones for quick validation
```

### `geocode`

Resolves street addresses for better routing points using Digitransit API. Falls back to geometric centroids if geocoding fails.

```bash
pnpm dev geocode              # Geocode all zones
pnpm dev geocode --limit 10   # Limit to 10 zones
```

Requires: `DIGITRANSIT_API_KEY` or `HSL_API_KEY` (optional but recommended)

### `routes`

Calculates transit routes via OTP for all zone pairs.

```bash
pnpm dev routes                       # All periods, all routes
pnpm dev routes --period MORNING      # Single period only
pnpm dev routes --zones 5             # All routes FROM 5 random origin zones
pnpm dev routes --limit 10            # Process 10 random routes total
pnpm dev routes --zones 3 --limit 20  # 20 routes from 3 random zones
pnpm dev routes -p MORNING --zones 2  # Morning routes from 2 zones
```

Time periods:

- **MORNING**: 09:00 departure on next Tuesday
- **EVENING**: 17:30 departure on next Tuesday
- **MIDNIGHT**: 23:30 departure on next Tuesday

Options:

- `--zones <count>`: Select N random origin zones (filters routes by FROM zone)
- `--limit <count>`: Process only N random routes (useful for quick testing)
- `--period <period>`: Process only specified time period

### `clear`

Selectively clear database tables with confirmation prompt.

```bash
pnpm dev clear                  # Clear all data (with prompt)
pnpm dev clear --force          # Skip confirmation
pnpm dev clear --routes         # Reset routes to PENDING only
pnpm dev clear --places         # Clear places (cascades to routes)
pnpm dev clear --metadata       # Clear metadata only
pnpm dev clear --time-buckets   # Clear time buckets only
```

### `time-buckets`

Generates heatmap time bucket distribution for visualization.

```bash
pnpm dev time-buckets          # Calculate time buckets
pnpm dev time-buckets --force  # Force recalculation
```

Creates 6 time buckets based on route duration quantiles.

### `map`

Converts ESRI shapefiles to TopoJSON and generates pre-rendered SVG layers for background visualization.

```bash
pnpm dev map
```

Requires shapefile data in `data/maastokartta_esri/`.

## Configuration

Create `.env` file in parent directory:

```bash
# Database path (default: ../opas/public/varikko.db)
DB_PATH=/path/to/varikko.db

# OTP Configuration
OTP_URL=http://localhost:8080
DIGITRANSIT_API_KEY=your_api_key
HSL_API_KEY=your_api_key

# Routing concurrency (default: 1 for remote, 10 for local)
OTP_CONCURRENCY=10

# Map output paths
TOPOJSON_OUTPUT=../opas/public/background_map.json
SVG_LAYERS_OUTPUT=../opas/public/layers/
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

### `time_buckets` Table

- `time_period`: MORNING | EVENING | MIDNIGHT
- `bucket_number`: 1-6
- `min_duration`, `max_duration`: Duration range in minutes
- `color`: Hex color code
- `label`: Human-readable range

### `metadata` Table

Key-value store for progress tracking and timestamps.

## Development

```bash
# Run commands in dev mode
pnpm dev [command]

# Build TypeScript
pnpm build

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Architecture

```
varikko/
├── src/
│   ├── main.ts              # Entry point
│   ├── cli.ts               # CLI commands (Commander)
│   ├── lib/                 # Business logic (pure functions)
│   │   ├── cli-format.ts    # CLI formatting utilities
│   │   ├── db.ts            # Database utilities
│   │   ├── events.ts        # Progress event emitter
│   │   ├── zones.ts         # Zone fetching
│   │   ├── geocoding.ts     # Geocoding
│   │   ├── routing.ts       # Route calculation
│   │   ├── clearing.ts      # Data clearing
│   │   ├── time-buckets.ts  # Time bucket calculation
│   │   ├── maps.ts          # Map processing
│   │   └── exportLayers.ts  # SVG layer export
│   └── tests/               # Test files (Vitest)
├── data/                    # ESRI shapefiles
└── plans/                   # Development docs
```

### Design Principles

- **Separation of Concerns**: Business logic (lib/) is completely UI-agnostic
- **Event-Driven Progress**: ProgressEmitter enables real-time feedback
- **Type Safety**: Strict TypeScript with comprehensive interfaces
- **Testability**: Pure functions with 80%+ test coverage

## Requirements

- Node.js 18+
- pnpm 10+
- OpenTripPlanner instance (local or remote)
- SQLite 3+

### Local OTP Setup (Recommended for Performance)

```bash
# Run OTP in Docker
docker run -p 8080:8080 \
  -v $(pwd)/data:/data \
  opentripplanner/opentripplanner:latest \
  --build --serve /data
```

Or use remote Digitransit API with API key (slower but no local setup needed).

## Performance

- **Startup time**: < 200ms
- **Full route calculation**: Several hours for 262 zones (205,146 routes total)
  - Local OTP (10 concurrent): ~2-3 hours
  - Remote API (1 concurrent): ~12-15 hours
- **Limited processing**: `--limit 10` or `--zones 1` completes in seconds for quick validation
- **Memory usage**: < 200MB

## Troubleshooting

### OTP Connection Failed

Ensure OTP is running:

```bash
curl http://localhost:8080/otp/routers/default
```

Or set `DIGITRANSIT_API_KEY` for remote API.

### Geocoding Rate Limited

Rate limiting (100ms delay) prevents API throttling. Set `DIGITRANSIT_API_KEY` for better rate limits.

### Database Locked

Close any other processes accessing the database (e.g., SQLite browser).

## CLI Output Examples

### Status Command

```
╭──────────────── VARIKKO DATABASE STATUS ─────────────────╮

💾 DATABASE
  Path:            /path/to/varikko.db
  Size:            40.5 MB
  Last Modified:   12/28/2025, 11:16:34

📍 ZONES
  Total Zones:     262

🚌 ROUTES
  Total Routes:    205,146 (68,382/period)
  ✓ Calculated:    0 (0.0%)
  ○ Pending:       205,146 (100.0%)

🗺️ TIME BUCKETS
  Not calculated yet

💡 NEXT STEPS
  1. Run 'varikko routes' to calculate pending routes

╰──────────────────────────────────────────────────────────╯
```

### Routes Command

```
🚌 CALCULATING ROUTES

OTP:           http://localhost:8080 (local)
Concurrency:   10 requests
Period:        All (MORNING, EVENING, MIDNIGHT)
Mode:          Full dataset

[==============================] 100% (205,146/205,146) ✓ 185,234 | ⊘ 19,500 no route | ✗ 412 errors

──────────────────────────────────────────────────────
                     SUMMARY
──────────────────────────────────────────────────────
Total processed:     205,146
✓ Successful:        185,234 routes
⊘ No route found:    19,500 routes
✗ Errors:            412 routes
Duration:            2h 15m

💡 Next: Run 'varikko time-buckets' to calculate heatmap data
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test zones

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test --watch
```

Test coverage requirements:

- Lines: 80%
- Functions: 80%
- Branches: 70%
- Statements: 80%

## Contributing

1. Read `plans/00-overview.md` for architecture details
2. Write tests for new features (Vitest)
3. Follow existing code patterns (TypeScript strict mode)
4. Ensure business logic stays in `lib/` (UI-agnostic)
5. Run `pnpm test` and `pnpm lint` before committing

## Changelog

### v3.0.0 (2025-01-XX)

**Breaking Changes:**

- Removed TUI (interactive mode)
- Default command now shows status instead of launching interactive menu

**Added:**

- Rich CLI output with colors, progress bars, and formatting
- Comprehensive status command showing database state
- Better progress reporting for long-running operations
- Next-step suggestions in command output

**Removed:**

- Ink/React TUI dependencies (~10 packages)
- TUI code (~1,500 lines)
- Interactive mode

**Improved:**

- Simpler codebase (easier to maintain)
- Better testability (all output testable)
- Faster startup (no React rendering)
- Smaller bundle size

## Related Projects

- [Opas](../opas) - Web visualization frontend
- [OpenTripPlanner](https://www.opentripplanner.org/) - Transit routing engine
- [Digitransit](https://digitransit.fi/) - HSL transit data platform

## License

MIT
