<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import { useMapDataStore, type ZoneProperties } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import type { Feature, Geometry } from 'geojson'

const store = useMapDataStore()
const { zones, activeZoneId } = storeToRefs(store)
const containerRef = ref<HTMLElement | null>(null)

type ZoneFeature = Feature<Geometry, ZoneProperties>

let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>
let g: d3.Selection<SVGGElement, unknown, null, undefined>
let projection: d3.GeoProjection
let pathGenerator: d3.GeoPath<null, ZoneFeature>

// Dimensions
const width = 800 // Will be responsive
const height = 800

function initMap() {
  if (!containerRef.value) return

  // Clear previous
  d3.select(containerRef.value).selectAll('*').remove()

  svg = d3
    .select(containerRef.value)
    .append('svg')
    .attr('viewBox', `0 -200 ${width} ${height}`)
    .attr('class', 'w-full h-auto')
    .style('position', 'absolute')
    .style('top', '0')
    .style('left', '0')
    .style('pointer-events', 'auto')

  // Grainy texture overlay
  // Handled via CSS on container usually, but SVG filter is also possible.

  g = svg.append('g')

  // Projection needed.
  // Center roughly on Helsinki.
  // We'll update this once data loads to auto-fit.
  projection = d3
    .geoMercator()
    .center([24.93, 60.17])
    .scale(120000)
    .translate([width / 2, height / 2])

  pathGenerator = d3.geoPath<null, ZoneFeature>().projection(projection)

  // No zoom behavior - static map
}

function renderZones() {
  if (!zones.value || !g) return

  // Don't use fitSize - it breaks alignment with background map
  // The projection should match BackgroundMap exactly

  const paths = g
    .selectAll<SVGPathElement, ZoneFeature>('path')
    .data(zones.value.features)
    .join('path')
    .attr('d', pathGenerator as (d: unknown) => string | null)
    .attr('class', 'cursor-pointer transition-colors duration-300 ease-in-out stroke-vintage-dark stroke-[2px]')
    .attr('fill', (d) => store.getZoneColor(d.properties.postinumeroalue))
    .attr('fill-opacity', (d) => {
      return store.activeZoneId === d.properties.postinumeroalue ? 1 : 0.5
    })
    .attr('opacity', 0)

  // Events - attach before transition
  paths
    .on('mouseenter', function () {
      d3.select(this).attr('stroke-width', '2px')
      // Could show tooltip here
    })
    .on('mouseleave', function () {
      d3.select(this).attr('stroke-width', '1px')
    })
    .on('click', (_event, d) => {
      const feature = d as unknown as ZoneFeature
      if (feature.properties) {
        store.activeZoneId = feature.properties.postinumeroalue
      }
    })

  // Transition for opacity
  paths
    .transition()
    .duration(500)
    .attr('opacity', 1)
}

function updateColors() {
  if (!g) return
  g.selectAll<SVGPathElement, ZoneFeature>('path')
    .transition()
    .duration(300)
    .attr('fill', (d) => store.getZoneColor(d.properties.postinumeroalue))
    .attr('fill-opacity', (d) => {
      // 0.5 opacity if not selected, full opacity if selected
      return store.activeZoneId === d.properties.postinumeroalue ? 1 : 0.5
    })
}

onMounted(async () => {
  initMap()
  // Data will be loaded automatically by the watch when zones is available
  watch([zones], () => {
    if (zones.value) renderZones()
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
