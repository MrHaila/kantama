<script setup lang="ts">
interface Leg {
  mode: string
  duration: number
  distance?: number
  routeName?: string
  from?: { name: string; lat?: number; lon?: number }
  to?: { name: string; lat?: number; lon?: number }
  legGeometry?: { points: string }
  route?: { shortName?: string; longName?: string }
}

interface Props {
  legs: Leg[]
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

const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)}m`
  }
  return `${(meters / 1000).toFixed(1)}km`
}

const getTransportIcon = (mode: string): string => {
  switch (mode.toLowerCase()) {
    case 'walk':
      return '🚶'
    case 'bus':
      return '🚌'
    case 'tram':
      return '🚊'
    case 'metro':
      return '🚇'
    case 'ferry':
      return '⛴️'
    case 'train':
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
    case 'metro':
      return 'Metro'
    case 'ferry':
      return 'Ferry'
    case 'train':
      return 'Train'
    default:
      return mode
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Journey Summary -->
    <div class="border-b border-vintage-dark/20 pb-3">
      <div class="flex items-center justify-between text-sm">
        <span class="text-vintage-dark/70">Total time:</span>
        <span class="font-bold text-vintage-dark">{{ formatDuration(totalDuration) }}</span>
      </div>
      <div class="flex items-center justify-between text-sm mt-1">
        <span class="text-vintage-dark/70">Walking:</span>
        <span class="text-vintage-dark">{{ formatDistance(walkDistance) }}</span>
      </div>
      <div class="flex items-center justify-between text-sm mt-1">
        <span class="text-vintage-dark/70">Transfers:</span>
        <span class="text-vintage-dark">{{ transfers }}</span>
      </div>
    </div>

    <!-- Legs List -->
    <div class="space-y-2">
      <div v-for="(leg, index) in legs" :key="index" class="flex items-start space-x-3">
        <!-- Transport Icon -->
        <div class="text-xl flex-shrink-0 mt-0.5">
          {{ getTransportIcon(leg.mode) }}
        </div>

        <!-- Leg Details -->
        <div class="flex-grow min-w-0">
          <div class="flex items-center justify-between">
            <span class="font-medium text-vintage-dark text-sm">
              {{ getModeLabel(leg.mode) }}
            </span>
            <span class="text-sm text-vintage-dark/70">
              {{ formatDuration(leg.duration) }}
            </span>
          </div>

          <div v-if="leg.route?.shortName || leg.route?.longName || leg.routeName" class="text-xs text-vintage-dark/60 mt-0.5">
            {{ leg.route?.shortName || leg.route?.longName || leg.routeName }}
          </div>

          <div v-if="leg.from && leg.to" class="text-xs text-vintage-dark/50 mt-0.5 truncate">
            {{ leg.from.name }} → {{ leg.to.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
