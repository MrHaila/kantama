<script setup lang="ts">
import { computed } from 'vue'
import { useLayerVisibility } from '../composables/useLayerVisibility'
import { themes, type ThemeColors } from '../config/themes'

const { layerVisibility, toggleLayer } = useLayerVisibility()

const currentTheme = computed<ThemeColors>(() => themes.vintage!)

const layers = [
  { key: 'background' as const, label: 'Background' },
  { key: 'zoneColors' as const, label: 'Zone Colors' },
  { key: 'infrastructure' as const, label: 'Roads + Rails' },
  { key: 'transit' as const, label: 'Transit Layer' },
  { key: 'zoneBorders' as const, label: 'Zone Borders + Points' },
]
</script>

<template>
  <div data-testid="layer-controls" class="layer-controls">
    <div data-testid="controls-title" class="controls-title">Layers</div>
    <div class="controls-items">
      <label
        v-for="layer in layers"
        :key="layer.key"
        :data-testid="`layer-control-${layer.key}`"
        class="control-item"
      >
        <input
          type="checkbox"
          :checked="layerVisibility[layer.key]"
          @change="toggleLayer(layer.key)"
          class="control-checkbox"
        />
        <span class="control-label">{{ layer.label }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.layer-controls {
  background: v-bind('currentTheme.background');
  border: 2px solid #264653;
  padding: 16px;
  box-shadow: 4px 4px 0px rgba(38, 70, 83, 1);
  min-width: 200px;
}

.controls-title {
  font-size: 14px;
  font-weight: 600;
  color: v-bind('currentTheme.title');
  margin-bottom: 12px;
  text-align: left;
  border-bottom: 1px solid rgba(38, 70, 83, 0.2);
  padding-bottom: 8px;
}

.controls-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.control-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #264653;
}

.control-label {
  font-size: 12px;
  color: v-bind('currentTheme.text');
  font-weight: 500;
}

.control-item:hover .control-label {
  color: #e76f51;
}
</style>
