<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
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
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'w-full h-auto drop-shadow-xl filter sepia-[0.3]')

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

  // Zoom behavior
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 8])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)
}

function renderZones() {
  if (!zones.value || !g) return

  // Auto-fit bounds
  projection.fitSize([width, height], zones.value)

  const paths = g
    .selectAll<SVGPathElement, ZoneFeature>('path')
    .data(zones.value.features)
    .join('path')
    .attr('d', pathGenerator)
    .attr('class', 'cursor-pointer transition-colors duration-300 ease-in-out stroke-vintage-dark stroke-[0.5px]')
    .attr('fill', (d) => store.getZoneColor(d.properties.postinumeroalue))

  // Events
  paths
    .on('mouseenter', function () {
      d3.select(this).attr('stroke-width', '2px')
      // Could show tooltip here
    })
    .on('mouseleave', function () {
      d3.select(this).attr('stroke-width', '0.5px')
    })
    .on('click', (_event, d) => {
      store.activeZoneId = d.properties.postinumeroalue
    })
}

function updateColors() {
  if (!g) return
  g.selectAll<SVGPathElement, ZoneFeature>('path')
    .transition()
    .duration(300)
    .attr('fill', (d) => store.getZoneColor(d.properties.postinumeroalue))
}

onMounted(async () => {
  initMap()
  if (!store.zones) {
    await store.loadData()
  }
})

watch(zones, () => {
  if (zones.value) renderZones()
})

watch(activeZoneId, () => {
  updateColors()
})
</script>

<template>
  <div ref="containerRef" class="relative w-full aspect-square bg-[#A8B5B9] overflow-hidden rounded-lg shadow-inner">
    <!-- SVG rendered here -->
    <div v-if="store.isLoading" class="absolute inset-0 flex items-center justify-center bg-vintage-cream/80 z-10">
      <span class="text-xl font-sans tracking-widest text-vintage-dark animate-pulse">LOADING MAP DATA...</span>
    </div>
  </div>
</template>
