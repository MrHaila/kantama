import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { dbService, type Place } from '../services/DatabaseService'

// Simple threshold scale function to replace D3's scaleThreshold
function getThresholdColor(duration: number): string {
  // Thresholds: 900, 1800, 2700, 3600 seconds (15, 30, 45, 60 mins)
  // Colors: Deep Orange -> Light Orange -> Beige -> Teal -> Dark Blue
  if (duration < 900) return '#E76F51' // < 15 min: Deep Orange
  if (duration < 1800) return '#F4A261' // 15-30 min: Light Orange
  if (duration < 2700) return '#E9C46A' // 30-45 min: Beige
  if (duration < 3600) return '#2A9D8F' // 45-60 min: Teal
  return '#264653' // 60+ min: Dark Blue
}

export const useMapDataStore = defineStore('mapData', () => {
  const zones = ref<Place[]>([])
  const currentCosts = ref<Map<string, number>>(new Map())
  const activeZoneId = ref<string | null>(null)
  const currentTimePeriod = ref<string>('MORNING')

  async function loadData() {
    try {
      await dbService.init()
      zones.value = dbService.getPlaces()
      console.log('Data loaded from DB:', zones.value.length, 'zones')
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
    if (activeZoneId.value === zoneId) return '#264653' // Selected origin (Dark)

    const duration = getDuration(zoneId)
    if (duration === null) return '#e0e0e0' // Unreachable / No Data (Light Grey)

    return getThresholdColor(duration)
  }

  return {
    zones,
    activeZoneId,
    currentTimePeriod,
    currentCosts,
    loadData,
    getDuration,
    getZoneColor,
  }
})
