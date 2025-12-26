import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import * as d3 from 'd3'
import { dbService, type Place } from '../services/DatabaseService'

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

  // Get color scale for current selection
  const colorScale = computed(() => {
    return (
      d3
        .scaleThreshold<number, string>()
        .domain([900, 1800, 2700, 3600]) // 15, 30, 45, 60 mins
        // Vintage palette: deep orange -> light orange -> beige -> teal -> dark blue
        // .range(["#E76F51", "#F4A261", "#E9C46A", "#2A9D8F", "#264653"])
        // Adjusting for "close is hot/good" vs "far is cold/bad"?
        // User requested:
        // < 15 min: Deep Orange (#E76F51) (Actually user said Deep Orange)
        // 15-30 min: Light Orange (#F4A261)
        // 30-45 min: Beige (#E9C46A)
        // 45-60 min: Teal (#2A9D8F)
        // 60+ min: Dark Blue (#264653)
        .range(['#E76F51', '#F4A261', '#E9C46A', '#2A9D8F', '#264653'])
    )
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

    return colorScale.value(duration)
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
