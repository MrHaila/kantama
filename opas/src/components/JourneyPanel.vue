<script setup lang="ts">
import { computed } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { dbService, type Leg, type Place } from '../services/DatabaseService'
import JourneyDetails from './JourneyDetails.vue'

interface JourneyDetailsData {
  isHint?: boolean
  isError?: boolean
  from: Place
  to?: Place
  duration?: number
  walkDistance?: number
  transfers?: number
  legs?: Leg[]
}

const store = useMapDataStore()
const { activeZoneId, hoveredZoneId, zones, currentTimePeriod } = storeToRefs(store)

const journeyDetails = computed<JourneyDetailsData | null>(() => {
  if (!activeZoneId.value) {
    return null
  }

  // If no hover, show hint
  if (!hoveredZoneId.value || activeZoneId.value === hoveredZoneId.value) {
    const fromZone = zones.value?.find(z => z.id === activeZoneId.value)
    return {
      isHint: true,
      from: fromZone!
    }
  }

  const fromZone = zones.value?.find(z => z.id === activeZoneId.value)
  const toZone = zones.value?.find(z => z.id === hoveredZoneId.value)
  
  if (!fromZone || !toZone) return null

  const routeDetails = dbService.getRouteDetails(
    activeZoneId.value,
    hoveredZoneId.value,
    currentTimePeriod.value
  )

  if (!routeDetails || routeDetails.status !== 'OK') {
    return {
      isError: true,
      from: fromZone,
      to: toZone
    }
  }

  const legs = dbService.parseLegs(routeDetails.legs)

  return {
    from: fromZone,
    to: toZone,
    duration: routeDetails.duration,
    walkDistance: routeDetails.walkDistance,
    transfers: routeDetails.numberOfTransfers,
    legs: legs
  }
})
</script>

<template>
  <div
    v-if="journeyDetails"
    class="p-6 bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] w-sm"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold uppercase text-vintage-dark">Journey Details</h3>
      <div class="text-xs text-vintage-dark/60">
        {{ currentTimePeriod }}
      </div>
    </div>

    <!-- Hint State -->
    <div v-if="journeyDetails.isHint" class="text-center py-8">
      <div class="text-4xl mb-3">👆</div>
      <p class="text-sm text-vintage-dark/70">
        Hover over another zone to see journey details
      </p>
      <p class="text-xs text-vintage-dark/50 mt-2">
        from {{ journeyDetails.from.name }}
      </p>
    </div>

    <!-- Error State -->
    <div v-else-if="journeyDetails.isError" class="text-center py-8">
      <div class="text-4xl mb-3">❌</div>
      <p class="text-sm text-vintage-dark/70">
        No route found
      </p>
      <p class="text-xs text-vintage-dark/50 mt-2">
        from {{ journeyDetails.from.name }} to {{ journeyDetails.to?.name }}
      </p>
    </div>

    <!-- Journey Details -->
    <div v-else>
      <!-- From/To -->
      <div class="space-y-2 mb-4">
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-vintage-orange rounded-full flex-shrink-0"></div>
          <span class="text-sm font-medium text-vintage-dark">{{ journeyDetails.from.name }}</span>
        </div>
        <div class="flex items-center space-x-2">
          <div class="w-3 h-3 bg-vintage-dark rounded-full flex-shrink-0"></div>
          <span class="text-sm font-medium text-vintage-dark">{{ journeyDetails.to?.name }}</span>
        </div>
      </div>

      <JourneyDetails
        v-if="journeyDetails.legs && journeyDetails.duration !== undefined && journeyDetails.walkDistance !== undefined && journeyDetails.transfers !== undefined"
        :legs="journeyDetails.legs"
        :total-duration="journeyDetails.duration"
        :walk-distance="journeyDetails.walkDistance"
        :transfers="journeyDetails.transfers"
      />
    </div>
  </div>
</template>
