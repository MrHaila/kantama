<script setup lang="ts">
import { onMounted, ref, watch, onUnmounted } from 'vue';
import * as d3 from 'd3';
import { useMapDataStore } from '../stores/mapData';
import { storeToRefs } from 'pinia';

const store = useMapDataStore();
const { zones, activeZoneId } = storeToRefs(store);
const containerRef = ref<HTMLElement | null>(null);

let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
let g: d3.Selection<SVGGElement, unknown, null, undefined>;
let projection: d3.GeoProjection;
let pathGenerator: d3.GeoPath;

// Dimensions
const width = 800; // Will be responsive
const height = 800;

function initMap() {
  if (!containerRef.value) return;

  // Clear previous
  d3.select(containerRef.value).selectAll('*').remove();

  svg = d3.select(containerRef.value)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'w-full h-auto drop-shadow-xl filter sepia-[0.3]');

  // Grainy texture overlay
  // Handled via CSS on container usually, but SVG filter is also possible.
  
  g = svg.append('g');

  // Projection needed. 
  // Center roughly on Helsinki.
  // We'll update this once data loads to auto-fit.
  projection = d3.geoMercator()
    .center([24.93, 60.17])
    .scale(120000)
    .translate([width / 2, height / 2]);

  pathGenerator = d3.geoPath().projection(projection);

  // Zoom behavior
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 8])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);
}

function renderZones() {
  if (!zones.value || !g) return;

  // Auto-fit bounds
  projection.fitSize([width, height], zones.value);

  const paths = g.selectAll('path')
    .data(zones.value.features)
    .join('path')
    .attr('d', pathGenerator as any)
    .attr('class', 'cursor-pointer transition-colors duration-300 ease-in-out stroke-vintage-dark stroke-[0.5px]')
    .attr('fill', (d: any) => store.getZoneColor(d.properties.id));

  // Events
  paths.on('mouseenter',  function(event, d: any) {
      d3.select(this).attr('stroke-width', '2px');
      // Could show tooltip here
    })
    .on('mouseleave', function(event, d: any) {
      d3.select(this).attr('stroke-width', '0.5px');
    })
    .on('click', (event, d: any) => {
      store.activeZoneId = d.properties.id;
    });
}

function updateColors() {
  if (!g) return;
  g.selectAll('path')
    .transition()
    .duration(300)
    .attr('fill', (d: any) => store.getZoneColor(d.properties.id));
}

onMounted(async () => {
    initMap();
    if (!store.zones) {
        await store.loadData();
    }
});

watch(zones, () => {
    if (zones.value) renderZones();
});

watch(activeZoneId, () => {
    updateColors();
});
</script>

<template>
  <div class="relative w-full aspect-square bg-[#A8B5B9] overflow-hidden rounded-lg shadow-inner" ref="containerRef">
    <!-- SVG rendered here -->
    <div v-if="store.isLoading" class="absolute inset-0 flex items-center justify-center bg-vintage-cream/80 z-10">
      <span class="text-xl font-sans tracking-widest text-vintage-dark animate-pulse">LOADING MAP DATA...</span>
    </div>
  </div>
</template>
