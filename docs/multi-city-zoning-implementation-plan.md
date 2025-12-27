# Multi-City Zoning Implementation Plan (Option B: Mixed Granularity)

**Status:** Planning Document
**Created:** 2025-12-27
**Target:** Replace postal code zoning with named administrative areas across Helsinki region
**Approach:** Use finest available granularity for each city (osa-alue for Helsinki, districts for others)

---

## Executive Summary

This plan replaces the current postal code-based zoning system with culturally meaningful, named administrative areas across the Helsinki metropolitan region. The approach uses the finest available official administrative divisions for each city:

- **Helsinki**: 148 osa-alue (sub-districts) - very granular
- **Vantaa**: 61 kaupunginosa (districts) - medium granularity
- **Espoo**: Statistical areas or districts - granularity TBD

**Expected Outcome:** ~250-300 named zones vs current ~60 postal codes (4-5x increase in granularity)

---

## Goals

### Primary Goals
1. Replace postal code zones with named administrative areas that locals recognize
2. Maximize granularity while using reliable, officially maintained data sources
3. Support multi-city coverage (Helsinki, Vantaa, Espoo at minimum)
4. Maintain backward compatibility with existing database schema and routing system
5. Preserve SVG rendering and visualization capabilities

### Secondary Goals
- Enable future addition of more cities (Kauniainen, etc.)
- Support easy switching between different administrative levels
- Document data sources for future maintenance
- Create extensible architecture for hybrid OSM data in future

---

## Data Sources

### Helsinki - Osa-alue (Sub-districts)

**Source:** City of Helsinki WFS API
**Endpoint:** `https://kartta.hel.fi/ws/geoserver/avoindata/wfs`
**Layer:** `avoindata:Maavesi_osa_alueet`
**Format:** GeoJSON (application/json)
**Coordinate System:** EPSG:4326 (WGS84)
**License:** CC BY 4.0

**Feature Properties:**
```javascript
{
  "tietopalvelu_id": 164,           // Unique ID
  "aluejako": "OSA-ALUE",            // Type classification
  "tunnus": "101",                   // District code
  "nimi_fi": "Vilhonvuori",         // Finnish name
  "nimi_se": "Vilhelmsberg",        // Swedish name
  "tyyppi": "Maa-alue",             // Land area type
  "pa": 426258.84,                  // Area in square units
  "paivitetty_tietopalveluun": "2024-01-15"
}
```

**Geometry Type:** MultiPolygon
**Count:** 148 zones
**Coverage:** Helsinki city boundaries

**WFS Request Example:**
```
https://kartta.hel.fi/ws/geoserver/avoindata/wfs?
  service=WFS&
  version=2.0.0&
  request=GetFeature&
  typeName=avoindata:Maavesi_osa_alueet&
  outputFormat=application/json&
  srsName=EPSG:4326
```

---

### Vantaa - Kaupunginosa (Districts)

**Source:** City of Vantaa WFS API
**Endpoint:** `http://gis.vantaa.fi/geoserver/wfs`
**Layer:** `indeksit:kaupunginosat`
**Format:** GeoJSON (application/json)
**Coordinate System:** EPSG:3879 (default), supports EPSG:4326
**License:** Open data (verify exact license)

**Feature Properties:** (To be verified during implementation)
```javascript
{
  "tunnus": "...",      // District code
  "nimi": "...",        // Finnish name (or "nimi_fi")
  // Swedish name field - verify field name
  // Additional metadata fields TBD
}
```

**Geometry Type:** MultiPolygon (verify)
**Count:** 61 districts
**Coverage:** Vantaa city boundaries

**WFS Request Example:**
```
http://gis.vantaa.fi/geoserver/wfs?
  service=WFS&
  version=2.0.0&
  request=GetFeature&
  typeName=indeksit:kaupunginosat&
  outputFormat=application/json&
  srsName=EPSG:4326
```

**Implementation Note:** Verify exact property field names during implementation by fetching sample data first.

---

### Espoo - Statistical Areas or Districts

**Source:** City of Espoo WFS API
**Endpoint:** `https://kartat.espoo.fi/teklaogcweb/wfs.ashx`
**Layer Options:**
  1. `kanta:TilastollinenAlue` (Statistical areas - preferred if granular)
  2. `GIS:Kaupunginosat` (Districts - fallback)
**Format:** GML 2.1.2 or GML 3.1.1 (XML) - **requires parsing**
**Coordinate System:** EPSG:3879 (default), supports EPSG:4326
**License:** CC BY 4.0

**WFS Version:** 1.1.0 (NOT 2.0.0)

**Feature Properties:** (To be verified during implementation)
```javascript
{
  // Property field names TBD - extract from GML response
  // Expected: tunnus/id, nimi/nimi_fi, possibly nimi_se
}
```

**Geometry Type:** Polygon or MultiPolygon (verify from GML)
**Count:** Unknown - **MUST VERIFY DURING IMPLEMENTATION**
**Coverage:** Espoo city boundaries

**WFS Request Example:**
```
https://kartat.espoo.fi/teklaogcweb/wfs.ashx?
  service=WFS&
  version=1.1.0&
  request=GetFeature&
  typeName=kanta:TilastollinenAlue&
  outputFormat=text/xml; subtype=gml/3.1.1
```

**Critical Implementation Steps for Espoo:**
1. Fetch `kanta:TilastollinenAlue` and count features
2. Verify it has name properties and reasonable granularity (ideally 80-120+ zones)
3. If statistical areas are too coarse or lack names, fall back to `GIS:Kaupunginosat`
4. Parse GML XML to extract geometries and properties
5. Convert to GeoJSON-compatible internal format

**GML Parsing:** Use library like `xml2js` or `fast-xml-parser` to parse XML, then extract geometry coordinates and properties. May need custom GML-to-GeoJSON converter.

---

## Technical Architecture

### Zone ID Format

To avoid ID conflicts between cities, use prefixed IDs:

```javascript
const generateZoneId = (cityCode, originalId) => `${cityCode}-${originalId}`

// Examples:
// "HEL-232" - Helsinki osa-alue tunnus 232 (Arabianranta)
// "VAN-045" - Vantaa kaupunginosa 045
// "ESP-T89" - Espoo statistical area 89
```

**City Codes:**
- `HEL` - Helsinki
- `VAN` - Vantaa
- `ESP` - Espoo
- `KAU` - Kauniainen (future)

### Database Schema

The existing `places` table schema remains unchanged:

```sql
CREATE TABLE places (
  id TEXT PRIMARY KEY,           -- Prefixed zone ID (e.g., "HEL-232")
  name TEXT,                     -- Finnish name (nimi_fi)
  lat REAL,                      -- Geometric centroid latitude
  lon REAL,                      -- Geometric centroid longitude
  geometry TEXT,                 -- GeoJSON geometry as JSON string
  svg_path TEXT,                 -- Pre-rendered SVG path
  routing_lat REAL,              -- Geocoded routing point latitude
  routing_lon REAL,              -- Geocoded routing point longitude
  routing_source TEXT            -- Source of routing coordinates
);
```

**New Optional Fields** (consider adding):
```sql
ALTER TABLE places ADD COLUMN city TEXT;           -- City name: "Helsinki", "Vantaa", "Espoo"
ALTER TABLE places ADD COLUMN name_se TEXT;        -- Swedish name
ALTER TABLE places ADD COLUMN admin_level TEXT;    -- "osa-alue", "kaupunginosa", etc.
ALTER TABLE places ADD COLUMN area_sqm REAL;       -- Area in square meters
ALTER TABLE places ADD COLUMN source_layer TEXT;   -- Original WFS layer name
```

These additions are optional but recommended for debugging and future analytics.

### Data Processing Pipeline

The fetch script should follow this architecture:

```javascript
// High-level pipeline
async function fetchAllZones() {
  const allZones = []

  // 1. Fetch from each city
  const helsinkiZones = await fetchHelsinki()
  const vantaaZones = await fetchVantaa()
  const espooZones = await fetchEspoo()

  // 2. Merge all zones
  allZones.push(...helsinkiZones, ...vantaaZones, ...espooZones)

  // 3. Filter by visible area
  const visibleZones = filterByVisibleArea(allZones, visibleBounds)

  // 4. Process geometries
  const processedZones = visibleZones.map(zone => ({
    ...zone,
    centroid: calculateCentroid(zone.geometry),
    svgPath: generateSvgPath(zone.geometry, projection)
  }))

  // 5. Insert to database
  insertToDatabase(processedZones)

  return processedZones
}
```

### Abstraction Layer: City Fetchers

Create a standardized interface for fetching from different cities:

```typescript
interface CityFetcher {
  name: string
  cityCode: string

  // Fetch raw features from WFS
  fetchFeatures(): Promise<Feature[]>

  // Parse city-specific properties to standard format
  parseFeature(feature: any): StandardZone
}

interface StandardZone {
  originalId: string        // City's original zone ID/code
  cityCode: string          // "HEL", "VAN", "ESP"
  name: string              // Finnish name
  nameSe?: string           // Swedish name
  adminLevel: string        // "osa-alue", "kaupunginosa", etc.
  geometry: GeoJSON.Geometry
  metadata: {
    city: string
    sourceLayer: string
    area?: number
    [key: string]: any
  }
}
```

**Example Implementation:**

```javascript
class HelsinkiFetcher {
  async fetchFeatures() {
    const url = 'https://kartta.hel.fi/ws/geoserver/avoindata/wfs?...'
    const response = await axios.get(url)
    return response.data.features
  }

  parseFeature(feature) {
    return {
      originalId: feature.properties.tunnus,
      cityCode: 'HEL',
      name: feature.properties.nimi_fi,
      nameSe: feature.properties.nimi_se,
      adminLevel: 'osa-alue',
      geometry: feature.geometry,
      metadata: {
        city: 'Helsinki',
        sourceLayer: 'avoindata:Maavesi_osa_alueet',
        area: feature.properties.pa
      }
    }
  }
}

class VantaaFetcher {
  async fetchFeatures() {
    const url = 'http://gis.vantaa.fi/geoserver/wfs?...'
    const response = await axios.get(url)
    return response.data.features
  }

  parseFeature(feature) {
    return {
      originalId: feature.properties.tunnus,
      cityCode: 'VAN',
      name: feature.properties.nimi,  // Verify field name!
      nameSe: feature.properties.nimi_se,  // Verify if exists!
      adminLevel: 'kaupunginosa',
      geometry: feature.geometry,
      metadata: {
        city: 'Vantaa',
        sourceLayer: 'indeksit:kaupunginosat'
      }
    }
  }
}

class EspooFetcher {
  async fetchFeatures() {
    const url = 'https://kartat.espoo.fi/teklaogcweb/wfs.ashx?...'
    const response = await axios.get(url)

    // Parse GML XML to GeoJSON-like features
    const features = await parseGMLToFeatures(response.data)
    return features
  }

  parseFeature(feature) {
    return {
      originalId: feature.properties.tunnus,  // Verify field name!
      cityCode: 'ESP',
      name: feature.properties.nimi,  // Verify field name!
      nameSe: feature.properties.nimi_se,  // Verify if exists!
      adminLevel: 'tilastollinen_alue',  // or 'kaupunginosa'
      geometry: feature.geometry,
      metadata: {
        city: 'Espoo',
        sourceLayer: 'kanta:TilastollinenAlue'
      }
    }
  }
}
```

---

## Implementation Steps

### Phase 1: Research & Validation

**Goal:** Verify data sources and property schemas before writing code.

1. **Verify Helsinki osa-alue data:**
   - Fetch sample features and examine property structure
   - Confirm field names match documentation
   - Verify geometry types and coordinate system

2. **Verify Vantaa kaupunginosa data:**
   - Fetch sample features
   - **CRITICAL:** Determine exact property field names (may differ from Helsinki)
   - Check if Swedish names are available
   - Verify geometry types

3. **Evaluate Espoo options:**
   - Fetch `kanta:TilastollinenAlue` (statistical areas)
   - Count total features
   - Parse GML to extract property names
   - Assess granularity - is it fine enough?
   - **Decision point:** Use statistical areas OR fall back to `GIS:Kaupunginosat`

4. **Document findings:**
   - Create a data source reference document
   - List exact property field names for each city
   - Note any quirks or special handling needed

### Phase 2: GML Parser for Espoo

**Goal:** Create reliable GML-to-GeoJSON converter for Espoo data.

1. **Install XML parsing library:**
   ```bash
   npm install fast-xml-parser
   # or
   npm install xml2js
   ```

2. **Implement GML parser:**
   - Parse GML XML structure
   - Extract geometry coordinates (handle `gml:Polygon`, `gml:MultiPolygon`)
   - Convert GML coordinate format to GeoJSON [[lon, lat]] format
   - Extract feature properties

3. **Handle coordinate system conversion:**
   - If Espoo returns EPSG:3879, convert to EPSG:4326
   - Consider using `proj4` library: `npm install proj4`
   - Define transformation: `proj4(EPSG3879, EPSG4326, [x, y])`

4. **Test GML parser:**
   - Verify geometry conversion correctness
   - Ensure all features parse successfully
   - Validate output matches GeoJSON spec

**Reference GML Structure (example to handle):**
```xml
<gml:Polygon>
  <gml:exterior>
    <gml:LinearRing>
      <gml:posList>
        x1 y1 x2 y2 x3 y3 ...
      </gml:posList>
    </gml:LinearRing>
  </gml:exterior>
</gml:Polygon>
```

### Phase 3: Implement City Fetchers

**Goal:** Create modular, testable fetchers for each city.

1. **Create fetcher interface/base class:**
   - Define standard contract for all fetchers
   - Implement common utilities (HTTP fetch, error handling)

2. **Implement Helsinki fetcher:**
   - Straightforward - uses GeoJSON
   - Map properties to standard format
   - Handle MultiPolygon geometries

3. **Implement Vantaa fetcher:**
   - Similar to Helsinki but verify field names
   - Handle any city-specific quirks

4. **Implement Espoo fetcher:**
   - Use GML parser from Phase 2
   - Handle potential coordinate system conversion
   - Decide on TilastollinenAlue vs Kaupunginosat based on Phase 1 findings

5. **Add error handling:**
   - HTTP request failures
   - Malformed responses
   - Missing required properties
   - Invalid geometries

### Phase 4: Update Fetch Script

**Goal:** Modify `fetch_zones.ts` (or create new script) to use multi-city fetchers.

1. **Initialize all fetchers:**
   ```javascript
   const fetchers = [
     new HelsinkiFetcher(),
     new VantaaFetcher(),
     new EspooFetcher()
   ]
   ```

2. **Fetch from all cities in parallel:**
   ```javascript
   const allFeatures = await Promise.all(
     fetchers.map(f => f.fetchFeatures())
   )
   const merged = allFeatures.flat()
   ```

3. **Parse features to standard format:**
   ```javascript
   const standardZones = merged.map((feature, fetcher) =>
     fetcher.parseFeature(feature)
   )
   ```

4. **Generate zone IDs:**
   ```javascript
   const zonesWithIds = standardZones.map(zone => ({
     ...zone,
     id: `${zone.cityCode}-${zone.originalId}`
   }))
   ```

5. **Filter by visible area:**
   - Reuse existing `getVisibleAreaBounds()` logic
   - Reuse existing `isGeometryInVisibleArea()` logic
   - Filter zones to only those intersecting viewport

6. **Process geometries:**
   - Calculate centroids using Turf.js
   - Generate SVG paths using D3.js projection
   - Clean invalid geometry rings

7. **Insert to database:**
   - Use existing database insertion logic
   - Consider adding new optional columns (city, name_se, admin_level)
   - Generate routes Cartesian product as before

### Phase 5: Update Geocoding Script

**Goal:** Adapt `geocode_zones.ts` to handle multi-city zones.

1. **Modify geocoding address format:**
   - Current: `{postal_code}, Helsinki`
   - New: `{zone_name}, {city_name}`
   - Example: `"Arabianranta, Helsinki"`, `"Tikkurila, Vantaa"`, `"Tapiola, Espoo"`

2. **Extract city from zone ID:**
   ```javascript
   const getCity = (zoneId) => {
     const cityCode = zoneId.split('-')[0]
     return {
       'HEL': 'Helsinki',
       'VAN': 'Vantaa',
       'ESP': 'Espoo'
     }[cityCode]
   }
   ```

3. **Geocode with city context:**
   ```javascript
   const address = `${zone.name}, ${getCity(zone.id)}`
   const coords = await geocodeAddress(address)
   ```

4. **Add fallback strategies:**
   - Try Swedish name if Finnish fails
   - Try without city name
   - Fall back to geometric centroid if all fail

### Phase 6: Testing & Validation

**Goal:** Ensure data quality and correctness.

1. **Verify zone counts:**
   - Helsinki: ~148 zones
   - Vantaa: ~61 zones
   - Espoo: Verify actual count matches expectations
   - Total: ~250-300 zones

2. **Spot-check zone data:**
   - Verify well-known areas appear correctly:
     - Helsinki: Kallio, Arabianranta, Kamppi, Punavuori
     - Vantaa: Tikkurila, Myyrmäki, Hakunila
     - Espoo: Tapiola, Otaniemi, Leppävaara, Espoonlahti
   - Check geometries render correctly on map
   - Verify names are in Finnish (not Swedish or English)

3. **Test boundary cases:**
   - Zones at city boundaries
   - MultiPolygon geometries (islands, disconnected areas)
   - Very small or very large zones
   - Zones at edge of visible area

4. **Validate geocoding:**
   - Check routing points fall within zone boundaries
   - Verify routing points are on valid streets
   - Ensure no routing points in water/parks

5. **Performance testing:**
   - Measure fetch time for all cities
   - Measure database insertion time
   - Measure route building time (~250 * 250 * 3 = ~187,500 routes)
   - Ensure acceptable performance (<10min for full rebuild)

### Phase 7: Documentation & Handoff

**Goal:** Document the implementation for future maintainers.

1. **Update code comments:**
   - Document data source URLs
   - Explain city-specific quirks
   - Note any assumptions or limitations

2. **Create maintenance guide:**
   - How to add new cities
   - How to update WFS endpoints if they change
   - How to switch between administrative levels
   - Troubleshooting common issues

3. **Document data refresh process:**
   - How often to refresh zone data (quarterly? annually?)
   - What to do if WFS endpoints are down
   - How to verify data freshness

---

## Integration Points

### Files to Modify

1. **`varikko/src/fetch_zones.ts`** (or create new `fetch_zones_multi_city.ts`)
   - Main changes: Replace single WFS fetch with multi-city fetchers
   - Add GML parsing for Espoo
   - Update zone ID generation
   - Keep existing geometry processing logic

2. **`varikko/src/geocode_zones.ts`**
   - Update address format to include city name
   - Add city extraction from zone ID
   - Update fallback strategies

3. **`opas/src/stores/mapData.ts`** (if needed)
   - Should work without changes (loads from database)
   - May want to add city filtering/grouping logic

4. **`opas/src/components/InteractiveMap.vue`** (if needed)
   - Should work without changes
   - May want to add visual distinction between cities (border colors?)

5. **`opas/src/components/InfoPanel.vue`** (if needed)
   - Update to show city name
   - Show admin level (osa-alue vs kaupunginosa)
   - Display Swedish name if available

### Dependencies to Add

```json
{
  "dependencies": {
    "fast-xml-parser": "^4.3.0",  // For parsing Espoo's GML
    "proj4": "^2.9.0"              // For coordinate system conversion (if needed)
  }
}
```

### Environment/Config Considerations

Consider adding configuration file for data sources:

```javascript
// config/data_sources.js
export const DATA_SOURCES = {
  helsinki: {
    url: 'https://kartta.hel.fi/ws/geoserver/avoindata/wfs',
    layer: 'avoindata:Maavesi_osa_alueet',
    format: 'geojson',
    cityCode: 'HEL',
    cityName: 'Helsinki'
  },
  vantaa: {
    url: 'http://gis.vantaa.fi/geoserver/wfs',
    layer: 'indeksit:kaupunginosat',
    format: 'geojson',
    cityCode: 'VAN',
    cityName: 'Vantaa'
  },
  espoo: {
    url: 'https://kartat.espoo.fi/teklaogcweb/wfs.ashx',
    layer: 'kanta:TilastollinenAlue',
    format: 'gml',
    version: '1.1.0',
    cityCode: 'ESP',
    cityName: 'Espoo'
  }
}
```

---

## Edge Cases & Considerations

### Granularity Mismatch

**Problem:** Helsinki zones will be much smaller than Vantaa/Espoo zones.

**Visual Impact:** Map will show very fine detail in Helsinki, coarser detail in suburbs.

**Acceptable?** Yes - this reflects reality of how transit service density varies by location. More central areas (Helsinki) naturally have denser zones.

**Mitigation:**
- Could add visual cues (border thickness?) to indicate zone size
- Document this in UI (show zone area in info panel?)
- Consider adding zone area as a data field for future analytics

### City Boundaries

**Problem:** Some zones might span city boundaries (unlikely but possible with statistical areas).

**Handling:**
- Assign zone to city that contains its centroid
- Or: Keep separate if both cities claim the same area
- Document which city a zone belongs to using the city prefix

### Missing Swedish Names

**Problem:** Some datasets might not include Swedish names (Vantaa TBD).

**Handling:**
- Make `name_se` optional in database
- Display only Finnish name if Swedish unavailable
- Consider adding Swedish names manually for major areas (low priority)

### Espoo Data Quality

**Problem:** Espoo uses GML format, harder to work with, potentially lower quality.

**Risks:**
- GML parsing bugs
- Geometry conversion errors
- Missing or malformed data

**Mitigation:**
- Thorough testing of GML parser
- Validate all geometries after parsing
- Log warnings for any problematic zones
- Have fallback to `GIS:Kaupunginosat` if `TilastollinenAlue` is problematic

### Coordinate System Conversion

**Problem:** If Espoo returns EPSG:3879 instead of EPSG:4326.

**Handling:**
- Use proj4 to convert to WGS84
- Verify conversion accuracy (spot-check known locations)
- Document projection parameters

**EPSG:3879 Definition:**
```javascript
import proj4 from 'proj4'

proj4.defs("EPSG:3879",
  "+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 " +
  "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
)

const toWGS84 = (x, y) => proj4('EPSG:3879', 'EPSG:4326', [x, y])
```

### Performance with Increased Zone Count

**Current:** ~60 postal codes = 60 * 60 * 3 = ~10,800 routes
**New:** ~250 zones = 250 * 250 * 3 = ~187,500 routes (17x increase!)

**Impact:**
- Route building will take much longer
- Database size will increase significantly
- May need pagination/chunking in route builder

**Optimization Strategies:**
1. **Parallel route fetching:** Use worker threads or multiple concurrent requests
2. **Incremental builds:** Only fetch routes for new zones, keep existing routes
3. **Caching:** Cache route segments between common transfer points
4. **Filtering:** Only build routes between zones within reasonable distance (e.g., <30km)
5. **Sampling:** For testing, use `--test` mode with subset of zones

**Consideration for Future:**
- May want to implement distance-based filtering (don't route between very distant zones)
- Or: Only fetch routes for "active" zones (zones user has interacted with)

### WFS Service Availability

**Problem:** Any of the WFS services might be temporarily down.

**Handling:**
- Implement retry logic with exponential backoff
- Log errors clearly indicating which city failed
- Allow partial builds (e.g., if Espoo fails, continue with Helsinki + Vantaa)
- Consider caching raw WFS responses for faster retries

### Data Freshness

**Problem:** Administrative boundaries change (rarely, but it happens).

**Handling:**
- Add metadata table field for last update date per city
- Script to check for data updates
- Document expected update frequency (likely annual or less)
- Version control zone data for reproducibility

---

## Testing Strategy

### Unit Tests

1. **GML Parser:**
   - Test parsing of sample GML responses
   - Test coordinate conversion
   - Test handling of Polygon vs MultiPolygon
   - Test error handling for malformed GML

2. **City Fetchers:**
   - Mock HTTP responses
   - Test property parsing
   - Test ID generation
   - Test error handling

3. **Geometry Processing:**
   - Test centroid calculation for various shapes
   - Test SVG path generation
   - Test visible area filtering
   - Test geometry cleaning

### Integration Tests

1. **End-to-End Fetch:**
   - Run full fetch with `--test` flag (limited zones)
   - Verify database populated correctly
   - Check all cities represented
   - Validate zone counts

2. **Geocoding:**
   - Test geocoding for sample zones from each city
   - Verify coordinates fall within zone boundaries
   - Check fallback strategies work

3. **Routing:**
   - Build sample routes between zones from different cities
   - Verify cross-city routes work (Helsinki ↔ Vantaa)
   - Check route geometries are valid

### Manual Validation

1. **Visual Inspection:**
   - Load map in browser
   - Check all zones render correctly
   - Verify colors/boundaries look reasonable
   - Test hover/click interactions

2. **Spot-Check Data:**
   - Pick 5-10 well-known areas
   - Verify names are correct
   - Check boundaries match reality (compare to online maps)

3. **Cross-City Boundaries:**
   - Check zones near city boundaries
   - Verify no gaps or overlaps
   - Check transitions look natural

---

## Rollback Plan

If implementation fails or data quality is poor:

1. **Keep original fetch script:** Don't delete `fetch_zones.ts`, rename to `fetch_zones_postal.ts`
2. **Database backup:** Back up database before first multi-city build
3. **Feature flag:** Consider adding flag to switch between postal codes and admin areas
4. **Gradual rollout:** Test with `--test` mode extensively before full build

---

## Future Enhancements

After successful Option B implementation, consider:

1. **Add Kauniainen:** Small city between Helsinki/Espoo, easy to add with same pattern
2. **OSM place names:** Layer colloquial neighborhood names on top of official boundaries
3. **Zone hierarchy:** Store parent-child relationships (osa-alue → peruspiiri → suurpiiri)
4. **User-selectable granularity:** Let users choose admin level (coarse/medium/fine)
5. **Distance-based route filtering:** Only build routes within reasonable travel distance
6. **Incremental updates:** Only fetch changed zones, not full rebuild each time

---

## Success Metrics

Implementation is successful when:

- [ ] All three cities (Helsinki, Vantaa, Espoo) provide zone data
- [ ] Total zone count is 250-300 (or documented reason if different)
- [ ] All zones have Finnish names
- [ ] All zones render correctly on map
- [ ] Geocoding succeeds for >90% of zones
- [ ] Route building completes successfully (may take longer than before)
- [ ] Spot-check of 10 well-known areas shows correct names and boundaries
- [ ] No critical errors in logs
- [ ] Map loads and is interactive in browser

---

## Questions to Resolve During Implementation

1. **Vantaa property names:** What are the exact field names for zone name, ID, etc.?
2. **Espoo granularity:** Does `kanta:TilastollinenAlue` have enough zones? Or fall back to `GIS:Kaupunginosat`?
3. **Espoo property names:** What fields contain zone names and IDs in the GML response?
4. **Coordinate systems:** Does Espoo return EPSG:4326 or EPSG:3879? Need conversion?
5. **Swedish names:** Are Swedish names available for Vantaa and Espoo?
6. **Performance:** Is 187k routes feasible? Need optimization?
7. **Database schema:** Add optional fields (city, name_se, admin_level) or keep minimal?

---

## Reference Links

- [Helsinki osa-alue WFS](https://hri.fi/data/en_GB/dataset/helsingin-piirijako)
- [Vantaa kaupunginosat](https://hri.fi/data/fi/dataset/vantaan-kaupunginosat)
- [Espoo kaupunginosat](https://www.avoindata.fi/data/fi/dataset/espoon-kaupunginosat)
- [Helsinki Region Infoshare](https://hri.fi/en_gb/)
- [GeoJSON Specification](https://datatracker.ietf.org/doc/html/rfc7946)
- [WFS Standard](https://www.ogc.org/standards/wfs)

---

## Appendix: Sample Code Snippets

### GML to GeoJSON Parser (Skeleton)

```javascript
import { XMLParser } from 'fast-xml-parser'

function parseGMLFeature(gmlFeature) {
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(gmlFeature)

  // Extract geometry
  const geometry = extractGeometry(parsed)

  // Extract properties
  const properties = extractProperties(parsed)

  return {
    type: 'Feature',
    geometry: geometry,
    properties: properties
  }
}

function extractGeometry(parsed) {
  // Navigate to gml:Polygon or gml:MultiPolygon
  // Extract coordinate list
  // Convert to GeoJSON coordinate format [[lon, lat], ...]
  // Return geometry object
}

function extractProperties(parsed) {
  // Navigate to feature properties section
  // Extract relevant fields (nimi, tunnus, etc.)
  // Return properties object
}
```

### Parallel City Fetching

```javascript
async function fetchAllCities() {
  const results = await Promise.allSettled([
    fetchHelsinki(),
    fetchVantaa(),
    fetchEspoo()
  ])

  const zones = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      zones.push(...result.value)
    } else {
      console.error('City fetch failed:', result.reason)
      // Continue with other cities
    }
  }

  return zones
}
```

### Zone ID Validation

```javascript
function isValidZoneId(id) {
  return /^(HEL|VAN|ESP|KAU)-\d+$/.test(id)
}

function extractCityCode(id) {
  return id.split('-')[0]
}

function extractOriginalId(id) {
  return id.split('-')[1]
}
```

---

**End of Implementation Plan**
