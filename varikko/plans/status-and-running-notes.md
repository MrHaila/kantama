# Varikko Status & Running Notes

Essential learnings, design decisions, and hand-off notes from each phase.

---

# Phase 01: Testing Setup ✅

## Learnings

- **TypeScript strictness**: Test code needs same type discipline as production code (no `any`, explicit undefined checks)
- **Workspace linting**: Use `pnpm -w run lint` from project root
- **Vitest config**: `globals: true` for describe/it, 30s timeout for route tests, coverage thresholds at 80%/70%

---

# Phase 02: Foundation ✅

## Learnings

- **Ink ESM**: Requires `moduleResolution: "bundler"` in tsconfig.json
- **Ink spacing**: Text doesn't support marginTop; wrap in Box
- **Vitest async**: Use Promise-based tests, not done() callbacks
- **ESLint patterns**: Prefix unused params with `_`, wrap switch case declarations in braces

---

# Phase 03: Fetch Zones ✅

## Learnings

- **tsx runtime**: Has issues with yoga-layout top-level await; rely on unit tests during development
- **Geometry bounds**: Test geometries must be within Helsinki (~24.93, 60.17) to pass isGeometryInVisibleArea()
- **Test DB**: createTestDB() already creates full schema

## Key Design Decisions

- **Route pre-filling**: Cartesian product (N×(N-1)×3) created at fetch time with status='PENDING'
- **SVG paths**: Pre-generated during fetch, projection matches MAP_CONFIG
- **Test mode**: 5 zones, same WFS source (not mocked)

## Post-Phase Refactor

Separated schema initialization from fetchZones():
- `validateSchema(db)`: Returns true if all 4 tables exist
- `varikko init --force`: Explicit schema setup required before first fetch
- Prevents accidental data wipes on re-fetch

---

# Phase 04: Geocode Zones ✅

## Learnings

- **ProgressEmitter API**: Use `emitStart()`, `emitProgress()`, `emitComplete()` (not generic `emit()`)
- **WorkflowStage types**: Use exact names like 'geocode_zones' not 'geocoding'
- **Mock cleanup**: Add `vi.clearAllMocks()` in beforeEach

## Key Design Decisions

- **Three-strategy geocoding**: postal code → zone name → postal+Helsinki → centroid fallback
- **Non-destructive migration**: ALTER TABLE ADD COLUMN (preserves data)
- **Rate limiting**: 100ms delay between requests (max 10 req/sec)
- **API keys**: DIGITRANSIT_API_KEY or HSL_API_KEY (optional)

---

# Phase 05: Build Routes ✅

## Learnings

- **ProgressEmitter metadata**: Enhanced emitStart/emitProgress to accept metadata parameter
- **createTestDB()**: Returns `{db, cleanup}` object; use try/finally for cleanup
- **Routes PRIMARY KEY**: (from_id, to_id, time_period) prevents duplicates

## Key Design Decisions

- **OTP config**: Local (10 concurrent, no delay) vs Remote (1 concurrent, 200ms delay)
- **Time periods**: MORNING 08:30, EVENING 17:30, MIDNIGHT 23:30, target next Tuesday
- **Route statuses**: PENDING → OK | NO_ROUTE | ERROR

---

# Phase 06: Clear Data ✅

## Learnings

- **Schema column names**: `time_period` not `period`, `decile_number` not `decile`, `min_duration`/`max_duration`, `color_hex`, `label` (NOT NULL)
- **ProgressEmitter signatures**: emitStart(stage, total?, message?, metadata?), emitProgress(stage, current, total, message?, metadata?)
- **Ink components**: Spinner is named export, colors are strings not Chalk

## Key Design Decisions

- **Selective clearing**: --routes (reset to PENDING), --places (cascade deletes routes), --metadata, --deciles
- **Safety**: Confirmation prompt unless --force; VACUUM after clearing
- **Non-destructive**: Only deletes data, never drops tables

---

# Phase 07: Calculate Deciles ✅

## Learnings

- **Routes table constraints**: PRIMARY KEY prevents duplicate routes; vary periods in tests
- **Edge cases**: <10 routes creates empty deciles; empty deciles use previous max as min/max

## Key Design Decisions

- **Vintage color palette**: 10 colors from #E76F51 (warm/fast) to #355C7D (cool/slow)
- **Distribution**: 10 equal quantiles, last is open-ended (max = -1)
- **Labels**: "8-15 min", "15 min", or ">60 min" format
- **Force flag**: Required to overwrite existing deciles

---

# Phase 08: Maps ✅

## Learnings

- **vi.mock() hoisting**: Cannot reference variables in factory; define mocks directly
- **TypeScript JSX**: Use !! for boolean conversion; String() for interpolation
- **fs mocking**: Must mock existsSync, statSync (with size), unlinkSync

## Key Design Decisions

- **Two-stage workflow**: processMap (shapefiles → TopoJSON) then generateSVG (TopoJSON → SVG)
- **Projection params**: Center [24.93, 60.17], scale 120000, zoom 1.2 (must match opas BackgroundMap.vue)
- **Layers**: Water (polygons/fills), Roads (lines/strokes), CSS variables for theming

---

# Phase 09: Export Routes ✅ (DEPRECATED)

Removed from codebase. Feature deemed unnecessary.

---

# Phase 10: Dashboard/TUI ✅

## Learnings

- **Screen navigation**: React state + switch statement works well for routing between screens
- **Test mode**: Global state in App.tsx propagated to all workflow screens
- **useInput callbacks**: Must add to screens to handle Enter/Esc for onComplete/onCancel navigation
- **Ink Text limitations**: Text component doesn't support marginTop; wrap in Box instead

## Key Design Decisions

- **Dashboard**: Keyboard-driven menu with number keys (1-6) and arrow navigation
- **Help screen**: Comprehensive guide to all workflows and keyboard shortcuts
- **Global test mode**: Toggle with 't' key, persists across all screens
- **Return to dashboard**: All workflow screens call onComplete/onExit when done

## Implementation Notes

- Exported DBStats type from lib/db.ts for type safety
- Added useInput handlers to FetchZonesScreen and GeocodeScreen for navigation
- Dashboard shows live database stats with refresh on 'r' key
- All 6 workflow screens integrated: fetch-zones, geocode, routes, clear, deciles, maps

---

**Last Updated:** 2025-12-27
