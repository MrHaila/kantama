<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BackgroundMap from './components/BackgroundMap.vue'
import InteractiveMap from './components/InteractiveMap.vue'
import InfoPanelContainer from './components/InfoPanelContainer.vue'
import { useAppState } from './composables/useAppState'

const { currentState, error, initialize } = useAppState()

// Theme management
const currentTheme = ref<'vintage' | 'modern' | 'dark' | 'contrast' | 'yle'>('vintage')

const themes: Array<'vintage' | 'modern' | 'dark' | 'contrast' | 'yle'> = ['vintage', 'modern', 'dark', 'contrast', 'yle']

function cycleTheme(): void {
  const currentIndex = themes.indexOf(currentTheme.value!)
  currentTheme.value = themes[(currentIndex + 1) % themes.length]!
}

onMounted(() => {
  initialize()
})
</script>

<template>
  <div class="min-h-screen w-full bg-vintage-cream relative">
    <!-- Fixed Page Title - Background layer -->
    <div class="fixed top-6 left-6 z-10 pointer-events-none">
      <h1 class="text-3xl md:text-4xl font-sans font-bold text-vintage-dark/80 tracking-tighter uppercase">
        <div>Helsinki</div>
        <div class="text-vintage-orange/80">Kantama</div>
      </h1>
      <p class="text-xs text-vintage-dark/50 tracking-widest mt-1 italic">/ˈkɑntɑmɑ/ — n. how far you can get</p>
    </div>

    <!-- Theme Selector - Bottom Right -->
    <div class="fixed bottom-6 right-6 z-20">
      <button
        class="px-4 py-2 bg-vintage-cream border-2 border-vintage-dark shadow-[3px_3px_0px_rgba(38,70,83,1)] hover:bg-vintage-dark/10 transition-colors text-vintage-dark font-sans text-xs tracking-widest uppercase"
        @click="cycleTheme"
      >
        {{ currentTheme }}
      </button>
    </div>

    <!-- Main Content -->
    <main class="min-h-screen w-full flex relative">
      <!-- Loading State -->
      <div v-if="currentState === 'loading'" class="grow flex items-center justify-center bg-[#A8B5B9]">
        <div class="text-center">
          <div
            class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-vintage-dark border-t-transparent mb-4"
          ></div>
          <p class="text-xl font-sans tracking-widest text-vintage-dark animate-pulse">LOADING MAP DATA...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="currentState === 'error'" class="grow flex items-center justify-center bg-[#A8B5B9]">
        <div class="text-center max-w-md px-8">
          <div class="text-vintage-dark text-6xl mb-4">⚠️</div>
          <h2 class="text-2xl font-sans font-bold text-vintage-dark mb-2">Failed to Load</h2>
          <p class="text-vintage-dark/80 mb-4">{{ error || 'Unable to load map data' }}</p>
          <button
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
          <!-- Background Map Layer (water only, roads rendered in InteractiveMap) -->
          <div class="absolute inset-0">
            <BackgroundMap :theme="currentTheme" :layers="['water']" />
          </div>
          <!-- Interactive Map Layer -->
          <div class="absolute inset-0">
            <InteractiveMap />
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
