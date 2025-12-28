# Varikko CLI Refactor Plan

## Goal
Replace the Ink/React TUI with high-quality CLI commands. The default command (no args) shows comprehensive status. Each command is easily testable, with less code to maintain.

## Current State Analysis

### Architecture Strengths (Already in Place)
- **Perfect separation**: Business logic in `src/lib/` has zero TUI dependencies
- **Event-driven progress**: `ProgressEmitter` works for both CLI and TUI
- **CLI commands exist**: Commander.js already handles `init`, `fetch`, `geocode`, `routes`, `clear`, `deciles`, `map`, `status`
- **Tests focus on lib/**: TUI is already excluded from coverage

### What Needs to Change
1. Remove TUI layer (14 files in `src/tui/`)
2. Enhance CLI commands with better progress output
3. Implement comprehensive `status` command as default
4. Remove TUI dependencies from package.json
5. Simplify main.ts entry point
6. Add CLI output tests

---

## Phased Refactor Plan

### Phase 1: Enhance CLI Infrastructure (Foundation)
**Goal**: Build reusable CLI output utilities before removing TUI

**1.1 Create CLI output module** (`src/cli/output.ts`)
- Progress bar renderer (using `cli-progress`)
- Status table formatter
- Color-coded status indicators (using `chalk`)
- Result summary formatters for each command

**1.2 Create CLI status command** (`src/cli/commands/status.ts`)
- Comprehensive database stats display
- Zone counts by city
- Route status distribution (OK/NO_ROUTE/PENDING/ERROR)
- Decile status
- Last run timestamps from metadata
- Actionable suggestions (e.g., "Run `geocode` to geocode 15 zones")

**1.3 Restructure CLI commands** (`src/cli/commands/`)
- Extract each command to its own file
- Consistent pattern: parse options → call business logic → format output
- Commands: `init.ts`, `fetch.ts`, `geocode.ts`, `routes.ts`, `clear.ts`, `deciles.ts`, `map.ts`

**Checkpoint**: Run `pnpm test`, `pnpm build`, lint. All should pass.

---

### Phase 2: Enhance Progress Feedback
**Goal**: Rich, informative progress output for long-running operations

**2.1 Create progress renderer** (`src/cli/progress.ts`)
- Subscribe to `ProgressEmitter` events
- Multi-line progress display with:
  - Current operation description
  - Progress bar with percentage
  - Items processed (e.g., "142/500 routes")
  - Elapsed time
  - Rate (items/sec)
- Final summary with totals and duration

**2.2 Update command implementations**
- Wire progress renderer to each command
- Ensure consistent formatting across all commands
- Add `--quiet` flag for minimal output (useful for scripting)
- Add `--json` flag for machine-readable output

**Checkpoint**: Run `pnpm test`, `pnpm build`, lint.

---

### Phase 3: Remove TUI Layer
**Goal**: Clean removal of all TUI code and dependencies

**3.1 Simplify main.ts**
- Remove TUI routing logic
- Remove lazy imports of React/Ink
- Make default behavior: show status (call `status` command)
- Handle `--help` and version flags

**3.2 Delete TUI files**
- `src/tui/app.tsx`
- `src/tui/dashboard.tsx`
- `src/tui/theme.ts`
- `src/tui/components/*.tsx` (5 files)
- `src/tui/screens/*.tsx` (7 files)
- Remove `src/tui/` directory entirely

**3.3 Update package.json**
- Remove dependencies:
  - `ink`
  - `react`
  - `@types/react`
  - `ink-select-input`
  - `ink-spinner`
  - `ink-table`
  - `ink-text-input`
- Keep shared dependencies (chalk, cli-progress, etc.)

**3.4 Update tsconfig.json**
- Remove JSX configuration (no longer needed)
- Remove React-specific compiler options

**Checkpoint**: Run `pnpm test`, `pnpm build`, lint. Verify all commands work.

---

### Phase 4: Add CLI Tests
**Goal**: Ensure all CLI commands are testable and tested

**4.1 Create CLI test infrastructure** (`src/tests/cli/`)
- Test helpers for capturing CLI output
- Mock stdin for confirmation prompts
- Snapshot testing for output formats

**4.2 Write command tests**
- `status.test.ts` - Test status display with various DB states
- `fetch.test.ts` - Test fetch with mocked WFS
- `geocode.test.ts` - Test geocode with mocked Digitransit
- `routes.test.ts` - Test routes with mocked OTP
- `clear.test.ts` - Test clear confirmations and flags
- `deciles.test.ts` - Test decile calculations
- `map.test.ts` - Test map processing

**4.3 Integration test**
- Full workflow: init → fetch → geocode → routes → deciles
- Verify database state at each step

**Checkpoint**: Run full test suite with coverage. Target 80%+.

---

### Phase 5: Polish and Documentation
**Goal**: Production-ready CLI experience

**5.1 Improve help text**
- Rich command descriptions
- Examples for each command
- Document all flags

**5.2 Error handling**
- User-friendly error messages
- Suggestions for common errors
- Exit codes (0 success, 1 error, 2 user abort)

**5.3 Update README**
- New CLI usage examples
- Remove TUI screenshots/references
- Document all commands

---

## File Structure After Refactor

```
varikko/src/
├── main.ts              # Entry point (simplified)
├── cli/
│   ├── index.ts         # Commander program setup
│   ├── output.ts        # Output formatting utilities
│   ├── progress.ts      # Progress bar renderer
│   └── commands/
│       ├── status.ts    # Default: comprehensive status
│       ├── init.ts
│       ├── fetch.ts
│       ├── geocode.ts
│       ├── routes.ts
│       ├── clear.ts
│       ├── deciles.ts
│       └── map.ts
├── lib/                 # (unchanged - business logic)
│   ├── db.ts
│   ├── zones.ts
│   ├── city-fetchers.ts
│   ├── geocoding.ts
│   ├── routing.ts
│   ├── clearing.ts
│   ├── deciles.ts
│   ├── maps.ts
│   ├── exportLayers.ts
│   ├── events.ts
│   ├── logger.ts
│   ├── types.ts
│   ├── gml-parser.ts
│   └── mapConfig.ts
└── tests/
    ├── setup.ts
    ├── lib/             # (unchanged - business logic tests)
    ├── cli/             # (new - CLI command tests)
    │   ├── status.test.ts
    │   ├── fetch.test.ts
    │   ├── geocode.test.ts
    │   ├── routes.test.ts
    │   ├── clear.test.ts
    │   ├── deciles.test.ts
    │   └── map.test.ts
    ├── integration/
    │   └── workflow.test.ts
    └── helpers/
        ├── db.ts
        ├── fixtures.ts
        ├── assertions.ts
        └── cli.ts        # (new - CLI test helpers)
```

---

## Command Reference (Post-Refactor)

### `varikko` (no arguments)
Shows comprehensive status:
```
╭─ Varikko Status ─────────────────────────────────────────╮
│                                                          │
│  Database: /path/to/varikko.db                           │
│  Last updated: 2025-12-28 14:32                          │
│                                                          │
│  ┌─ Zones ────────────────────────────────────────────┐  │
│  │  Helsinki    142  ✓ geocoded                       │  │
│  │  Espoo        89  ✓ geocoded                       │  │
│  │  Vantaa       67  ✓ geocoded                       │  │
│  │  Kauniainen    3  ✓ geocoded                       │  │
│  │  Total       301                                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Routes ───────────────────────────────────────────┐  │
│  │  MORNING   42,150 / 90,300   46.7%  ████▒▒▒▒▒▒▒   │  │
│  │  EVENING    8,200 / 90,300    9.1%  █▒▒▒▒▒▒▒▒▒▒   │  │
│  │  MIDNIGHT       0 / 90,300    0.0%  ▒▒▒▒▒▒▒▒▒▒▒   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  → Next: Run `varikko routes -p MORNING` to continue     │
│                                                          │
╰──────────────────────────────────────────────────────────╯
```

### `varikko init [--force]`
Initialize database schema. `--force` to reset existing.

### `varikko fetch [--test]`
Fetch postal zones from WFS. `--test` limits to 5 zones.

### `varikko geocode [--test]`
Geocode zones to routing addresses.

### `varikko routes [--test] [--period MORNING|EVENING|MIDNIGHT]`
Calculate transit routes via OTP.

### `varikko clear [--force] [--routes] [--places] [--deciles] [--metadata]`
Clear data. Without flags, clears all. `--force` skips confirmation.

### `varikko deciles [--force]`
Calculate heatmap deciles.

### `varikko map`
Process shapefiles and generate SVG layers.

### Common flags (all commands)
- `--quiet, -q` - Minimal output
- `--json` - Machine-readable JSON output
- `--help, -h` - Show help

---

## Dependencies After Refactor

### Keep
- `commander` - CLI parsing
- `chalk` - Colors
- `cli-progress` - Progress bars
- All business logic deps (axios, better-sqlite3, turf, d3-geo, etc.)

### Remove
- `ink` - TUI renderer
- `react` - Component framework
- `@types/react` - React types
- `ink-select-input` - TUI menu
- `ink-spinner` - TUI spinner
- `ink-table` - TUI tables
- `ink-text-input` - TUI input

---

## Risk Mitigation

1. **Phase gates**: Each phase ends with test/lint/build checkpoint
2. **Business logic untouched**: All changes are in CLI/TUI layers
3. **Incremental removal**: Build new CLI infra before removing TUI
4. **Backwards compatible**: Command names and flags remain same
5. **Easy rollback**: TUI code deleted only after CLI is proven

---

## Estimated Complexity

| Phase | Files Changed | New Files | Deleted Files |
|-------|---------------|-----------|---------------|
| 1     | 2             | 9         | 0             |
| 2     | 8             | 1         | 0             |
| 3     | 3             | 0         | 14            |
| 4     | 0             | 8         | 0             |
| 5     | 2             | 0         | 0             |

**Net result**: -6 files, simpler architecture, better testability
