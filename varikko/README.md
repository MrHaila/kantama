# Varikko

Data pipeline CLI for Kantama. Fetches zone data, calculates transit routes via OpenTripPlanner, and writes optimized data files to `opas/public/data/`.

## Quick Start

```bash
bun install
bun run dev          # Show status
bun run dev fetch    # Fetch zones from city WFS endpoints
bun run dev routes   # Calculate routes (requires OTP running)
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Show pipeline status |
| `bun run dev map` | Process background map shapefiles |
| `bun run dev fetch` | Fetch zones from Helsinki, Vantaa, Espoo, Kauniainen |
| `bun run dev geocode` | Resolve street addresses for routing points |
| `bun run dev routes` | Calculate transit routes via OTP |
| `bun run dev simplify-routes` | Optimize route files for size |
| `bun run dev time-buckets` | Generate heatmap color distribution |
| `bun run dev reachability` | Pre-compute zone connectivity scores |
| `bun run dev transit-layer` | Generate transit visualization layer |
| `bun run dev zones list` | List all zones with metadata (debugging) |
| `bun run dev clear` | Clear data files |

### Command Options

**Route Calculation:**
```bash
bun run dev routes                       # All periods, all routes
bun run dev routes --period MORNING      # Single period
bun run dev routes --zones 5             # Routes from 5 random zones
bun run dev routes --limit 10            # 10 random routes total
```

Time periods: MORNING (08:30), EVENING (17:00), MIDNIGHT (24:00)

**Zone Listing:**
```bash
bun run dev zones list                   # List all zones
bun run dev zones list --limit 10        # Show first 10 zones only
```

## Data Output

All data written to `opas/public/data/`:

```
opas/public/data/
├── zones.json           # Zone metadata + time buckets + reachability
├── pipeline.json        # Pipeline execution state
├── manifest.json        # Data summary for frontend
└── routes/              # Per-zone route files (MessagePack)
    ├── {zoneId}-M.msgpack
    ├── {zoneId}-E.msgpack
    └── {zoneId}-N.msgpack
```

## Configuration

Environment variables (`.env` in project root):

```bash
OTP_URL=http://localhost:8080
DIGITRANSIT_API_KEY=your_key
HSL_API_KEY=your_key
```

## Development

```bash
bun run test           # Run tests
bun run test:ui        # Tests with UI
bun run test:coverage  # Coverage report
bun run lint           # Lint code
bun run build          # Build TypeScript
```

## Requirements

- Node.js 18+
- bun
- OpenTripPlanner instance (local Docker or remote Digitransit API)
