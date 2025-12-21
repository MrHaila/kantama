<script setup lang="ts">
import InteractiveMap from './components/InteractiveMap.vue'
import InfoPanel from './components/InfoPanel.vue'
</script>

<template>
  <div class="min-h-screen bg-vintage-cream flex flex-col">
    <!-- Header -->
    <header class="p-6 border-b-4 border-vintage-dark flex justify-between items-center bg-vintage-cream relative z-10">
      <div>
        <h1 class="text-4xl md:text-6xl font-sans font-bold text-vintage-dark tracking-tighter uppercase">
          Helsinki<br />
          <span class="text-vintage-orange">Chrono-Map</span>
        </h1>
      </div>
      <div class="hidden md:block text-right font-sans text-sm tracking-widest opacity-70">
        <p>VARIKKO & OPAS PROJECT</p>
        <p>EST. 2025</p>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-grow flex relative">
      <!-- Map Container -->
      <div class="flex-grow relative bg-[#A8B5B9] p-4 md:p-8 flex items-center justify-center">
        <div
          class="w-full max-w-5xl aspect-square relative shadow-2xl border-8 border-white bg-white p-2 transform rotate-1"
        >
          <InteractiveMap />
        </div>
      </div>

      <!-- Texture Overlay -->
      <div class="pointer-events-none absolute inset-0 opacity-[0.15] bg-paper-texture mix-blend-multiply z-30"></div>
    </main>

    <InfoPanel />
  </div>
</template>

<style>
/* Global grainy texture if valid svg available, else fallback */
</style>
