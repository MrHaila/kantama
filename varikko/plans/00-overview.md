# Phase 00: Overview & Architecture

**Status:** Planning
**Dependencies:** None
**Effort:** N/A (Planning Document)

---

## Project Vision

Transform Varikko from a collection of CLI scripts into a unified TUI application that provides:
- Beautiful, keyboard-driven interactive interface (Omarchy-inspired)
- Real-time progress visualization for long-running operations
- Clear state management and error visibility
- Full non-interactive automation support
- Comprehensive testing coverage

---

## Current State Analysis

### Existing Architecture

**8 Workflow Stages (Independent Scripts):**
1. `fetch_zones.ts` - Fetch postal code polygons from WFS, calculate centroids, pre-render SVG paths
2. `geocode_zones.ts` - Resolve street addresses for routing points
3. `build_routes.ts` - Calculate transit routes via OTP for 3 time periods
4. `clear_routes.ts` - Reset or clear data
5. `calculate_deciles.ts` - Generate heatmap color distribution
6. `process_map.ts` - Convert shapefiles to TopoJSON
7. `generate_svg.ts` - Render SVG from TopoJSON
8. `status.ts` - Display current state

**Technology Stack:**
- TypeScript + Node.js
- better-sqlite3 (WAL mode)
- @turf/turf, d3-geo, topojson-client
- axios for HTTP
- cli-progress for progress bars
- pnpm package manager

**Pain Points:**
- No unified interface - must remember 9+ different commands
- Limited visibility into long-running operations
- Error inspection requires manual DB queries
- State transitions unclear between stages
- Test modes inconsistent across scripts
- No workflow composition (can't chain stages easily)

---

## Target Architecture

### Core Principles

1. **Single Binary, Dual Mode**
   - Interactive: `varikko` → Full TUI
   - Non-interactive: `varikko <subcommand> [flags]` → Automation-friendly

2. **Clean Separation of Concerns**
   ```
   src/
   ├── lib/          # Pure business logic (testable)
   ├── tui/          # UI components (Ink/React)
   ├── cli.ts        # CLI parser (commander)
   └── main.ts       # Entry point
   ```

3. **Event-Driven Progress**
   - Business logic emits events (progress, errors, completion)
   - TUI subscribes and renders updates
   - CLI mode logs to stdout or ignores

4. **Test-First Development**
   - Vitest for unit/integration tests
   - DB fixtures for reproducible test state
   - Manual testing checklist per phase

5. **No Backward Compatibility**
   - Full replacement of existing scripts
   - Execute one workflow at a time
   - Manual validation after each phase

---

## Technology Decisions

### TUI Framework: Ink

**Why Ink over blessed:**
- ✅ Active maintenance (blessed unmaintained)
- ✅ TypeScript-first with full type definitions
- ✅ React-style declarative UI (easier state management)
- ✅ Better for real-time updates/progress
- ✅ Familiar patterns if you know React/Vue
- ⚠️ Smaller ecosystem than blessed

**Key Ink Packages:**
- `ink` - Core framework
- `ink-spinner` - Loading indicators
- `ink-text-input` - User input
- `ink-select-input` - Menu selection
- `ink-table` - Tabular data
- `react` - Required peer dependency

### CLI Framework: Commander

**Why Commander:**
- Industry standard for Node.js CLIs
- Excellent TypeScript support
- Subcommand support
- Automatic help generation
- Flexible option parsing

### Testing Framework: Vitest

**Why Vitest:**
- Fast (ESM-native, parallel execution)
- TypeScript-first
- Compatible with existing tsx setup
- Better DX than Jest
- Already in dependencies (run mode only → expand to full usage)

---

## Design System (Omarchy-Inspired)

### Visual Language

**Typography:**
- Monospace font (user's terminal default)
- Box drawing characters: `┌─┐│└┘├┤┬┴┼`
- Unicode symbols: `✓✗⊘▶◀▲▼`

**Color Palette:**
```
Primary:    Cyan/Blue    (interactive elements, progress)
Success:    Green        (completed operations)
Warning:    Yellow       (pending/caution)
Error:      Red          (failures)
Muted:      Gray         (secondary info)
Highlight:  Magenta      (current selection)
```

**Layout Principles:**
- Header with title + context
- Main content area with clear hierarchy
- Footer with keyboard shortcuts
- Consistent spacing (1-2 line padding)

### Keyboard Shortcuts (Omarchy-Style)

**Global:**
- `q` - Quit
- `?` - Help
- `Esc` - Back/Cancel

**Navigation:**
- `j`/`k` or `↓`/`↑` - Move selection
- `1-9` - Quick select stages
- `Enter` - Confirm/Execute

**Stage-Specific:**
- `t` - Toggle test mode
- `p` - Pause operation
- `c` - Cancel operation
- `o` - Open logs
- `r` - Retry/Refresh

### Sample TUI Layout

```
┌─ VARIKKO DATA PIPELINE ────────────────────────────────────────┐
│ Database: /Users/teemu/Documents/Kantama/opas/public/varikko.db │
│ Zones: 279 | Routes: 232,554 (OK: 180k, PENDING: 50k, ERROR: 2k)│
│ Last Run: 2025-12-25 14:30 | Deciles: ✓ Calculated            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WORKFLOW STAGES                                                │
│  ────────────────                                               │
│  [1] ▶ Fetch Zones          Fetch postal code polygons         │
│  [2]   Geocode Zones        Resolve routing addresses          │
│  [3]   Build Routes         Calculate transit routes           │
│  [4]   Clear Data           Reset or clear database            │
│  [5]   Calculate Deciles    Generate heatmap distribution      │
│  [6]   Export Routes        Export to JSON                     │
│  [7]   Process Map          Convert shapefiles to TopoJSON     │
│  [8]   Generate SVG         Render SVG from TopoJSON           │
│                                                                  │
│  [s]   Status               View detailed status               │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ RECENT ERRORS (2)                        [o] Open error logs/   │
│ • Geocoding timeout: postal:00180 (fallback to geometric)      │
│ • Route calc: NO_ROUTE from 00920 → 01530 (MIDNIGHT period)   │
└─────────────────────────────────────────────────────────────────┘
  [t] Test Mode: OFF | [?] Help | [q] Quit
```

---

## Data Flow

### State Management

**Single Source of Truth:** SQLite database (`varikko.db`)

**Tables:**
- `places` - Zones with geometry + routing points
- `routes` - Pre-calculated routes (from × to × period)
- `deciles` - Heatmap color distribution
- `metadata` - Progress tracking + timestamps

**State Transitions:**
```
fetch_zones
  ├─> places (all zones, geometric centroids, SVG paths)
  └─> routes (skeleton, all PENDING)
      ↓
geocode_zones (optional enhancement)
  └─> places.routing_lat/routing_lon
      ↓
build_routes
  ├─> routes (populated with duration, transfers, legs)
  ├─> metadata (progress tracking)
  └─> auto-triggers calculate_deciles
      ↓
calculate_deciles
  └─> deciles (10 rows for heatmap)

[Parallel workflows]
process_map + generate_svg
  └─> background_map.json + background_map.svg
```

### Progress Events

Business logic functions emit events via EventEmitter:

```typescript
interface ProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error'
  stage: string
  current?: number
  total?: number
  message?: string
  error?: Error
}
```

TUI subscribes and updates UI in real-time.
CLI mode logs to stdout or runs silently.

---

## File Structure

```
varikko/
├── src/
│   ├── main.ts                    # Entry point
│   ├── cli.ts                     # Commander CLI parser
│   │
│   ├── lib/                       # Pure business logic
│   │   ├── db.ts                  # Database utilities
│   │   ├── events.ts              # Event emitter types
│   │   ├── zones.ts               # Zone fetching logic
│   │   ├── geocoding.ts           # Geocoding logic
│   │   ├── routing.ts             # Route calculation logic
│   │   ├── clearing.ts            # Data clearing logic
│   │   ├── deciles.ts             # Decile calculation logic
│   │   ├── maps.ts                # Map processing logic
│   │   ├── export.ts              # Export logic
│   │   └── status.ts              # Status queries
│   │
│   ├── tui/                       # TUI components
│   │   ├── app.tsx                # Root TUI component
│   │   ├── dashboard.tsx          # Main dashboard screen
│   │   ├── theme.ts               # Colors, styles
│   │   │
│   │   ├── screens/               # Full-screen stage UIs
│   │   │   ├── fetch-zones.tsx
│   │   │   ├── geocode.tsx
│   │   │   ├── build-routes.tsx
│   │   │   ├── clear-data.tsx
│   │   │   ├── deciles.tsx
│   │   │   ├── export.tsx
│   │   │   ├── maps.tsx
│   │   │   ├── status.tsx
│   │   │   └── help.tsx
│   │   │
│   │   └── components/            # Reusable UI components
│   │       ├── Header.tsx
│   │       ├── Footer.tsx
│   │       ├── StatusBox.tsx
│   │       ├── ProgressBar.tsx
│   │       ├── ErrorPreview.tsx
│   │       ├── StageMenu.tsx
│   │       └── ConfirmDialog.tsx
│   │
│   ├── tests/                     # Vitest tests
│   │   ├── setup.ts               # Test setup
│   │   ├── fixtures/              # DB fixtures
│   │   │   ├── zones.json
│   │   │   ├── routes.json
│   │   │   └── create-test-db.ts
│   │   │
│   │   ├── lib/                   # Unit tests
│   │   │   ├── zones.test.ts
│   │   │   ├── geocoding.test.ts
│   │   │   ├── routing.test.ts
│   │   │   ├── clearing.test.ts
│   │   │   ├── deciles.test.ts
│   │   │   ├── maps.test.ts
│   │   │   └── export.test.ts
│   │   │
│   │   └── integration/           # Integration tests
│   │       └── workflow.test.ts
│   │
│   ├── logs/                      # Structured log files
│   │   ├── .gitkeep
│   │   └── README.md              # Log format docs
│   │
│   └── [legacy scripts - delete after migration]
│       ├── fetch_zones.ts
│       ├── geocode_zones.ts
│       ├── build_routes.ts
│       └── ...
│
├── plans/                         # Planning documents (this directory)
│   ├── 00-overview.md
│   ├── 01-testing-setup.md
│   └── ...
│
├── data/                          # ESRI shapefiles (unchanged)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env
```

---

## Dependencies to Add

**Install via `pnpm add` to get latest versions:**

```bash
# TUI Framework
pnpm add ink react
pnpm add -D @types/react

# TUI Components
pnpm add ink-spinner ink-text-input ink-select-input ink-table

# CLI Framework
pnpm add commander

# Utilities
pnpm add chalk eventemitter3

# Testing (already have vitest, expand config)
pnpm add -D @vitest/ui
```

**Note:** NEVER edit package.json directly to avoid version pinning. Always use `pnpm add`.

---

## Execution Strategy

### Phase Order

1. **Testing Setup** (01) - Foundation for validation
2. **Foundation** (02) - CLI parser, TUI framework, shared components
3. **Workflows** (03-09) - One at a time, in dependency order:
   - Fetch Zones (03)
   - Geocode Zones (04)
   - Build Routes (05)
   - Clear Data (06)
   - Calculate Deciles (07)
   - Maps (08)
   - Export (09)
4. **Dashboard** (10) - Main interface
5. **Integration** (11) - Polish, deployment

### Per-Phase Workflow

1. Read planning document (standalone, no prior context needed)
2. Write Vitest tests based on acceptance criteria
3. Implement lib/ business logic
4. Implement TUI screen
5. Implement CLI subcommand
6. Run tests (unit + integration)
7. Manual testing with real data
8. Delete old script files
9. Commit phase completion

### Testing Gates

Each phase must pass:
- ✅ All Vitest tests passing
- ✅ Manual testing checklist complete
- ✅ DB state matches expected (compare with old implementation)
- ✅ Non-interactive mode works for automation

---

## Success Criteria

### Functional Requirements

- ✅ All 8 workflows work identically to current scripts
- ✅ Real-time progress for long operations (geocoding, routing)
- ✅ Error visibility with log file links
- ✅ Test mode support for all workflows
- ✅ Non-interactive mode for automation/CI
- ✅ Keyboard-driven navigation (j/k/numbers/q)

### Non-Functional Requirements

- ✅ Sub-second startup time
- ✅ Responsive UI even during heavy operations
- ✅ 80%+ test coverage for lib/ code
- ✅ Documentation for all subcommands
- ✅ Clean error messages (no stack traces in TUI)

### Developer Experience

- ✅ Single entry point (`varikko`)
- ✅ Discoverable (help screens, auto-complete ready)
- ✅ Consistent UX across all workflows
- ✅ Easy to add new workflows

---

## Migration Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during testing | High | Always test against copy of varikko.db |
| Regression in calculations | High | Vitest tests with known inputs/outputs |
| TUI rendering issues | Medium | Test in multiple terminals (iTerm, Terminal.app) |
| Performance degradation | Medium | Benchmark critical paths (route calc) |
| Breaking automation | High | Maintain CLI compatibility, add CI tests |

---

## Next Steps

1. Read `01-testing-setup.md`
2. Implement testing framework and fixtures
3. Proceed through phases 02-11 sequentially

---

## References

- **Omarchy Manual:** https://learn.omacom.io/2/the-omarchy-manual
- **Ink Documentation:** https://github.com/vadimdemedes/ink
- **Commander.js:** https://github.com/tj/commander.js
- **Vitest:** https://vitest.dev
- **Current Implementation:** `src/*.ts` (fetch_zones, geocode_zones, build_routes, etc.)
