# Phase 08: Maps Workflow

**Status:** Ready for implementation
**Dependencies:** Phase 02 (Foundation)
**Estimated Effort:** 1-2 days
**Priority:** LOW (independent workflow for background visualization)

---

## Overview

Process ESRI shapefiles into TopoJSON and render SVG for background map visualization. Two-step workflow: process_map (shapefile → TopoJSON) → generate_svg (TopoJSON → SVG).

**What it does:**

### Part 1: Process Map
1. Load ESRI shapefiles (water areas, roads)
2. Use mapshaper to reproject EPSG:3067 → EPSG:4326
3. Clip to Helsinki bounding box
4. Simplify geometries (80% reduction)
5. Convert to TopoJSON
6. Output to `background_map.json`
7. Auto-trigger generate_svg

### Part 2: Generate SVG
1. Load TopoJSON
2. Apply D3 Mercator projection (same params as zones)
3. Extract features
4. Generate SVG paths with CSS classes
5. Output to `background_map.svg`

**Current Implementation:**
- `src/process_map.ts:1-XXX`
- `src/generate_svg.ts:1-XXX`

---

## Target Architecture

**File:** `src/lib/maps.ts`

```typescript
export interface ProcessMapOptions {
  shapefileDir?: string;
  outputPath?: string;
  emitter?: ProgressEmitter;
}

export async function processMap(options: ProcessMapOptions): Promise<void>;
export async function generateSVG(
  topoJsonPath: string,
  outputPath: string,
  emitter?: ProgressEmitter
): Promise<void>;
```

---

## Testing Strategy

- ✅ Shapefile loading
- ✅ Reprojection (mock mapshaper)
- ✅ TopoJSON generation
- ✅ SVG path generation
- ✅ Projection params match zones
- ⚠️ Integration test requires actual shapefiles (large files)

---

## TUI Considerations

Single combined screen for both steps. Show progress for shapefile processing (slow) and SVG generation (fast).

---

## References

- **Current Implementation:** `src/process_map.ts`, `src/generate_svg.ts`
- **Mapshaper:** https://github.com/mbloch/mapshaper
- **Data Source:** Maanmittauslaitos (CC BY 4.0)
