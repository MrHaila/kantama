# Zone Geocoding - Address-based Routing Points

## Overview

This document explains how to set up and use address-based routing points for zones, which improves routing accuracy by ensuring coordinates fall on valid addresses instead of arbitrary geometric centroids.

## The Problem

Zones in this system are based on Finnish postal code polygons. Previously, we calculated the **geometric centroid** of each polygon and used it for routing. However, geometric centroids can fall in invalid locations:

- Water bodies (harbors, sea)
- Parks and forests
- Industrial areas without addresses
- Other non-routeable locations

This can lead to:

- Inaccurate routing results
- Failed route calculations
- Routes that don't represent realistic travel times

## The Solution

The geocoding script (`geocode_zones.ts`) resolves zone postal codes and names into **address-based coordinates** using the Digitransit geocoding API. These coordinates are guaranteed to:

- Fall on valid street addresses
- Be routeable by the OTP routing engine
- Represent realistic departure/arrival points

## Terminology

To avoid confusion, we now distinguish between two types of coordinates:

1. **Geometric Centroid** (`lat`, `lon` columns)
   - Calculated from the zone polygon geometry
   - Used for **visualization** in the UI
   - May fall in invalid locations
   - Always present

2. **Routing Point** (`routing_lat`, `routing_lon` columns)
   - Resolved from postal code/zone name via geocoding API
   - Used for **routing calculations**
   - Guaranteed to be on valid addresses
   - Optional (requires running geocoding script)

## Setup

### 1. Get API Key

The Digitransit geocoding API may require authentication. To obtain an API key:

1. Register at [Digitransit Developer Portal](https://digitransit.fi/en/developers/)
2. Follow the API registration instructions
3. Copy your subscription key

### 2. Configure Environment

Add your API key to the `.env` file in the project root:

```bash
# Option 1: Use DIGITRANSIT_API_KEY
DIGITRANSIT_API_KEY=your-api-key-here

# Option 2: Use HSL_API_KEY (same key used for routing)
HSL_API_KEY=your-api-key-here
```

The script will check both variables (DIGITRANSIT_API_KEY first, then HSL_API_KEY).

## Usage

### Test Mode (Recommended First Step)

Before geocoding all zones, test with a small sample:

```bash
pnpm --filter varikko geocode:test
```

This will:

- Process only **5 zones**
- Show detailed output for each zone
- Help verify API key is working
- Check rate limiting is working

Expected output:

```
============================================================
Zone Geocoding - Address-based Routing Point Resolution
============================================================
Test mode: YES (will process 5 zones only)
Rate limiting: 100ms delay between requests
API key configured: YES
============================================================

Updating database schema...
  ✓ Added routing_lat column
  ✓ Added routing_lon column
  ✓ Added routing_source column
  ✓ Added geocoding_error column
Schema update complete.

Processing 5 zones...

Progress |████████████████████████████████████████| 100% | 5/5 zones | ETA: 0s

============================================================
RESULTS
============================================================
Successfully geocoded: 5/5 zones
Failed (using fallback): 0/5 zones
```

### Full Geocoding

Once testing succeeds, geocode all zones:

```bash
pnpm --filter varikko geocode:zones
```

This will:

- Process **all zones** (~279 zones)
- Take approximately **30-40 seconds** (100ms delay between requests)
- Update the database with routing points
- Show a progress bar

### Rebuild Routes

After geocoding, rebuild the routes to use the new routing points:

```bash
pnpm --filter varikko build:routes
```

The routing script will automatically:

- Use `routing_lat/routing_lon` if available (geocoded points)
- Fall back to `lat/lon` if not geocoded yet
- Display statistics showing how many zones use each type

## Database Schema

The geocoding script adds these columns to the `places` table:

| Column            | Type | Description                              |
| ----------------- | ---- | ---------------------------------------- |
| `routing_lat`     | REAL | Latitude of address-based routing point  |
| `routing_lon`     | REAL | Longitude of address-based routing point |
| `routing_source`  | TEXT | Source of routing point (see below)      |
| `geocoding_error` | TEXT | Error message if geocoding failed        |

### Routing Source Values

- `geocoded:postal code` - Resolved from postal code (e.g., "00100")
- `geocoded:zone name` - Resolved from zone name (e.g., "Kaartinkaupunki")
- `geocoded:postal code + Helsinki` - Resolved from postal code + city name
- `fallback:geometric` - Geocoding failed, using geometric centroid

## How Geocoding Works

The script tries multiple search strategies for each zone, in order:

1. **Postal code only** (e.g., "00100")
2. **Zone name** (e.g., "Kaartinkaupunki")
3. **Postal code + Helsinki** (e.g., "00100 Helsinki")

It returns the first successful result. If all strategies fail, it falls back to the geometric centroid.

## Rate Limiting

The Digitransit geocoding API has an informal limit of **10 requests per second**.

The script enforces a **100ms delay** between requests, which equals exactly 10 requests/second. This is conservative and should prevent rate limiting issues.

For ~279 zones: `279 × 100ms = 27.9 seconds` (plus API response time)

## Troubleshooting

### API Returns 404 Errors

**Problem:** All geocoding requests fail with 404 status

**Solution:**

1. Verify API key is set correctly in `.env`
2. Check API key header name (script uses `digitransit-subscription-key`)
3. Try testing directly with curl:
   ```bash
   curl -H "digitransit-subscription-key: YOUR_KEY" \
        "https://api.digitransit.fi/geocoding/v1/search?text=00100&size=1"
   ```

### No API Key Configured

**Warning:** `⚠️ WARNING: No API key configured`

**Impact:** Requests may fail without authentication

**Solution:** Add API key to `.env` file (see Setup section)

### High Failure Rate

**Problem:** Many zones show "Failed (using fallback)"

**Possible causes:**

1. API authentication issues
2. Zone names/postal codes not recognized by geocoding API
3. Network connectivity issues

**Solution:**

1. Check `geocoding_error` column in database for specific error messages:
   ```bash
   pnpm exec tsx -e "
   const db = require('better-sqlite3')('./opas/public/varikko.db');
   const errors = db.prepare('SELECT id, name, geocoding_error FROM places WHERE geocoding_error IS NOT NULL').all();
   console.log(JSON.stringify(errors, null, 2));
   "
   ```
2. Review error messages and adjust geocoding logic if needed

### Database Schema Already Exists

**Message:** Columns already exist (no error)

**Impact:** None - script safely checks before adding columns

**Action:** No action needed, script will proceed normally

## Visualization

The Opas UI has been updated to support both coordinate types:

- **Geometric centroids** (`lat`, `lon`) are used for zone polygon visualization
- **Routing points** (`routingLat`, `routingLon`) are available in the `Place` interface
- You can optionally visualize routing points as markers to show where routing actually happens

Example code to display routing points:

```typescript
import { dbService } from '@/services/DatabaseService';

const places = dbService.getPlaces();

places.forEach((place) => {
  if (place.routingLat && place.routingLon) {
    // Show routing point marker
    console.log(`${place.name}: routing point at ${place.routingLat}, ${place.routingLon}`);
    console.log(`  Source: ${place.routingSource}`);
  }
});
```

## Data Pipeline

The complete workflow is:

```
1. Fetch Zones
   └─> pnpm --filter varikko fetch:zones
       ├─ Download postal code polygons from WFS
       ├─ Calculate geometric centroids (for visualization)
       └─ Store in database (lat, lon, geometry, svg_path)

2. Geocode Zones (NEW)
   └─> pnpm --filter varikko geocode:zones
       ├─ Query geocoding API for each postal code/name
       ├─ Resolve to address-based coordinates
       └─ Store routing points (routing_lat, routing_lon, routing_source)

3. Build Routes
   └─> pnpm --filter varikko build:routes
       ├─ Load places with COALESCE(routing_lat, lat)
       ├─ Use address-based routing points if available
       └─ Calculate routes using OTP

4. Visualize
   └─> Opas UI
       ├─ Show zone polygons
       ├─ Use geometric centroids for zone centers
       └─ Optionally show routing points
```

## API Reference

### Digitransit Geocoding API

**Endpoint:**

```
https://api.digitransit.fi/geocoding/v1/search
```

**Parameters:**

- `text` - Search query (postal code, address, place name)
- `size` - Number of results (default: 10)
- `boundary.rect.min_lat` - Minimum latitude for bounding box
- `boundary.rect.max_lat` - Maximum latitude for bounding box
- `boundary.rect.min_lon` - Minimum longitude for bounding box
- `boundary.rect.max_lon` - Maximum longitude for bounding box
- `layers` - Filter by place type (neighbourhood, locality, address, etc.)

**Headers:**

- `digitransit-subscription-key` - API key for authentication

**Response:**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "geometry": {
        "coordinates": [24.9384, 60.1699] // [lon, lat]
      },
      "properties": {
        "name": "Mannerheimintie 2",
        "postalcode": "00100",
        "locality": "Helsinki",
        "layer": "address"
      }
    }
  ]
}
```

## Further Reading

- [Digitransit Geocoding API Documentation](https://digitransit.fi/en/developers/apis/3-geocoding-api/)
- [Digitransit Routing API Documentation](https://digitransit.fi/en/developers/apis/1-routing-api/)
- [OpenTripPlanner Documentation](https://docs.opentripplanner.org/)
