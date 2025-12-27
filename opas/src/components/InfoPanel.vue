<script setup lang="ts">
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import type { Place } from '../services/DatabaseService'

const store = useMapDataStore()
const { activeZoneId, zones, currentCosts } = storeToRefs(store)

const zoneDetails = computed(() => {
  if (!activeZoneId.value || !zones.value) return null
  const zone = zones.value.find((z: Place) => z.id === activeZoneId.value)
  return zone
})

const reachabilityStats = computed(() => {
  if (!activeZoneId.value || currentCosts.value.size === 0) return null

  // Calculate simple stats: how many reach specific thresholds
  const costsArray = Array.from(currentCosts.value.values())
  const total = zones.value?.length || costsArray.length
  if (total === 0) return null

  const under30 = costsArray.filter((d) => d < 1800 && d > 0).length

  return {
    count: total,
    under30,
    percent30: Math.round((under30 / total) * 100),
  }
})

function deselectZone() {
  store.activeZoneId = null
}
</script>

<template>
  <div
    v-if="activeZoneId"
    class="relative p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] w-sm"
  >
    <!-- Close button in top right corner -->
    <button
      class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-vintage-dark/60 hover:text-vintage-dark transition-colors duration-200 rounded-sm hover:bg-vintage-dark/10"
      title="Deselect zone"
      @click="deselectZone"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <div v-if="zoneDetails" class="pr-8">
      <h2 class="text-3xl font-bold uppercase mb-1 text-vintage-orange">{{ zoneDetails.name }}</h2>
      <p class="text-vintage-dark/60 text-sm tracking-widest mb-4">{{ zoneDetails.city || 'Helsinki' }}</p>

      <div v-if="reachabilityStats" class="space-y-2">
        <div class="flex items-baseline space-x-1.5">
          <span class="text-2xl font-bold">{{ reachabilityStats.percent30 }}%</span>
          <span class="text-lg">within 30 min travel</span>
        </div>
      </div>
      <div v-else class="text-sm italic">No routing data available for this origin.</div>
    </div>
  </div>

  <div v-else class="p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] w-sm">
    <h2 class="text-xl uppercase">Discover Helsinki</h2>
    <p class="text-sm mt-2">Select a zone on the map to visualize travel times.</p>
  </div>
</template>
