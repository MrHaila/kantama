<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { layerService, type LayerId, type ThemeName } from '../services/LayerService'
import { useLayerVisibility } from '../composables/useLayerVisibility'

interface Props {
  theme?: ThemeName
  layers?: LayerId[]
}

const { theme = 'morning', layers = ['water'] } = defineProps<Props>()
const { layerVisibility } = useLayerVisibility()

const containerRef = ref<HTMLElement | null>(null)
const viewBox = ref<string>('')

/**
 * Load and render requested layers
 */
async function loadLayers() {
  if (!containerRef.value) return

  try {
    // Load manifest first
    const manifest = await layerService.loadManifest()
    viewBox.value = manifest.viewBox

    // Clear previous content
    containerRef.value.innerHTML = ''

    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', viewBox.value)
    svg.setAttribute('class', 'w-full h-full')

    // Filter layers based on visibility settings (only water layer is used here)
    const filteredLayers = layers.filter(layerId => {
      if (layerId === 'water') return layerVisibility.background
      return true
    })

    // Load and append each requested layer in z-index order
    const sortedLayers = [...filteredLayers].sort((a, b) => {
      const aIndex = manifest.layers.find((l) => l.id === a)?.zIndex ?? 0
      const bIndex = manifest.layers.find((l) => l.id === b)?.zIndex ?? 0
      return aIndex - bIndex
    })

    for (const layerId of sortedLayers) {
      const layerSvg = await layerService.loadLayer(layerId)
      const layerGroup = layerSvg.querySelector(`#${layerId}`)

      if (layerGroup) {
        // Get theme styles for this layer
        const themeStyles = layerService.getThemeStyles(theme, layerId)

        // Apply theme styles to the group
        if (themeStyles) {
          if (themeStyles.fill) {
            layerGroup.setAttribute('fill', themeStyles.fill)
          }
          if (themeStyles.stroke) {
            layerGroup.setAttribute('stroke', themeStyles.stroke)
          }
          if (themeStyles.strokeWidth !== undefined) {
            layerGroup.setAttribute('stroke-width', themeStyles.strokeWidth.toString())
          }
        }

        // Import and append to main SVG
        const importedGroup = document.importNode(layerGroup, true)
        svg.appendChild(importedGroup)
      }
    }

    containerRef.value.appendChild(svg)
    console.log(`Loaded layers in z-index order: ${sortedLayers.join(', ')}`)
  } catch (error) {
    console.error('Failed to load background map layers:', error)
  }
}

// Load layers on mount
onMounted(() => {
  loadLayers()
})

// Reload when theme, layers, or visibility settings change
watch([() => theme, () => layers, () => layerVisibility.background], () => {
  loadLayers()
})
</script>

<template>
  <div ref="containerRef" data-testid="background-map" class="relative w-full h-full overflow-hidden">
    <!-- SVG loaded here -->
  </div>
</template>
