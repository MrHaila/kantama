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
</script>

<template>
  <div
    v-if="activeZoneId"
    class="fixed bottom-8 left-8 p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] max-w-sm w-full z-20 font-sans"
  >
    <div v-if="zoneDetails">
      <h2 class="text-3xl font-bold uppercase mb-1 text-vintage-orange">{{ zoneDetails.name }}</h2>
      <p class="text-vintage-dark/60 text-sm tracking-widest mb-4">POSTAL CODE {{ activeZoneId }}</p>

      <div v-if="reachabilityStats" class="space-y-2">
        <div class="flex justify-between items-baseline border-b border-vintage-dark/20 pb-2">
          <span class="text-lg">Within 30 min:</span>
          <span class="text-2xl font-bold">{{ reachabilityStats.percent30 }}%</span>
        </div>
        <p class="text-sm italic text-vintage-dark/80 mt-2">TBD</p>
      </div>
      <div v-else class="text-sm italic">No routing data available for this origin.</div>
    </div>
  </div>

  <div
    v-else
    class="fixed bottom-8 left-8 p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] max-w-sm w-full z-20 font-sans opacity-80"
  >
    <h2 class="text-xl uppercase">Discover Helsinki</h2>
    <p class="text-sm mt-2">Select a zone on the map to visualize travel times.</p>
  </div>
</template>
