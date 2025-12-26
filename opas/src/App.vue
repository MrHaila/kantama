<script setup lang="ts">
import { onMounted } from 'vue'
import BackgroundMap from './components/BackgroundMap.vue'
import InteractiveMap from './components/InteractiveMap.vue'
import InfoPanel from './components/InfoPanel.vue'
import { useAppState } from './composables/useAppState'

const { currentState, error, initialize } = useAppState()

onMounted(() => {
  initialize()
})
</script>

<template>
  <div class="min-h-screen bg-vintage-cream flex flex-col">
    <!-- Header -->
    <header class="p-6 border-b-4 border-vintage-dark flex justify-between items-center bg-vintage-cream relative z-10">
      <div>
        <h1 class="text-4xl md:text-6xl font-sans font-bold text-vintage-dark tracking-tighter uppercase">
          Helsinki <span class="text-vintage-orange">Kantama</span>
        </h1>
      </div>
      <div class="hidden md:block text-right font-sans text-sm tracking-widest opacity-70">
        <p>HOW FAR IS EVERYTHING FROM EVERYTHING ELSE?</p>
        <!-- <p>GENERATED ON TBD</p> -->
      </div>
    </header>

    <!-- Main Content -->
    <main class="grow flex relative">
      <!-- Loading State -->
      <div v-if="currentState === 'loading'" class="grow flex items-center justify-center bg-[#A8B5B9]">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-vintage-dark border-t-transparent mb-4"></div>
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
      <div v-else class="grow relative bg-[#A8B5B9] p-4 md:p-8 flex items-center justify-center">
        <div class="w-full max-w-5xl aspect-square relative shadow-2xl border-8 border-white bg-white p-2">
          <!-- Background Map Layer -->
          <div class="absolute inset-0">
            <BackgroundMap />
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

    <!-- InfoPanel only shows when ready -->
    <InfoPanel v-if="currentState === 'ready'" />
  </div>
</template>

<style>
/* Global grainy texture if valid svg available, else fallback */
</style>
