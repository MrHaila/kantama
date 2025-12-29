<script setup lang="ts">
import { onMounted, computed } from 'vue'
import BackgroundMap from './components/BackgroundMap.vue'
import InteractiveMap from './components/InteractiveMap.vue'
import InfoPanelContainer from './components/InfoPanelContainer.vue'
import { useAppState } from './composables/useAppState'
import { useMapDataStore } from './stores/mapData'
import { getLayerStyles, type MapThemeName } from './config/mapThemes'

const { currentState, error, initialize } = useAppState()
const store = useMapDataStore()

// Derive theme from current time period
const currentTheme = computed<MapThemeName>(() => {
  const period = store.currentTimePeriod.toLowerCase()
  if (period === 'morning' || period === 'evening' || period === 'midnight') {
    return period as MapThemeName
  }
  return 'morning' // Default fallback
})

// Derive transit layer ID and styling from current period
const transitLayerId = computed(() => {
  const period = store.currentTimePeriod
  if (period === 'MORNING') return 'transit-M'
  if (period === 'EVENING') return 'transit-E'
  if (period === 'MIDNIGHT') return 'transit-N'
  return 'transit-M' // Default fallback
})

const transitStyles = computed(() => {
  return getLayerStyles(currentTheme.value, transitLayerId.value)
})

// Period options
type TimePeriod = 'MORNING' | 'EVENING' | 'MIDNIGHT'
const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT']

function setPeriod(period: TimePeriod): void {
  store.currentTimePeriod = period
}

onMounted(() => {
  initialize()
})
</script>

<template>
  <div data-testid="app-root" class="min-h-screen w-full bg-vintage-cream relative">
    <!-- Fixed Page Title - Background layer -->
    <div class="fixed top-6 left-6 z-10 pointer-events-none">
      <h1 class="text-3xl md:text-4xl font-sans font-bold text-vintage-dark/80 tracking-tighter uppercase">
        <div>Helsinki</div>
        <div class="text-vintage-orange/80">Kantama</div>
      </h1>
      <p class="text-xs text-vintage-dark/50 tracking-widest mt-1 italic">/ˈkɑntɑmɑ/ — n. how far you can get</p>
    </div>

    <!-- Controls - Bottom Right -->
    <div class="fixed bottom-6 right-6 z-20 flex flex-col gap-3 items-end">
      <!-- Period Toggle -->
      <div class="flex border-2 border-vintage-dark shadow-[3px_3px_0px_rgba(38,70,83,1)] bg-vintage-cream">
        <button
          v-for="period in periods"
          :key="period"
          :data-testid="`time-period-${period.toLowerCase()}`"
          class="px-4 py-2 font-sans text-xs tracking-widest uppercase transition-colors"
          :class="
            store.currentTimePeriod === period
              ? 'bg-vintage-dark text-vintage-cream'
              : 'bg-vintage-cream text-vintage-dark hover:bg-vintage-dark/10'
          "
          @click="setPeriod(period)"
        >
          {{ period }}
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <main class="min-h-screen w-full flex relative">
      <!-- Loading State -->
      <div v-if="currentState === 'loading'" data-testid="loading-state" class="grow flex items-center justify-center bg-[#A8B5B9]">
        <div class="text-center">
          <div
            class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-vintage-dark border-t-transparent mb-4"
          ></div>
          <p class="text-xl font-sans tracking-widest text-vintage-dark animate-pulse">LOADING MAP DATA...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="currentState === 'error'" data-testid="error-state" class="grow flex items-center justify-center bg-[#A8B5B9]">
        <div class="text-center max-w-md px-8">
          <div class="text-vintage-dark text-6xl mb-4">⚠️</div>
          <h2 class="text-2xl font-sans font-bold text-vintage-dark mb-2">Failed to Load</h2>
          <p class="text-vintage-dark/80 mb-4">{{ error || 'Unable to load map data' }}</p>
          <button
            data-testid="retry-button"
            class="px-6 py-2 bg-vintage-dark text-vintage-cream hover:bg-vintage-orange transition-colors font-sans tracking-widest text-sm"
            @click="initialize()"
          >
            RETRY
          </button>
        </div>
      </div>

      <!-- Ready State - Show Map -->
      <div v-else class="grow relative bg-[#A8B5B9] flex items-center justify-center p-6">
        <div class="w-full max-w-5xl aspect-square relative shadow-2xl border-8 border-white bg-white p-2">
          <!-- Background Map Layer (water only) -->
          <div class="absolute inset-0">
            <BackgroundMap :theme="currentTheme" :layers="['water']" />
          </div>
          <!-- Interactive Map Layer -->
          <div class="absolute inset-0">
            <InteractiveMap
              :transit-color="transitStyles.stroke"
              :transit-width="transitStyles.strokeWidth"
            />
          </div>
        </div>
      </div>

      <!-- Texture Overlay -->
      <div class="pointer-events-none absolute inset-0 opacity-[0.15] bg-paper-texture mix-blend-multiply z-30"></div>
    </main>

    <!-- InfoPanelContainer only shows when ready -->
    <InfoPanelContainer v-if="currentState === 'ready'" />
  </div>
</template>

<style>
/* Global grainy texture if valid svg available, else fallback */
</style>
