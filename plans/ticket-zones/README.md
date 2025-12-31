# Plan: Add HSL Ticket Zone Layer

## Overview
Add optional SVG layer displaying HSL public transit ticket zone boundaries (A, B, C, D).

## Requirements
- **Style**: Minimal monochrome (single color, varying stroke widths per zone)
- **Interactivity**: Static overlay (non-interactive, pointer-events-none)
- **Default state**: Disabled by default
- **Labels**: No text labels, just boundaries

## Data Source
- **Dataset**: HSL Fare Zones (Helsinki Region Infoshare)
- **URL**: https://opendata.arcgis.com/datasets/89b6b5142a9b4bb9a5c5f4404ff28963_0.geojson
- **License**: CC BY 4.0
- **Date**: Spring 2019

---

## Implementation

### 1. Varikko (Data Pipeline)

**New Command**: `varikko/src/commands/fetchTicketZones.ts`
- Register as `fetch-ticket-zones` command
- Download GeoJSON from HRI using axios
- Parse features, group by `properties.tunnus` (A, B, C, D)
- Project coordinates using existing Mercator (MAP_CENTER, MAP_SCALE from shared/config)
- Generate SVG with grouped `<g id="zone-A">` elements
- Write to `opas/public/data/ticket-zones.svg`
- Update `opas/public/data/manifest.json` with new layer entry (zIndex: 15)

**New Service**: `varikko/src/lib/ticketZones.ts`
- `downloadTicketZones()`: Fetch GeoJSON
- `groupByZone(features)`: Group by tunnus property
- `projectGeometry(geometry)`: Mercator projection using D3 (pattern from zones.ts:99-104)
- `generateTicketZonesSVG(geojson)`: Create SVG with zone groups
- `writeTicketZonesLayer(svg)`: Write to opas/public/data/
- `updateManifest()`: Add layer to manifest.json

**SVG Structure**:
```xml
<svg viewBox="-30 -190 1080 720" xmlns="http://www.w3.org/2000/svg">
  <g id="zone-A" class="ticket-zone" data-stroke-width="1.0">
    <path d="..." />
  </g>
  <g id="zone-B" class="ticket-zone" data-stroke-width="1.5">
    <path d="..." />
  </g>
  <g id="zone-C" class="ticket-zone" data-stroke-width="2.0">
    <path d="..." />
  </g>
  <g id="zone-D" class="ticket-zone" data-stroke-width="2.5">
    <path d="..." />
  </g>
</svg>
```

**Testing**: `varikko/src/tests/lib/ticketZones.test.ts`
- Mock axios for GeoJSON fetch
- Validate grouping by zone
- Check SVG path generation
- Verify manifest update

**Command Registration**: Add to `varikko/src/commands/index.ts`

---

### 2. Opas (Frontend)

**Layer Visibility**: `opas/src/composables/useLayerVisibility.ts`
```typescript
const layerVisibility = reactive({
  // ...existing
  ticketZones: false, // Disabled by default
})
```

**Layer Controls**: `opas/src/components/LayerControls.vue`
- Add checkbox: "Ticket Zones"

**Theme Config**: `opas/src/config/mapThemes.ts`
- Add `'ticketZones'` to `LayerId` type (line 7)
- Add monochrome styling to each theme's layers:
  ```typescript
  ticketZones: {
    stroke: '#6b7280',  // Gray (adjust per theme)
    strokeWidth: 1.5,   // Base width (zones use data-stroke-width)
    fill: 'none'
  }
  ```
- Morning: `stroke: '#264653'` (dark blue-gray)
- Evening: `stroke: '#57534e'` (warm gray)
- Midnight: `stroke: '#6b7280'` (neutral gray)

**Rendering**: `opas/src/components/BackgroundMap.vue`
- Add `'ticketZones'` to props layers array where used
- Layer loading handled automatically via existing pattern:
  - Loads SVG via `layerService.loadLayer('ticketZones')` (line 136)
  - Applies theme styles (lines 141-156)
  - Filters by `layerVisibility.ticketZones` (lines 123-126)
  - Zone stroke widths applied via data attributes in SVG

**Manifest**: `opas/public/data/manifest.json` (updated by Varikko)
```json
{
  "id": "ticketZones",
  "file": "ticket-zones.svg",
  "description": "HSL fare zone boundaries",
  "zIndex": 15
}
```

---

## File Changes Summary

### New Files
- `varikko/src/commands/fetchTicketZones.ts` - CLI command
- `varikko/src/lib/ticketZones.ts` - Business logic
- `varikko/src/tests/lib/ticketZones.test.ts` - Tests
- `opas/public/data/ticket-zones.svg` - Generated SVG layer

### Modified Files
- `varikko/src/commands/index.ts` - Register command
- `opas/src/composables/useLayerVisibility.ts` - Add ticketZones state
- `opas/src/components/LayerControls.vue` - Add toggle
- `opas/src/config/mapThemes.ts` - Add LayerId + theme styles
- `opas/public/data/manifest.json` - Add layer entry (auto-generated)

---

## Monochrome Stroke Widths

Zones distinguished by stroke width:
- **Zone A** (innermost): 1.0px
- **Zone B**: 1.5px
- **Zone C**: 2.0px
- **Zone D** (outermost): 2.5px

Applied via `data-stroke-width` attributes read by CSS or JS.

---

## Unresolved Questions
None - ready to implement.
