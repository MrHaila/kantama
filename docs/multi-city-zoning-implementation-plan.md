# Multi-City Zoning Implementation Plan (Option B: Mixed Granularity)

**Status:** Planning Document (Updated for Varikko TUI)
**Created:** 2025-12-27
**Updated:** 2025-12-27 (Post-rebase on main)
**Target:** Replace postal code zoning with named administrative areas across Helsinki region
**Approach:** Use finest available granularity for each city (osa-alue for Helsinki, districts for others)

---

## Executive Summary

This plan replaces the current postal code-based zoning system with culturally meaningful, named administrative areas across the Helsinki metropolitan region. The approach uses the finest available official administrative divisions for each city:

- **Helsinki**: 148 osa-alue (sub-districts) - very granular
- **Vantaa**: 61 kaupunginosa (districts) - medium granularity
- **Espoo**: Statistical areas or districts - granularity TBD

**Expected Outcome:** ~250-300 named zones vs current ~60 postal codes (4-5x increase in granularity)

**Architecture:** Integrates with the new Varikko TUI (Terminal User Interface) modular architecture.

---

## Varikko Architecture Overview

### Current Structure (Post-Refactor)

Varikko is now a **TUI-based data pipeline** using Ink (React for terminals):

```
varikko/
├── src/
│   ├── main.ts                 # Entry point, launches TUI
│   ├── cli.ts                  # CLI argument parsing
│   ├── lib/                    # Core modules (where changes go)
│   │   ├── zones.ts           # ⭐ Zone fetching - PRIMARY MODIFICATION TARGET
│   │   ├── geocoding.ts       # Geocoding functionality
│   │   ├── routing.ts         # Route building
│   │   ├── db.ts              # Database utilities
│   │   ├── events.ts          # ProgressEmitter for TUI
│   │   ├── deciles.ts         # Decile calculations
│   │   ├── maps.ts            # Map processing
│   │   ├── clearing.ts        # Route clearing
│   │   └── logger.ts          # Logging
│   └── tui/                   # TUI components and screens
│       ├── app.tsx            # Main TUI app
│       ├── components/        # Reusable TUI components
│       └── screens/           # Workflow screens
│           ├── fetch-zones.tsx # ⭐ MODIFICATION TARGET
│           ├── geocode.tsx
│           ├── routes.tsx
│           └── ...
```

### Key Patterns to Follow

1. **Modular library functions** in `src/lib/` - pure logic, no UI
2. **TUI screens** in `src/tui/screens/` - React components using lib functions
3. **ProgressEmitter** for async progress tracking
4. **Database utilities** in `src/lib/db.ts` for standard operations
5. **TypeScript** for type safety

---

## Goals

### Primary Goals
1. Replace postal code zones with named administrative areas
2. Support multi-city coverage (Helsinki, Vantaa, Espoo)
3. Integrate seamlessly with existing Varikko TUI architecture
4. Maintain backward compatibility with database schema
5. Use ProgressEmitter for TUI progress tracking

### Secondary Goals
- Enable easy addition of more cities (Kauniainen, etc.)
- Create reusable city fetcher abstraction
- Document data sources for future maintenance
- Support both TUI and standalone script modes

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
```typescript
interface HelsinkiFeatureProperties {
  tietopalvelu_id: number;
  aluejako: string;           // "OSA-ALUE"
  tunnus: string;             // District code
  nimi_fi: string;            // Finnish name
  nimi_se: string;            // Swedish name
  tyyppi: string;             // "Maa-alue"
  pa: number;                 // Area in square units
  paivitetty_tietopalveluun: string;
}
```

**Geometry Type:** MultiPolygon
**Count:** 148 zones

---

### Vantaa - Kaupunginosa (Districts)

**Source:** City of Vantaa WFS API
**Endpoint:** `http://gis.vantaa.fi/geoserver/wfs`
**Layer:** `indeksit:kaupunginosat`
**Format:** GeoJSON (application/json)
**Coordinate System:** EPSG:3879 (default), supports EPSG:4326
**License:** Open data

**Feature Properties:** (To be verified during implementation)
```typescript
interface VantaaFeatureProperties {
  tunnus?: string;      // District code
  nimi?: string;        // Finnish name
  nimi_fi?: string;     // Alternative field name
  nimi_se?: string;     // Swedish name (if available)
  // Exact field names TBD - verify during Phase 1
}
```

**Count:** 61 districts

---

### Espoo - Statistical Areas or Districts

**Source:** City of Espoo WFS API
**Endpoint:** `https://kartat.espoo.fi/teklaogcweb/wfs.ashx`
**Layer Options:**
  1. `kanta:TilastollinenAlue` (Statistical areas - preferred)
  2. `GIS:Kaupunginosat` (Districts - fallback)
**Format:** GML 2.1.2 or GML 3.1.1 (XML) - **requires parsing**
**WFS Version:** 1.1.0
**License:** CC BY 4.0

**Critical:** Must evaluate granularity during Phase 1 and decide which layer to use.

---

## Technical Architecture

### Zone ID Format

Use prefixed IDs to avoid conflicts between cities:

```typescript
const CITY_CODES = {
  HELSINKI: 'HEL',
  VANTAA: 'VAN',
  ESPOO: 'ESP',
  KAUNIAINEN: 'KAU'
} as const;

type CityCode = typeof CITY_CODES[keyof typeof CITY_CODES];

function generateZoneId(cityCode: CityCode, originalId: string): string {
  return `${cityCode}-${originalId}`;
}

// Examples:
// "HEL-232" - Helsinki osa-alue tunnus 232 (Arabianranta)
// "VAN-045" - Vantaa kaupunginosa 045
// "ESP-T89" - Espoo statistical area 89
```

### Database Schema

The existing schema remains unchanged (backward compatible):

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
  routing_source TEXT,           -- Source of routing coordinates
  geocoding_error TEXT           -- Geocoding error message (if any)
);
```

**Optional New Columns** (consider adding for better tracking):
```sql
-- Add these columns to enhance debugging and analytics:
ALTER TABLE places ADD COLUMN city TEXT;           -- "Helsinki", "Vantaa", "Espoo"
ALTER TABLE places ADD COLUMN name_se TEXT;        -- Swedish name
ALTER TABLE places ADD COLUMN admin_level TEXT;    -- "osa-alue", "kaupunginosa", etc.
ALTER TABLE places ADD COLUMN source_layer TEXT;   -- Original WFS layer name
```

### Type Definitions

Add to `src/lib/zones.ts` or new `src/lib/types.ts`:

```typescript
export interface StandardZone {
  originalId: string;       // City's original zone ID/code
  cityCode: CityCode;       // "HEL", "VAN", "ESP"
  city: string;             // "Helsinki", "Vantaa", "Espoo"
  name: string;             // Finnish name
  nameSe?: string;          // Swedish name
  adminLevel: string;       // "osa-alue", "kaupunginosa", "tilastollinen_alue"
  geometry: GeoJSON.Geometry;
  metadata?: {
    area?: number;
    sourceLayer: string;
    [key: string]: any;
  };
}

export interface ZoneData {
  id: string;               // Prefixed ID
  name: string;
  lat: number;
  lon: number;
  geometry: string;         // JSON string
  svg_path: string;
  city?: string;
  name_se?: string;
  admin_level?: string;
  source_layer?: string;
}

export interface CityFetcher {
  cityCode: CityCode;
  cityName: string;

  // Fetch raw features from WFS/API
  fetchFeatures(): Promise<GeoJSON.Feature[]>;

  // Parse city-specific properties to standard format
  parseFeature(feature: GeoJSON.Feature): StandardZone;
}
```

---

## Implementation Steps

### Phase 1: Research & Validation (1-2 hours)

**Goal:** Verify data sources before writing code.

**Tasks:**

1. **Test Helsinki osa-alue data:**
   ```bash
   curl 'https://kartta.hel.fi/ws/geoserver/avoindata/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=avoindata:Maavesi_osa_alueet&outputFormat=application/json&srsName=EPSG:4326&count=3'
   ```
   - Verify property field names
   - Confirm geometry types
   - Check coordinate system

2. **Test Vantaa kaupunginosa data:**
   ```bash
   curl 'http://gis.vantaa.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=indeksit:kaupunginosat&outputFormat=application/json&srsName=EPSG:4326&count=3'
   ```
   - **CRITICAL:** Determine exact property field names
   - Check if Swedish names exist
   - Verify geometry types

3. **Evaluate Espoo options:**
   ```bash
   # Test statistical areas
   curl 'https://kartat.espoo.fi/teklaogcweb/wfs.ashx?service=WFS&version=1.1.0&request=GetFeature&typeName=kanta:TilastollinenAlue&count=10'

   # Count total features
   curl 'https://kartat.espoo.fi/teklaogcweb/wfs.ashx?service=WFS&version=1.1.0&request=GetFeature&typeName=kanta:TilastollinenAlue&resultType=hits'
   ```
   - Parse GML response manually (or using xml2js)
   - Count total features
   - Extract sample property field names
   - **Decision:** Use TilastollinenAlue OR fall back to GIS:Kaupunginosat

4. **Document findings** in a validation report (markdown file)

### Phase 2: GML Parser for Espoo (2-3 hours)

**Goal:** Create GML-to-GeoJSON parser.

**Tasks:**

1. **Add dependency:**
   ```bash
   cd varikko
   pnpm add fast-xml-parser
   ```

2. **Create GML parser module** (`src/lib/gml-parser.ts`):
   ```typescript
   import { XMLParser } from 'fast-xml-parser';
   import type { Feature, Geometry } from 'geojson';

   export function parseGMLFeatureCollection(gmlXml: string): Feature[] {
     const parser = new XMLParser({
       ignoreAttributes: false,
       attributeNamePrefix: '@_'
     });

     const parsed = parser.parse(gmlXml);

     // Navigate GML structure
     // Extract features, geometries, properties
     // Convert to GeoJSON format

     return features;
   }

   function parseGMLGeometry(gmlGeometry: any): Geometry {
     // Handle gml:Polygon, gml:MultiPolygon
     // Parse gml:posList or gml:coordinates
     // Convert to GeoJSON [[lon, lat]] format
   }
   ```

3. **Handle coordinate system conversion** (if needed):
   ```bash
   pnpm add proj4
   ```

   ```typescript
   import proj4 from 'proj4';

   // Define EPSG:3879 (ETRS-GK25)
   proj4.defs('EPSG:3879',
     '+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 ' +
     '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
   );

   function toWGS84(x: number, y: number): [number, number] {
     return proj4('EPSG:3879', 'EPSG:4326', [x, y]);
   }
   ```

4. **Write unit tests** (`src/lib/__tests__/gml-parser.test.ts`)

### Phase 3: Create City Fetchers (3-4 hours)

**Goal:** Implement modular city fetcher abstraction.

**Tasks:**

1. **Create fetcher implementations** in `src/lib/city-fetchers.ts`:
   ```typescript
   import axios from 'axios';
   import type { Feature } from 'geojson';
   import type { CityFetcher, StandardZone, CityCode } from './types';
   import { parseGMLFeatureCollection } from './gml-parser';

   export class HelsinkiFetcher implements CityFetcher {
     cityCode: CityCode = 'HEL';
     cityName = 'Helsinki';

     async fetchFeatures(): Promise<Feature[]> {
       const url = 'https://kartta.hel.fi/ws/geoserver/avoindata/wfs?' +
         'service=WFS&version=2.0.0&request=GetFeature&' +
         'typeName=avoindata:Maavesi_osa_alueet&' +
         'outputFormat=application/json&srsName=EPSG:4326';

       const response = await axios.get(url);
       return response.data.features;
     }

     parseFeature(feature: Feature): StandardZone {
       const props = feature.properties as any;
       return {
         originalId: props.tunnus,
         cityCode: this.cityCode,
         city: this.cityName,
         name: props.nimi_fi,
         nameSe: props.nimi_se,
         adminLevel: 'osa-alue',
         geometry: feature.geometry,
         metadata: {
           area: props.pa,
           sourceLayer: 'avoindata:Maavesi_osa_alueet'
         }
       };
     }
   }

   export class VantaaFetcher implements CityFetcher {
     cityCode: CityCode = 'VAN';
     cityName = 'Vantaa';

     async fetchFeatures(): Promise<Feature[]> {
       const url = 'http://gis.vantaa.fi/geoserver/wfs?' +
         'service=WFS&version=2.0.0&request=GetFeature&' +
         'typeName=indeksit:kaupunginosat&' +
         'outputFormat=application/json&srsName=EPSG:4326';

       const response = await axios.get(url);
       return response.data.features;
     }

     parseFeature(feature: Feature): StandardZone {
       const props = feature.properties as any;
       // VERIFY FIELD NAMES during Phase 1!
       return {
         originalId: props.tunnus || props.id,
         cityCode: this.cityCode,
         city: this.cityName,
         name: props.nimi || props.nimi_fi,
         nameSe: props.nimi_se,
         adminLevel: 'kaupunginosa',
         geometry: feature.geometry,
         metadata: {
           sourceLayer: 'indeksit:kaupunginosat'
         }
       };
     }
   }

   export class EspooFetcher implements CityFetcher {
     cityCode: CityCode = 'ESP';
     cityName = 'Espoo';

     async fetchFeatures(): Promise<Feature[]> {
       // Decide layer based on Phase 1 evaluation
       const layer = 'kanta:TilastollinenAlue'; // or 'GIS:Kaupunginosat'

       const url = 'https://kartat.espoo.fi/teklaogcweb/wfs.ashx?' +
         `service=WFS&version=1.1.0&request=GetFeature&typeName=${layer}`;

       const response = await axios.get(url);
       // Response is GML XML
       return parseGMLFeatureCollection(response.data);
     }

     parseFeature(feature: Feature): StandardZone {
       const props = feature.properties as any;
       // VERIFY FIELD NAMES from GML during Phase 2!
       return {
         originalId: props.tunnus || props.id,
         cityCode: this.cityCode,
         city: this.cityName,
         name: props.nimi || props.nimi_fi,
         nameSe: props.nimi_se,
         adminLevel: 'tilastollinen_alue', // or 'kaupunginosa'
         geometry: feature.geometry,
         metadata: {
           sourceLayer: layer
         }
       };
     }
   }
   ```

2. **Add error handling** for HTTP failures, malformed responses, etc.

3. **Write unit tests** for each fetcher (mock HTTP responses)

### Phase 4: Update zones.ts Library (2-3 hours)

**Goal:** Modify `src/lib/zones.ts` to support multi-city fetching.

**Key Changes:**

1. **Add multi-city download function:**
   ```typescript
   import { HelsinkiFetcher, VantaaFetcher, EspooFetcher } from './city-fetchers';
   import type { StandardZone, CityCode } from './types';

   const ALL_FETCHERS = [
     new HelsinkiFetcher(),
     new VantaaFetcher(),
     new EspooFetcher()
   ];

   /**
    * Download zones from all cities
    */
   export async function downloadZonesMultiCity(
     emitter?: ProgressEmitter
   ): Promise<StandardZone[]> {
     emitter?.emitStart('fetch_zones', undefined, 'Fetching from multiple cities...');

     const allZones: StandardZone[] = [];

     for (const fetcher of ALL_FETCHERS) {
       try {
         emitter?.emitProgress('fetch_zones', 0, 100, `Fetching ${fetcher.cityName}...`);

         const features = await fetcher.fetchFeatures();
         const zones = features.map(f => fetcher.parseFeature(f));

         allZones.push(...zones);

         emitter?.emitProgress('fetch_zones', 0, 100,
           `Fetched ${zones.length} zones from ${fetcher.cityName}`);
       } catch (error) {
         console.error(`Failed to fetch ${fetcher.cityName}:`, error);
         // Continue with other cities (partial success)
       }
     }

     return allZones;
   }
   ```

2. **Update `processZones()` to handle StandardZone:**
   ```typescript
   export function processZonesMultiCity(
     standardZones: StandardZone[],
     options: { testMode?: boolean; testLimit?: number } = {}
   ): ZoneData[] {
     const projection = createProjection();
     const visibleBounds = getVisibleAreaBounds(projection);

     let processed = standardZones
       .map((zone) => {
         // Generate zone ID with city prefix
         const id = `${zone.cityCode}-${zone.originalId}`;

         // Calculate centroid
         let centroid: [number, number] | null = null;
         try {
           const center = turf.centroid(zone.geometry);
           centroid = center.geometry.coordinates as [number, number];
         } catch {
           return null;
         }

         // Clean geometry (existing logic)
         const cleanedGeometry = cleanGeometry(zone.geometry);
         if (!cleanedGeometry) return null;

         // Filter to visible area
         if (!isGeometryInVisibleArea(cleanedGeometry, visibleBounds)) {
           return null;
         }

         // Generate SVG path
         const svgPath = generateSvgPath(cleanedGeometry, projection);
         if (!svgPath) return null;

         return {
           id,
           name: zone.name,
           lat: centroid[1],
           lon: centroid[0],
           geometry: JSON.stringify(cleanedGeometry),
           svg_path: svgPath,
           city: zone.city,
           name_se: zone.nameSe,
           admin_level: zone.adminLevel,
           source_layer: zone.metadata?.sourceLayer
         };
       })
       .filter((z): z is ZoneData => z !== null);

     // Apply test mode limit
     if (options.testMode && options.testLimit) {
       processed = processed.slice(0, options.testLimit);
     }

     return processed;
   }
   ```

3. **Create new `fetchZonesMultiCity()` function:**
   ```typescript
   export async function fetchZonesMultiCity(
     db: Database.Database,
     options: FetchZonesOptions = {}
   ): Promise<{ zoneCount: number; routeCount: number }> {
     const emitter = options.emitter;

     // Validate schema
     if (!validateSchema(db)) {
       throw new Error('Database schema not initialized.');
     }

     // Download from all cities
     const standardZones = await downloadZonesMultiCity(emitter);

     emitter?.emitProgress('fetch_zones', 0, 100,
       `Downloaded ${standardZones.length} zones from all cities`);

     // Process zones
     const zones = processZonesMultiCity(standardZones, {
       testMode: options.testMode,
       testLimit: options.testLimit || 5
     });

     // Insert zones (reuse existing insertZones logic)
     insertZones(db, zones, emitter);

     // Store metadata
     db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
       'last_fetch',
       JSON.stringify({
         date: new Date().toISOString(),
         zoneCount: zones.length,
         isTest: options.testMode || false,
         multiCity: true,
         cities: ['Helsinki', 'Vantaa', 'Espoo']
       })
     );

     const routeCount = zones.length * (zones.length - 1) * 3; // TIME_PERIODS.length

     return { zoneCount: zones.length, routeCount };
   }
   ```

4. **Keep original `fetchZones()` for backward compatibility**

### Phase 5: Update Geocoding (1-2 hours)

**Goal:** Adapt geocoding to use city names.

**File:** `src/lib/geocoding.ts`

**Changes:**

1. **Extract city from zone ID:**
   ```typescript
   const CITY_NAME_MAP: Record<string, string> = {
     'HEL': 'Helsinki',
     'VAN': 'Vantaa',
     'ESP': 'Espoo',
     'KAU': 'Kauniainen'
   };

   function getCityFromZoneId(zoneId: string): string | undefined {
     const cityCode = zoneId.split('-')[0];
     return CITY_NAME_MAP[cityCode];
   }
   ```

2. **Update geocoding address format:**
   ```typescript
   // OLD: `${place.id}, Helsinki` (postal code)
   // NEW: `${place.name}, ${city}`

   async function geocodePlace(place: Place): Promise<GeocodeResult> {
     const city = getCityFromZoneId(place.id) || 'Helsinki';

     // Strategy 1: Zone name + city
     const result1 = await tryGeocode(`${place.name}, ${city}`);
     if (result1.success) return result1;

     // Strategy 2: Try Swedish name if available
     if (place.name_se) {
       const result2 = await tryGeocode(`${place.name_se}, ${city}`);
       if (result2.success) return result2;
     }

     // Strategy 3: Zone name only (no city)
     const result3 = await tryGeocode(place.name);
     if (result3.success) return result3;

     // Fallback: Use geometric centroid
     return {
       success: false,
       error: 'All geocoding strategies failed'
     };
   }
   ```

3. **Update database query** to include new columns (if added):
   ```typescript
   const places = db.prepare(`
     SELECT id, name, lat, lon, name_se, city
     FROM places
     WHERE routing_lat IS NULL OR routing_lon IS NULL
   `).all() as Place[];
   ```

### Phase 6: Update TUI Screen (1 hour)

**Goal:** Add multi-city support to TUI.

**File:** `src/tui/screens/fetch-zones.tsx`

**Changes:**

1. **Add mode selection:**
   ```tsx
   interface FetchZonesScreenProps {
     testMode: boolean;
     multiCity?: boolean;  // NEW: Enable multi-city mode
     onComplete: () => void;
     onCancel: () => void;
   }
   ```

2. **Call appropriate fetch function:**
   ```tsx
   const result = await (multiCity
     ? fetchZonesMultiCity(db, { testMode, testLimit: 5, emitter })
     : fetchZones(db, { testMode, testLimit: 5, emitter })
   );
   ```

3. **Update UI to show city counts:**
   ```tsx
   {status === 'complete' && result && (
     <Box flexDirection="column">
       <Text color="green">
         {symbols.success} Zones fetched successfully!
       </Text>
       <Box marginTop={1}>
         <Text>Total Zones: </Text>
         <Text color="cyan">{result.zoneCount}</Text>
       </Box>
       {multiCity && (
         <Box>
           <Text color="gray">
             Helsinki (osa-alue), Vantaa (kaupunginosa), Espoo (TBD)
           </Text>
         </Box>
       )}
     </Box>
   )}
   ```

### Phase 7: Testing & Validation (2-3 hours)

**Goal:** Ensure data quality.

**Unit Tests:**
```bash
pnpm test
```

**Integration Test:**
```bash
pnpm dev
# Select: Fetch Zones > Test Mode (5 zones)
```

**Verify database:**
```bash
sqlite3 ../opas/public/varikko.db "SELECT city, COUNT(*) as count FROM places GROUP BY city;"
```

**Spot-check zones:**
- Helsinki: Kallio, Arabianranta, Kamppi
- Vantaa: Tikkurila, Myyrmäki
- Espoo: Tapiola, Otaniemi

**Performance test:**
```bash
time pnpm fetch:zones
```

### Phase 8: Documentation (1 hour)

**Tasks:**

1. Update AGENTS.md with multi-city architecture
2. Create migration guide for switching data sources
3. Add inline JSDoc comments
4. Document city fetcher pattern

---

## Dependencies to Add

```bash
cd varikko
pnpm add fast-xml-parser proj4
```

---

## Success Metrics

- [ ] All three cities fetch successfully
- [ ] Total zone count is 250-300
- [ ] All zones have Finnish names
- [ ] All zones render in Opas
- [ ] Geocoding >90% success rate
- [ ] Unit tests pass
- [ ] TUI shows progress
- [ ] No errors in logs

---

## Reference Links

- [Helsinki District Divisions - HRI](https://hri.fi/data/en_GB/dataset/helsingin-piirijako)
- [Vantaa Districts - HRI](https://hri.fi/data/fi/dataset/vantaan-kaupunginosat)
- [Espoo Districts - Avoindata](https://www.avoindata.fi/data/fi/dataset/espoon-kaupunginosat)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)

---

**End of Implementation Plan**

**Last Updated:** 2025-12-27
**Architecture Version:** Varikko TUI v2.0
