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
 * Create SVG gradient definitions for water layer
 * Parse viewBox to position gradient in absolute coordinates
 */
function createWaterGradientDefs(svg: SVGSVGElement, themeName: ThemeName, viewBoxStr: string): string | null {
  const gradient = layerService.getWaterGradient(themeName)

  if (gradient.type === 'solid' || !gradient.colors) {
    return null // No gradient, use solid fill
  }

  // Parse viewBox: "minX minY width height"
  const [minX, minY, width, height] = viewBoxStr.split(' ').map(Number)
  const centerX = minX + width / 2  // Horizontal center
  const centerY = minY              // Top of map
  const radius = Math.max(width, height) * 0.8

  // Create defs element
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')

  // Create radial gradient in userSpaceOnUse (absolute coordinates)
  const radialGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient')
  const gradientId = `water-gradient-${themeName}`
  radialGradient.setAttribute('id', gradientId)
  radialGradient.setAttribute('gradientUnits', 'userSpaceOnUse')
  radialGradient.setAttribute('cx', centerX.toString())
  radialGradient.setAttribute('cy', centerY.toString())
  radialGradient.setAttribute('r', radius.toString())

  // Add color stops
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  stop1.setAttribute('offset', '0%')
  stop1.setAttribute('stop-color', gradient.colors[0])

  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
  stop2.setAttribute('offset', '100%')
  stop2.setAttribute('stop-color', gradient.colors[1])

  radialGradient.appendChild(stop1)
  radialGradient.appendChild(stop2)
  defs.appendChild(radialGradient)
  svg.appendChild(defs)

  return `url(#${gradientId})`
}

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

    // Parse viewBox for background rect dimensions
    const [minX, minY, width, height] = viewBox.value.split(' ').map(Number)

    // Create background rect to fill islands/holes in water
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('x', minX.toString())
    bgRect.setAttribute('y', minY.toString())
    bgRect.setAttribute('width', width.toString())
    bgRect.setAttribute('height', height.toString())
    bgRect.setAttribute('fill', layerService.getBackgroundColor(theme))
    svg.appendChild(bgRect)

    // Create water gradient if needed (uses absolute coordinates from viewBox)
    const waterGradientFill = createWaterGradientDefs(svg, theme, viewBox.value)

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
          // For water layer, use gradient if available
          if (layerId === 'water' && waterGradientFill) {
            layerGroup.setAttribute('fill', waterGradientFill)
          } else if (themeStyles.fill) {
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
