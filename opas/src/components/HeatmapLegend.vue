<script setup lang="ts">
import { computed } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { themes, type ThemeColors } from '../config/themes'

interface Decile {
  decile_number: number
  min_duration: number
  max_duration: number | null
  color_hex: string
  label: string
}

const store = useMapDataStore()

// Current theme (could be made reactive in the future)
const currentTheme = computed<ThemeColors>(() => themes.vintage || themes.vintage)

// Computed property to get deciles from the store
const deciles = computed<Decile[]>(() => {
  const baseDeciles = store.deciles || []
  
  // Override colors with theme colors if we have the right number
  if (baseDeciles.length === currentTheme.value.decileColors.length) {
    return baseDeciles.map((decile, index) => ({
      ...decile,
      color_hex: currentTheme.value.decileColors[index] || decile.color_hex
    }))
  }
  
  return baseDeciles
})
</script>

<template>
  <div class="heatmap-legend">
    <div class="legend-title">Travel Time</div>
    <div class="legend-items">
      <div 
        v-for="decile in deciles" 
        :key="decile.decile_number"
        class="legend-item"
      >
        <div 
          class="legend-color" 
          :style="{ backgroundColor: decile.color_hex }"
        ></div>
        <div class="legend-label">{{ decile.label }}</div>
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
  border: 2px solid v-bind('currentTheme.border');
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 140px;
}

.legend-title {
  font-size: 14px;
  font-weight: 600;
  color: v-bind('currentTheme.title');
  margin-bottom: 12px;
  text-align: center;
  border-bottom: 1px solid v-bind('currentTheme.border');
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
