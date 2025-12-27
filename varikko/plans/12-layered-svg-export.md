# Plan 12: Layered SVG Export

## Problem Statement

Currently, Varikko exports a single `background_map.svg` containing all map layers (water, roads) baked together. The Opas frontend then has to use runtime hacks to:

1. Parse the SVG and hide/show elements by class name
2. Load the same SVG multiple times for different layer combinations
3. Extract road paths at runtime to render them in InteractiveMap's SVG

This is inefficient and fragile. A cleaner architecture would have Varikko export **separate SVG files per layer**, allowing the frontend to compose them declaratively.

## Proposed Architecture

### Varikko Output

Export individual layer files to `opas/public/layers/`:

```text
opas/public/layers/
├── water.svg       # Sea, lakes, water bodies
├── roads.svg       # Road network
└── manifest.json   # Layer metadata and ordering
```

### Manifest Format

```json
{
  "viewBox": "-20 -280 960 960",
  "layers": [
    {
      "id": "water",
      "file": "water.svg",
      "description": "Water bodies (sea, lakes)",
      "zIndex": 0
    },
    {
      "id": "roads", 
      "file": "roads.svg",
      "description": "Road network",
      "zIndex": 10
    }
  ],
  "themes": {
    "vintage": {
      "water": { "fill": "#2a4d69" },
      "roads": { "stroke": "#8b7355", "strokeWidth": 0.5 }
    },
    "yle": {
      "water": { "fill": "#6b9bc3" },
      "roads": { "stroke": "#3d5a50", "strokeWidth": 0.6 }
    }
  }
}
```

### Benefits

1. **No runtime SVG parsing** - Load only needed layers
2. **Smaller payloads** - Don't load roads if not needed
3. **Easier caching** - Individual layer files cache independently
4. **Theme data separate from geometry** - Themes defined in manifest, not CSS variables
5. **Extensible** - Easy to add new layers (parks, buildings, rail lines)

## Implementation Tasks

### Phase 1: Varikko Changes

#### 1.1 Update SVG Generation Script

Modify the script that generates `background_map.svg` to instead produce separate files:

```typescript
// src/lib/exportLayers.ts

interface LayerExportOptions {
  outputDir: string
  viewBox: string
}

async function exportWaterLayer(features: Feature[], options: LayerExportOptions): Promise<void>
async function exportRoadsLayer(features: Feature[], options: LayerExportOptions): Promise<void>
async function generateManifest(options: LayerExportOptions): Promise<void>
```

#### 1.2 SVG File Format

Each layer SVG should be minimal:

```xml
<!-- water.svg -->
<svg viewBox="-20 -280 960 960" xmlns="http://www.w3.org/2000/svg">
  <g id="water">
    <path d="M786.081,570.505L785.11..." />
    <path d="M-420.59,647.488L-414.638..." />
    <!-- ... -->
  </g>
</svg>
```

No embedded styles - styling applied by frontend based on theme.

#### 1.3 Update Build Pipeline

- Add new export command: `pnpm export:layers`
- Remove or deprecate combined `background_map.svg` generation
- Output to `../opas/public/layers/`

### Phase 2: Opas Changes

#### 2.1 Create LayerService

```typescript
// src/services/LayerService.ts

interface LayerManifest {
  viewBox: string
  layers: LayerDefinition[]
  themes: Record<string, ThemeDefinition>
}

class LayerService {
  private manifest: LayerManifest | null = null
  private loadedLayers: Map<string, SVGElement> = new Map()

  async loadManifest(): Promise<LayerManifest>
  async loadLayer(layerId: string): Promise<SVGElement>
  getThemeStyles(theme: string, layerId: string): CSSProperties
}
```

#### 2.2 Refactor BackgroundMap.vue

```vue
<script setup lang="ts">
interface Props {
  theme?: ThemeName
  layers?: LayerId[]  // ['water'] or ['water', 'roads']
}

// Load only requested layers from separate files
// Apply theme styles from manifest
</script>

<template>
  <div class="background-map-container">
    <svg :viewBox="manifest.viewBox">
      <g v-for="layer in requestedLayers" :key="layer.id">
        <component :is="layer.content" :style="getLayerStyle(layer.id)" />
      </g>
    </svg>
  </div>
</template>
```

#### 2.3 Update InteractiveMap.vue

Remove the road loading hack:

```diff
- // Road paths loaded from background SVG
- const roadPaths = ref<string[]>([])
- async function loadRoadPaths() { ... }
```

Instead, InteractiveMap can either:

- Import roads as a prop from parent
- Or accept a slot for injecting road layer

#### 2.4 Update App.vue Layer Composition

```vue
<template>
  <!-- Layer composition becomes declarative -->
  <MapContainer>
    <BackgroundMap :theme="theme" :layers="['water']" />
    <InteractiveMap>
      <!-- Roads injected between zones and borders -->
      <template #roads>
        <BackgroundMap :theme="theme" :layers="['roads']" :inline="true" />
      </template>
    </InteractiveMap>
  </MapContainer>
</template>
```

### Phase 3: Future Enhancements

#### 3.1 Additional Layers

Once infrastructure is in place, easy to add:

- `parks.svg` - Green areas
- `rail.svg` - Rail/metro lines
- `buildings.svg` - Building footprints
- `labels.svg` - Place names

#### 3.2 Dynamic Loading

Load layers on demand based on zoom level or user preference.

#### 3.3 Layer Toggle UI

Add UI controls to show/hide individual layers.

## Migration Path

1. Implement Varikko changes (keep old export working)
2. Add new LayerService to Opas
3. Update components to use new system
4. Remove old `background_map.svg` and runtime hacks
5. Clean up CSS variable-based theming

## Files to Modify

### Varikko

- `src/lib/maps.ts` - Refactor to export separate layers
- `src/commands/export.ts` - Add layer export command
- New: `src/lib/exportLayers.ts` - Layer export logic

### Opas

- New: `src/services/LayerService.ts`
- `src/components/BackgroundMap.vue` - Use LayerService
- `src/components/InteractiveMap.vue` - Remove road loading hack
- `src/App.vue` - Update layer composition
- `src/styles/background-map.css` - Simplify or remove

## Estimated Effort

- **Varikko changes**: 2-3 hours
- **Opas refactor**: 3-4 hours
- **Testing & cleanup**: 1-2 hours

**Total**: ~1 day of focused work

## Open Questions

1. Should zones also become a separate layer file, or keep loading from SQLite?
2. Should manifest include projection parameters for coordinate transformation?
3. Worth adding layer dependency graph (e.g., roads depend on land being rendered first)?
