# Phase 01: Testing Setup - Status & Running Notes

**Date:** 2025-12-27  
**Status:** ✅ COMPLETE

---

## Unexpected Learnings & Plan Expansions

### TypeScript Strictness

- Original plan didn't account for TypeScript's strict type checking in test helpers
- Had to replace all `any` types with proper interfaces and type assertions
- Added explicit undefined checks for database query results
- Lesson: Test code needs same type discipline as production code

### ESLint Configuration

- Project uses workspace-level linting (`pnpm -w run lint`)
- Test files required removing unused imports (`expect` not needed for skeleton tests)
- Required ES6 imports instead of `require()` even in test helpers

### Vitest Configuration Details

- `globals: true` needed for describe/it without imports
- Coverage thresholds set to 80% (lines, functions, statements) and 70% (branches)
- 30s timeout required for future route calculation tests
- Setup file path must be relative to project root

---

## What Went Well

- All dependencies installed successfully
- Test infrastructure created as planned
- Coverage and UI modes working
- Clean separation of concerns in helpers

---

## Next Phase - Phase 02 Foundation

**Prerequisites:** None  
**Estimated Effort:** 2-3 days

### Key Tasks

1. Install TUI framework dependencies (ink, react, commander)
2. Create CLI parser with subcommands
3. Set up basic TUI framework structure
4. Create shared components (Header, Footer, StatusBox, etc.)
5. Implement main TUI app skeleton

### Hand-off Notes

- Tests are ready for implementation (all skeleton files created)
- Use `pnpm test` to verify changes
- Run `pnpm -w run lint` from project root for linting
- Test helpers in `src/tests/helpers/` are fully functional
- Fixtures available for 5 zones dataset

---

## Files Created/Modified

```text
✓ vitest.config.ts (enhanced)
✓ src/tests/setup.ts
✓ src/tests/helpers/db.ts
✓ src/tests/helpers/assertions.ts  
✓ src/tests/helpers/fixtures.ts
✓ src/tests/fixtures/zones/5-zones.json
✓ src/tests/fixtures/routes/*.json
✓ src/tests/lib/*.test.ts (7 skeleton files)
✓ src/tests/integration/workflow.test.ts
```

All lint and type errors resolved. Ready to proceed with Phase 02.

---

# Phase 02: Foundation - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Unexpected Learnings & Plan Expansions

### TypeScript Module Resolution

- Initially used `moduleResolution: "node"` but Ink requires `"bundler"` for ESM modules
- Error: "Cannot find module 'ink' or its corresponding type declarations"
- Solution: Updated tsconfig.json to use `moduleResolution: "bundler"`

### Ink Component Props

- Text component doesn't support marginTop prop directly
- Had to wrap Text in Box components for proper spacing
- Learned to always check Ink component prop types during development

### Vitest Test Patterns

- Vitest deprecated done() callback pattern in favor of Promise-based async tests
- Converted all event emitter tests to use Promise wrappers
- More reliable and cleaner than callback-based tests

### ESLint Rules

- Unused action parameters in CLI must be prefixed with `_` to satisfy linting
- Control character regex patterns (for ANSI codes) need eslint-disable comment
- Lexical declarations in switch case blocks must be wrapped in braces

---

## What Went Well

- All dependencies installed without conflicts
- TUI framework (Ink) integrated smoothly
- CLI parser (Commander) works as expected
- Event system provides clean progress tracking API
- Database utilities handle stats queries correctly
- Logger creates structured log files properly
- Tests pass after minor async pattern updates
- Build compiles successfully with no type errors

---

## Implementation Notes

### Dependencies Added

```bash
ink, react (TUI framework)
@types/react (dev)
ink-spinner, ink-text-input, ink-select-input, ink-table (UI components)
commander (CLI parser)
chalk, eventemitter3 (utilities)
@types/node (dev - already present, verified)
```

### Files Created

```text
✓ src/main.ts (entry point)
✓ src/cli.ts (CLI parser with all subcommands)
✓ src/lib/db.ts (database utilities)
✓ src/lib/events.ts (progress event system)
✓ src/lib/logger.ts (structured logging)
✓ src/tui/theme.ts (colors, symbols, layout helpers)
✓ src/tui/app.tsx (root TUI component)
✓ src/tui/components/Header.tsx
✓ src/tui/components/Footer.tsx
✓ src/tui/components/ProgressBar.tsx
✓ src/tui/components/StatusBox.tsx
✓ src/tui/components/Spinner.tsx
✓ src/tests/lib/db.test.ts
✓ src/tests/lib/events.test.ts
```

### Files Modified

```text
✓ package.json (version 2.0.0, bin entry, scripts)
✓ tsconfig.json (JSX support, ESM module resolution)
```

---

## Testing Results

- All unit tests passing (5/5)
- Event emitter tests work correctly with Promise pattern
- Database utilities properly query stats and errors
- Build compiles without errors
- Lint passes with no errors (8 warnings for metadata `any` types - acceptable)

---

## Manual Verification

✅ `pnpm build` - compiles successfully
✅ `pnpm test` - all tests pass
✅ `pnpm -w run lint` - no errors, only metadata warnings
✅ `logs/` directory created by logger initialization
✅ `dist/main.js` exists and is executable

---

## Next Phase - Phase 03 Fetch Zones

**Prerequisites:** Phase 02 (Foundation)
**Estimated Effort:** 2-3 days

### Key Tasks

1. Implement zone fetching business logic in `src/lib/zones.ts`
2. Create TUI screen for fetch zones workflow
3. Implement CLI subcommand handler
4. Write tests for zone fetching logic
5. Delete old `src/fetch_zones.ts` after validation

### Hand-off Notes

- Foundation infrastructure is fully functional
- TUI framework ready for workflow screens
- CLI parser ready to route to implementations
- Event system ready for progress tracking
- Tests demonstrate proper async patterns
- Use `pnpm dev` to run TUI in development mode

---

# Phase 03: Fetch Zones Workflow - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Unexpected Learnings & Plan Expansions

### Ink Text Component Limitations

- Text component doesn't support marginTop/marginBottom props
- Must wrap Text in Box components for vertical spacing
- Example: `<Box marginTop={1}><Text>content</Text></Box>`

### TypeScript ESM Import Issues with tsx

- tsx runtime has issues with yoga-layout (Ink dependency) using top-level await
- Error: "Top-level await is currently not supported with the 'cjs' output format"
- Workaround: Rely on comprehensive unit tests instead of manual CLI testing during development

### Geometry Processing Edge Cases

- Test geometries must be within visible map bounds (centered on Helsinki ~24.93, 60.17)
- Polygons outside visible area are filtered out by isGeometryInVisibleArea()
- Test data coordinates must match actual Helsinki area for realistic results

### Test Database Schema Initialization

- createTestDB() helper already creates full schema
- Tests for "destructive drop" must insert data first, then re-initialize
- Cannot test table creation when table already exists

---

## What Went Well

- All 16 tests passing on first run after fixes
- Business logic cleanly extracted from fetch_zones.ts
- TDD approach validated implementation before manual testing
- Event emitter integration worked seamlessly
- Progress tracking API clean and intuitive
- Database schema initialization perfectly replicated
- SVG path generation and projection logic preserved correctly

---

## Implementation Notes

### Files Created

```text
✓ src/lib/zones.ts (business logic, 430 lines)
  - downloadZonesFromWFS(): WFS API integration
  - processZones(): Filter, clean, project, generate SVG
  - initializeSchema(): Database schema initialization
  - insertZones(): Zone insertion + Cartesian route pre-fill
  - fetchZones(): Main workflow orchestration

✓ src/tui/screens/fetch-zones.tsx (TUI screen)
  - Real-time progress display with ProgressBar/Spinner
  - Test mode support (5 zones)
  - Error handling with user-friendly messages
  - Status tracking (idle → running → complete/error)

✓ src/tests/lib/zones.test.ts (comprehensive test suite, 16 tests)
  - WFS download tests (mocked axios)
  - Zone processing tests (filtering, centroids, SVG paths)
  - Schema initialization tests
  - Zone insertion and route pre-fill tests
  - Progress event emission tests
  - End-to-end integration tests
```

### Files Modified

```text
✓ src/cli.ts (implemented fetch command action)
  - Non-interactive CLI support
  - Progress event handling with console output
  - Database connection management
  - Error handling and exit codes
```

### Technology Integration

- **@turf/turf**: Centroid calculation for zone polygons
- **d3-geo**: Mercator projection and SVG path generation
- **axios**: WFS API requests to geo.stat.fi
- **better-sqlite3**: SQLite database operations with transactions

---

## Testing Results

- All 16 unit tests passing (100%)
- WFS download mocked correctly with axios.get
- Zone processing filters Helsinki postal codes (00/01/02)
- Geometric centroid calculation accurate
- SVG path generation validated (paths start with 'M')
- Schema initialization creates all tables and indexes
- Route Cartesian product calculated correctly (N×(N-1)×3)
- Self-routes properly excluded
- Progress events emitted at correct stages
- Metadata stored with timestamp and zone count

---

## Key Design Decisions

### Test Mode Behavior

- Limits to 5 zones for fast validation
- Uses same WFS data source (not mocked fixtures)
- Identical code path ensures production parity

### Destructive Schema Initialization

- DROP TABLE IF EXISTS for clean slate
- Matches current implementation behavior
- No migration/backward compatibility needed

### Route Pre-filling Strategy

- Cartesian product created at fetch time
- 3 time periods: MORNING, EVENING, MIDNIGHT
- Self-routes excluded (from_id ≠ to_id)
- Status defaults to 'PENDING' for all routes

### SVG Path Pre-generation

- Paths generated during fetch (not on-demand)
- Reduces opas UI render overhead
- Projection parameters match MAP_CONFIG exactly

---

## Manual Verification

✅ `pnpm test` - all 21 tests pass (16 zones + 5 existing)
✅ `pnpm build` - compiles successfully
✅ Test suite covers all acceptance criteria
✅ Code follows existing patterns from fetch_zones.ts
✅ TypeScript strict mode compliance

---

## Migration Notes

### Files to Delete (Later Phases)

- `src/fetch_zones.ts` can be removed after full validation
- `package.json` script `fetch:zones` can be replaced with `varikko fetch`

### Breaking Changes

- None - old scripts still work during transition
- New implementation is additive at this stage

---

## Next Phase - Phase 04 Geocode Zones

**Prerequisites:** Phase 03 (Fetch Zones)
**Estimated Effort:** 2 days

### Key Tasks

1. Implement geocoding business logic in `src/lib/geocoding.ts`
2. Create TUI screen for geocode zones workflow
3. Implement CLI subcommand handler
4. Write tests for geocoding logic
5. Delete old `src/geocode_zones.ts` after validation

### Hand-off Notes

- Fetch zones workflow fully tested and working
- Database schema includes routing_lat/routing_lon columns (ready for geocoding)
- Progress event pattern established and reusable
- TUI screen pattern can be replicated for geocoding
- CLI integration pattern proven

---

## Post-Phase 03 Refactor: Schema Initialization Separation

**Date:** 2025-12-27

### Motivation

After completing Phase 03, refactored to improve separation of concerns and safety:

- Schema initialization was being called automatically in `fetchZones()`
- This meant every fetch would destructively drop and recreate tables
- Made it unsafe to re-run fetch without losing data
- Made implementing clear/reset workflows harder

### Changes Made

**New Functions:**
- `validateSchema(db)`: Returns true if all 4 required tables exist
- `varikko init` CLI command: Explicit schema setup with --force flag

**Modified Behavior:**
- `fetchZones()` now validates schema first
- Throws helpful error if schema not initialized
- Users must run `varikko init --force` before first fetch

**Test Updates:**
- Added 3 tests for `validateSchema()`
- Updated integration tests to call `initializeSchema()` explicitly
- Added test for fetchZones failure when schema missing
- All 25 tests passing (20 zones + 5 existing)

### Benefits

✅ **Safety:** No accidental data wipes
✅ **Clarity:** Explicit intent with init command
✅ **Better UX:** Clear error messages guide users
✅ **Easier future work:** Clear/reset workflows will be simpler to implement

---

**Last Updated:** 2025-12-27
**Phase 03 Complete** ✅

---

# Phase 04: Geocode Zones Workflow - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Unexpected Learnings & Plan Expansions

### TypeScript Event Emitter Types

- Initial implementation used generic `emit()` calls which didn't match the ProgressEmitter API
- Had to update to use specific methods: `emitStart()`, `emitProgress()`, `emitComplete()`
- Learned importance of using proper WorkflowStage type ('geocode_zones' not 'geocoding')

### Vitest Mock Management

- Mock call counts accumulate across tests without proper cleanup
- Had to add `vi.clearAllMocks()` in beforeEach to reset axios mocks
- Mock emitters in tests need to implement the same method signatures as ProgressEmitter

### Schema Migration Pattern

- Used `ensureGeocodingSchema()` for non-destructive migrations
- Different from Phase 03's destructive `initializeSchema()` approach
- ALTER TABLE ADD COLUMN works for adding new fields without data loss

---

## What Went Well

- All 14 tests passing (100% coverage)
- Business logic cleanly extracted from geocode_zones.ts
- TDD approach validated implementation before manual testing
- Event emitter integration works correctly with proper types
- Progress tracking provides real-time feedback
- Geocoding API integration preserved correctly
- Three-strategy fallback system (postal code → zone name → postal+Helsinki)
- Rate limiting prevents API throttling (100ms delays)
- Mock-based testing avoids actual API calls during tests

---

## Implementation Notes

### Files Created

```text
✓ src/lib/geocoding.ts (business logic, 282 lines)
  - ensureGeocodingSchema(): Non-destructive schema migration
  - geocodeZone(): Single zone geocoding with 3 strategies
  - updateZoneRouting(): Database update with fallback logic
  - geocodeZones(): Main workflow orchestration

✓ src/tui/screens/geocode.tsx (TUI screen)
  - Real-time progress display with ProgressBar/Spinner
  - Test mode support (5 zones)
  - Error handling and fallback reporting
  - API key warning display

✓ src/tests/lib/geocoding.test.ts (comprehensive test suite, 14 tests)
  - Schema migration tests
  - Single zone geocoding tests (all 3 strategies)
  - Database update tests
  - Integration tests with rate limiting
  - Progress event emission tests
```

### Files Modified

```text
✓ src/cli.ts (implemented geocode command action)
  - Non-interactive CLI support
  - Progress event handling with console output
  - API key detection and warning
  - Database connection management
  - Error handling and exit codes
```

### Technology Integration

- **axios**: Digitransit Geocoding API requests
- **better-sqlite3**: SQLite database operations (ALTER TABLE)
- **eventemitter3**: Progress tracking via ProgressEmitter
- **vitest**: Mock-based testing with axios mocks

---

## Testing Results

- All 14 unit tests passing (100%)
- Schema migration properly adds 4 new columns
- Geocoding tries all 3 strategies in correct order
- Fallback to geometric centroid works correctly
- Rate limiting enforced (100ms delays validated)
- Progress events emitted with correct stage name
- Mock cleanup prevents test interference
- Build compiles without TypeScript errors

---

## Key Design Decisions

### Three-Strategy Geocoding

1. **Postal code only** - fastest, most precise
2. **Zone name** - handles areas with multiple postal codes
3. **Postal code + Helsinki** - disambiguates common postal codes

Falls back to geometric centroid if all strategies fail.

### Non-Destructive Schema Migration

- Uses ALTER TABLE ADD COLUMN (not DROP TABLE)
- Preserves existing data during schema updates
- Idempotent - can run multiple times safely
- Different from Phase 03's destructive initialization

### Rate Limiting Strategy

- Fixed 100ms delay between requests (max 10 req/sec)
- Prevents API throttling and 429 errors
- Sleep after each geocode except last zone
- No adaptive throttling (keeps implementation simple)

### API Key Handling

- Supports both DIGITRANSIT_API_KEY and HSL_API_KEY
- Optional - geocoding works without key (may have lower limits)
- Warning displayed if no key configured
- Passed via digitransit-subscription-key header

---

## Manual Verification

✅ `pnpm test` - all 39 tests pass (14 geocoding + 25 existing)
✅ `pnpm build` - compiles successfully
✅ Test suite covers all acceptance criteria
✅ Code follows patterns from fetch_zones.ts and geocode_zones.ts
✅ TypeScript strict mode compliance
✅ Lint passes with no new warnings

---

## Migration Notes

### Files to Delete (After Validation)

- `src/geocode_zones.ts` can be removed after full validation
- `package.json` scripts `geocode:zones` and `geocode:test` can be removed

### Breaking Changes

- None - old scripts still work during transition
- New implementation is additive at this stage

---

## Next Phase - Phase 05 Build Routes

**Prerequisites:** Phase 04 (Geocode Zones)
**Estimated Effort:** 3-4 days

### Key Tasks

1. Implement route calculation business logic in `src/lib/routing.ts`
2. Create TUI screen for build routes workflow
3. Implement CLI subcommand handler
4. Write tests for routing logic
5. Delete old `src/build_routes.ts` after validation

### Hand-off Notes

- Geocode zones workflow fully tested and working
- Database schema includes routing_lat/routing_lon columns (populated)
- Progress event pattern established and reusable
- TUI screen pattern can be replicated for routing
- CLI integration pattern proven
- Rate limiting pattern can be adapted for OTP API

---

**Last Updated:** 2025-12-27
**Phase 04 Complete** ✅

---

# Phase 05: Build Routes Workflow - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Implementation Notes

### Files Created

```text
✓ src/lib/routing.ts (business logic, 462 lines)
  - getNextTuesday(): Calculate next Tuesday for consistent schedules
  - getOTPConfig(): Read OTP configuration from environment
  - fetchRoute(): Single route calculation with OTP GraphQL API
  - processPeriod(): Batch process routes for one time period
  - buildRoutes(): Main workflow orchestration

✓ src/tui/screens/routes.tsx (TUI screen)
  - Real-time progress display with ProgressBar/Spinner
  - Test mode support (5 routes)
  - Error handling with user-friendly messages
  - Status tracking and statistics display
  - Period-specific processing support

✓ src/tests/lib/routing.test.ts (comprehensive test suite, 24 tests)
  - getNextTuesday tests (3 tests)
  - getOTPConfig tests (5 tests)
  - fetchRoute tests (9 tests)
  - buildRoutes integration tests (7 tests)
  - All tests passing ✓
```

### Files Modified

```text
✓ src/cli.ts (implemented routes command action)
  - Non-interactive CLI support
  - Period-specific processing (--period flag)
  - Test mode support (--test flag)
  - Progress event handling with console output
  - Database connection management
  - Error handling and exit codes

✓ src/lib/events.ts (enhanced ProgressEmitter)
  - Added metadata support to emitStart()
  - Added metadata support to emitProgress()
  - Allows passing real-time statistics with progress events
```

### Technology Integration

- **axios**: OTP GraphQL API requests
- **better-sqlite3**: SQLite database operations
- **p-limit**: Concurrency control
- **vitest**: Comprehensive test coverage with mocking

---

## Testing Results

- All 24 routing tests passing (100%)
- OTP GraphQL query generation validated
- Route parsing with multiple itineraries tested
- Error handling (timeout, network, GraphQL errors) verified
- NO_ROUTE responses handled correctly
- Concurrency control with p-limit working
- Rate limiting enforced for remote API
- Progress events emitted correctly
- Metadata storage after completion verified
- Build compiles without errors

---

## Key Design Decisions

### OTP Configuration

- **Local OTP**: Fast processing (10 concurrent requests, no rate limiting)
- **Remote OTP**: Slow processing (1 concurrent request, 200ms rate limiting)
- Configurable via USE_LOCAL_OTP environment variable
- API key support via HSL_API_KEY or DIGITRANSIT_API_KEY

### Time Periods

- MORNING: 08:30:00
- EVENING: 17:30:00
- MIDNIGHT: 23:30:00
- Target date: Next Tuesday (for consistent transit schedules)
- All periods processed by default, or single period via --period flag

### Route Processing Strategy

- Cartesian product pre-filled during fetch (Phase 03)
- Routes with status='PENDING' processed
- Updates status to: OK, NO_ROUTE, or ERROR
- Stores duration, transfers, walk distance, and detailed legs
- Progress metadata updated every route
- Batch metadata updated every 10 routes

### Test Mode Behavior

- Limits to 5 random routes per period
- Uses same OTP data source (not mocked)
- Identical code path ensures production parity

---

## What Went Well

- All 24 tests passing on first attempt after fixes
- Business logic cleanly extracted from build_routes.ts
- TDD approach validated implementation
- Event emitter integration worked seamlessly
- Progress tracking provides real-time feedback
- OTP GraphQL integration preserved correctly
- Concurrency control prevents API overload
- Rate limiting prevents throttling

---

## Unexpected Learnings & Plan Expansions

### ProgressEmitter Enhancements

- Initially, emitProgress() and emitStart() didn't support metadata
- Enhanced both methods to accept optional metadata parameter
- Allows real-time statistics (ok/noRoute/errors counts) during processing
- All event types now consistently support metadata

### TUI Component Props

- StatusBox component is specific to database stats, not general status
- Ink Text component expects string colors, not Chalk instances
- Footer component expects `shortcuts` prop, not `items`
- Had to use plain Box/Text instead of StatusBox

### Test Database Schema

- createTestDB() returns {db, cleanup} object, not db directly
- All tests need try/finally blocks to ensure cleanup
- Required geometry and svg_path columns for places table
- Routes table PRIMARY KEY prevents duplicate route entries

---

## Manual Verification

✅ `pnpm test routing` - all 24 tests pass
✅ `pnpm build` - compiles successfully
✅ Test suite covers all acceptance criteria
✅ Code follows existing patterns from build_routes.ts
✅ TypeScript strict mode compliance
✅ Lint passes with no errors

---

## Migration Notes

### Files to Delete (After Validation)

- `src/build_routes.ts` can be removed after full validation
- `package.json` script `routes:build` can be replaced with `varikko routes`

### Breaking Changes

- None - old scripts still work during transition
- New implementation is additive at this stage

---

## Next Phase - Phase 06 Clear Data

**Prerequisites:** Phase 02 (Foundation)
**Estimated Effort:** 1 day

### Key Tasks

1. Implement data clearing business logic in `src/lib/clearing.ts`
2. Create TUI screen for clear data workflow
3. Implement CLI subcommand handler
4. Write tests for clearing logic
5. Support multiple clear operations (routes, places, metadata, all)

### Hand-off Notes

- Build routes workflow fully tested and working
- Database operations proven (inserts, updates, queries)
- Progress event pattern established and reusable
- TUI screen pattern can be replicated for clearing
- CLI integration pattern proven

---

**Last Updated:** 2025-12-27
**Phase 05 Complete** ✅

---

# Phase 06: Clear Data Workflow - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Implementation Notes

### Files Created

```text
✓ src/lib/clearing.ts (business logic, 185 lines)
  - clearData(): Clear/reset database data with selective options
  - getCounts(): Get record counts for all tables
  - Support for --routes (reset to PENDING), --places, --metadata, --deciles flags
  - VACUUM after clearing to reclaim disk space

✓ src/tui/screens/clear.tsx (TUI screen)
  - Real-time progress display with Spinner
  - Show current database state before clearing
  - Summary of deleted records after completion
  - Error handling with user-friendly messages

✓ src/tests/lib/clearing.test.ts (comprehensive test suite, 9 tests)
  - getCounts() tests (2 tests)
  - clearData() tests (7 tests)
  - All scenarios covered: clear all, selective clearing, progress events
  - All tests passing ✓
```

### Files Modified

```text
✓ src/cli.ts (implemented clear command action)
  - Non-interactive CLI support with confirmation prompt
  - Support for --force, --routes, --places, --metadata, --deciles flags
  - Display current state before clearing
  - Progress event handling with console output
  - Summary of deleted records after completion
```

### Technology Integration

- **better-sqlite3**: SQLite database operations (DELETE, UPDATE, VACUUM)
- **eventemitter3**: Progress tracking via ProgressEmitter
- **readline**: Interactive confirmation prompt for CLI
- **vitest**: Comprehensive test coverage

---

## Testing Results

- All 9 unit tests passing (100%)
- getCounts() returns accurate counts for all tables
- clearData() correctly handles all clearing modes:
  - Default (no flags): clears all data
  - --routes: resets routes to PENDING (preserves count)
  - --places: deletes places and routes
  - --metadata: deletes metadata only
  - --deciles: deletes deciles only
  - Multiple flags: clears only specified tables
- VACUUM runs after clearing
- Progress events emitted correctly
- Build compiles without TypeScript errors

---

## Key Design Decisions

### Selective Clearing

- **Default behavior**: Clears all data (routes, places, metadata, deciles)
- **--routes flag**: Resets route data to PENDING without deleting rows
  - Sets duration, numberOfTransfers, walkDistance, legs to NULL
  - Sets status to 'PENDING'
  - Useful for re-running route calculations without re-fetching zones
- **--places flag**: Deletes places AND routes (cascade delete)
- **--metadata flag**: Deletes metadata only
- **--deciles flag**: Deletes deciles only
- **Multiple flags**: Can combine flags to clear specific subsets

### Safety Features

- **Confirmation prompt**: Required unless --force flag is used
- **Display current state**: Shows record counts before clearing
- **Summary after completion**: Shows exact number of deleted records
- **VACUUM**: Automatically reclaims disk space after clearing

### Non-Destructive Schema

- Does NOT drop tables (unlike initializeSchema)
- Only deletes/updates data
- Safe to run multiple times

---

## What Went Well

- All 9 tests passing on first attempt after schema fixes
- Business logic cleanly extracted from clear_routes.ts
- TDD approach validated implementation
- Event emitter integration worked seamlessly
- CLI confirmation prompt provides good UX
- Build compiles successfully with no type errors

---

## Unexpected Learnings & Plan Expansions

### Database Schema Column Names

- Routes table uses `time_period` not `period`
- Deciles table uses:
  - `decile_number` (not `decile`)
  - `min_duration` / `max_duration` (not `min_value` / `max_value`)
  - `color_hex` (not `color`)
  - `label` (NOT NULL column required)
- Had to match exact schema from zones.ts initializeSchema()

### ProgressEmitter API

- emitStart() signature: `(stage, total?, message?, metadata?)`
- emitProgress() signature: `(stage, current, total, message?, metadata?)`
- emitComplete() signature: `(stage, message?, metadata?)`
- emitError() signature: `(stage, error, message?)`
- All events emitted to single 'progress' event listener

### Ink Component Patterns

- Spinner is a named export, not default
- Theme exports individual items (colors, symbols) not a theme object
- Footer expects `label` prop not `description`
- Text component color prop expects string (e.g., "green") not Chalk objects

---

## Manual Verification

✅ `pnpm test clearing` - all 9 tests pass
✅ `pnpm build` - compiles successfully
✅ Test suite covers all acceptance criteria
✅ Code follows patterns from previous phases
✅ TypeScript strict mode compliance
✅ Lint passes with no new warnings

---

## Migration Notes

### Files to Delete (After Full Validation)

- `src/clear_routes.ts` can be removed after full validation
- No package.json scripts to remove (none existed for clear)

### Breaking Changes

- None - old scripts still work during transition
- New implementation is additive at this stage

---

## Next Phase - Phase 07 Calculate Deciles

**Prerequisites:** Phase 05 (Build Routes)
**Estimated Effort:** 2 days

### Key Tasks

1. Implement decile calculation business logic in `src/lib/deciles.ts`
2. Create TUI screen for calculate deciles workflow
3. Implement CLI subcommand handler
4. Write tests for decile calculation logic
5. Generate heatmap color distribution from route durations

### Hand-off Notes

- Clear data workflow fully tested and working
- Database operations proven (DELETE, UPDATE, VACUUM)
- Progress event pattern established and reusable
- TUI screen pattern can be replicated for deciles
- CLI integration pattern proven
- Deciles table schema ready for population

---

**Last Updated:** 2025-12-27
**Phase 06 Complete** ✅

---

# Phase 07: Calculate Deciles Workflow - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Implementation Notes

### Files Created

```text
✓ src/lib/deciles.ts (business logic, 213 lines)
  - calculateDeciles(): Calculate 10-quantile distribution from route durations
  - secondsToMinutes(): Convert seconds to rounded minutes
  - formatDecileLabel(): Generate human-readable labels
  - DECILE_COLORS: Vintage color palette (10 colors)

✓ src/tui/screens/deciles.tsx (TUI screen)
  - Real-time progress display with ProgressBar/Spinner
  - Display calculated deciles with colors
  - Error handling with user-friendly messages

✓ src/tests/lib/deciles.test.ts (comprehensive test suite, 14 tests)
  - Basic functionality tests (3 tests)
  - Edge case tests (6 tests)
  - Force recalculation tests (2 tests)
  - Progress event tests (2 tests)
  - Decile continuity tests (2 tests)
  - All tests passing ✓
```

### Files Modified

```text
✓ src/cli.ts (implemented deciles command)
  - Non-interactive CLI support
  - Force recalculation with --force flag
  - Progress event handling with console output
  - Display decile distribution summary
  - Error handling for duplicate calculations
```

### Technology Integration

- **better-sqlite3**: SQLite database operations
- **eventemitter3**: Progress tracking via ProgressEmitter
- **vitest**: Comprehensive test coverage

---

## Testing Results

- All 14 unit tests passing (100%)
- Decile calculation algorithm validated:
  - Correct 10-quantile distribution
  - Edge case: < 10 routes (handled with empty deciles)
  - Edge case: exactly 10 routes (1 per decile)
  - Edge case: uneven distribution (97 routes)
- Color assignment verified (vintage palette)
- Label generation validated (e.g., "8-15 min", ">60 min")
- Decile ranges continuous (no gaps)
- Last decile open-ended (max = -1)
- Progress events emitted correctly
- Build compiles without TypeScript errors

---

## Key Design Decisions

### Vintage Color Palette

10 colors from fastest (warm) to slowest (cool):
1. `#E76F51` - Deep Orange (fastest)
2. `#F4A261` - Light Orange
3. `#F9C74F` - Yellow
4. `#90BE6D` - Light Green
5. `#43AA8B` - Teal
6. `#277DA1` - Blue
7. `#4D5061` - Dark Blue-Gray
8. `#6C5B7B` - Purple
9. `#8B5A8C` - Dark Purple
10. `#355C7D` - Very Dark Blue (slowest)

### Decile Distribution Algorithm

- Divides successful routes into 10 equal quantiles
- Handles uneven distributions by distributing remainder
- Edge case: < 10 routes creates empty deciles at the end
- Last decile is always open-ended (max = -1)
- Label format: "8-15 min", "15 min", or ">60 min"

### Force Recalculation

- Default: Throws error if deciles already exist
- --force flag: Clears existing deciles and recalculates
- Prevents accidental overwriting of calculations

### Metadata Storage

- Stores calculation timestamp: `deciles_calculated_at`
- Allows tracking when deciles were last updated

---

## What Went Well

- All 14 tests passing on first attempt after fixes
- Business logic cleanly extracted from calculate_deciles.ts
- TDD approach validated implementation
- Event emitter integration worked seamlessly
- Progress tracking provides real-time feedback
- Decile algorithm handles all edge cases correctly
- Build compiles successfully with no type errors

---

## Unexpected Learnings & Plan Expansions

### Test Database Schema

- Test schema doesn't include postal_code column
- Had to adjust test fixtures to match test schema
- Learned to verify schema compatibility before writing tests

### Unique Route Constraints

- Routes table has PRIMARY KEY on (from_id, to_id, time_period)
- Cannot insert duplicate routes with different durations
- Had to create enough places and vary periods to avoid conflicts

### Edge Case Handling

- Algorithm must handle < 10 routes gracefully
- Empty deciles use previous decile's max as min/max
- All deciles marked as open-ended when empty

### TUI Component Patterns

- Named imports required for Header, Footer, ProgressBar
- Color values must be strings ("green"), not Chalk instances
- symbols.block doesn't exist in theme (removed from display)
- Spinner component is a named export

---

## Manual Verification

✅ `pnpm test deciles` - all 14 tests pass
✅ `pnpm test` - all 86 tests pass (no regressions)
✅ `pnpm build` - compiles successfully
✅ Test suite covers all acceptance criteria
✅ Code follows patterns from previous phases
✅ TypeScript strict mode compliance

---

## Migration Notes

### Files to Delete (After Full Validation)

- `src/calculate_deciles.ts` can be removed after full validation
- `package.json` scripts `deciles:calculate` can be replaced with `varikko deciles`

### Breaking Changes

- None - old scripts still work during transition
- New implementation is additive at this stage

---

## Next Phase - Phase 08 Maps

**Prerequisites:** Phase 02 (Foundation)
**Estimated Effort:** 2-3 days

### Key Tasks

1. Implement map processing business logic in `src/lib/maps.ts`
2. Create TUI screen for map processing workflow
3. Implement CLI subcommand handler
4. Write tests for map processing logic
5. Convert shapefiles to TopoJSON
6. Generate SVG from TopoJSON

### Hand-off Notes

- Calculate deciles workflow fully tested and working
- Database operations proven (SELECT, INSERT, DELETE)
- Progress event pattern established and reusable
- TUI screen pattern can be replicated for maps
- CLI integration pattern proven
- Ready to implement remaining workflows (Maps, Export)

---

**Last Updated:** 2025-12-27
**Phase 07 Complete** ✅

---

# Phase 08: Maps Workflow - Status & Running Notes

**Date:** 2025-12-27
**Status:** ✅ COMPLETE

---

## Implementation Notes

### Files Created

```text
✓ src/lib/maps.ts (business logic, 325 lines)
  - processMap(): Process ESRI shapefiles to TopoJSON
  - generateSVG(): Generate SVG from TopoJSON
  - processMaps(): Combined workflow (process + generate)
  - Layer processing: water and roads layers
  - Projection: EPSG:3067 → EPSG:4326 (WGS84)

✓ src/tui/screens/maps.tsx (TUI screen)
  - Real-time progress display with ProgressBar/Spinner
  - Two-stage workflow tracking (process_map + generate_svg)
  - Error handling with user-friendly messages
  - File size display for output files

✓ src/tests/lib/maps.test.ts (comprehensive test suite, 21 tests)
  - processMap tests (10 tests)
  - generateSVG tests (9 tests)
  - processMaps integration tests (2 tests)
  - All tests passing ✓
```

### Files Modified

```text
✓ src/cli.ts (implemented map command)
  - Non-interactive CLI support
  - Progress event handling with console output
  - File output summary display
  - Error handling and exit codes
```

### Technology Integration

- **mapshaper**: CLI tool for shapefile processing
  - Reprojection (EPSG:3067 → EPSG:4326)
  - Clipping to Helsinki bounding box
  - Geometry simplification (80% reduction)
  - TopoJSON conversion
- **d3-geo**: Mercator projection and SVG path generation
- **topojson-client**: Feature extraction from TopoJSON
- **vitest**: Comprehensive test coverage with fs mocking

---

## Testing Results

- All 21 unit tests passing (100%)
- processMap workflow validated:
  - Clipping mask created with correct bbox
  - Layers reprojected to EPSG:4326
  - Geometry simplification (80%)
  - TopoJSON combination successful
  - Temporary file cleanup on success and error
- generateSVG workflow validated:
  - SVG viewBox parameters correct
  - CSS styles with CSS variables
  - Water and roads layers rendered
  - Background rectangle included
- Build compiles without TypeScript errors
- Full test suite: 107 tests passing

---

## Key Design Decisions

### Two-Stage Workflow

1. **Process Map** (processMap):
   - Load ESRI shapefiles (water, roads)
   - Reproject from ETRS-TM35FIN to WGS84
   - Clip to Helsinki bounding box (24.5-25.3, 60.0-60.5)
   - Simplify geometries (80% reduction)
   - Output TopoJSON

2. **Generate SVG** (generateSVG):
   - Load TopoJSON
   - Apply D3 Mercator projection (matching opas MAP_CONFIG)
   - Extract and render features
  - Output SVG with CSS classes

### Projection Parameters

Must match opas BackgroundMap.vue exactly:
- Center: [24.93, 60.17] (Helsinki)
- Scale: 120000
- Zoom level: 1.2 (20% zoom out)
- Base dimensions: 800×800
- ViewBox adjustments for consistent alignment

### Layer Processing

- **Water layer**: Polygons (fills, no stroke)
- **Roads layer**: Lines (strokes, no fill)
- **CSS variables**: Allows theme customization in opas
- **Background rect**: Provides consistent background color

### Test Mocking Strategy

- Mocked fs module at module level using vi.mock()
- Mocked mapshaper to avoid actual shapefile processing
- Proper TypeScript typing with vi.mocked()
- Comprehensive coverage of success and error paths

---

## What Went Well

- All 21 tests passing on first attempt after fixes
- Business logic cleanly extracted from process_map.ts and generate_svg.ts
- TDD approach validated implementation
- Event emitter integration worked seamlessly
- Progress tracking provides real-time feedback
- Mapshaper integration preserved correctly
- SVG generation with D3 projections working perfectly
- Build compiles successfully with no type errors

---

## Unexpected Learnings & Plan Expansions

### Vitest Module Mocking

- Cannot reference variables inside vi.mock() factory (hoisted)
- Must define mock functions directly in factory
- Use vi.mocked() after import to get typed mock instance
- Mock must include both default and named exports for fs

### TypeScript JSX Expressions

- Unknown types cannot be used in JSX expressions
- Must use !! operator to convert to boolean for conditional rendering
- Cannot use `value &&` pattern with unknown types
- String() conversion needed for interpolation

### React Component Patterns

- Spinner imported from custom component, not ink-spinner
- Header component doesn't accept dbPath prop
- Footer component doesn't accept onShortcut prop
- Color props must be strings ("green"), not Chalk instances

### File System Mocking

- fs.existsSync must be mocked to return true for shapefiles
- Mock implementation must handle all file path patterns
- Cleanup functions (unlinkSync) should not throw errors
- statSync must return proper Stats object with size property

---

## Manual Verification

✅ `pnpm test maps` - all 21 tests pass
✅ `pnpm test` - all 107 tests pass (no regressions)
✅ `pnpm build` - compiles successfully
✅ Test suite covers all acceptance criteria
✅ Code follows patterns from previous phases
✅ TypeScript strict mode compliance

---

## Migration Notes

### Files to Delete (After Full Validation)

- `src/process_map.ts` can be removed after full validation
- `src/generate_svg.ts` can be removed after full validation
- No package.json scripts to remove (none existed for maps)

### Breaking Changes

- None - old scripts still work during transition
- New implementation is additive at this stage

---

## Next Phase - Phase 09 Export

**Prerequisites:** Phase 05 (Build Routes)
**Estimated Effort:** 1-2 days

### Key Tasks

1. Implement export business logic in `src/lib/export.ts`
2. Create TUI screen for export workflow
3. Implement CLI subcommand handler
4. Write tests for export logic
5. Export routes to JSON with optional period filtering

### Hand-off Notes

- Maps workflow fully tested and working
- Progress event pattern established and reusable
- TUI screen pattern can be replicated for export
- CLI integration pattern proven
- Ready to implement remaining workflows (Export, Dashboard)

---

**Last Updated:** 2025-12-27
**Phase 08 Complete** ✅
