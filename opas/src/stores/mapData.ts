import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { dbService, type Place, type TimeBucket, type Leg } from '../services/DatabaseService'
import { themes } from '../config/themes'

// Get time bucket color for a given duration
function getTimeBucketColor(duration: number, timeBuckets: TimeBucket[]): string {
  // Find which time bucket this duration falls into
  for (const bucket of timeBuckets) {
    if (duration >= bucket.min_duration && (bucket.max_duration === -1 || duration <= bucket.max_duration)) {
      return bucket.color_hex
    }
  }

  // If no bucket matches (shouldn't happen), return a default color
  return '#e0e0e0'
}

// Get themed time bucket colors
function getThemedTimeBuckets(timeBuckets: TimeBucket[]): TimeBucket[] {
  const currentTheme = themes.vintage

  // Ensure theme exists
  if (!currentTheme || !currentTheme.timeBucketColors) {
    return timeBuckets
  }

  // Override colors with theme colors if we have the right number
  if (timeBuckets.length === currentTheme.timeBucketColors.length) {
    return timeBuckets.map((bucket, index) => ({
      ...bucket,
      color_hex: currentTheme.timeBucketColors[index] || bucket.color_hex,
    }))
  }

  return timeBuckets
}

export const useMapDataStore = defineStore('mapData', () => {
  const zones = ref<Place[]>([])
  const currentCosts = ref<Map<string, number>>(new Map())
  const activeZoneId = ref<string | null>(null)
  const hoveredZoneId = ref<string | null>(null)
  const currentTimePeriod = ref<string>('MORNING')
  const timeBuckets = ref<TimeBucket[]>([])

  async function loadData() {
    try {
      await dbService.init()
      zones.value = dbService.getPlaces()
      const rawTimeBuckets = dbService.getTimeBuckets()
      timeBuckets.value = getThemedTimeBuckets(rawTimeBuckets)
      console.log('Data loaded from DB:', zones.value.length, 'zones')
      console.log('Time buckets loaded:', timeBuckets.value.length, 'buckets')
    } catch (e) {
      console.error('Failed to load map data:', e)
    }
  }

  // Watch for active zone or period changes to update costs
  watch([activeZoneId, currentTimePeriod], () => {
    if (activeZoneId.value) {
      currentCosts.value = dbService.getRouteCosts(activeZoneId.value, currentTimePeriod.value)
    } else {
      currentCosts.value = new Map()
    }
  })

  function getDuration(toId: string) {
    if (!activeZoneId.value) return null
    return currentCosts.value.get(toId) || null
  }

  function getZoneColor(zoneId: string) {
    if (!activeZoneId.value) return 'transparent' // Transparent when no zone selected
    if (activeZoneId.value === zoneId) return 'transparent' // Selected zone - will be transparent via opacity

    const duration = getDuration(zoneId)
    if (duration === null) return '#e0e0e0' // Unreachable / No Data (Light Grey)

    return getTimeBucketColor(duration, timeBuckets.value)
  }

  // Get route legs for the currently hovered route
  const currentRouteLegs = computed<Leg[]>(() => {
    if (!activeZoneId.value || !hoveredZoneId.value) return []
    if (activeZoneId.value === hoveredZoneId.value) return []

    const routeDetails = dbService.getRouteDetails(activeZoneId.value, hoveredZoneId.value, currentTimePeriod.value)

    if (!routeDetails || routeDetails.status !== 'OK') return []

    return dbService.parseLegs(routeDetails.legs)
  })

  return {
    zones,
    activeZoneId,
    hoveredZoneId,
    currentTimePeriod,
    currentCosts,
    timeBuckets,
    currentRouteLegs,
    loadData,
    getDuration,
    getZoneColor,
  }
})
