<script setup lang="ts">
import { computed } from 'vue'
import type { Zone } from '../services/DataService'
import { useZoneAnimation } from '../composables/useZoneAnimation'
import { useMapDataStore } from '../stores/mapData'

interface Props {
  zone: Zone
}

const props = defineProps<Props>()

const store = useMapDataStore()

// Use animation composable with initial color from store
const { currentColor, currentDelay, startAnimation, setColorImmediate } = useZoneAnimation(
  store.getZoneColor(props.zone.id)
)

/**
 * Expose changeColor method for parent components to trigger animations
 */
function changeColor(newColor: string, delayMs: number = 0) {
  startAnimation(newColor, delayMs)
}

/**
 * Expose updateColorImmediate for non-animated updates
 */
function updateColorImmediate(newColor: string) {
  setColorImmediate(newColor)
}

defineExpose({
  changeColor,
  updateColorImmediate,
})

// Computed states
const isActive = computed(() => store.transportState.activeZoneId === props.zone.id)
const fillOpacity = computed(() => (isActive.value ? 0 : 1))

// CSS variables for dynamic styling
const styleVars = computed(() => ({
  '--zone-color': currentColor.value,
  '--animation-delay': `${currentDelay.value}ms`,
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
    :data-testid="`zone-${zone.id}`"
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
    fill 150ms ease-in-out var(--animation-delay),
    stroke-width 200ms ease-in-out,
    fill-opacity 150ms ease-in-out;
}
</style>
