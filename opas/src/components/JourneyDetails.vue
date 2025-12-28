<script setup lang="ts">
import { getModeColor } from '../utils/transportColors'
import type { CompactLeg } from '../services/DataService'

interface Props {
  legs: CompactLeg[]
  totalDuration: number
  walkDistance: number
  transfers: number
}

defineProps<Props>()

const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

const getTransportIcon = (mode: string): string => {
  switch (mode.toLowerCase()) {
    case 'walk':
      return '🚶'
    case 'bus':
      return '🚌'
    case 'tram':
      return '🚊'
    case 'subway':
      return '🚇'
    case 'ferry':
      return '⛴️'
    case 'rail':
      return '🚆'
    default:
      return '🚌'
  }
}

const getModeLabel = (mode: string): string => {
  switch (mode.toLowerCase()) {
    case 'walk':
      return 'Walk'
    case 'bus':
      return 'Bus'
    case 'tram':
      return 'Tram'
    case 'subway':
      return 'Metro'
    case 'ferry':
      return 'Ferry'
    case 'rail':
      return 'Train'
    default:
      return mode
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Legs List -->
    <div class="space-y-3">
      <div v-for="(leg, index) in legs" :key="index" class="flex items-start space-x-3">
        <!-- Transport Icon -->
        <div class="text-xl flex-shrink-0 mt-0.5">
          {{ getTransportIcon(leg.mode) }}
        </div>

        <!-- Leg Details -->
        <div class="flex-grow min-w-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="font-medium text-vintage-dark text-sm">
                {{ getModeLabel(leg.mode) }}
              </span>
              <!-- Colored badge for route number/name -->
              <span
                v-if="leg.routeShortName || leg.routeLongName"
                class="px-1 py-0.5 text-xs font-medium rounded"
                :style="{ backgroundColor: getModeColor(leg.mode), color: 'white' }"
              >
                {{ leg.routeShortName || leg.routeLongName }}
              </span>
            </div>
            <span class="text-sm text-vintage-dark/70">
              {{ formatDuration(leg.duration) }}
            </span>
          </div>

          <div v-if="leg.from && leg.to" class="text-xs text-vintage-dark/50 mt-1 truncate">
            {{ leg.from.name }} → {{ leg.to.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
