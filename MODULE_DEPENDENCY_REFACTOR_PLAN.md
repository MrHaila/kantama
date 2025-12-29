# Module Dependency Refactoring Plan

## Executive Summary

This plan outlines the refactoring of module relationships between `varikko` and `opas` to establish `varikko` as a source of shared types, configurations, and utilities. This will eliminate code duplication, ensure consistency across both packages, and improve maintainability while preserving the current hot-module-reloading (HMR) workflow.

## Current State Analysis

### Monorepo Structure

```
kantama/ (pnpm workspace)
├── varikko/          # Data pipeline CLI
├── opas/             # Vue.js visualization frontend
└── otp/              # OpenTripPlanner service
```

### Identified Duplications

#### 1. Map Configuration (HIGH PRIORITY)

**Location:**

- `varikko/src/lib/mapConfig.ts`
- `opas/src/config/mapConfig.ts`

**Issue:**
Varikko's mapConfig has a comment stating:

```typescript
/**
 * IMPORTANT: These values MUST match the source of truth in opas:
 * opas/src/config/mapConfig.ts
 */
```

This is a **critical code smell** - the configuration is duplicated and manually kept in sync.

**Shared Values:**

- Base dimensions (width: 800, height: 800)
- Zoom level (1.2 for 20% zoom out)
- ViewBox calculations
- Map center coordinates `[24.93, 60.17]`
- Map scale `120000`
- Metro area bounds
- Clip bounding box `[24.5, 60.0, 25.3, 60.5]`

**Impact:**

- Used by varikko for SVG generation and coordinate projection
- Used by opas for map rendering and zone display
- Inconsistencies would cause misaligned visualizations

#### 2. MessagePack Data Types (HIGH PRIORITY)

**Location:**

- `varikko/src/lib/export.ts` (defines types for export)
- `opas/src/services/DataService.ts` (defines types for import)

**Duplicated Types:**

| Varikko Type     | Opas Type        | Status              |
| ---------------- | ---------------- | ------------------- |
| `CompactZone`    | `Zone`           | Nearly identical    |
| `TimeBucket`     | `TimeBucket`     | **Exact duplicate** |
| `CompactLeg`     | `CompactLeg`     | **Exact duplicate** |
| `CompactRoute`   | `CompactRoute`   | **Exact duplicate** |
| `ZoneRoutesFile` | `ZoneRoutesData` | Nearly identical    |

**Issue:**
These types define the data contract between varikko (producer) and opas (consumer). Any mismatch breaks the application.

#### 3. Shared Dependencies

Both packages use:

- `@msgpack/msgpack` - MessagePack encoding/decoding
- `d3-geo` - Geographic projections
- `topojson-client` - TopoJSON utilities
- Type definitions: `@types/d3-geo`, `@types/geojson`

**Current Status:**

- opas: `@msgpack/msgpack` in dependencies
- varikko: `@msgpack/msgpack` in devDependencies
- Both independently declare d3-geo and topojson-client

#### 4. Utility Functions (MEDIUM PRIORITY)

**Polyline Decoding:**

- `opas/src/utils/polyline.ts` - Decodes Google Encoded Polyline format
- Used by opas to render route geometry
- Generic algorithm that could be shared

**Transport Colors:**

- `opas/src/utils/transportColors.ts` - HSL transport mode colors
- Could be useful in varikko for future visualization features
- Low priority for now (opas-specific)

### Current Workflow

Varikko exports data directly to opas directories for HMR convenience:

1. **Database location:** `../opas/public/varikko.db` (default)
2. **Export command:** `varikko export -o ../opas/public`
   - Writes `data/zones.json`
   - Writes `data/routes/*.msgpack`
   - Writes `data/manifest.json`
3. **Map export:** `varikko map`
   - Writes `background_map.json` (TopoJSON)
   - Writes `layers/*.svg` (water, roads, railways, ferries)
   - Writes `layers/manifest.json`

This workflow **must be preserved** for developer experience.

## Proposed Solution

### Design Principles

1. **Single Source of Truth**: Varikko owns shared types and configurations
2. **Preserve HMR**: Export commands continue writing to opas/public
3. **Minimal Changes**: Don't over-engineer; focus on eliminating duplications
4. **Type Safety**: Ensure TypeScript types are properly exported and imported
5. **No Breaking Changes**: Maintain backward compatibility during transition

### Module Relationship

```
varikko (producer/exporter)
   ↓ provides types/config
opas (consumer/importer)
```

Varikko will export:

- Shared TypeScript types
- Map configuration constants
- Utility functions (if needed)

Opas will import:

- Types from varikko for type-safe data loading
- Map configuration to ensure perfect alignment

### Implementation Plan

#### Phase 1: Package Configuration

**1.1 Update varikko/package.json**

Add exports field to define public API:

```json
{
  "name": "varikko",
  "version": "3.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types.d.ts",
      "import": "./dist/types.js"
    },
    "./config": {
      "types": "./dist/config.d.ts",
      "import": "./dist/config.js"
    }
  },
  "files": ["dist"]
}
```

**1.2 Update varikko tsconfig.json**

Ensure proper compilation for library usage:

```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**1.3 Update opas/package.json**

Add workspace dependency:

```json
{
  "dependencies": {
    "varikko": "workspace:*",
    "@msgpack/msgpack": "^3.1.3"
    // ... other deps
  }
}
```

#### Phase 2: Create Shared Module in Varikko

**2.1 Create varikko/src/shared/types.ts**

Move and consolidate all shared data types:

```typescript
/**
 * Shared types between varikko (data pipeline) and opas (visualization)
 *
 * IMPORTANT: This is the single source of truth for data contract types.
 * Changes here affect both the export (varikko) and import (opas) sides.
 */

// ============================================================================
// Zone Types
// ============================================================================

export interface Zone {
  id: string;
  name: string;
  city: string;
  svgPath: string;
  routingPoint: [number, number]; // [lat, lon]
}

// ============================================================================
// Time Bucket Types
// ============================================================================

export interface TimeBucket {
  number: number;
  min: number;
  max: number;
  color: string;
  label: string;
}

// ============================================================================
// Route Types
// ============================================================================

export interface CompactLeg {
  mode: string;
  duration: number;
  distance?: number;
  from?: { name: string; lat?: number; lon?: number };
  to?: { name: string; lat?: number; lon?: number };
  geometry?: string; // Encoded polyline
  routeShortName?: string;
  routeLongName?: string;
}

export interface CompactRoute {
  toId: string;
  duration: number | null;
  transfers: number | null;
  walkDistance: number | null;
  status: 'OK' | 'NO_ROUTE' | 'ERROR' | 'PENDING';
  legs?: CompactLeg[];
}

export type TimePeriod = 'MORNING' | 'EVENING' | 'MIDNIGHT';

export interface ZoneRoutesData {
  fromId: string;
  generated: string;
  periods: {
    MORNING: CompactRoute[];
    EVENING: CompactRoute[];
    MIDNIGHT: CompactRoute[];
  };
}

// ============================================================================
// Data File Types
// ============================================================================

export interface ZonesData {
  version: number;
  generated: string;
  timeBuckets: TimeBucket[];
  zones: Zone[];
}

export interface DataManifest {
  version: number;
  generated: string;
  zones: number;
  routeFiles: number;
  totalSize: number;
  errors: number;
}
```

**2.2 Create varikko/src/shared/config.ts**

Single source of truth for map configuration:

```typescript
/**
 * Map projection configuration
 *
 * IMPORTANT: This is the single source of truth for map projection settings.
 * Used by:
 * - varikko: SVG generation, coordinate projection, layer export
 * - opas: Map rendering, zone display, route visualization
 *
 * Any changes here affect both data generation and visualization.
 */

// ============================================================================
// SVG Viewport Configuration
// ============================================================================

export const MAP_CONFIG = {
  // Base dimensions
  baseWidth: 800,
  baseHeight: 800,

  // Current zoom level (1.0 = 100%, 1.2 = 20% zoom out)
  zoomLevel: 1.2,

  // Calculated dimensions
  get width() {
    return this.baseWidth * this.zoomLevel;
  },

  get height() {
    return this.baseHeight * this.zoomLevel;
  },

  // ViewBox offsets to keep bottom edge fixed while expanding
  get viewBoxX() {
    // Center horizontally when zooming out, then move 60px right
    return -(this.width - this.baseWidth) / 2 + 60;
  },

  get viewBoxY() {
    // Keep bottom edge fixed by moving up more than we expand
    const baseOffset = -120;
    const additionalExpansion = this.height - this.baseHeight;
    return baseOffset - additionalExpansion;
  },

  // Full viewBox string
  get viewBox() {
    return `${this.viewBoxX} ${this.viewBoxY} ${this.width} ${this.height}`;
  },
} as const;

// Export individual values for convenience
export const BASE_WIDTH = MAP_CONFIG.baseWidth;
export const BASE_HEIGHT = MAP_CONFIG.baseHeight;
export const ZOOM_LEVEL = MAP_CONFIG.zoomLevel;
export const WIDTH = MAP_CONFIG.width;
export const HEIGHT = MAP_CONFIG.height;
export const VIEWBOX_X = MAP_CONFIG.viewBoxX;
export const VIEWBOX_Y = MAP_CONFIG.viewBoxY;
export const VIEWBOX = MAP_CONFIG.viewBox;

// ============================================================================
// Geographic Configuration
// ============================================================================

/** Map center coordinates (Helsinki metropolitan area center) */
export const MAP_CENTER: [number, number] = [24.93, 60.17];

/** Map scale for d3-geo projection */
export const MAP_SCALE = 120000;

/** Extended metro area bounds for coordinate validation */
export const METRO_AREA_BOUNDS = {
  minLon: 23.5,
  maxLon: 26.5,
  minLat: 59.5,
  maxLat: 61.0,
} as const;

/** Bounding box for map clipping (used in shapefile processing) */
export const CLIP_BBOX: [number, number, number, number] = [24.5, 60.0, 25.3, 60.5];
```

**2.3 Create varikko/src/shared/index.ts**

Main export barrel file:

```typescript
/**
 * Shared module exports for use by opas
 *
 * This module provides the data contract between varikko and opas:
 * - Types for zones, routes, and time buckets
 * - Map configuration for consistent projections
 */

// Export all types
export * from './types';

// Export all config
export * from './config';

// Re-export for backwards compatibility
export type {
  Zone,
  TimeBucket,
  CompactRoute,
  CompactLeg,
  ZoneRoutesData,
  TimePeriod,
} from './types';
export { MAP_CONFIG, MAP_CENTER, MAP_SCALE, METRO_AREA_BOUNDS, CLIP_BBOX } from './config';
```

**2.4 Create varikko/src/index.ts**

Top-level exports:

```typescript
/**
 * Varikko - Transit route calculation pipeline
 *
 * This package provides:
 * - CLI for data processing (varikko command)
 * - Shared types and config for opas integration
 */

// Export shared modules for opas
export * from './shared';

// Internal modules (not exported for external use)
// CLI, database, routing, etc. are internal implementation
```

#### Phase 3: Update Varikko Internal Usage

**3.1 Update varikko/src/lib/export.ts**

Replace local type definitions with imports from shared module:

```typescript
import { encode } from '@msgpack/msgpack';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressEmitter } from './events';

// Import shared types instead of defining locally
import type {
  Zone,
  TimeBucket,
  CompactLeg,
  CompactRoute,
  ZoneRoutesData,
  ZonesData,
} from '../shared/types';

// Keep only export-specific types
export interface ExportOptions {
  outputDir: string;
  emitter?: ProgressEmitter;
}

export interface ExportResult {
  zonesFile: string;
  routeFiles: number;
  totalSize: number;
  errors: string[];
}

// ... rest of implementation uses shared types
```

**3.2 Update varikko/src/lib/exportLayers.ts**

Replace local config with shared config:

```typescript
import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import type { Feature } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { ProgressEmitter } from './events';

// Import shared config instead of local mapConfig
import {
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  VIEWBOX,
  MAP_CENTER,
  MAP_SCALE,
} from '../shared/config';

// ... rest of implementation
```

**3.3 Delete varikko/src/lib/mapConfig.ts**

This file is now redundant - configuration lives in shared/config.ts

**3.4 Update varikko/src/lib/types.ts**

This file contains varikko-internal types (CityCode, StandardZone, etc.). Keep it but clarify its scope:

```typescript
import type { Feature, Geometry } from 'geojson';

/**
 * Internal varikko types for data processing pipeline
 *
 * Note: Data export types are in ../shared/types.ts
 */

export type CityCode = 'HEL' | 'VAN' | 'ESP' | 'KAU';

// ... rest of internal types
```

#### Phase 4: Update Opas to Import from Varikko

**4.1 Update opas/src/services/DataService.ts**

Replace local type definitions with imports from varikko:

```typescript
import { decode } from '@msgpack/msgpack';
// Import types from varikko shared module
import type {
  Zone,
  TimeBucket,
  CompactLeg,
  CompactRoute,
  ZoneRoutesData,
  ZonesData,
  TimePeriod,
} from 'varikko';

// Keep only opas-specific types
export interface DataServiceError {
  type: 'zones_not_found' | 'routes_not_found' | 'parse_error' | 'network_error';
  message: string;
  details?: string;
}

export interface DataServiceState {
  initialized: boolean;
  zonesLoaded: boolean;
  zonesError: DataServiceError | null;
  routeErrors: Map<string, DataServiceError>;
}

// ... rest of implementation
```

**4.2 Update opas/src/config/mapConfig.ts**

Replace local configuration with imports from varikko:

```typescript
/**
 * Map configuration - imported from varikko shared module
 *
 * This ensures perfect alignment between data generation (varikko)
 * and visualization (opas).
 */

export { MAP_CONFIG } from 'varikko';
```

Or if the object-with-getters pattern doesn't work well in Vue, create adapter:

```typescript
import {
  BASE_WIDTH,
  BASE_HEIGHT,
  ZOOM_LEVEL,
  WIDTH,
  HEIGHT,
  VIEWBOX_X,
  VIEWBOX_Y,
  VIEWBOX,
} from 'varikko';

// Re-export with same structure for backwards compatibility
export const MAP_CONFIG = {
  baseWidth: BASE_WIDTH,
  baseHeight: BASE_HEIGHT,
  zoomLevel: ZOOM_LEVEL,
  get width() {
    return WIDTH;
  },
  get height() {
    return HEIGHT;
  },
  get viewBoxX() {
    return VIEWBOX_X;
  },
  get viewBoxY() {
    return VIEWBOX_Y;
  },
  get viewBox() {
    return VIEWBOX;
  },
} as const;
```

**4.3 Update Component Imports**

Any Vue components importing types should use varikko:

```typescript
// opas/src/components/InteractiveMap.vue
<script setup lang="ts">
import type { Zone, TimePeriod, CompactRoute } from 'varikko';
// ... rest of component
</script>
```

#### Phase 5: Preserve HMR Workflow

**5.1 Verify Export Paths**

Ensure export commands still work:

```bash
# From varikko directory
pnpm exec tsx src/main.ts export -o ../opas/public
pnpm exec tsx src/main.ts map
```

Files should still be written to:

- `../opas/public/data/zones.json`
- `../opas/public/data/routes/*.msgpack`
- `../opas/public/background_map.json`
- `../opas/public/layers/*.svg`

**5.2 Update Development Scripts**

No changes needed - varikko continues to write files directly to opas/public.

#### Phase 6: Build and Test

**6.1 Build Varikko**

```bash
cd varikko
pnpm build  # Generates dist/ with types
```

**6.2 Install Dependencies**

```bash
cd ../
pnpm install  # Resolves workspace:* dependency
```

**6.3 Build Opas**

```bash
cd opas
pnpm build  # Should compile successfully with varikko types
```

**6.4 Type Checking**

```bash
cd opas
pnpm exec vue-tsc --noEmit  # Verify no type errors
```

**6.5 Runtime Testing**

```bash
# Terminal 1: Run varikko export
cd varikko
pnpm exec tsx src/main.ts export

# Terminal 2: Run opas dev server
cd opas
pnpm dev

# Verify:
# - Data loads correctly
# - Maps render with proper alignment
# - No console errors
```

## Migration Checklist

- [ ] Phase 1: Package Configuration
  - [ ] Update varikko package.json with exports
  - [ ] Update varikko tsconfig.json for library mode
  - [ ] Add varikko workspace dependency to opas package.json

- [ ] Phase 2: Create Shared Module
  - [ ] Create varikko/src/shared/types.ts
  - [ ] Create varikko/src/shared/config.ts
  - [ ] Create varikko/src/shared/index.ts
  - [ ] Create varikko/src/index.ts

- [ ] Phase 3: Update Varikko Internally
  - [ ] Update lib/export.ts to import shared types
  - [ ] Update lib/exportLayers.ts to import shared config
  - [ ] Delete lib/mapConfig.ts
  - [ ] Update lib/types.ts documentation

- [ ] Phase 4: Update Opas
  - [ ] Update services/DataService.ts to import from varikko
  - [ ] Update config/mapConfig.ts to import from varikko
  - [ ] Update component imports as needed

- [ ] Phase 5: Verify HMR Workflow
  - [ ] Test varikko export command
  - [ ] Test varikko map command
  - [ ] Verify files written to correct locations

- [ ] Phase 6: Build and Test
  - [ ] Build varikko successfully
  - [ ] Install workspace dependencies
  - [ ] Build opas successfully
  - [ ] Run type checking
  - [ ] Runtime testing with dev server

## Benefits

1. **Single Source of Truth**: Map config and types defined once in varikko
2. **Type Safety**: Compile-time verification that data contract is followed
3. **Reduced Duplication**: ~200 lines of duplicate code eliminated
4. **Easier Maintenance**: Changes to data format only need to happen in one place
5. **Better Developer Experience**: IDE autocomplete and type hints work across packages
6. **Preserved Workflow**: Export commands continue working as before for HMR

## Future Enhancements (Out of Scope)

These are potential future improvements but not part of this refactoring:

1. **Shared Utilities Package**: Create `@kantama/shared` for truly shared code
2. **Runtime Validation**: Add zod/yup schemas for runtime type checking
3. **Polyline Utils**: Move polyline decoding to shared if varikko needs it
4. **Transport Colors**: Export colors if varikko adds visualization features
5. **Monorepo Optimization**: Use Turborepo for build caching and task orchestration

## Risks and Mitigations

| Risk                      | Mitigation                                                  |
| ------------------------- | ----------------------------------------------------------- |
| Breaking HMR workflow     | Extensive testing of export commands before committing      |
| Type import issues        | Ensure proper TypeScript configuration and explicit exports |
| Build order dependencies  | Document that varikko must build before opas                |
| Runtime incompatibilities | Version lock varikko dependency with workspace:\*           |

## Timeline Estimate

- Phase 1: 30 minutes (package config)
- Phase 2: 1 hour (create shared module)
- Phase 3: 45 minutes (update varikko)
- Phase 4: 45 minutes (update opas)
- Phase 5: 15 minutes (verify HMR)
- Phase 6: 1 hour (testing)

**Total: ~4 hours** for careful, tested implementation

## Success Criteria

- [ ] No duplicate map configuration
- [ ] No duplicate MessagePack types
- [ ] All TypeScript compilation succeeds
- [ ] HMR workflow still functions
- [ ] No runtime errors in opas
- [ ] Map layers remain perfectly aligned
- [ ] Data loads correctly from exported files
