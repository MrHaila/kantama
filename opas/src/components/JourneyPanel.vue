<script setup lang="ts">
import { computed } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { type Zone, type CompactLeg, RouteStatus } from '../services/DataService'
import JourneyDetails from './JourneyDetails.vue'

interface JourneyDetailsData {
  isHint?: boolean
  isError?: boolean
  from: Zone
  to?: Zone
  duration?: number
  transfers?: number
  legs?: CompactLeg[]
}

const store = useMapDataStore()
const { zones, currentTimePeriod, currentRouteDetails } = storeToRefs(store)

const journeyDetails = computed<JourneyDetailsData | null>(() => {
  const activeZoneId = store.transportState.activeZoneId
  const hoveredZoneId = store.transportState.hoveredZoneId

  if (!activeZoneId) {
    return null
  }

  // If no hover, show hint
  if (!hoveredZoneId || activeZoneId === hoveredZoneId) {
    const fromZone = zones.value?.find((z) => z.id === activeZoneId)
    return {
      isHint: true,
      from: fromZone!,
    }
  }

  const fromZone = zones.value?.find((z) => z.id === activeZoneId)
  const toZone = zones.value?.find((z) => z.id === hoveredZoneId)

  if (!fromZone || !toZone) return null

  const routeData = currentRouteDetails.value

  if (!routeData || routeData.s !== RouteStatus.OK) {
    return {
      isError: true,
      from: fromZone,
      to: toZone,
    }
  }

  return {
    from: fromZone,
    to: toZone,
    duration: routeData.d ?? undefined,
    transfers: routeData.t ?? undefined,
    legs: routeData.l,
  }
})
</script>

<template>
  <div
    v-if="journeyDetails"
    data-testid="journey-panel"
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
    <div v-if="journeyDetails.isHint" data-testid="journey-hint" class="text-center py-8">
      <div class="text-4xl mb-3">👆</div>
      <p class="text-sm text-vintage-dark/70">Hover over another zone to see journey details</p>
      <p class="text-xs text-vintage-dark/50 mt-2">from {{ journeyDetails.from.name }}</p>
    </div>

    <!-- Error State -->
    <div v-else-if="journeyDetails.isError" data-testid="journey-error" class="text-center py-8">
      <div class="text-4xl mb-3">❌</div>
      <p class="text-sm text-vintage-dark/70">No route found</p>
      <p class="text-xs text-vintage-dark/50 mt-2">
        from {{ journeyDetails.from.name }} to {{ journeyDetails.to?.name }}
      </p>
    </div>

    <!-- Journey Details -->
    <div v-else>
      <!-- From/To with Duration -->
      <div class="mb-6">
        <div class="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2 items-center">
          <!-- From row -->
          <span class="text-xs uppercase tracking-wide text-vintage-dark/50 font-medium">From</span>
          <span data-testid="journey-from" class="text-sm font-medium text-vintage-dark">{{ journeyDetails.from.name }}</span>
          <!-- Duration spans From and To rows -->
          <div data-testid="journey-duration" class="text-2xl font-bold text-vintage-dark row-span-2 flex items-center">
            {{ journeyDetails.duration ? Math.round(journeyDetails.duration / 60) + ' min' : '' }}
          </div>

          <!-- To row -->
          <span class="text-xs uppercase tracking-wide text-vintage-dark/50 font-medium">To</span>
          <span data-testid="journey-to" class="text-sm font-medium text-vintage-dark">{{ journeyDetails.to?.name }}</span>
        </div>
      </div>

      <JourneyDetails
        v-if="journeyDetails.legs && journeyDetails.duration !== undefined"
        :legs="journeyDetails.legs"
        :total-duration="journeyDetails.duration"
        :transfers="journeyDetails.transfers ?? 0"
      />
    </div>
  </div>
</template>
