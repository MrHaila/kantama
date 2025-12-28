import { defineStore } from 'pinia';
import { ref, watch, computed } from 'vue';
import {
  dataService,
  type Zone,
  type TimeBucket,
  type TimePeriod,
  type DataServiceError,
  type CompactRoute,
  type CompactLeg,
} from '../services/DataService';
import { themes } from '../config/themes';

// Get time bucket color for a given duration
function getTimeBucketColor(duration: number, timeBuckets: TimeBucket[]): string {
  for (const bucket of timeBuckets) {
    if (duration >= bucket.min && (bucket.max === -1 || duration <= bucket.max)) {
      return bucket.color;
    }
  }
  return '#e0e0e0';
}

// Get themed time bucket colors
function getThemedTimeBuckets(timeBuckets: TimeBucket[]): TimeBucket[] {
  const currentTheme = themes.vintage;

  if (!currentTheme || !currentTheme.timeBucketColors) {
    return timeBuckets;
  }

  if (timeBuckets.length === currentTheme.timeBucketColors.length) {
    return timeBuckets.map((bucket, index) => ({
      ...bucket,
      color: currentTheme.timeBucketColors[index] || bucket.color,
    }));
  }

  return timeBuckets;
}

export const useMapDataStore = defineStore('mapData', () => {
  // State
  const zones = ref<Zone[]>([]);
  const currentCosts = ref<Map<string, number>>(new Map());
  const activeZoneId = ref<string | null>(null);
  const hoveredZoneId = ref<string | null>(null);
  const currentTimePeriod = ref<TimePeriod>('MORNING');
  const timeBuckets = ref<TimeBucket[]>([]);

  // Loading and error states
  const isLoading = ref(false);
  const isLoadingRoutes = ref(false);
  const initError = ref<DataServiceError | null>(null);
  const routeError = ref<DataServiceError | null>(null);

  /**
   * Initialize the store by loading zone data
   */
  async function loadData() {
    isLoading.value = true;
    initError.value = null;

    try {
      const state = await dataService.init();

      if (state.zonesError) {
        initError.value = state.zonesError;
        console.error('Failed to load map data:', state.zonesError.message);
        return;
      }

      zones.value = dataService.getZones();
      const rawTimeBuckets = dataService.getTimeBuckets();
      timeBuckets.value = getThemedTimeBuckets(rawTimeBuckets);

      console.log('Data loaded:', zones.value.length, 'zones');
    } catch (e) {
      initError.value = {
        type: 'network_error',
        message: 'Failed to load map data',
        details: e instanceof Error ? e.message : String(e),
      };
      console.error('Failed to load map data:', e);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Load routes when active zone or period changes
   */
  watch([activeZoneId, currentTimePeriod], async () => {
    routeError.value = null;

    if (!activeZoneId.value) {
      currentCosts.value = new Map();
      return;
    }

    isLoadingRoutes.value = true;

    try {
      // Load routes for this zone if not cached
      if (!dataService.hasRoutesLoaded(activeZoneId.value)) {
        const routes = await dataService.loadRoutesForZone(activeZoneId.value);
        if (!routes) {
          routeError.value = dataService.getRouteError(activeZoneId.value);
          currentCosts.value = new Map();
          return;
        }
      }

      // Get costs for current period
      currentCosts.value = dataService.getRouteCosts(activeZoneId.value, currentTimePeriod.value);
    } finally {
      isLoadingRoutes.value = false;
    }
  });

  /**
   * Get duration to a specific zone from the active zone
   */
  function getDuration(toId: string): number | null {
    if (!activeZoneId.value) return null;
    return currentCosts.value.get(toId) ?? null;
  }

  /**
   * Get color for a zone based on travel time
   */
  function getZoneColor(zoneId: string): string {
    if (!activeZoneId.value) return 'transparent';
    if (activeZoneId.value === zoneId) return 'transparent';

    const duration = getDuration(zoneId);
    if (duration === null) return '#e0e0e0'; // Unreachable / No Data

    return getTimeBucketColor(duration, timeBuckets.value);
  }

  /**
   * Get route details for the hovered zone
   */
  const currentRouteDetails = computed<CompactRoute | null>(() => {
    if (!activeZoneId.value || !hoveredZoneId.value) return null;
    if (activeZoneId.value === hoveredZoneId.value) return null;

    return dataService.getRouteDetails(activeZoneId.value, hoveredZoneId.value, currentTimePeriod.value);
  });

  /**
   * Get route legs for visualization (compatible with old API)
   */
  const currentRouteLegs = computed<CompactLeg[]>(() => {
    const details = currentRouteDetails.value;
    if (!details || details.status !== 'OK' || !details.legs) return [];
    return details.legs;
  });

  /**
   * Check if data is ready for use
   */
  const isReady = computed(() => dataService.isReady() && !initError.value);

  /**
   * Get actionable error message for display
   */
  const errorMessage = computed(() => {
    if (initError.value) {
      return {
        title: initError.value.message,
        action: initError.value.details || 'Check the console for more details.',
      };
    }
    if (routeError.value) {
      return {
        title: routeError.value.message,
        action: routeError.value.details || 'Try selecting a different zone.',
      };
    }
    return null;
  });

  return {
    // State
    zones,
    activeZoneId,
    hoveredZoneId,
    currentTimePeriod,
    currentCosts,
    timeBuckets,
    currentRouteDetails,
    currentRouteLegs,

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
  };
});
