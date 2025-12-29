<script setup lang="ts">
import { computed } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { themes, type ThemeColors } from '../config/themes'
import type { TimeBucket } from '../services/DataService'
import type { ReachabilityBucket } from '../services/ReachabilityService'

const store = useMapDataStore()
const { timeBuckets, reachabilityLegend } = storeToRefs(store)

// Current theme (could be made reactive in the future)
const currentTheme = computed<ThemeColors>(() => themes.vintage!)

// Legend title based on overlay mode
const legendTitle = computed(() => {
  if (store.transportState.overlayMode === 'reachability') {
    return 'Connectivity'
  }
  return 'Travel Time'
})

// Legend items based on overlay mode
interface LegendItem {
  color: string
  label: string
}

const legendItems = computed<LegendItem[]>(() => {
  // Reachability mode - show connectivity legend
  if (store.transportState.overlayMode === 'reachability') {
    return reachabilityLegend.value.map((bucket: ReachabilityBucket) => ({
      color: bucket.color,
      label: bucket.label,
    }))
  }

  // Zone selection mode - show travel time legend
  const baseTimeBuckets = timeBuckets.value || []

  // Override colors with theme colors if we have the right number
  if (baseTimeBuckets.length === currentTheme.value.timeBucketColors.length) {
    return baseTimeBuckets.map((bucket: TimeBucket, index: number) => ({
      color: currentTheme.value.timeBucketColors[index] || bucket.color,
      label: bucket.label,
    }))
  }

  return baseTimeBuckets.map((bucket: TimeBucket) => ({
    color: bucket.color,
    label: bucket.label,
  }))
})
</script>

<template>
  <div class="heatmap-legend">
    <div class="legend-title">{{ legendTitle }}</div>
    <div class="legend-items">
      <div v-for="(item, index) in legendItems" :key="index" class="legend-item">
        <div class="legend-color" :style="{ backgroundColor: item.color }"></div>
        <div class="legend-label">{{ item.label }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-legend {
  position: fixed;
  top: 20px;
  right: 20px;
  background: v-bind('currentTheme.background');
  border: 2px solid #264653;
  padding: 16px;
  box-shadow: 4px 4px 0px rgba(38, 70, 83, 1);
  z-index: 1000;
  min-width: 140px;
}

.legend-title {
  font-size: 14px;
  font-weight: 600;
  color: v-bind('currentTheme.title');
  margin-bottom: 12px;
  text-align: left;
  border-bottom: 1px solid rgba(38, 70, 83, 0.2);
  padding-bottom: 8px;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-color {
  width: 20px;
  height: 20px;
  border: 1px solid #333;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend-label {
  font-size: 12px;
  color: v-bind('currentTheme.text');
  font-weight: 500;
}
</style>
