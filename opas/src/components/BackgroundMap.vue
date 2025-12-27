<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { layerService, type LayerId, type ThemeName } from '../services/LayerService'

interface Props {
  theme?: ThemeName
  layers?: LayerId[]
}

const { theme = 'vintage', layers = ['water'] } = defineProps<Props>()

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
    svg.setAttribute('class', 'w-full h-auto')

    // Load and append each requested layer in order
    for (const layerId of layers) {
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
    console.log(`Loaded layers: ${layers.join(', ')}`)
  } catch (error) {
    console.error('Failed to load background map layers:', error)
  }
}

// Load layers on mount
onMounted(() => {
  loadLayers()
})

// Reload when theme or layers change
watch([() => theme, () => layers], () => {
  loadLayers()
})
</script>

<template>
  <div ref="containerRef" class="relative w-full aspect-square overflow-hidden">
    <!-- SVG loaded here -->
  </div>
</template>
