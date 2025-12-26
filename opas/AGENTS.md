# Opas Visualisation Module

## Purpose

This module serves as the **Web Frontend** for the Chrono-Map project. It provides an interactive Vue 3 + D3.js visualization of temporal distances between places in Helsinki using public transit data from Varikko.

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
  - Loads zone data from Varikko SQLite database
  - Manages zone selection and travel time coloring
  - Previously handled zoom/pan (now removed for static approach)
- **`InfoPanel.vue`**: Displays information about selected zones and travel times
- **`DatabaseService.ts`**: Service for loading data from Varikko SQLite database
- **`mapData.ts`**: Pinia store managing map state and data

## Data Sources

- **`public/background_map.json`**: TopoJSON file containing water and road layers processed by Varikko
  - Water areas: Polygon features for seas, lakes
  - Roads: Line features for road network
  - Coordinate system: WGS84 (EPSG:4326)
- **`varikko.db`**: SQLite database with zones and calculated travel times

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

## Patterns

1. **Layered Architecture**: Separate static background from interactive layers for better performance
2. **Absolute Positioning**: Use inset-0 on both layers to guarantee exact alignment
3. **Vintage Styling**: Consistent sepia-toned aesthetic across all visual elements
4. **TypeScript**: All code must be fully typed
5. **Component Composition**: Prefer composition over inheritance for map features
