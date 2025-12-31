# Varikko

Data pipeline CLI for Kantama. Fetches zone data, calculates transit routes via OpenTripPlanner, and writes optimized data files to `opas/public/data/`.

## Quick Start

```bash
pnpm install
pnpm dev          # Show status
pnpm dev fetch    # Fetch zones from city WFS endpoints
pnpm dev routes   # Calculate routes (requires OTP running)
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Show pipeline status |
| `pnpm dev map` | Process background map shapefiles |
| `pnpm dev fetch` | Fetch zones from Helsinki, Vantaa, Espoo, Kauniainen |
| `pnpm dev geocode` | Resolve street addresses for routing points |
| `pnpm dev routes` | Calculate transit routes via OTP |
| `pnpm dev simplify-routes` | Optimize route files for size |
| `pnpm dev time-buckets` | Generate heatmap color distribution |
| `pnpm dev reachability` | Pre-compute zone connectivity scores |
| `pnpm dev transit-layer` | Generate transit visualization layer |
| `pnpm dev zones list` | List all zones with metadata (debugging) |
| `pnpm dev clear` | Clear data files |

### Command Options

**Route Calculation:**
```bash
pnpm dev routes                       # All periods, all routes
pnpm dev routes --period MORNING      # Single period
pnpm dev routes --zones 5             # Routes from 5 random zones
pnpm dev routes --limit 10            # 10 random routes total
```

Time periods: MORNING (08:30), EVENING (17:00), MIDNIGHT (24:00)

**Zone Listing:**
```bash
pnpm dev zones list                   # List all zones
pnpm dev zones list --limit 10        # Show first 10 zones only
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
pnpm test           # Run tests
pnpm test:ui        # Tests with UI
pnpm test:coverage  # Coverage report
pnpm lint           # Lint code
pnpm build          # Build TypeScript
```

## Requirements

- Node.js 18+
- pnpm
- OpenTripPlanner instance (local Docker or remote Digitransit API)
