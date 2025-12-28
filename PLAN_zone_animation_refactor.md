# Zone Animation Refactoring Plan

## Current Architecture Analysis

### Current State
- **Location**: `opas/src/components/InteractiveMap.vue` (lines 156-228)
- **Rendering**: Single SVG with v-for loop rendering ~300 zone paths
- **Color Logic**: Reactive `store.getZoneColor(zone.id)` based on travel time buckets
- **Transitions**: Global `transition-colors duration-300` CSS class on all zones
- **Problem**: All zones animate simultaneously - no independent delays or timing control

### Current Animation Flow
```
activeZoneId changes → getZoneColor() recalculates → all zones update → 300ms fade
```

---

## Proposed Architecture

### Approach: **Component-based with Composable + CSS Variables**

After analyzing the requirements and codebase, I recommend a hybrid approach:

1. **Component-ize zones** for encapsulation and independent state
2. **Composable for animation logic** for code reuse
3. **CSS custom properties** for dynamic timing
4. **Keyframe animations** for complex effects

### Advantages
✅ Each zone controls its own animation timing
✅ Simple API: reactive props or methods
✅ CSS-based for performance
✅ Supports delays, staggering, and custom animations
✅ Minimal changes to existing store logic
✅ Vue 3 Composition API best practices

---

## Implementation Plan

### 1. Create ZonePolygon Component

**File**: `opas/src/components/ZonePolygon.vue`

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Zone } from '@kantama/varikko/shared/types';
import { useZoneAnimation } from '@/composables/useZoneAnimation';

interface Props {
  zone: Zone;
  targetColor: string;
  animationDelay?: number; // milliseconds
  isActive?: boolean;
  isHovered?: boolean;
  fillOpacity?: number;
}

const props = withDefaults(defineProps<Props>(), {
  animationDelay: 0,
  isActive: false,
  isHovered: false,
  fillOpacity: 1,
});

const emit = defineEmits<{
  mouseenter: [zoneId: string];
  mouseleave: [];
  click: [zoneId: string];
}>();

// Use animation composable
const { currentColor, startAnimation } = useZoneAnimation(
  () => props.targetColor,
  props.animationDelay
);

// CSS variables for dynamic styling
const styleVars = computed(() => ({
  '--zone-color': currentColor.value,
  '--animation-delay': `${props.animationDelay}ms`,
  '--fill-opacity': props.fillOpacity,
}));

// Watch for color changes and trigger animation
watch(() => props.targetColor, (newColor, oldColor) => {
  if (newColor !== oldColor) {
    startAnimation(newColor);
  }
});
</script>

<template>
  <path
    :d="zone.svgPath"
    :style="styleVars"
    class="zone-polygon"
    :class="{
      'zone-active': isActive,
      'zone-hovered': isHovered,
    }"
    @mouseenter="emit('mouseenter', zone.id)"
    @mouseleave="emit('mouseleave')"
    @click="emit('click', zone.id)"
  />
</template>

<style scoped>
.zone-polygon {
  cursor: pointer;
  fill: var(--zone-color);
  fill-opacity: var(--fill-opacity, 1);
  stroke: var(--color-vintage-dark);
  stroke-width: 2;
  transition:
    fill 300ms ease-in-out var(--animation-delay),
    stroke-width 200ms ease-in-out,
    fill-opacity 150ms ease-in-out;
}

.zone-polygon.zone-active {
  fill-opacity: 0;
}

.zone-polygon.zone-hovered {
  stroke: var(--color-vintage-orange);
  stroke-width: 3;
}

/* Optional: Keyframe animation for special effects */
@keyframes zone-pulse {
  0%, 100% { fill-opacity: var(--fill-opacity, 1); }
  50% { fill-opacity: 0.6; }
}

.zone-polygon.animating {
  animation: zone-pulse 600ms ease-in-out var(--animation-delay);
}
</style>
```

**Key Features**:
- ✅ Independent animation timing via `--animation-delay`
- ✅ CSS transitions for smooth color changes
- ✅ Support for keyframe animations (pulse effect)
- ✅ Reactive to prop changes
- ✅ Clean event handling

---

### 2. Create Animation Composable

**File**: `opas/src/composables/useZoneAnimation.ts`

```typescript
import { ref, watch } from 'vue';

export interface ZoneAnimationOptions {
  duration?: number; // milliseconds
  easing?: string; // CSS easing function
  onComplete?: () => void;
}

export function useZoneAnimation(
  targetColorGetter: () => string,
  delayMs: number = 0,
  options: ZoneAnimationOptions = {}
) {
  const currentColor = ref(targetColorGetter());
  const isAnimating = ref(false);

  const {
    duration = 300,
    easing = 'ease-in-out',
    onComplete,
  } = options;

  /**
   * Start animation to new color after specified delay
   */
  function startAnimation(newColor: string) {
    isAnimating.value = true;

    // Apply delay before starting color transition
    setTimeout(() => {
      currentColor.value = newColor;

      // Mark animation complete after transition duration
      setTimeout(() => {
        isAnimating.value = false;
        onComplete?.();
      }, duration);
    }, delayMs);
  }

  /**
   * Immediately set color without animation
   */
  function setColorImmediate(color: string) {
    currentColor.value = color;
    isAnimating.value = false;
  }

  /**
   * Update delay dynamically
   */
  function updateDelay(newDelay: number) {
    // Could store delay in ref if needed for dynamic changes
  }

  return {
    currentColor,
    isAnimating,
    startAnimation,
    setColorImmediate,
    updateDelay,
  };
}
```

**Features**:
- ✅ Manages color state and animation lifecycle
- ✅ Delay support built-in
- ✅ Callbacks for animation completion
- ✅ Immediate update option (skip animation)
- ✅ Reusable across components

---

### 3. Update InteractiveMap Component

**File**: `opas/src/components/InteractiveMap.vue`

**Changes**:
- Replace v-for `<path>` with `<ZonePolygon>` components
- Calculate stagger delays (optional)
- Pass reactive colors and states

```vue
<script setup lang="ts">
import { computed } from 'vue';
import ZonePolygon from './ZonePolygon.vue';
import { useMapDataStore } from '@/stores/mapData';

const store = useMapDataStore();

// Optional: Calculate staggered delays for wave effect
function getAnimationDelay(index: number, zoneId: string): number {
  // Example: Stagger by 30ms per zone
  return index * 30;

  // Alternative: Delay based on distance from active zone
  // return calculateDistanceDelay(zoneId, store.activeZoneId);
}

// Alternative: Delay based on travel time (zones closer to active zone animate first)
function getTravelTimeDelay(zoneId: string): number {
  if (!store.activeZoneId) return 0;
  const duration = store.getDuration(zoneId);
  if (duration === null) return 1000; // Unreachable zones last
  return Math.min(duration * 10, 1000); // Max 1s delay
}
</script>

<template>
  <svg :viewBox="MAP_CONFIG.viewBox" class="w-full h-auto">
    <!-- Zone fill layer -->
    <g class="zones-layer">
      <ZonePolygon
        v-for="(zone, index) in store.zones"
        :key="zone.id"
        :zone="zone"
        :target-color="store.getZoneColor(zone.id)"
        :animation-delay="getTravelTimeDelay(zone.id)"
        :is-active="store.activeZoneId === zone.id"
        :is-hovered="store.hoveredZoneId === zone.id"
        :fill-opacity="store.activeZoneId === zone.id ? 0 : 1"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
        @click="handleZoneClick"
      />
    </g>

    <!-- Rest of SVG layers (roads, routes, etc.) -->
    <!-- ... existing code ... -->
  </svg>
</template>
```

**Delay Strategy Options**:
1. **Index-based**: Simple sequential stagger
2. **Travel time-based**: Zones animate in order of travel time (recommended)
3. **Distance-based**: Ripple effect from active zone
4. **Random**: Organic feel

---

### 4. Optional: Animation Orchestrator Store

**File**: `opas/src/stores/zoneAnimation.ts`

For complex animation sequences (optional advanced feature):

```typescript
import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useZoneAnimationStore = defineStore('zoneAnimation', () => {
  const animationMode = ref<'sequential' | 'travelTime' | 'wave'>('travelTime');
  const baseDelay = ref(30); // ms between zones
  const maxDelay = ref(1000); // maximum delay

  function calculateDelay(
    zoneId: string,
    index: number,
    travelTime: number | null
  ): number {
    switch (animationMode.value) {
      case 'sequential':
        return index * baseDelay.value;

      case 'travelTime':
        if (travelTime === null) return maxDelay.value;
        return Math.min(travelTime * 10, maxDelay.value);

      case 'wave':
        // Could implement distance-based calculation
        return index * baseDelay.value;

      default:
        return 0;
    }
  }

  return {
    animationMode,
    baseDelay,
    maxDelay,
    calculateDelay,
  };
});
```

---

## Alternative Approaches Considered

### Option B: Keep v-for, Use Dynamic Styles
**Pros**: Fewer component instances, simpler
**Cons**: Less encapsulation, harder to manage per-zone state

```vue
<path
  v-for="(zone, index) in zones"
  :style="{
    '--animation-delay': `${index * 30}ms`,
    fill: getZoneColor(zone.id)
  }"
  class="transition-all duration-300"
  style="transition-delay: var(--animation-delay)"
/>
```

### Option C: Vue TransitionGroup
**Pros**: Built-in Vue feature
**Cons**: Designed for enter/leave, not color changes; adds wrapper elements

**Verdict**: Component approach provides best balance of flexibility and performance.

---

## Migration Strategy

### Phase 1: Create Infrastructure
1. ✅ Create `composables/useZoneAnimation.ts`
2. ✅ Create `components/ZonePolygon.vue`
3. ✅ Add unit tests for composable

### Phase 2: Integration
4. ✅ Update `InteractiveMap.vue` to use `<ZonePolygon>`
5. ✅ Implement travel-time-based delay calculation
6. ✅ Update CSS theme variables if needed

### Phase 3: Enhancement (Optional)
7. ⬜ Create `stores/zoneAnimation.ts` for advanced controls
8. ⬜ Add animation mode selector to UI
9. ⬜ Support custom keyframe animations
10. ⬜ Performance testing with 300+ zones

### Phase 4: Polish
11. ✅ Remove old transition classes
12. ✅ Update documentation
13. ✅ Test across themes (vintage, etc.)

---

## Performance Considerations

### Rendering ~300 Components
- **Vue 3 performance**: Handles thousands of components efficiently
- **Virtual DOM**: Only updates changed zones
- **CSS transitions**: Hardware-accelerated
- **Memory**: Minimal per-component overhead

### Optimization Strategies
1. **Use `v-once`** for static zone paths if needed
2. **Lazy loading**: Render zones in viewport first (future enhancement)
3. **CSS containment**: `contain: layout style paint`
4. **will-change**: Only during active animations

### Benchmark Expectations
- Initial render: < 100ms for 300 zones
- Color update: < 16ms per frame (60fps)
- Memory: ~1-2MB for component instances

---

## API Examples

### Simple Color Update (All Zones)
```typescript
// When active zone changes, colors update automatically via reactive props
store.activeZoneId = 'zone-123';
// → All zones get new targetColor
// → Each zone animates with its own delay
```

### Programmatic Animation Trigger
```vue
<ZonePolygon
  :zone="zone"
  :target-color="customColor"
  :animation-delay="500"
  @animation-complete="handleComplete"
/>
```

### Special Effect (Pulse on Hover)
```typescript
// In ZonePolygon component
const pulseClass = ref(false);

function triggerPulse() {
  pulseClass.value = true;
  setTimeout(() => pulseClass.value = false, 600);
}
```

---

## Testing Plan

### Unit Tests
- ✅ `useZoneAnimation` composable delay timing
- ✅ Color transition state management
- ✅ Callback execution

### Component Tests
- ✅ ZonePolygon renders correctly
- ✅ Props update trigger animations
- ✅ Events emit properly

### Integration Tests
- ✅ InteractiveMap renders all zones
- ✅ Zone selection triggers staggered animations
- ✅ Animation delays match expected values

### Visual Tests
- ✅ Smooth color transitions
- ✅ No flickering or jank
- ✅ Proper stagger timing

---

## Open Questions for Review

1. **Delay strategy**: Should we use travel-time-based delays (closer zones animate first) or simple sequential stagger?
2. **Animation duration**: Keep 300ms or make configurable?
3. **Advanced features**: Do we want animation mode selector in UI, or keep it simple?
4. **Keyframe animations**: Should we support custom keyframes for special effects (pulse, glow, etc.)?
5. **Performance**: Should we add lazy loading for zones outside viewport (future optimization)?

---

## Estimated Complexity

- **Component creation**: 2-3 hours
- **Composable logic**: 1-2 hours
- **Integration**: 1-2 hours
- **Testing & polish**: 2-3 hours
- **Total**: ~6-10 hours

---

## Summary

This refactoring will:
✅ Enable independent zone animations with per-element delays
✅ Provide clean API via reactive props
✅ Leverage CSS for performance
✅ Support advanced animations via keyframes
✅ Maintain backward compatibility with existing store logic
✅ Follow Vue 3 Composition API best practices

The component-based approach offers the best balance of:
- **Simplicity**: Easy to understand and maintain
- **Flexibility**: Each zone controls its own animation
- **Performance**: CSS-based, hardware-accelerated
- **Extensibility**: Easy to add new animation types
