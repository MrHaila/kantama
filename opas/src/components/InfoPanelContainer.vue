<script setup lang="ts">
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import InfoPanel from './InfoPanel.vue'
import JourneyPanel from './JourneyPanel.vue'

const store = useMapDataStore()
const { activeZoneId } = storeToRefs(store)
</script>

<template>
  <div class="fixed left-8 top-8 z-20 space-y-4 font-sans">
    <!-- InfoPanel - always shown when zone is selected -->
    <InfoPanel v-if="activeZoneId" />
    
    <!-- JourneyPanel - always shown when zone is selected -->
    <JourneyPanel v-if="activeZoneId" />
  </div>
</template>
