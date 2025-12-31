# Opas Visualisation Module

## Purpose

This module serves as the **Web Frontend** for Kantama. It provides an interactive Vue 3 + D3.js visualization of temporal distances between places in Helsinki using public transit data from Varikko.

## Architecture

The visualization is built as a layered map system:

- **BackgroundMap.vue**: Static base layer rendering water and road features from TopoJSON
- **InteractiveMap.vue**: Interactive layer for postal zones with travel time visualization
- Both layers are absolutely positioned to ensure perfect alignment

## Key Components

- **`BackgroundMap.vue`**: Renders static background map layers (water, roads) from `background_map.json`
  - Uses D3.js to load and render TopoJSON data
  - Configurable vintage styling for different layers
  - Static rendering without zoom/pan interactions
- **`InteractiveMap.vue`**: Handles interactive zone visualization
  - Loads zone data from `public/data/` directory
  - Manages zone selection and travel time coloring
  - Previously handled zoom/pan (now removed for static approach)
- **`InfoPanel.vue`**: Displays information about selected zones and travel times
- **`DataService.ts`**: Service for loading zones and routes from JSON/MessagePack files
- **`mapData.ts`**: Pinia store managing map state and data

## Data Sources

- **`public/background_map.json`**: TopoJSON file containing water and road layers processed by Varikko
  - Water areas: Polygon features for seas, lakes
  - Roads: Line features for road network
  - Coordinate system: WGS84 (EPSG:4326)
- **`public/data/`**: Varikko-generated data files
  - `zones.json`: Zone metadata and time buckets (JSON)
  - `pipeline.json`: Pipeline execution metadata
  - `manifest.json`: Data summary for frontend
  - `routes/*.msgpack`: Pre-calculated routes (MessagePack binary format)

## Styling

Vintage aesthetic with configurable color schemes:

- Water bodies: Deep blue (#2A4D69 or similar)
- Roads: Sepia/brown tones (#8B7355 or similar)
- Background: Vintage cream (#FDFBF7)
- All colors configurable through component props

## Development

Run all commands via `pnpm`:

- **`pnpm dev`**: Start development server
- **`pnpm build`**: Build for production
- **`pnpm lint`**: Run ESLint
- **`pnpm format`**: Format code with Prettier
- **`pnpm test`**: Run unit tests

## E2E Testing

Tests live in `tests/e2e/` and use Playwright.

**Commands:**

- `pnpm test` — Run all tests headless
- `pnpm test:ui` — Interactive UI with watch mode (recommended for TDD)
- `pnpm test:headed` — Run tests in visible browser

**Element Location Rules:**

⚠️ **Always use `data-testid` attributes.** Other locator strategies are forbidden.

```typescript
// ✅ CORRECT
await page.getByTestId('zone-map')
await page.getByTestId('info-panel')

// ❌ WRONG - Never use these
await page.locator('.zone-map')           // CSS class
await page.locator('svg')                 // Element type
await page.getByText('Helsinki')          // Text content
await page.locator('#app')                // ID selector
```

**Adding test IDs to components:**

```vue
<template>
  <div data-testid="zone-map">...</div>
</template>
```

**Naming conventions:**

- Use kebab-case: `data-testid="info-panel"`
- Be descriptive: `data-testid="zone-travel-time"` not `data-testid="time"`
- For lists, use suffixes: `data-testid="zone-item-00100"` (with zone ID)

## Patterns

1. **Layered Architecture**: Separate static background from interactive layers for better performance
2. **Absolute Positioning**: Use inset-0 on both layers to guarantee exact alignment
3. **Vintage Styling**: Consistent sepia-toned aesthetic across all visual elements
4. **TypeScript**: All code must be fully typed
5. **Component Composition**: Prefer composition over inheritance for map features

## Performance Rules

⚠️ **No route data loading on page load.** Route data (`.msgpack` files) must only be loaded when the user selects a zone. Initial page load should only fetch:

- `zones.json` (includes pre-computed reachability scores)
- `background_map.json` (static map layers)

This rule is enforced by a Playwright test in `tests/e2e/performance.spec.ts`.

Reachability scores for the default heatmap view must be pre-computed by Varikko and included in `zones.json`, not calculated at runtime.
