/**
 * Transport state machine composable
 * Manages app state transitions for transport modes and overlay modes
 */

import { ref, computed, watch } from 'vue'
import type { AppState, OverlayMode } from '../types/state'

const overlayMode = ref<OverlayMode>('reachability')
const activeZoneId = ref<string | null>(null)
const hoveredZoneId = ref<string | null>(null)

export function useTransportState() {
  // Automatically switch overlay mode based on zone selection
  watch(activeZoneId, (newZoneId) => {
    if (newZoneId !== null) {
      overlayMode.value = 'zoneSelection'
    } else {
      overlayMode.value = 'reachability'
    }
  })

  // Actions
  const selectZone = (zoneId: string) => {
    activeZoneId.value = zoneId
  }

  const clearZone = () => {
    activeZoneId.value = null
  }

  const setHoveredZone = (zoneId: string | null) => {
    hoveredZoneId.value = zoneId
  }

  const toggleOverlay = () => {
    if (overlayMode.value === 'reachability') {
      overlayMode.value = 'none'
    } else {
      overlayMode.value = 'reachability'
    }
  }

  // Computed state
  const currentState = computed<Partial<AppState>>(() => ({
    overlayMode: overlayMode.value,
    activeZoneId: activeZoneId.value,
    hoveredZoneId: hoveredZoneId.value,
  }))

  const isZoneSelectionMode = computed(() => overlayMode.value === 'zoneSelection')
  const isReachabilityMode = computed(() => overlayMode.value === 'reachability')
  const hasActiveZone = computed(() => activeZoneId.value !== null)
  const hasHoveredZone = computed(() => hoveredZoneId.value !== null)

  return {
    // State
    overlayMode,
    activeZoneId,
    hoveredZoneId,
    currentState,

    // Computed
    isZoneSelectionMode,
    isReachabilityMode,
    hasActiveZone,
    hasHoveredZone,

    // Actions
    selectZone,
    clearZone,
    setHoveredZone,
    toggleOverlay,
  }
}
