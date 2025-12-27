# Phase 10: Dashboard & Integration

**Status:** Ready for implementation
**Dependencies:** Phases 03-09 (all workflows implemented)
**Estimated Effort:** 2-3 days
**Priority:** HIGH (brings everything together)

---

## Overview

Build the main TUI dashboard that integrates all workflow screens. This is the primary user interface for interactive mode.

**What it does:**
1. Display database status overview
2. Show stage menu with keyboard shortcuts (1-9)
3. Navigate to workflow screens
4. Show recent errors with log file links
5. Refresh stats on demand
6. Handle workflow completion and return to dashboard

---

## Target Architecture

**File:** `src/tui/dashboard.tsx`

```typescript
export function Dashboard() {
  // State: current screen, db stats, selected stage
  // Navigation: handle keyboard input (1-9, s, q, r)
  // Render: stage menu, status box, error preview
}
```

**Updated:** `src/tui/app.tsx` - Route to Dashboard or specific screens

---

## Dashboard Layout

```
┌─ VARIKKO DATA PIPELINE ─────────────────────────────┐
│ Database: varikko.db                                │
│ Zones: 279 | Routes: 232,554 (OK: 180k, PENDING: 50k)│
│ Deciles: ✓ Calculated | Last Run: 2025-12-25       │
├──────────────────────────────────────────────────────┤
│ WORKFLOW STAGES                                      │
│ [1] ▶ Fetch Zones          [5] Calculate Deciles   │
│ [2]   Geocode Zones        [6] Export Routes       │
│ [3]   Build Routes         [7] Process Map         │
│ [4]   Clear Data           [8] Generate SVG        │
│                            [s] Status               │
├──────────────────────────────────────────────────────┤
│ RECENT ERRORS (2)                  [o] Open logs/   │
│ • Geocoding timeout: 00180                          │
│ • Route: NO_ROUTE 00920 → 01530                    │
└──────────────────────────────────────────────────────┘
  [t] Test Mode: OFF | [?] Help | [q] Quit
```

---

## Navigation Flow

```
Dashboard
  ├─ [1] → FetchZonesScreen → Dashboard
  ├─ [2] → GeocodeScreen → Dashboard
  ├─ [3] → BuildRoutesScreen → Dashboard
  ├─ [4] → ClearDataScreen → Dashboard
  ├─ [5] → DecilesScreen → Dashboard
  ├─ [6] → ExportScreen → Dashboard
  ├─ [7] → MapsScreen → Dashboard
  ├─ [s] → StatusScreen → Dashboard
  └─ [?] → HelpScreen → Dashboard
```

---

## State Management

Use React hooks for local state:
- `currentScreen` - which screen is active
- `dbStats` - cached database statistics
- `testMode` - global test mode toggle

---

## Keyboard Shortcuts

**Global:**
- `1-9` - Select stage
- `s` - Status details
- `t` - Toggle test mode
- `r` - Refresh stats
- `o` - Open log directory
- `?` - Help
- `q` - Quit

**Per-Screen:**
- `Esc` - Back to dashboard
- `Enter` - Confirm/Continue

---

## Help Screen

**File:** `src/tui/screens/help.tsx`

Show keyboard shortcuts, workflow descriptions, and links to documentation.

---

## Testing Strategy

### Integration Tests
- ✅ Navigation between screens
- ✅ Keyboard shortcuts work
- ✅ Stats refresh correctly
- ✅ Test mode toggle persists across screens

### Manual Testing
- [ ] Launch dashboard
- [ ] Navigate to each workflow
- [ ] Complete workflow and return
- [ ] Toggle test mode
- [ ] Refresh stats
- [ ] Open help screen

---

## Acceptance Criteria

- ✅ Dashboard renders correctly
- ✅ All workflows accessible via keyboard
- ✅ Stats update after workflow completion
- ✅ Error preview shows recent issues
- ✅ Test mode toggle works globally
- ✅ Help screen comprehensive
- ✅ Smooth transitions between screens

---

## Implementation Notes

This phase ties everything together. Once complete, the TUI should be fully functional for all workflows.

**Screen Transitions:** Use React state to switch between screens. Each screen should accept `onComplete` and `onCancel` callbacks.

**Stats Refresh:** After any workflow completes, refresh stats before returning to dashboard.

---

## References

- **Placeholder:** `src/tui/app.tsx` (current minimal version)
- **Component Examples:** All workflow screens from phases 03-09
