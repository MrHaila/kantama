<script setup lang="ts">
import { computed, watch } from 'vue'
import type { Zone } from '../services/DataService'
import { useZoneAnimation } from '../composables/useZoneAnimation'
import { useMapDataStore } from '../stores/mapData'

interface Props {
  zone: Zone
}

const props = defineProps<Props>()

const store = useMapDataStore()

// Calculate animation delay based on travel time from active zone or reachability score
const animationDelay = computed(() => {
  // In reachability mode, no staggered animation
  if (store.transportState.overlayMode === 'reachability') {
    return 0
  }

  // In zone selection mode, animate based on travel time
  if (!store.transportState.activeZoneId) return 0

  const duration = store.getDuration(props.zone.id)

  // Unreachable zones animate last
  if (duration === null) return 1000

  // Closer zones animate first (max 1s delay)
  return Math.min(duration * 10, 1000)
})

// Get target color from store
const targetColor = computed(() => store.getZoneColor(props.zone.id))

// Use animation composable
const { currentColor, startAnimation } = useZoneAnimation(() => targetColor.value, animationDelay.value)

// Watch for color changes and trigger animation
watch(
  targetColor,
  (newColor, oldColor) => {
    if (newColor !== oldColor) {
      startAnimation(newColor)
    }
  },
  { immediate: true }
)

// Computed states
const isActive = computed(() => store.transportState.activeZoneId === props.zone.id)
const fillOpacity = computed(() => (isActive.value ? 0 : 1))

// CSS variables for dynamic styling
const styleVars = computed(() => ({
  '--zone-color': currentColor.value,
  '--animation-delay': `${animationDelay.value}ms`,
  '--fill-opacity': fillOpacity.value,
}))

// Handle zone interactions - integrated into component
function handleClick() {
  store.transportState.selectZone(props.zone.id)
}

function handleMouseEnter() {
  store.transportState.setHoveredZone(props.zone.id)
}

function handleMouseLeave() {
  store.transportState.setHoveredZone(null)
}
</script>

<template>
  <path
    :d="zone.svgPath"
    :style="styleVars"
    class="zone-polygon"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @click="handleClick"
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
</style>
