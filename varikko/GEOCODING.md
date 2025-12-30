# Zone Geocoding

Resolves street addresses for better routing points using the Digitransit reverse geocoding API.

## Overview

Zones use a two-layer coordinate system:

1. **Inside points** (pole of inaccessibility) - guaranteed inside polygon, used for visualization
2. **Routing points** (address-based) - refined via geocoding, used for route calculations

## Setup

### Get API Key

1. Register at [Digitransit Developer Portal](https://digitransit.fi/en/developers/)
2. Copy your subscription key

### Configure Environment

Add to `.env` in project root:

```bash
DIGITRANSIT_API_KEY=your-key-here
# or
HSL_API_KEY=your-key-here
```

## Usage

### Test with Limited Zones

```bash
pnpm dev geocode --limit 5
```

### Full Geocoding

```bash
pnpm dev geocode
```

Takes ~30-40 seconds for all zones (100ms rate limit between requests).

### Rebuild Routes After Geocoding

```bash
pnpm dev routes
```

Routing automatically uses geocoded points when available, falls back to inside points otherwise.

## How It Works

The script uses reverse geocoding from the inside point coordinates:

1. **500m radius** - Search for addresses within 500m
2. **1km radius** - Expand if no results
3. **2km radius** - Further expansion
4. **Include venues** - Try venue layer if addresses not found
5. **Include localities** - Last resort

For each result, validates it's inside the zone polygon. Falls back to inside point if all strategies fail.

## Data Storage

Geocoding results stored in `zones.json`:

```typescript
interface Zone {
  id: string
  routingPoint: [lat, lon]  // Geocoded or fallback
  // ...other fields
}
```

## API Reference

**Endpoint:** `https://api.digitransit.fi/geocoding/v1/reverse`

**Parameters:**
- `point.lat`, `point.lon` - Coordinates to reverse geocode
- `size` - Number of results (max 40)
- `layers` - Filter by place type
- `boundary.circle.radius` - Search radius in km

**Headers:**
- `digitransit-subscription-key` - API key

## Troubleshooting

### 404 Errors
Verify API key is set correctly. Test with curl:
```bash
curl -H "digitransit-subscription-key: YOUR_KEY" \
     "https://api.digitransit.fi/geocoding/v1/reverse?point.lat=60.17&point.lon=24.94&size=1"
```

### High Failure Rate
Check network connectivity and API key validity. Zones with no nearby addresses will use inside point fallback.
