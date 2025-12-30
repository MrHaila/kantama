<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import BackgroundMap from './components/BackgroundMap.vue'
import InteractiveMap from './components/InteractiveMap.vue'
import InfoPanelContainer from './components/InfoPanelContainer.vue'
import HeatmapLegend from './components/HeatmapLegend.vue'
import LayerControls from './components/LayerControls.vue'
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

// Zoom controls
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1

const zoomScale = ref(1.0)

function zoomIn(): void {
  zoomScale.value = Math.min(MAX_ZOOM, zoomScale.value + ZOOM_STEP)
}

function zoomOut(): void {
  zoomScale.value = Math.max(MIN_ZOOM, zoomScale.value - ZOOM_STEP)
}

onMounted(() => {
  initialize()
})
</script>

<template>
  <div data-testid="app-root" class="w-full h-screen bg-[#A8B5B9] relative overflow-hidden">
    <!-- Mobile Overlay - Hidden on screens >= 768px -->
    <div
      data-testid="mobile-overlay"
      class="fixed inset-0 z-40 bg-[#A8B5B9] flex items-center justify-center p-6 md:hidden"
    >
      <!-- Tilted Screenshot Background -->
      <div class="absolute inset-0 flex items-center justify-center opacity-30">
        <img
          src="/desktop-screenshot.svg"
          alt="Desktop view"
          class="w-[90%] max-w-2xl shadow-2xl"
          style="transform: rotate(3deg) translateY(-2rem);"
        />
      </div>

      <!-- Text Box (Floating Panel Style) -->
      <div
        class="relative z-10 max-w-md bg-vintage-cream border-2 border-vintage-dark shadow-[4px_4px_0px_rgba(38,70,83,1)] p-6"
      >
        <h2 class="text-2xl font-bold uppercase mb-3 text-vintage-orange tracking-tight">
          Desktop Required
        </h2>
        <p class="text-sm leading-relaxed mb-4">
          <strong class="text-vintage-dark">Kantama</strong> is an interactive map showing
          how far you can travel by public transit across Helsinki's capital region.
        </p>
        <p class="text-sm leading-relaxed text-vintage-dark/80">
          Please use a device with a wider screen or resize your browser.
        </p>
      </div>
    </div>

    <!-- Fixed Page Title - Background layer -->
    <div class="fixed top-6 left-6 z-10 pointer-events-none">
      <h1 class="text-3xl md:text-4xl font-sans font-bold text-vintage-dark/80 tracking-tighter uppercase">
        <div>Helsinki</div>
        <div class="text-vintage-orange/80">Kantama</div>
      </h1>
      <p class="text-xs text-vintage-dark/50 tracking-widest mt-1 italic">/ˈkɑntɑmɑ/ — n. how far you can get</p>
      <div class="mt-2 pointer-events-auto">
        <a
          href="https://github.com/MrHaila/kantama"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[10px] text-vintage-dark/40 hover:text-vintage-dark/70 transition-colors uppercase tracking-widest flex items-center gap-1"
        >
          About this app
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      </div>
    </div>

    <!-- Legend and Layer Controls - Top Right -->
    <div class="hidden md:flex fixed top-6 right-6 z-20 flex-col gap-3">
      <HeatmapLegend />
      <LayerControls />
    </div>

    <!-- Controls - Bottom Right -->
    <div class="hidden md:flex fixed bottom-6 right-6 z-20 flex-col gap-3 items-end">
      <!-- Zoom Controls -->
      <div class="flex border-2 border-vintage-dark shadow-[3px_3px_0px_rgba(38,70,83,1)] bg-vintage-cream">
        <button
          data-testid="zoom-out-button"
          class="px-3 py-2 font-sans text-lg transition-colors"
          :class="
            zoomScale <= MIN_ZOOM
              ? 'bg-vintage-cream/50 text-vintage-dark/30 cursor-not-allowed'
              : 'bg-vintage-cream text-vintage-dark hover:bg-vintage-dark/10'
          "
          :disabled="zoomScale <= MIN_ZOOM"
          @click="zoomOut"
        >
          −
        </button>
        <button
          data-testid="zoom-in-button"
          class="px-3 py-2 font-sans text-lg transition-colors"
          :class="
            zoomScale >= MAX_ZOOM
              ? 'bg-vintage-cream/50 text-vintage-dark/30 cursor-not-allowed'
              : 'bg-vintage-cream text-vintage-dark hover:bg-vintage-dark/10'
          "
          :disabled="zoomScale >= MAX_ZOOM"
          @click="zoomIn"
        >
          +
        </button>
      </div>

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
    <main class="w-full h-screen flex relative overflow-x-auto overflow-y-hidden">
      <!-- Loading State -->
      <div v-if="currentState === 'loading'" data-testid="loading-state" class="grow flex items-center justify-center">
        <div class="text-center">
          <div
            class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-vintage-dark border-t-transparent mb-4"
          ></div>
          <p class="text-xl font-sans tracking-widest text-vintage-dark animate-pulse">LOADING MAP DATA...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="currentState === 'error'" data-testid="error-state" class="grow flex items-center justify-center">
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
      <div v-else class="grow relative flex items-center justify-center">
        <div
          class="relative shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)] border-8 border-white bg-white p-2 h-[calc(100vh-3rem)] aspect-3/2 transition-transform duration-200"
          :style="{ transform: `scale(${zoomScale})` }"
        >
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
    <InfoPanelContainer v-if="currentState === 'ready'" class="hidden md:block" />
  </div>
</template>

<style>
/* Global grainy texture if valid svg available, else fallback */
</style>
