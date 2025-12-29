import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import {
  dataService,
  type Zone,
  type TimeBucket,
  type TimePeriod,
  type DataServiceError,
  type CompactRoute,
  type CompactLeg,
  RouteStatus,
} from '../services/DataService'
import { themes } from '../config/themes'
import { useTransportState } from '../composables/useTransportState'
import {
  computeReachabilityScores,
  getReachabilityColor,
  generateReachabilityLegend,
  type ReachabilityScore,
  type ReachabilityBucket,
} from '../services/ReachabilityService'

// Get time bucket color for a given duration
function getTimeBucketColor(duration: number, timeBuckets: TimeBucket[]): string {
  for (const bucket of timeBuckets) {
    if (duration >= bucket.min && (bucket.max === -1 || duration <= bucket.max)) {
      return bucket.color
    }
  }
  return '#e0e0e0'
}

// Get themed time bucket colors
function getThemedTimeBuckets(timeBuckets: TimeBucket[]): TimeBucket[] {
  const currentTheme = themes.vintage

  if (!currentTheme || !currentTheme.timeBucketColors) {
    return timeBuckets
  }

  if (timeBuckets.length === currentTheme.timeBucketColors.length) {
    return timeBuckets.map((bucket, index) => ({
      ...bucket,
      color: currentTheme.timeBucketColors[index] || bucket.color,
    }))
  }

  return timeBuckets
}

export const useMapDataStore = defineStore('mapData', () => {
  // Transport state machine
  const transportState = useTransportState()

  // State
  const zones = ref<Zone[]>([])
  const currentCosts = ref<Map<string, number>>(new Map())
  const currentTimePeriod = ref<TimePeriod>('MORNING')
  const timeBuckets = ref<TimeBucket[]>([])

  // Reachability state
  const reachabilityScores = ref<Map<string, ReachabilityScore>>(new Map())
  const reachabilityLegend = ref<ReachabilityBucket[]>(generateReachabilityLegend())

  // Loading and error states
  const isLoading = ref(false)
  const isLoadingRoutes = ref(false)
  const initError = ref<DataServiceError | null>(null)
  const routeError = ref<DataServiceError | null>(null)

  /**
   * Initialize the store by loading zone data
   */
  async function loadData() {
    isLoading.value = true
    initError.value = null

    try {
      const state = await dataService.init()

      if (state.zonesError) {
        initError.value = state.zonesError
        console.error('Failed to load map data:', state.zonesError.message)
        return
      }

      zones.value = dataService.getZones()
      const rawTimeBuckets = dataService.getTimeBuckets()
      timeBuckets.value = getThemedTimeBuckets(rawTimeBuckets)

      console.log('Data loaded:', zones.value.length, 'zones')

      // Compute reachability scores in background
      await computeReachability()
    } catch (e) {
      initError.value = {
        type: 'network_error',
        message: 'Failed to load map data',
        details: e instanceof Error ? e.message : String(e),
      }
      console.error('Failed to load map data:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Compute reachability scores for all zones
   */
  async function computeReachability() {
    if (zones.value.length === 0) return

    const period = currentTimePeriod.value
    const routesByZone = new Map<string, CompactRoute[]>()

    // Load all zone routes for the current period
    for (const zone of zones.value) {
      if (!dataService.hasRoutesLoaded(zone.id, period)) {
        await dataService.loadRoutesForZone(zone.id, period)
      }
      const routes = dataService.getRoutes(zone.id, period)
      if (routes) {
        routesByZone.set(zone.id, routes)
      }
    }

    // Compute scores
    const zoneIds = zones.value.map((z) => z.id)
    reachabilityScores.value = computeReachabilityScores(routesByZone, zoneIds)

    console.log('Reachability scores computed for', reachabilityScores.value.size, 'zones')
  }

  /**
   * Load routes when active zone or period changes
   */
  watch([() => transportState.activeZoneId.value, currentTimePeriod], async () => {
    routeError.value = null

    if (!transportState.activeZoneId.value) {
      currentCosts.value = new Map()
      return
    }

    isLoadingRoutes.value = true

    try {
      // Load routes for this zone and period if not cached
      if (!dataService.hasRoutesLoaded(transportState.activeZoneId.value, currentTimePeriod.value)) {
        const routes = await dataService.loadRoutesForZone(transportState.activeZoneId.value, currentTimePeriod.value)
        if (!routes) {
          routeError.value = dataService.getRouteError(transportState.activeZoneId.value)
          currentCosts.value = new Map()
          return
        }
      }

      // Get costs for current period
      currentCosts.value = dataService.getRouteCosts(transportState.activeZoneId.value, currentTimePeriod.value)
    } finally {
      isLoadingRoutes.value = false
    }
  })

  /**
   * Recompute reachability when period changes
   */
  watch(currentTimePeriod, () => {
    computeReachability()
  })

  /**
   * Get duration to a specific zone from the active zone
   */
  function getDuration(toId: string): number | null {
    if (!transportState.activeZoneId.value) return null
    return currentCosts.value.get(toId) ?? null
  }

  /**
   * Get color for a zone based on overlay mode
   */
  function getZoneColor(zoneId: string): string {
    // Reachability overlay mode - show connectivity scores
    if (transportState.overlayMode.value === 'reachability') {
      const score = reachabilityScores.value.get(zoneId)
      if (!score) return '#e0e0e0'
      return getReachabilityColor(score.score)
    }

    // Zone selection mode - show travel times from active zone
    if (transportState.overlayMode.value === 'zoneSelection') {
      if (!transportState.activeZoneId.value) return 'transparent'
      if (transportState.activeZoneId.value === zoneId) return 'transparent'

      const duration = getDuration(zoneId)
      if (duration === null) return '#e0e0e0' // Unreachable / No Data

      return getTimeBucketColor(duration, timeBuckets.value)
    }

    // No overlay
    return 'transparent'
  }

  /**
   * Get route details for the hovered zone
   */
  const currentRouteDetails = computed<CompactRoute | null>(() => {
    if (!transportState.hoveredZoneId.value) return null

    // In zone selection mode, show route from active zone to hovered zone
    if (transportState.activeZoneId.value) {
      if (transportState.activeZoneId.value === transportState.hoveredZoneId.value) return null
      return dataService.getRouteDetails(
        transportState.activeZoneId.value,
        transportState.hoveredZoneId.value,
        currentTimePeriod.value
      )
    }

    // In reachability mode, we don't show route details
    return null
  })

  /**
   * Get route legs for visualization (compatible with old API)
   */
  const currentRouteLegs = computed<CompactLeg[]>(() => {
    const details = currentRouteDetails.value
    if (!details || details.s !== RouteStatus.OK || !details.l) return []
    return details.l
  })

  /**
   * Check if data is ready for use
   */
  const isReady = computed(() => dataService.isReady() && !initError.value)

  /**
   * Get actionable error message for display
   */
  const errorMessage = computed(() => {
    if (initError.value) {
      return {
        title: initError.value.message,
        action: initError.value.details || 'Check the console for more details.',
      }
    }
    if (routeError.value) {
      return {
        title: routeError.value.message,
        action: routeError.value.details || 'Try selecting a different zone.',
      }
    }
    return null
  })

  return {
    // Transport state machine
    transportState,

    // State
    zones,
    currentTimePeriod,
    currentCosts,
    timeBuckets,
    currentRouteDetails,
    currentRouteLegs,

    // Reachability
    reachabilityScores,
    reachabilityLegend,

    // Loading states
    isLoading,
    isLoadingRoutes,
    isReady,

    // Errors
    initError,
    routeError,
    errorMessage,

    // Actions
    loadData,
    getDuration,
    getZoneColor,
    computeReachability,
  }
})
