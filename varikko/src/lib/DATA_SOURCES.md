# Data Sources & Transformations

This document describes the external data sources used for zone fetching and how they are transformed. Useful for maintenance when endpoints change.

## Overview

Zones are fetched from three city WFS endpoints, transformed to a common format, and stored in SQLite.

```
WFS Endpoints → City Fetchers → StandardZone → Processing → Database
```

## City Data Sources

### Helsinki

| Property | Value |
|----------|-------|
| **Endpoint** | `https://kartta.hel.fi/ws/geoserver/avoindata/wfs` |
| **Layer** | `avoindata:Maavesi_osa_alueet` |
| **Format** | GeoJSON |
| **CRS** | EPSG:4326 (native) |
| **Admin Level** | osa-alue (sub-regions) |
| **Expected Count** | ~143 zones |

**Key Properties:**
- `tunnus` → Zone ID (e.g., "101")
- `nimi_fi` → Finnish name
- `nimi_se` → Swedish name

### Vantaa

| Property | Value |
|----------|-------|
| **Endpoint** | `https://gis.vantaa.fi/geoserver/wfs` |
| **Layer** | `indeksit:kaupunginosat` |
| **Format** | GeoJSON |
| **CRS** | EPSG:4326 (requested via `srsName`) |
| **Admin Level** | kaupunginosa (districts) |
| **Expected Count** | ~58 zones |

**Key Properties:**
- `kosanimi` → Finnish name (also used as ID - no numeric tunnus available)
- `kosa_ruotsiksi` → Swedish name
- `suuralue` → Parent region name

**Note:** Vantaa WFS has no `tunnus` or `id` field. Zone IDs are generated from `kosanimi`.

### Espoo

| Property | Value |
|----------|-------|
| **Endpoint** | `https://kartat.espoo.fi/teklaogcweb/wfs.ashx` |
| **Layer** | `kanta:TilastollinenAlue` |
| **Format** | GML XML |
| **CRS** | EPSG:3879 → EPSG:4326 (converted) |
| **Admin Level** | pienalue (small areas) |
| **Expected Count** | ~88 zones |

**Key Properties:**
- `tunnus` → Zone ID (e.g., "635")
- `nimi` → Finnish name
- `tyyppi` → Area type: `pienalue`, `suuralue`, `tilastoalue`

**Filtering:** Only `tyyppi === 'pienalue'` zones are imported. This excludes:
- `suuralue` (7 compound areas like "Suur-Tapiola")
- `tilastoalue` (26 statistical areas)

**GML Parsing:** Espoo uses GML XML with two geometry formats:
1. `gml:Polygon` with `gml:LinearRing` containing `gml:pos` elements
2. `gml:PolyhedralSurface` with nested `gml:PolygonPatch` → `gml:Ring` → `gml:Curve` → `gml:LineStringSegment` → `gml:pos`

See `gml-parser.ts` for implementation details.

## Coordinate Transformation

- **Helsinki/Vantaa:** Already in EPSG:4326 (WGS84)
- **Espoo:** EPSG:3879 (ETRS-GK25) → EPSG:4326 via proj4

```typescript
proj4.defs('EPSG:3879',
  '+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 ' +
  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);
```

## Zone ID Format

All zones get a prefixed ID: `{CITY_CODE}-{ORIGINAL_ID}`

- Helsinki: `HEL-101`, `HEL-102`
- Vantaa: `VAN-Tikkurila`, `VAN-Myyrmäki` (name-based)
- Espoo: `ESP-635`, `ESP-713`

## File Structure

```
lib/
├── city-fetchers.ts   # WFS endpoint definitions & fetchers
├── gml-parser.ts      # Espoo GML XML parsing & coordinate transform
├── zones.ts           # Zone processing, filtering, SVG generation
└── DATA_SOURCES.md    # This file
```

## Troubleshooting

### Endpoint Changes
If a WFS endpoint changes:
1. Update URL in the relevant fetcher class in `city-fetchers.ts`
2. Check if property names changed (e.g., `tunnus` → `id`)
3. Verify CRS - may need new proj4 definition

### Missing Zones
Check the filtering summary in console output:
- `Outside visible area` - zone centroid outside map bounds
- `Invalid geometry` - GML parsing failed
- `Centroid failed` - couldn't calculate centroid

### Espoo GML Issues
If Espoo zones fail to parse:
1. Check if GML structure changed (new geometry types)
2. Verify `tyyppi` values haven't changed
3. Test with: `curl -s "ESPOO_URL" | grep -o '<kanta:tyyppi>[^<]*'`

## Last Verified

- **Helsinki:** December 2024
- **Vantaa:** December 2024
- **Espoo:** December 2024
