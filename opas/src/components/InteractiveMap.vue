<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useMapDataStore } from '../stores/mapData'
import { storeToRefs } from 'pinia'
import { MAP_CONFIG } from '../config/mapConfig'
import { geoMercator } from 'd3-geo'
import HeatmapLegend from './HeatmapLegend.vue'
import ZonePolygon from './ZonePolygon.vue'
import { decodePolyline } from '../utils/polyline'

// Type for ZonePolygon component instance
type ZonePolygonInstance = InstanceType<typeof ZonePolygon>
import { modeColors } from '../utils/transportColors'
import { layerService } from '../services/LayerService'

interface Props {
  showRoads?: boolean
  roadColor?: string
  roadWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  showRoads: true,
  roadColor: undefined,
  roadWidth: 0.5,
})

const { showRoads, roadColor, roadWidth } = props

const store = useMapDataStore()
const { zones, currentRouteLegs } = storeToRefs(store)

// Store references to ZonePolygon components
const zoneRefs = ref<Map<string, ZonePolygonInstance>>(new Map())

// Function to register zone component references
function registerZoneRef(id: string, el: unknown) {
  const component = el as ZonePolygonInstance | null
  if (component) {
    zoneRefs.value.set(id, component)
  } else {
    zoneRefs.value.delete(id)
  }
}

/**
 * Update all zone colors with staggered animation
 */
function updateZoneColors(animate: boolean = true) {
  if (!zones.value) return

  zones.value.forEach((zone) => {
    const component = zoneRefs.value.get(zone.id)
    if (!component) return

    const newColor = store.getZoneColor(zone.id)

    if (!animate) {
      component.updateColorImmediate(newColor)
      return
    }

    // Calculate animation delay based on screen distance from active zone
    let delayMs = 0
    if (store.transportState.activeZoneId) {
      const activeZone = zones.value.find((z) => z.id === store.transportState.activeZoneId)
      if (activeZone) {
        const p1 = latLonToSvg(activeZone.routingPoint[0], activeZone.routingPoint[1])
        const p2 = latLonToSvg(zone.routingPoint[0], zone.routingPoint[1])

        if (p1 && p2) {
          // Euclidean distance in SVG/screen pixels
          const distance = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2))
          // Make faster
          delayMs = Math.round(distance / 6)
        }
      }
    }

    component.changeColor(newColor, delayMs)
  })
}

// Watch for state changes that should trigger color updates
watch(
  () => [store.transportState.activeZoneId, store.transportState.overlayMode, store.reachabilityScores],
  () => {
    updateZoneColors(true)
  },
  { deep: true }
)

// Initial colors without animation after data is loaded
watch(
  () => zones.value,
  (newZones) => {
    if (newZones && newZones.length > 0) {
      // Small delay to ensure refs are populated
      setTimeout(() => updateZoneColors(false), 0)
    }
  },
  { immediate: true }
)

// Road paths loaded from layer service
const roadPaths = ref<string[]>([])

// Zones without route data (for debugging visual)
const zonesWithoutData = computed(() => {
  if (!zones.value) return []

  // In reachability mode, check for missing reachability scores
  if (store.transportState.overlayMode === 'reachability') {
    return zones.value.filter(zone => !store.reachabilityScores.get(zone.id))
  }

  // In zone selection mode, check for zones with no route from active zone
  if (store.transportState.overlayMode === 'zoneSelection' && store.transportState.activeZoneId) {
    return zones.value.filter(zone => {
      if (zone.id === store.transportState.activeZoneId) return false
      return store.getDuration(zone.id) === null
    })
  }

  return []
})

// Load road paths from layer service
async function loadRoadPaths() {
  if (!showRoads) return

  try {
    roadPaths.value = await layerService.getRoadPaths()
  } catch (error) {
    console.error('Failed to load road paths:', error)
  }
}

// Create D3 projection to convert lat/lon to SVG coordinates
// Must match the projection used in fetch_zones.ts
const projection = computed(() => {
  const width = MAP_CONFIG.width
  const height = MAP_CONFIG.height
  return geoMercator()
    .center([24.93, 60.17])
    .scale(120000)
    .translate([width / 2, height / 2])
})

// Convert lat/lon to SVG coordinates
function latLonToSvg(lat: number, lon: number): [number, number] | null {
  return projection.value([lon, lat])
}

// Convert route legs to SVG path data for visualization
const routePaths = computed(() => {
  if (!currentRouteLegs.value.length) return []

  return currentRouteLegs.value
    .filter((leg) => leg.g)
    .map((leg, index) => {
      const points = decodePolyline(leg.g!)
      const svgPoints = points
        .map(([lat, lon]) => latLonToSvg(lat, lon))
        .filter((p): p is [number, number] => p !== null)

      if (svgPoints.length < 2) return null

      const pathData = svgPoints.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')

      return {
        id: `leg-${index}`,
        d: pathData,
        mode: leg.m,
        color: modeColors[leg.m] || '#666666',
        routeName: leg.sn || leg.ln,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
})

// Extract route stop points for visualization
const routeStops = computed(() => {
  const stops: { id: string; x: number; y: number; color: string }[] = []
  const legs = currentRouteLegs.value

  legs.forEach((leg, index) => {
    if (leg.f?.lt && leg.f?.ln) {
      const pos = latLonToSvg(leg.f.lt, leg.f.ln)
      if (pos) {
        stops.push({
          id: `from-${index}`,
          x: pos[0],
          y: pos[1],
          color: modeColors[leg.m] || '#666666',
        })
      }
    }
  })

  // Add final destination
  const lastLeg = legs[legs.length - 1]
  if (lastLeg?.t?.lt && lastLeg?.t?.ln) {
    const pos = latLonToSvg(lastLeg.t.lt, lastLeg.t.ln)
    if (pos) {
      stops.push({
        id: 'destination',
        x: pos[0],
        y: pos[1],
        color: '#264653',
      })
    }
  }

  return stops
})

// Load data on mount
onMounted(async () => {
  await Promise.all([store.loadData(), loadRoadPaths()])
})

// ESC key handler to deselect zone
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && store.transportState.activeZoneId) {
    store.transportState.clearZone()
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
    <HeatmapLegend />
    <div class="absolute inset-0 overflow-hidden rounded-lg shadow-inner">
      <svg
        :viewBox="MAP_CONFIG.viewBox"
        class="w-full h-auto"
        style="position: absolute; top: 0; left: 0; pointer-events: auto"
      >
        <!-- Pattern definitions -->
        <defs>
          <pattern id="no-data-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="8" fill="rgba(255, 255, 255, 0.3)" />
          </pattern>
        </defs>

        <g class="zones-layer">
          <!-- Render all zones with independent animation controlled by parent -->
          <ZonePolygon
            v-for="zone in zones"
            :key="zone.id"
            :ref="(el) => registerZoneRef(zone.id, el)"
            :zone="zone"
          />
        </g>
        <!-- Roads layer - on top of zones, under borders -->
        <g v-if="showRoads" class="road-layer pointer-events-none">
          <path
            v-for="(d, index) in roadPaths"
            :key="`road-${index}`"
            :d="d"
            fill="none"
            :class="roadColor ? '' : 'stroke-current text-vintage-dark/50'"
            :stroke="roadColor"
            :stroke-width="roadWidth || 0.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
        <!-- Selected zone border on top -->
        <g v-if="store.transportState.activeZoneId">
          <path
            v-for="zone in zones"
            v-show="zone.id === store.transportState.activeZoneId"
            :key="`selected-${zone.id}`"
            :d="zone.svgPath"
            class="pointer-events-none stroke-vintage-orange"
            fill="none"
            stroke-width="3"
          />
        </g>
        <!-- Hovered zone border on top -->
        <g
          v-if="
            store.transportState.hoveredZoneId &&
            store.transportState.hoveredZoneId !== store.transportState.activeZoneId
          "
        >
          <path
            v-for="zone in zones"
            v-show="zone.id === store.transportState.hoveredZoneId"
            :key="`hovered-${zone.id}`"
            :d="zone.svgPath"
            class="pointer-events-none stroke-vintage-orange"
            fill="none"
            stroke-width="3"
            opacity="0.7"
          />
        </g>
        <!-- No-data stripe overlay (debugging aid) -->
        <g v-if="zonesWithoutData.length > 0" class="no-data-layer pointer-events-none">
          <path
            v-for="zone in zonesWithoutData"
            :key="`no-data-${zone.id}`"
            :d="zone.svgPath"
            fill="url(#no-data-stripes)"
            stroke="none"
          />
        </g>
        <!-- Routing reference points for each zone (always visible) -->
        <g class="routing-points">
          <circle
            v-for="zone in zones"
            :key="`ref-${zone.id}`"
            :cx="latLonToSvg(zone.routingPoint[0], zone.routingPoint[1])?.[0]"
            :cy="latLonToSvg(zone.routingPoint[0], zone.routingPoint[1])?.[1]"
            r="3"
            fill="#264653"
            stroke="#ffffff"
            stroke-width="1"
            class="pointer-events-none"
            opacity="0.6"
          />
        </g>
        <!-- Route visualization layer -->
        <g v-if="routePaths.length" class="route-paths">
          <!-- White outline for contrast -->
          <path
            v-for="route in routePaths"
            :key="`outline-${route.id}`"
            :d="route.d"
            fill="none"
            stroke="#ffffff"
            stroke-width="6"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="pointer-events-none"
          />
          <!-- Colored route path -->
          <path
            v-for="route in routePaths"
            :key="route.id"
            :d="route.d"
            fill="none"
            :stroke="route.color"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
            :stroke-dasharray="route.mode === 'WALK' ? '8,6' : 'none'"
            class="pointer-events-none"
          />
        </g>
        <!-- Route stops/transfers visualization -->
        <g v-if="routeStops.length" class="route-stops">
          <circle
            v-for="stop in routeStops"
            :key="stop.id"
            :cx="stop.x"
            :cy="stop.y"
            r="5"
            :fill="stop.color"
            stroke="#ffffff"
            stroke-width="2"
            class="pointer-events-none"
          />
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Ensure smooth transitions for hover effects */
path {
  transition: stroke-width 0.2s ease-in-out;
}
</style>
