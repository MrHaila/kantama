# Multi-City Zoning Implementation

This document describes the multi-city zoning system implemented in Varikko, which replaces the postal code-based zoning with named administrative areas across the Helsinki metropolitan region.

## Overview

The multi-city zoning system fetches administrative zones from three cities:

- **Helsinki**: osa-alue (sub-regions) - 137 zones

- **Vantaa**: kaupunginosa (districts) - 52 zones

- **Espoo**: tilastollinen alue (statistical areas) - 121 zones

Total: 310 zones (increased from 279 postal codes)

## Architecture

### Core Components

1. **types.ts** - Defines shared types and interfaces

   - `CityCode` - City identifier (HEL, VAN, ESP, KAU)

   - `StandardZone` - Standardized zone format

   - `CityFetcher` - Interface for city-specific fetchers

2. **city-fetchers.ts** - Implements city-specific data fetching

   - `HelsinkiFetcher` - Handles Helsinki WFS API

   - `VantaaFetcher` - Handles Vantaa WFS API

   - `EspooFetcher` - Handles Espoo WFS API (GML format)

3. **gml-parser.ts** - Parses Espoo's GML XML responses

   - Converts coordinates from EPSG:3879 to EPSG:4326

   - Handles Polygon and MultiPolygon geometries

4. **zones.ts** - Updated with multi-city functions

   - `fetchZonesMultiCity()` - Main entry point

   - `downloadZonesMultiCity()` - Downloads from all cities

   - `processZonesMultiCity()` - Processes zones with city prefixes

5. **geocoding.ts** - Enhanced for multi-city support

   - Uses city-aware queries: "Zone Name, City"

   - Supports Swedish names for bilingual areas

## Zone ID Format

Zones use a prefixed ID format: `{CITY_CODE}-{ORIGINAL_ID}`

Examples:
- `HEL-101` - Vilhonvuori, Helsinki
- `VAN-51` - Ylästö, Vantaa
- `ESP-1` - Kunnarla, Espoo

## Database Schema Changes

The `places` table now includes:
- `city` - City name
- `name_se` - Swedish name (optional)
- `admin_level` - Administrative level
- `source_layer` - WFS layer name

## Usage

### Fetch Multi-City Zones

```typescript
import { fetchZonesMultiCity } from './lib/zones';

const result = await fetchZonesMultiCity(db, {
  testMode: false,
  emitter: progressEmitter
});
```

### Individual City Fetchers

```typescript
import { HelsinkiFetcher, VantaaFetcher, EspooFetcher } from './lib/city-fetchers';

const helsinki = new HelsinkiFetcher();
const zones = await helsinki.fetchFeatures();
const parsed = zones.map(z => helsinki.parseFeature(z));
```

## Data Sources

### Helsinki

- **URL**: <https://kartta.hel.fi/ws/geoserver/avoindata/wfs>

- **Layer**: avoindata:Maavesi_osa_alueet

- **Format**: GeoJSON

- **Properties**: tunnus, nimi_fi, nimi_se

### Vantaa

- **URL**: <https://gis.vantaa.fi/geoserver/wfs>

- **Layer**: indeksit:kaupunginosat

- **Format**: GeoJSON

- **Properties**: kosanimi, kosa_ruotsiksi

### Espoo

- **URL**: <https://kartat.espoo.fi/teklaogcweb/wfs.ashx>

- **Layer**: kanta:TilastollinenAlue

- **Format**: GML XML

- **Coordinate System**: EPSG:3879 → EPSG:4326

- **Properties**: tunnus, nimi, tyyppi

## Benefits

1. **Better Granularity**: Administrative areas provide more meaningful zones than postal codes
2. **City Coverage**: Covers entire Helsinki metropolitan region, not just Helsinki
3. **Bilingual Support**: Includes Swedish names for bilingual areas
4. **Modular Design**: Easy to add new cities or change data sources
5. **Backward Compatibility**: Original postal code system preserved

## Migration

See the Migration Guide in AGENTS.md for detailed steps to migrate from postal codes to multi-city zones.

## Testing

Run test mode with 5 zones:
```bash
pnpm dev
# Select option 1 (Fetch Zones)
# Press 't' to toggle test mode
# Press Enter to run
```

Verify database content:
```sql
SELECT city, COUNT(*) as count 
FROM places 
GROUP BY city;
```

## Future Enhancements

1. **Kauniainen Support**: Framework ready for Kauniainen zones
2. **Custom Zones**: Add ability to define custom zones
3. **Dynamic Boundaries**: Support for time-based boundary changes
4. **Performance**: Optimize for larger datasets
