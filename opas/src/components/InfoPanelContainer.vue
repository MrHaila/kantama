<script setup lang="ts">
import { useMapDataStore } from '../stores/mapData'
import InfoPanel from './InfoPanel.vue'
import JourneyPanel from './JourneyPanel.vue'

const store = useMapDataStore()
</script>

<template>
  <div class="fixed left-6 bottom-6 z-20 flex flex-col space-y-3 font-sans">
    <!-- JourneyPanel - only shown when zone is selected (above info) -->
    <JourneyPanel v-if="store.transportState.activeZoneId" />

    <!-- InfoPanel - always shown (bottom) -->
    <InfoPanel />
  </div>
</template>
