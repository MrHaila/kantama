import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { dbService, type Place, type Decile } from '../services/DatabaseService'
import { themes } from '../config/themes'

// Get decile color for a given duration
function getDecileColor(duration: number, deciles: Decile[]): string {
  // Find which decile this duration falls into
  for (const decile of deciles) {
    if (duration >= decile.min_duration && (decile.max_duration === -1 || duration <= decile.max_duration)) {
      return decile.color_hex
    }
  }

  // If no decile matches (shouldn't happen), return a default color
  return '#e0e0e0'
}

// Get themed decile colors
function getThemedDeciles(deciles: Decile[]): Decile[] {
  const currentTheme = themes.vintage

  // Ensure theme exists
  if (!currentTheme || !currentTheme.decileColors) {
    return deciles
  }

  // Override colors with theme colors if we have the right number
  if (deciles.length === currentTheme.decileColors.length) {
    return deciles.map((decile, index) => ({
      ...decile,
      color_hex: currentTheme.decileColors[index] || decile.color_hex,
    }))
  }

  return deciles
}

export const useMapDataStore = defineStore('mapData', () => {
  const zones = ref<Place[]>([])
  const currentCosts = ref<Map<string, number>>(new Map())
  const activeZoneId = ref<string | null>(null)
  const hoveredZoneId = ref<string | null>(null)
  const currentTimePeriod = ref<string>('MORNING')
  const deciles = ref<Decile[]>([])

  async function loadData() {
    try {
      await dbService.init()
      zones.value = dbService.getPlaces()
      const rawDeciles = dbService.getDeciles()
      deciles.value = getThemedDeciles(rawDeciles)
      console.log('Data loaded from DB:', zones.value.length, 'zones')
      console.log('Deciles loaded:', deciles.value.length, 'deciles')
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

    return getDecileColor(duration, deciles.value)
  }

  return {
    zones,
    activeZoneId,
    hoveredZoneId,
    currentTimePeriod,
    currentCosts,
    deciles,
    loadData,
    getDuration,
    getZoneColor,
  }
})
