import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as d3 from 'd3';

export const useMapDataStore = defineStore('mapData', () => {
  const zones = ref<any>(null); // GeoJSON FeatureCollection
  const matrix = ref<Record<string, Record<string, number>>>({}); // { fromId: { toId: seconds } }
  const activeZoneId = ref<string | null>(null);
  const isLoading = ref(false);

  // Load static data
  async function loadData() {
    isLoading.value = true;
    try {
      const [zonesRes, matrixRes] = await Promise.all([
        window.fetch('/data/zones.geojson'),
        window.fetch('/data/matrix.json')
      ]);
      
      zones.value = await zonesRes.json();
      matrix.value = await matrixRes.json();
      console.log("Data loaded:", zones.value?.features?.length, "zones,", Object.keys(matrix.value).length, "matrix rows");
    } catch (e) {
      console.error("Failed to load map data:", e);
    } finally {
      isLoading.value = false;
    }
  }

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
    if (!activeZoneId.value || !matrix.value[activeZoneId.value]) return null;
    return matrix.value[activeZoneId.value][toId] || null;
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
    matrix,
    activeZoneId,
    isLoading,
    loadData,
    getDuration,
    getZoneColor
  };
});
