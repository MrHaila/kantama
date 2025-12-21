import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import * as d3 from 'd3';
import { dbService, type Place } from '../services/DatabaseService';

export const useMapDataStore = defineStore('mapData', () => {
  const zones = ref<any>(null); // GeoJSON FeatureCollection
  const currentCosts = ref<Map<string, number>>(new Map()); // { toId: seconds }
  const activeZoneId = ref<string | null>(null);
  const currentTimePeriod = ref<string>('MORNING'); // Default
  const isLoading = ref(false);

  // Load static data
  async function loadData() {
    isLoading.value = true;
    try {
      await dbService.init();
      
      const places = dbService.getPlaces();
      // Convert to GeoJSON FeatureCollection format for existing components
      zones.value = {
        type: "FeatureCollection",
        features: places.map(p => ({
          type: "Feature",
          properties: {
            postinumeroalue: p.id,
            nimi: p.name,
          },
          geometry: p.geometry
        }))
      };
      
      console.log("Data loaded from DB:", places.length, "zones");
    } catch (e) {
      console.error("Failed to load map data:", e);
    } finally {
      isLoading.value = false;
    }
  }

  // Watch for active zone or period changes to update costs
  watch([activeZoneId, currentTimePeriod], () => {
    if (activeZoneId.value) {
      currentCosts.value = dbService.getRouteCosts(activeZoneId.value, currentTimePeriod.value);
    } else {
      currentCosts.value = new Map();
    }
  });

  // Get color scale for current selection
  const colorScale = computed(() => {
    return d3.scaleThreshold<number, string>()
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
      .range(["#E76F51", "#F4A261", "#E9C46A", "#2A9D8F", "#264653"]);
  });

  function getDuration(toId: string) {
    if (!activeZoneId.value) return null;
    return currentCosts.value.get(toId) || null;
  }

  function getZoneColor(zoneId: string) {
    if (!activeZoneId.value) return '#FDFBF7'; // Default Vintage Cream
    if (activeZoneId.value === zoneId) return '#264653'; // Selected origin (Dark)

    const duration = getDuration(zoneId);
    if (duration === null) return '#e0e0e0'; // Unreachable / No Data (Light Grey)
    
    return colorScale.value(duration);
  }

  return {
    zones,
    activeZoneId,
    currentTimePeriod,
    currentCosts,
    isLoading,
    loadData,
    getDuration,
    getZoneColor
  };
});
