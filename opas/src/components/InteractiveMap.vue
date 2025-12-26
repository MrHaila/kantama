<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { MAP_CONFIG } from '../config/mapConfig' // For viewBox

interface ZonePath {
  id: string
  name: string
  path: string
}

const store = useMapDataStore()
const { activeZoneId } = storeToRefs(store)
const containerRef = ref<HTMLElement | null>(null)
const zonePaths = ref<ZonePath[]>([])

let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
let g: d3.Selection<SVGGElement, unknown, null, undefined>

async function loadZonePaths() {
  try {
    const response = await fetch('/zone_paths.json')
    zonePaths.value = await response.json()
    console.log('Loaded', zonePaths.value.length, 'pre-generated zone paths')
  } catch (error) {
    console.error('Failed to load zone paths:', error)
  }
}

function initMap() {
  if (!containerRef.value) return

  // Clear previous
  d3.select(containerRef.value).selectAll('*').remove()

  svg = d3
    .select(containerRef.value)
    .append('svg')
    .attr('viewBox', MAP_CONFIG.viewBox)
    .attr('class', 'w-full h-auto')
    .style('position', 'absolute')
    .style('top', '0')
    .style('left', '0')
    .style('pointer-events', 'auto')

  g = svg.append('g')
}

function renderZones() {
  if (!zonePaths.value.length || !g) return

  // Use pre-generated SVG paths from Varikko
  const paths = g
    .selectAll<SVGPathElement, ZonePath>('path')
    .data(zonePaths.value, (d) => d.id)
    .join('path')
    .attr('d', (d) => d.path)
    .attr('class', 'cursor-pointer transition-colors duration-300 ease-in-out stroke-vintage-dark stroke-[2px]')
    .attr('fill', (d) => store.getZoneColor(d.id))
    .attr('fill-opacity', (d) => {
      return store.activeZoneId === d.id ? 1 : 0.5
    })
    .attr('opacity', 0)

  // Events
  paths
    .on('mouseenter', function () {
      d3.select(this).attr('stroke-width', '2px')
    })
    .on('mouseleave', function () {
      d3.select(this).attr('stroke-width', '1px')
    })
    .on('click', (_event, d) => {
      store.activeZoneId = d.id
    })

  // Transition for opacity
  paths
    .transition()
    .duration(500)
    .attr('opacity', 1)
}

function updateColors() {
  if (!g) return
  g.selectAll<SVGPathElement, ZonePath>('path')
    .transition()
    .duration(300)
    .attr('fill', (d) => store.getZoneColor(d.id))
    .attr('fill-opacity', (d) => {
      return store.activeZoneId === d.id ? 1 : 0.5
    })
}

onMounted(async () => {
  initMap()
  await loadZonePaths()
  // Also load store data for route costs
  await store.loadData()
  
  watch([zonePaths], () => {
    if (zonePaths.value.length) renderZones()
  }, { immediate: true })
})

watch(activeZoneId, () => {
  updateColors()
})

// ESC key handler to deselect zone
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && store.activeZoneId) {
    store.activeZoneId = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

</script>

<template>
  <div class="relative w-full aspect-square">
    <div ref="containerRef" class="absolute inset-0 overflow-hidden rounded-lg shadow-inner">
      <!-- SVG rendered here -->
    </div>
  </div>
</template>
