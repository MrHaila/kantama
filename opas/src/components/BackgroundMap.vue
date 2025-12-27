<script setup lang="ts">
import { onMounted, ref } from 'vue'
import '../styles/background-map.css'

// Props for configuration
interface Props {
  theme?: 'vintage' | 'modern' | 'dark' | 'contrast' | 'yle'
  layers?: ('water' | 'roads')[]
}

const { theme = 'vintage', layers = [] } = defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)

// Load pre-generated SVG
async function loadBackgroundMap() {
  if (!containerRef.value) return

  try {
    // Load the SVG file
    const response = await fetch('/background_map.svg')
    const svgContent = await response.text()

    // Clear previous content
    containerRef.value.innerHTML = ''

    // Parse and inject SVG
    const parser = new DOMParser()
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml')
    const svgElement = svgDoc.documentElement

    // Add class for styling
    svgElement.setAttribute('class', 'w-full h-auto')

    // Filter layers if specified
    if (layers && layers.length > 0) {
      // Hide background rect if only showing roads
      if (!layers.includes('water')) {
        const bgRect = svgElement.querySelector('.background-rect')
        if (bgRect) bgRect.setAttribute('display', 'none')
      }
      // Hide water layer if not requested
      if (!layers.includes('water')) {
        const waterLayer = svgElement.querySelector('.water-layer')
        if (waterLayer) waterLayer.setAttribute('display', 'none')
      }
      // Hide road layer if not requested
      if (!layers.includes('roads')) {
        const roadLayer = svgElement.querySelector('.road-layer')
        if (roadLayer) roadLayer.setAttribute('display', 'none')
      }
    }

    containerRef.value.appendChild(svgElement)

    console.log('Background map loaded successfully')
  } catch (error) {
    console.error('Failed to load background map:', error)
  }
}

onMounted(() => {
  loadBackgroundMap()
})
</script>

<template>
  <div
    ref="containerRef"
    :class="['relative w-full aspect-square overflow-hidden', 'background-map-container', `theme-${theme}`]"
  >
    <!-- SVG loaded here -->
  </div>
</template>
