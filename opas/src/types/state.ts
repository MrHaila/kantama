/**
 * Application state machine types
 */

export type OverlayMode = 'none' | 'reachability' | 'zoneSelection'

export type LifecycleState = 'loading' | 'ready' | 'error'

export type TimePeriod = 'MORNING' | 'EVENING' | 'MIDNIGHT'

/**
 * Main application state
 */
export interface AppState {
  overlayMode: OverlayMode
  timePeriod: TimePeriod
  activeZoneId: string | null
  hoveredZoneId: string | null
  lifecycle: LifecycleState
}

/**
 * Valid state transitions
 */
export interface StateTransition {
  from: Partial<AppState>
  to: Partial<AppState>
  guard?: (state: AppState) => boolean
}

/**
 * State transition rules
 */
export const STATE_TRANSITIONS: Record<string, (state: AppState) => Partial<AppState>> = {
  // When zone selected, switch to zone selection overlay
  selectZone: (state) => ({
    overlayMode: 'zoneSelection',
    activeZoneId: state.activeZoneId,
  }),

  // When zone cleared, return to reachability overlay
  clearZone: () => ({
    overlayMode: 'reachability',
    activeZoneId: null,
  }),

  // Toggle overlay modes
  toggleOverlay: (state) => ({
    overlayMode: state.overlayMode === 'none' ? 'reachability' : 'none',
  }),
}
