<script setup lang="ts">
import { computed } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { themes, type ThemeColors } from '../config/themes'
import type { TimeBucket } from '../services/DataService'

const store = useMapDataStore()

// Current theme (could be made reactive in the future)
const currentTheme = computed<ThemeColors>(() => themes.vintage!)

// Computed property to get time buckets from the store
const timeBuckets = computed<TimeBucket[]>(() => {
  const baseTimeBuckets = store.timeBuckets || []

  // Override colors with theme colors if we have the right number
  if (baseTimeBuckets.length === currentTheme.value.timeBucketColors.length) {
    return baseTimeBuckets.map((bucket, index) => ({
      ...bucket,
      color: currentTheme.value.timeBucketColors[index] || bucket.color,
    }))
  }

  return baseTimeBuckets
})
</script>

<template>
  <div class="heatmap-legend">
    <div class="legend-title">Travel Time</div>
    <div class="legend-items">
      <div v-for="bucket in timeBuckets" :key="bucket.number" class="legend-item">
        <div class="legend-color" :style="{ backgroundColor: bucket.color }"></div>
        <div class="legend-label">{{ bucket.label }}</div>
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
