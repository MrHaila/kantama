# Zone Geocoding - Address-based Routing Points

## Overview

This document explains the two-layer coordinate system used for zones:
1. **Inside points** (pole of inaccessibility) - guaranteed to be inside polygons, used for visualization
2. **Routing points** (address-based) - refined via geocoding, used for routing calculations

This approach ensures both visual accuracy and routing validity.

## The Problem

Zones in this system are based on Finnish postal code polygons and statistical areas. While zone boundaries are well-defined, determining the best reference point within each zone is critical for:

- Accurate routing calculations
- Realistic travel time estimates
- Valid geocoding lookups

The reference point must:
- Be inside the zone's polygon (not outside)
- Be visually centered (representing the zone's "middle")
- Fall on or near routeable addresses

## The Solution: Two-Layer Coordinate System

We use a two-layer approach to ensure both visual accuracy and routing validity:

### Layer 1: Inside Point (Base Reference)

The **pole of inaccessibility** algorithm calculates the most distant internal point from the polygon's edges. This point is:

- **Guaranteed to be inside the polygon** (never outside, even for complex shapes)
- **Visually centered** (appears at the "center of mass")
- **Handles multi-polygons** (uses the largest polygon for zones with islands)

This inside point is stored in `lat`/`lon` columns and used for:
- Map visualization (markers, labels)
- Base reference for reverse geocoding

### Layer 2: Routing Point (Address Refinement)

The geocoding script (`geocode_zones.ts`) refines the inside point by reverse geocoding it to find the **nearest valid street address** using the Digitransit API. This address-based coordinate is:

- **Routeable** by the OTP routing engine
- **On a valid street** (guaranteed by geocoding API)
- **Close to the visual center** (based on inside point)

This routing point is stored in `routing_lat`/`routing_lon` columns.

## Terminology

To avoid confusion, we distinguish between two types of coordinates:

1. **Inside Point** (`lat`, `lon` columns)
   - Calculated using pole of inaccessibility algorithm
   - Guaranteed to be inside the polygon
   - Used for **visualization** and as base for geocoding
   - Always present

2. **Routing Point** (`routing_lat`, `routing_lon` columns)
   - Refined from inside point via reverse geocoding API
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

### Limited Processing (Recommended First Step)

Before geocoding all zones, test with a small sample:

```bash
pnpm dev geocode --limit 5
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
Mode: Limited (5 zones)
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

The `routing_source` column contains detailed information about how the routing point was determined:

- `reverse:address 500m:45m` - Found address within 500m radius, 45m from POI, inside zone
- `reverse:address 1km:832m` - Found address within 1km radius, 832m from POI, inside zone
- `reverse:venue 2km:1200m:outside` - Found venue within 2km, 1200m from POI, **outside zone** (warning in geocoding_error)
- `fallback:inside_point` - Reverse geocoding failed, using POI as routing point

The format is: `method:strategy:distance[:outside]`
- **method**: `reverse` (reverse geocoding) or `fallback` (POI fallback)
- **strategy**: radius and layer type (e.g., "address 500m", "venue 2km")
- **distance**: distance from POI in meters (e.g., "45m", "832m")
- **:outside**: suffix added if point is outside zone polygon

## How Geocoding Works

The script uses **reverse geocoding** from the POI (pole of inaccessibility) coordinates to find the nearest valid street address. It tries multiple strategies with progressive radius expansion:

1. **500m radius** - Search for addresses/streets within 500m of POI
2. **1km radius** - Expand search to 1km if no results
3. **2km radius** - Expand search to 2km if still no results
4. **Include venues** - Try venue layer if addresses not found
5. **Include localities** - Try locality layer as last resort

For each strategy, the script:
- Requests up to 5 results from the API
- **Validates each result** using polygon containment check
- Returns the **first result that's inside the zone polygon**
- If no result is inside, returns the closest result (marked as "outside")
- Falls back to POI if all strategies fail

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
        "https://api.digitransit.fi/geocoding/v1/reverse?point.lat=60.17&point.lon=24.94&size=1"
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

### Digitransit Reverse Geocoding API

**Endpoint:**

```
https://api.digitransit.fi/geocoding/v1/reverse
```

**Parameters:**

- `point.lat` - Latitude coordinate to reverse geocode
- `point.lon` - Longitude coordinate to reverse geocode
- `size` - Number of results (default: 10, max: 40)
- `layers` - Filter by place type (address, street, venue, locality, etc.)
- `boundary.circle.radius` - Search radius in kilometers
- `lang` - Preferred language (fi, sv, en)

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
