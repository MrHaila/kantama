# Varikko CLI Refactor Plan

## Executive Summary

This plan outlines a phased refactor to remove the TUI (Text User Interface) from Varikko and replace it with high-quality CLI commands. The goal is to simplify the codebase, improve testability, and reduce maintenance burden while preserving all business logic and enhancing visual output quality.

**Current State**:

- TUI: 1,524 lines (Ink/React)
- Business Logic: 3,387 lines (pure TypeScript, well-tested)
- Tests: 3,328 lines (80%+ coverage on business logic)
- Clean separation already exists between UI and business logic

**Target State**:

- No TUI dependencies (removes ~8 npm packages)
- Enhanced CLI with rich visual feedback
- Default command shows comprehensive status
- All commands easily testable
- ~1,500 fewer lines of UI code to maintain

---

## Current Architecture Analysis

### Excellent Separation ✓

The codebase already has **perfect separation** between business logic and UI:

```
Business Logic (lib/)          UI Layer (tui/)           CLI Layer (cli.ts)
┌─────────────────────┐       ┌──────────────────┐     ┌─────────────────┐
│ • zones.ts          │       │ • dashboard.tsx  │     │ • Commander     │
│ • geocoding.ts      │       │ • screens/*.tsx  │     │ • Basic output  │
│ • routing.ts        │◄──────┤ • components/    │     │ • Event logging │
│ • time-buckets.ts   │       │ • theme.ts       │     └─────────────────┘
│ • maps.ts           │       └──────────────────┘              ▲
│ • clearing.ts       │                                         │
└─────────────────────┘                                         │
         ▲                                                      │
         │                                                      │
         └──────────────────────────────────────────────────────┘
                    ProgressEmitter (events.ts)
```

**Key Insight**: Business logic requires **ZERO changes**. Only UI and entry point need modification.

### What TUI Currently Provides

1. **Dashboard** (dashboard.tsx):
   - Database status overview (zones, routes, time buckets)
   - Menu with keyboard shortcuts
   - Flexible limit/zones options via CLI flags
   - Visual hierarchy with box-drawing characters

2. **Screen Components** (screens/\*.tsx):
   - Real-time progress bars
   - Spinning loading indicators
   - Success/error states with colors
   - Statistics counters (OK/No Route/Errors)
   - Clear visual feedback during long operations

3. **StatusBox Component**:
   - Zones count
   - Routes breakdown by status (OK/PENDING/NO_ROUTE/ERROR)
   - Time buckets calculation status
   - Last fetch timestamp

### What CLI Currently Provides

1. **Commands** (cli.ts):
   - All business logic commands exist
   - Basic progress logging (text messages)
   - Summary statistics after completion
   - Minimal visual formatting

2. **Missing**:
   - Rich visual feedback (progress bars, colors)
   - Real-time statistics during operations
   - Comprehensive status command
   - Visual hierarchy and formatting

---

## Refactor Strategy

### Phases Overview

The refactor is divided into **5 phases** with testing/linting checkpoints between each:

1. **Phase 1**: Create CLI output formatting utilities
2. **Phase 2**: Implement comprehensive `status` command
3. **Phase 3**: Enhance all command outputs with rich formatting
4. **Phase 4**: Remove TUI code and dependencies
5. **Phase 5**: Final cleanup and documentation

Each phase is designed to:

- Be independently testable
- Allow running tests/linting between phases
- Preserve all business logic unchanged
- Incrementally improve CLI quality

---

## Detailed Phase Plans

### **Phase 1: CLI Output Utilities**

**Goal**: Create reusable formatting utilities for high-quality CLI output

**New Files**:

- `src/lib/cli-format.ts` - Terminal formatting utilities

**Features to Implement**:

1. **Color and Symbol Utilities**:

   ```typescript
   - Status symbols (✓, ✗, ⚠, ⊘, ➜)
   - Color helpers (success, error, warning, info, dim)
   - Box-drawing characters (for visual hierarchy)
   ```

2. **Progress Reporting**:

   ```typescript
   - Simple ASCII progress bar: [=====>    ] 50% (123/456)
   - Percentage calculator
   - ETA calculator (optional)
   - Statistics line formatter: "OK: 123 | No Route: 45 | Errors: 2"
   ```

3. **Table Formatting**:

   ```typescript
   - Simple aligned columns
   - Header separator
   - Numeric formatting (1,234)
   ```

4. **Status Display**:
   ```typescript
   - Section headers with borders
   - Key-value pairs with alignment
   - Multi-line status blocks
   ```

**Dependencies to Add**:

- `picocolors` (tiny color library, 1.1KB)
- OR use ANSI escape codes directly (zero dependencies)

**Test Coverage**:

- Unit tests for all formatting functions
- Snapshot tests for visual output
- Color stripping for CI environments

**Testing Checkpoint**:

```bash
pnpm test                    # Run all tests
pnpm exec tsc --noEmit       # Type check
pnpm exec eslint src/        # Lint
```

---

### **Phase 2: Status Command**

**Goal**: Implement the comprehensive `status` command as the default action

**Files to Modify**:

- `src/cli.ts` - Implement status command action
- `src/lib/db.ts` - Enhance `getDBStats()` if needed

**Features**:

1. **Database Overview**:

   ```
   ╭─────────────────────────────────────────╮
   │          VARIKKO DATABASE STATUS        │
   ╰─────────────────────────────────────────╯

   Database: /path/to/varikko.db
   Size: 45.2 MB
   Last Modified: 2025-01-15 14:23:45
   ```

2. **Zones Status**:

   ```
   📍 ZONES
      Total: 1,234 postal codes
      Coverage: Helsinki, Espoo, Vantaa
   ```

3. **Routes Status**:

   ```
   🚌 ROUTES (per period: MORNING, EVENING, MIDNIGHT)
      Total Combinations: 3,702 routes
      ✓ Calculated:       2,845 (76.8%)
      ⊘ Pending:          857  (23.2%)
      ⊘ No Route:         45   (1.2%)
      ✗ Errors:           12   (0.3%)
   ```

4. **Time Buckets Status**:

   ```
   🗺️  TIME BUCKETS
      Status: ✓ Calculated (6 buckets)
      Range: 14-89 minutes
   ```

5. **Next Steps Suggestions**:

   ```
   💡 NEXT STEPS
      1. Run 'varikko routes' to calculate pending routes
      2. Run 'varikko time-buckets' to generate heatmap data
   ```

6. **Error Preview** (if errors exist):
   ```
   ⚠️  RECENT ERRORS (5 most recent)
      • 00100 → 02100 (MORNING): Network timeout
      • 00200 → 02300 (EVENING): No route found
   ```

**Make it Default**:

- When user runs `varikko` (no args), show status instead of launching TUI
- Keep explicit `varikko status` command as well

**Test Coverage**:

- Test status output with various database states
- Test empty database
- Test partial completion states
- Test error display

**Testing Checkpoint**:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint src/
```

---

### **Phase 3: Enhance Command Outputs**

**Goal**: Add rich visual feedback to all existing commands

**Files to Modify**:

- `src/cli.ts` - Enhance all command action handlers

**For Each Command**:

1. **fetch**:

   ```
   🌍 FETCHING POSTAL CODE ZONES

   Mode: Test (5 zones only)
   Sources:
     • Helsinki WFS
     • Espoo WFS
     • Vantaa WFS

   Progress: [=========>    ] 60% (3/5)

   ✓ Zones fetched: 5
   ✓ Routes created: 25
   ✓ Duration: 12.3s
   ```

2. **geocode**:

   ```
   📍 GEOCODING ZONES

   API: Digitransit Geocoding API (authenticated)
   Mode: Full dataset

   Progress: [=====>        ] 45% (556/1234)
   Stats: ✓ 550 | ⚠ 6 fallbacks

   ✓ Successfully geocoded: 1,228 zones
   ⚠ Geometric fallback: 6 zones
   ✗ Failed: 0 zones
   ```

3. **routes**:

   ```
   🚌 CALCULATING ROUTES

   OTP: http://localhost:8080 (local)
   Concurrency: 10 requests
   Period: MORNING (09:00 departure)

   Progress: [==========>   ] 78% (2890/3702)
   Stats: ✓ 2,845 | ⊘ 45 no route | ✗ 12 errors
   ETA: ~5 minutes

   === SUMMARY ===
   ✓ Successful:     2,890 routes
   ⊘ No route found: 45 routes
   ✗ Errors:         12 routes

   💡 Next: Run 'varikko time-buckets' to calculate heatmap data
   ```

4. **clear**:

   ```
   🗑️  CLEAR DATA

   Current Database State:
     Places: 1,234
     Routes: 3,702
     Metadata: 12
     Time Buckets: 6

   Target: Clear routes only

   ⚠️  Are you sure? (y/N)

   ✓ Cleared 3,702 routes (reset to PENDING)
   ```

5. **time-buckets**:

   ```
   📊 CALCULATING TIME BUCKETS

   Analyzing 2,890 successful routes...

   ✓ Time Buckets Created:
      Bucket 1: 14-24 min  (#1a9641) - 580 routes
      Bucket 2: 25-34 min  (#a6d96a) - 720 routes
      Bucket 3: 35-44 min  (#ffffbf) - 650 routes
      Bucket 4: 45-59 min  (#fdae61) - 540 routes
      Bucket 5: 60-74 min  (#d7191c) - 320 routes
      Bucket 6: 75-89 min  (#8b0000) - 80 routes

   💡 Buckets ready for heatmap visualization
   ```

6. **map**:

   ```
   🗺️  PROCESSING MAPS

   Source: data/maastokartta_esri/

   ✓ Converting water.shp → TopoJSON
   ✓ Converting roads.shp → TopoJSON
   ✓ Converting railways.shp → TopoJSON
   ✓ Converting ferries.shp → TopoJSON

   ✓ Generating SVG layers...
     • water.svg (234 KB)
     • roads.svg (567 KB)
     • railways.svg (89 KB)
     • ferries.svg (12 KB)

   ✓ Created background_map.json (1.2 MB)
   ✓ Created layers/manifest.json
   ```

**Enhanced Progress Listeners**:

Modify all event listeners to use the new formatting utilities:

```typescript
emitter.on('progress', (event) => {
  if (event.type === 'start') {
    showHeader(event.message);
  } else if (event.type === 'progress') {
    updateProgressBar(event.current, event.total, event.metadata);
  } else if (event.type === 'complete') {
    showSuccess(event.message);
  } else if (event.type === 'error') {
    showError(event.message, event.error);
  }
});
```

**Test Coverage**:

- Integration tests for each command
- Test output formatting
- Test error scenarios
- Test progress reporting

**Testing Checkpoint**:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint src/
```

---

### **Phase 4: Remove TUI**

**Goal**: Delete TUI code and dependencies

**Files to Delete**:

```
src/tui/                      # Delete entire directory (1,524 lines)
  ├── app.tsx
  ├── dashboard.tsx
  ├── theme.ts
  ├── components/
  └── screens/
```

**Files to Modify**:

1. **src/main.ts**:

   ```typescript
   // BEFORE (lines 41-54):
   async function main() {
     const command = await parseCLI();

     if (!command) {
       // Interactive mode - launch TUI
       process.env.TUI_MODE = 'true';
       const { render } = await import('ink');
       const React = await import('react');
       const { App } = await import('./tui/app');
       render(React.createElement(App));
     }
   }

   // AFTER:
   async function main() {
     const command = await parseCLI();

     // If no command, parseCLI() will run default status command
     // Nothing to do here - all commands execute via Commander
   }
   ```

2. **src/cli.ts**:

   ```typescript
   // Change default action from "return null" to "run status"
   program.action(() => {
     // Run status command
     const db = openDB();
     try {
       showStatus(db); // New function
     } finally {
       db.close();
     }
   });
   ```

3. **package.json**:

   ```json
   // REMOVE from dependencies:
   {
     "ink": "^6.6.0",           // DELETE
     "react": "^19.2.3",         // DELETE
     "cli-progress": "^3.12.0"   // DELETE (unused)
   }

   // REMOVE from devDependencies:
   {
     "chalk": "^5.6.2",                 // DELETE
     "ink-select-input": "^6.2.0",      // DELETE
     "ink-spinner": "^5.0.0",           // DELETE
     "ink-table": "^3.1.0",             // DELETE
     "ink-text-input": "^6.0.0",        // DELETE
     "@types/react": "^19.2.7",         // DELETE
     "@types/cli-progress": "^3.11.6"   // DELETE
   }

   // ADD (if using picocolors):
   {
     "picocolors": "^1.1.1"  // Optional, 1.1KB
   }
   ```

4. **Remove TUI references**:
   - Remove `TUI_MODE` environment variable checks
   - Simplify error handlers (no special TUI handling)
   - Update comments/documentation

**Testing Checkpoint**:

```bash
pnpm install                 # Update dependencies
pnpm test                    # All tests should pass
pnpm exec tsc --noEmit       # Type check
pnpm exec eslint src/        # Lint
pnpm build                   # Test build (if exists)
```

**Manual Testing**:

```bash
# Test all commands still work
pnpm dev                     # Should show status
pnpm dev status              # Should show status
pnpm dev fetch --limit 5        # Should work
pnpm dev geocode --limit 5      # Should work
pnpm dev routes --limit 10       # Should work
pnpm dev clear --force --routes
pnpm dev time-buckets
pnpm dev map
```

---

### **Phase 5: Final Cleanup**

**Goal**: Update tests, documentation, and package metadata

**Test Updates**:

1. **Update test descriptions** to reflect CLI-only nature:

   ```typescript
   // OLD: "should work in both CLI and TUI modes"
   // NEW: "should format CLI output correctly"
   ```

2. **Add CLI output tests**:

   ```typescript
   // New test file: src/tests/lib/cli-format.test.ts
   describe('CLI formatting', () => {
     it('should format progress bar correctly', () => {
       const bar = formatProgressBar(50, 100);
       expect(bar).toContain('[=====>');
     });

     it('should format status table correctly', () => {
       const table = formatStatusTable(mockStats);
       expect(table).toMatchSnapshot();
     });
   });
   ```

3. **Integration tests**:
   ```typescript
   // Test that commands produce expected output format
   describe('CLI commands', () => {
     it('status command shows all sections', () => {
       // Mock database, capture output
     });
   });
   ```

**Documentation Updates**:

1. **README.md**:

   ````markdown
   # Varikko Data Pipeline

   High-quality CLI for transit route calculation and heatmap generation.

   ## Installation

   ```bash
   pnpm install
   ```
   ````

   ## Usage

   ```bash
   # Show status (default)
   pnpm dev
   pnpm dev status

   # Run workflow
   pnpm dev fetch           # Fetch zones
   pnpm dev geocode         # Geocode zones
   pnpm dev routes          # Calculate routes
   pnpm dev time-buckets    # Generate heatmap buckets
   pnpm dev map             # Process shapefiles

   # Options
   pnpm dev fetch --limit 5    # Test mode (5 zones)
   pnpm dev routes --period MORNING
   pnpm dev clear --force --routes
   ```

   ## Commands
   - `status` - Show database status (default)
   - `init` - Initialize database schema
   - `fetch` - Fetch postal code zones
   - `geocode` - Geocode zones to routing addresses
   - `routes` - Calculate transit routes
   - `clear` - Clear/reset data
   - `time-buckets` - Calculate heatmap buckets
   - `map` - Process shapefiles to SVG/TopoJSON

   ```

   ```

2. **package.json**:

   ```json
   {
     "name": "varikko",
     "description": "Transit route calculation and heatmap generation CLI",
     "version": "3.0.0", // Bump major version (breaking change)
     "keywords": ["transit", "routing", "cli", "heatmap"],
     "bin": {
       "varikko": "./dist/main.js" // If building for distribution
     }
   }
   ```

3. **CHANGELOG.md** (new file):

   ```markdown
   # Changelog

   ## [3.0.0] - 2025-01-XX

   ### Breaking Changes

   - Removed TUI (Text User Interface)
   - Default command now shows status instead of launching interactive mode

   ### Added

   - Rich CLI output with colors, progress bars, and formatting
   - Comprehensive `status` command showing database state
   - Better progress reporting for long-running operations
   - Next-step suggestions in command output

   ### Removed

   - Ink/React dependencies (~8 packages)
   - TUI code (~1,500 lines)
   - Interactive mode

   ### Improved

   - Simpler codebase (easier to maintain)
   - Better testability (all output testable)
   - Faster startup (no React rendering)
   - Smaller bundle size
   ```

**Testing Checkpoint**:

```bash
pnpm test                    # Final test run
pnpm test:coverage           # Check coverage maintained
pnpm exec tsc --noEmit       # Type check
pnpm exec eslint src/        # Lint
```

---

## Testing Strategy

### Between Each Phase

Run the full test suite to ensure no regressions:

```bash
# Type safety
pnpm exec tsc --noEmit

# Linting
pnpm exec eslint src/

# Unit tests
pnpm test

# Coverage check
pnpm test:coverage

# Manual smoke tests
pnpm dev status
pnpm dev fetch --limit 5
```

### New Tests to Add

1. **Phase 1**: CLI formatting utilities
   - Unit tests for each formatter function
   - Snapshot tests for visual output
   - Color stripping for CI environments

2. **Phase 2**: Status command
   - Test with empty database
   - Test with partial data
   - Test with complete data
   - Test error preview display

3. **Phase 3**: Enhanced commands
   - Test progress bar updates
   - Test statistics formatting
   - Test error displays
   - Test completion summaries

### Existing Tests (Preserved)

All existing business logic tests remain **unchanged**:

- `zones.test.ts` (586 lines)
- `routing.test.ts` (602 lines)
- `geocoding.test.ts` (347 lines)
- `maps.test.ts` (839 lines)
- `time-buckets.test.ts` (267 lines)
- `clearing.test.ts` (237 lines)
- `db.test.ts` (39 lines)
- `events.test.ts` (43 lines)

**Total coverage should remain 80%+** (excluding UI code)

---

## Risk Assessment

### Low Risk ✓

1. **Business Logic Changes**: NONE
   - All `lib/*.ts` files remain unchanged
   - Event system remains unchanged
   - Database operations remain unchanged

2. **Test Coverage**: Preserved
   - All existing tests pass without modification
   - New tests added for CLI formatting only

3. **Functionality**: Preserved
   - All commands continue to work
   - Same input → same output (better formatted)

### Medium Risk ⚠

1. **Visual Output Changes**:
   - CLI output will look different (better)
   - May affect any scripts that parse output
   - Mitigation: Add `--json` flag for machine-readable output (future enhancement)

2. **User Workflow Changes**:
   - No more interactive TUI menu
   - Users must know command names
   - Mitigation: Clear help text, status command shows next steps

### Mitigation Strategies

1. **Phased Approach**: Test after each phase
2. **Comprehensive Testing**: Run full suite between phases
3. **Manual Verification**: Smoke test all commands
4. **Documentation**: Clear migration guide for users
5. **Version Bump**: 3.0.0 signals breaking change

---

## Success Criteria

### Functional Requirements ✓

- [ ] All commands work without TUI
- [ ] Status command shows comprehensive overview
- [ ] Progress bars display during long operations
- [ ] Error messages are clear and actionable
- [ ] Success messages confirm completion
- [ ] Next-step suggestions guide workflow

### Non-Functional Requirements ✓

- [ ] All tests pass (80%+ coverage)
- [ ] Type checking passes (no errors)
- [ ] Linting passes (no errors)
- [ ] Build succeeds
- [ ] No TUI dependencies in package.json
- [ ] Codebase reduced by ~1,500 lines
- [ ] Startup time faster (no React rendering)

### Quality Requirements ✓

- [ ] Output is visually clear and hierarchical
- [ ] Colors used meaningfully (success=green, error=red, etc.)
- [ ] Progress reporting is informative
- [ ] Error messages include context and suggestions
- [ ] Command help is comprehensive

---

## Timeline Estimate

Based on the phased approach, assuming testing between each phase:

- **Phase 1** (CLI utilities): 2-3 hours
- **Phase 2** (Status command): 2-3 hours
- **Phase 3** (Enhance commands): 3-4 hours
- **Phase 4** (Remove TUI): 1 hour
- **Phase 5** (Cleanup & docs): 2 hours

**Total**: 10-13 hours of focused development

**Checkpoints**: 4 testing checkpoints (30 min each) = 2 hours

**Grand Total**: ~12-15 hours

---

## Dependencies

### To Remove (Phase 4)

```json
{
  "ink": "^6.6.0", // TUI framework
  "react": "^19.2.3", // React (for Ink)
  "cli-progress": "^3.12.0", // Unused
  "chalk": "^5.6.2", // Colors (devDep)
  "ink-select-input": "^6.2.0", // TUI component
  "ink-spinner": "^5.0.0", // TUI component
  "ink-table": "^3.1.0", // TUI component
  "ink-text-input": "^6.0.0", // TUI component
  "@types/react": "^19.2.7", // React types
  "@types/cli-progress": "^3.11.6" // Unused types
}
```

**Total Removed**: 10 packages (~15 MB node_modules)

### To Add (Phase 1)

**Option 1**: Use native ANSI codes (zero dependencies)
**Option 2**: Use `picocolors` (1.1 KB, faster than chalk)

```json
{
  "picocolors": "^1.1.1" // Tiny color library (optional)
}
```

**Recommendation**: Start with ANSI codes, add picocolors only if needed

### To Keep

All business logic dependencies remain:

- `better-sqlite3` (database)
- `axios` (HTTP)
- `@turf/turf` (geospatial)
- `d3-geo` (projections)
- `topojson-client` (TopoJSON)
- `commander` (CLI parsing - REQUIRED!)
- etc.

---

## Open Questions

1. **Color Support**: Should we auto-detect TTY and disable colors in non-interactive mode?
   - Recommendation: Yes, check `process.stdout.isTTY`

2. **JSON Output**: Should we add `--json` flag for machine-readable output?
   - Recommendation: Add in future (not part of this refactor)

3. **Verbose Mode**: Should we add `--verbose` flag for detailed logging?
   - Recommendation: Add in future (not part of this refactor)

4. **Progress Bar Library**: Use library or custom implementation?
   - Recommendation: Custom implementation (simpler, no dependencies)

5. **Database Path**: Should status command show database file path/size?
   - Recommendation: Yes, useful diagnostic info

---

## Rollback Plan

If issues arise during refactor:

1. **Git Branches**: Each phase is a separate commit
2. **Rollback**: `git reset --hard <phase-N-commit>`
3. **TUI Preservation**: Keep TUI code in separate branch for reference
4. **Gradual Migration**: Can pause after Phase 3 (TUI + enhanced CLI coexist)

---

## Post-Refactor Opportunities

After TUI removal, consider these enhancements:

1. **JSON Output Mode**: `--json` flag for scripting
2. **Verbose Logging**: `--verbose` flag for debugging
3. **Quiet Mode**: `--quiet` flag for minimal output
4. **CI/CD Mode**: Auto-detect CI environment, adjust output
5. **Watch Mode**: `varikko watch` to monitor database changes
6. **Validation Command**: `varikko validate` to check data integrity
7. **Export Command**: `varikko export` to export data as GeoJSON
8. **Interactive Prompts**: Better confirmation dialogs (using inquirer)

---

## Appendix: Command Examples

### Current CLI Output (Before)

```bash
$ pnpm dev routes --limit 10

Starting route calculation...
Progress: 5/5 (100%) - OK: 5, No Route: 0, Errors: 0
✓ Complete

=== Route Calculation Summary ===
Total processed: 5
✓ Successful: 5
⊘ No route found: 0
✗ Errors: 0
```

### Enhanced CLI Output (After)

```bash
$ pnpm dev routes --limit 10

🚌 CALCULATING ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Config:
  • OTP: http://localhost:8080 (local)
  • Concurrency: 10 requests
  • Period: MORNING (09:00 departure)
  • Mode: Test (5 routes only)

Progress: [====================] 100% (5/5)
Stats: ✓ 5 | ⊘ 0 no route | ✗ 0 errors

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Successful:     5 routes
⊘ No route found: 0 routes
✗ Errors:         0 routes

Duration: 8.2s

💡 Next: Run 'varikko time-buckets' to calculate heatmap data
```

---

## Conclusion

This refactor plan provides a **low-risk, high-value** path to simplifying Varikko:

**Benefits**:

- ✓ Simpler codebase (-1,500 lines, -10 packages)
- ✓ Better testability (all output is testable)
- ✓ Easier maintenance (no TUI framework updates)
- ✓ Faster startup (no React rendering)
- ✓ Better CLI output (richer visual feedback)
- ✓ Same business logic (zero changes)
- ✓ Same test coverage (80%+)

**Approach**:

- ✓ Phased implementation (5 phases)
- ✓ Testing checkpoints (after each phase)
- ✓ Incremental improvements (each phase adds value)
- ✓ Low risk (business logic unchanged)
- ✓ Reversible (git commits for each phase)

**Timeline**: ~12-15 hours of focused development

**Ready to proceed?** Start with Phase 1 (CLI utilities) and test after each phase.
