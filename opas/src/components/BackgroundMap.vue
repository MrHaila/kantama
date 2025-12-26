<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import type { Topology } from 'topojson-specification'
import { defaultConfig, type BackgroundMapConfig } from '../config/backgroundMap'

// Use default configuration
const config = ref<BackgroundMapConfig>(defaultConfig)

const containerRef = ref<HTMLElement | null>(null)

// Dimensions - should match InteractiveMap
const width = 800
const height = 800

async function loadBackgroundMap() {
  if (!containerRef.value) return

  try {
    // Load the TopoJSON file
    const response = await fetch('/background_map.json')
    const topology: Topology = await response.json()

    // Clear previous content
    d3.select(containerRef.value).selectAll('*').remove()

    // Create SVG
    const svg = d3
      .select(containerRef.value)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'w-full h-auto')

    // Set background color
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', config.value.backgroundColor)

    const g = svg.append('g')

    // Create projection - centered on Helsinki
    const projection = d3
      .geoMercator()
      .center([24.93, 60.17])
      .scale(120000)
      .translate([width / 2, height / 2])

    const pathGenerator = d3.geoPath().projection(projection)

    // Extract and render water layer
    if (topology.objects.water) {
      const waterGeoJson = topojson.feature(topology, topology.objects.water) as { features: unknown[] }

      g.append('g')
        .attr('class', 'water-layer')
        .selectAll('path')
        .data(waterGeoJson.features)
        .join('path')
        .attr('d', pathGenerator as (d: unknown) => string | null)
        .attr('fill', config.value.waterColor)
        .attr('stroke', 'none')
    }

    // Extract and render road layer
    if (topology.objects.roads) {
      const roadGeoJson = topojson.feature(topology, topology.objects.roads) as { features: unknown[] }

      g.append('g')
        .attr('class', 'road-layer')
        .selectAll('path')
        .data(roadGeoJson.features)
        .join('path')
        .attr('d', pathGenerator as (d: unknown) => string | null)
        .attr('fill', 'none')
        .attr('stroke', config.value.roadColor)
        .attr('stroke-width', config.value.roadWidth)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
    }

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
  <div ref="containerRef" class="relative w-full aspect-square overflow-hidden">
    <!-- SVG rendered here -->
  </div>
</template>
