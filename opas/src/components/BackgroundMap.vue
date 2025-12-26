<script setup lang="ts">
import { onMounted, ref } from 'vue'
import '../styles/background-map.css'

// Props for configuration
interface Props {
  theme?: 'vintage' | 'modern' | 'dark' | 'contrast'
}

const { theme = 'vintage' } = defineProps<Props>()

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
    :class="[
      'relative w-full aspect-square overflow-hidden',
      'background-map-container',
      `theme-${theme}`
    ]"
  >
    <!-- SVG loaded here -->
  </div>
</template>
