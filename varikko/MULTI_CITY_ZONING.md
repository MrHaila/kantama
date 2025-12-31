# Multi-City Zoning

Fetches administrative zones from four cities in the Helsinki metropolitan region.

## Overview

| City | Admin Level | Zone Count |
|------|-------------|------------|
| Helsinki | osa-alue (sub-regions) | ~143 |
| Vantaa | kaupunginosa (districts) | ~58 |
| Espoo | pienalue (small areas) | ~88 |
| Kauniainen | kunta (municipality) | 1 |

## Zone ID Format

Zones use prefixed IDs: `{CITY_CODE}-{ORIGINAL_ID}`

- `HEL-101` - Vilhonvuori, Helsinki
- `VAN-Tikkurila` - Tikkurila, Vantaa (name-based)
- `ESP-635` - Espoo zone
- `KAU-001` - Kauniainen (single zone)

## Architecture

### Core Components

- **city-fetchers.ts** - City-specific WFS fetchers
- **gml-parser.ts** - Espoo GML XML parsing + coordinate transform
- **zones.ts** - Multi-city fetch orchestration

### Data Sources

**Helsinki**
- URL: `https://kartta.hel.fi/ws/geoserver/avoindata/wfs`
- Layer: `avoindata:Maavesi_osa_alueet`
- Format: GeoJSON

**Vantaa**
- URL: `https://gis.vantaa.fi/geoserver/wfs`
- Layer: `indeksit:kaupunginosat`
- Format: GeoJSON

**Espoo**
- URL: `https://kartat.espoo.fi/teklaogcweb/wfs.ashx`
- Layer: `kanta:TilastollinenAlue`
- Format: GML XML (EPSG:3879 -> EPSG:4326)

**Kauniainen**
- URL: `https://kartta.hsy.fi/geoserver/wfs`
- Layer: `taustakartat_ja_aluejaot:seutukartta_kunta_2021`
- Format: GeoJSON

## Usage

```bash
# Fetch all zones
pnpm dev fetch

# Test with limited zones
pnpm dev fetch --limit 5
```

## Data Storage

Zones stored in `opas/public/data/zones.json`:

```typescript
interface Zone {
  id: string           // "HEL-101", "VAN-Tikkurila"
  name: string         // Finnish name
  city: string         // Helsinki, Vantaa, Espoo, Kauniainen
  svgPath: string      // Pre-rendered SVG path
  routingPoint: [lat, lon]
}
```

## Benefits

1. **Better Granularity** - Administrative areas more meaningful than postal codes
2. **Full Coverage** - Entire Helsinki metropolitan region
3. **Bilingual Support** - Swedish names for bilingual areas
4. **Modular Design** - Easy to add new cities or change sources
