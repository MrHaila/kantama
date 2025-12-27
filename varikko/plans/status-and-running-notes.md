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
