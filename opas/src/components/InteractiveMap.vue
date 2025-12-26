<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { MAP_CONFIG } from '../config/mapConfig'

const store = useMapDataStore()
const { zones } = storeToRefs(store)

// Track hovered zone for hover effects
const hoveredZoneId = ref<string | null>(null)

// Handle zone click
function handleZoneClick(zoneId: string) {
  store.activeZoneId = zoneId
}

// Handle mouse enter
function handleMouseEnter(zoneId: string) {
  hoveredZoneId.value = zoneId
}

// Handle mouse leave
function handleMouseLeave() {
  hoveredZoneId.value = null
}

// Load data on mount
onMounted(async () => {
  await store.loadData()
})

// ESC key handler to deselect zone
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && store.activeZoneId) {
    store.activeZoneId = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="relative w-full aspect-square">
    <div class="absolute inset-0 overflow-hidden rounded-lg shadow-inner">
      <svg
        :viewBox="MAP_CONFIG.viewBox"
        class="w-full h-auto"
        style="position: absolute; top: 0; left: 0; pointer-events: auto"
      >
        <g>
          <!-- Render all zones -->
          <path
            v-for="zone in zones"
            :key="zone.id"
            :d="zone.svgPath"
            class="cursor-pointer transition-colors duration-300 stroke-vintage-dark stroke-2 hover:fill-vintage-teal"
            :fill="store.getZoneColor(zone.id)"
            :fill-opacity="store.activeZoneId === zone.id ? 1 : 0.5"
            @mouseenter="handleMouseEnter(zone.id)"
            @mouseleave="handleMouseLeave"
            @click="handleZoneClick(zone.id)"
          />
        </g>
        <!-- Selected zone border on top -->
        <g v-if="store.activeZoneId">
          <path
            v-for="zone in zones"
            v-show="zone.id === store.activeZoneId"
            :key="`selected-${zone.id}`"
            :d="zone.svgPath"
            class="pointer-events-none stroke-vintage-orange"
            fill="none"
            stroke-width="3"
          />
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Ensure smooth transitions for hover effects */
path {
  transition: stroke-width 0.2s ease-in-out;
}
</style>
