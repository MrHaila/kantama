<script setup lang="ts">
import { getModeColor } from '../utils/transportColors'
import type { CompactLeg } from '../services/DataService'

interface Props {
  legs: CompactLeg[]
  totalDuration: number
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
        <div class="text-xl shrink-0 mt-0.5">
          {{ getTransportIcon(leg.m) }}
        </div>

        <!-- Leg Details -->
        <div class="grow min-w-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="font-medium text-vintage-dark text-sm">
                {{ getModeLabel(leg.m) }}
              </span>
              <!-- Colored badge for route number/name -->
              <span
                v-if="leg.sn || leg.ln"
                class="px-1 py-0.5 text-xs font-medium rounded"
                :style="{ backgroundColor: getModeColor(leg.m), color: 'white' }"
              >
                {{ leg.sn || leg.ln }}
              </span>
            </div>
            <span class="text-sm text-vintage-dark/70">
              {{ formatDuration(leg.d) }}
            </span>
          </div>

          <div v-if="leg.f && leg.t" class="text-xs text-vintage-dark/50 mt-1 truncate">
            {{ leg.f.n }} → {{ leg.t.n }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
