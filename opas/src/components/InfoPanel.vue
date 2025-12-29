<script setup lang="ts">
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import type { Zone } from '../services/DataService'

const store = useMapDataStore()
const { zones, currentCosts, reachabilityScores } = storeToRefs(store)

// Display zone for either active or hovered zone
const displayZoneId = computed(() => {
  return store.transportState.activeZoneId || store.transportState.hoveredZoneId
})

const zoneDetails = computed(() => {
  if (!displayZoneId.value || !zones.value) return null
  const zone = zones.value.find((z: Zone) => z.id === displayZoneId.value)
  return zone
})

const reachabilityStats = computed(() => {
  // In zone selection mode, show travel time stats
  if (store.transportState.activeZoneId && currentCosts.value.size > 0) {
    const costsArray: number[] = Array.from(currentCosts.value.values())
    const total = zones.value?.length || costsArray.length
    if (total === 0) return null

    const under30 = costsArray.filter((d) => d < 1800 && d > 0).length

    return {
      type: 'travel-time' as const,
      count: total,
      under30,
      percent30: Math.round((under30 / total) * 100),
    }
  }

  // In reachability mode, show connectivity score
  if (displayZoneId.value && reachabilityScores.value.size > 0) {
    const score = reachabilityScores.value.get(displayZoneId.value)
    if (!score) return null

    return {
      type: 'connectivity' as const,
      score: score.score,
      rank: score.rank,
      zonesWithin15min: score.zonesWithin15min,
      zonesWithin30min: score.zonesWithin30min,
      avgTravelTime: Math.round(score.avgTravelTime / 60), // Convert to minutes
    }
  }

  return null
})

function deselectZone() {
  store.transportState.clearZone()
}
</script>

<template>
  <div
    v-if="displayZoneId"
    class="relative p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] w-sm"
  >
    <!-- Close button in top right corner (only if zone is selected, not just hovered) -->
    <button
      v-if="store.transportState.activeZoneId"
      class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-vintage-dark/60 hover:text-vintage-dark transition-colors duration-200 rounded-sm hover:bg-vintage-dark/10"
      title="Deselect zone"
      @click="deselectZone"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <div v-if="zoneDetails" :class="store.transportState.activeZoneId ? 'pr-8' : ''">
      <h2 class="text-3xl font-bold uppercase mb-1 text-vintage-orange">{{ zoneDetails.name }}</h2>
      <p class="text-vintage-dark/60 text-sm tracking-widest mb-4">{{ zoneDetails.city || 'Helsinki' }}</p>

      <!-- Travel time stats (zone selection mode) -->
      <div v-if="reachabilityStats?.type === 'travel-time'" class="space-y-2">
        <div class="flex items-baseline space-x-1.5">
          <span class="text-2xl font-bold">{{ reachabilityStats.percent30 }}%</span>
          <span class="text-lg">within 30 min travel</span>
        </div>
      </div>

      <!-- Connectivity stats (reachability mode) -->
      <div v-else-if="reachabilityStats?.type === 'connectivity'" class="space-y-2">
        <div class="flex items-baseline space-x-1.5 mb-3">
          <span class="text-2xl font-bold">Rank #{{ reachabilityStats.rank }}</span>
          <span class="text-sm">connectivity</span>
        </div>
        <div class="text-sm space-y-1">
          <div>{{ reachabilityStats.zonesWithin15min }} zones within 15 min</div>
          <div>{{ reachabilityStats.zonesWithin30min }} zones within 30 min</div>
          <div class="text-vintage-dark/60">Avg: {{ reachabilityStats.avgTravelTime }} min</div>
        </div>
      </div>

      <div v-else class="text-sm italic">No data available.</div>
    </div>
  </div>

  <div v-else class="p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] w-sm">
    <h2 class="text-xl uppercase">Discover Helsinki</h2>
    <p class="text-sm mt-2">Hover or select a zone to see details.</p>
  </div>
</template>
