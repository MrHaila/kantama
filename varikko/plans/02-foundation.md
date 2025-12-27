# Phase 02: Foundation

**Status:** Ready for implementation
**Dependencies:** Phase 01 (Testing Setup)
**Estimated Effort:** 2-3 days
**Priority:** HIGH (required for all workflow phases)

---

## Overview

Build the foundational infrastructure for the TUI application:
- CLI parser with commander (hybrid interactive/non-interactive mode)
- Ink TUI framework setup
- Shared UI components (Header, Footer, ProgressBar, etc.)
- Database utilities
- Event system for progress tracking

This phase creates NO workflow logic - only the infrastructure that all workflows will use.

---

## Current State

**No unified entry point:**
- Each script is standalone (`fetch_zones.ts`, `geocode_zones.ts`, etc.)
- `package.json` has separate commands for each workflow
- No shared UI components
- No progress event system

**Pain Points:**
- Must remember many commands
- Inconsistent UX across scripts
- No way to chain workflows
- Hard to maintain consistent styling

---

## Target Architecture

### Entry Point Flow

```
$ varikko
    ↓
main.ts
    ↓
CLI parser (commander)
    ├─ No args? → Launch TUI (app.tsx)
    └─ Subcommand? → Execute non-interactively
```

### File Structure

```
src/
├── main.ts                    # Entry point
├── cli.ts                     # Commander CLI parser
│
├── lib/
│   ├── db.ts                  # Database utilities
│   ├── events.ts              # Event emitter types + helpers
│   └── logger.ts              # Structured logging
│
└── tui/
    ├── app.tsx                # Root TUI component
    ├── theme.ts               # Colors, styles, constants
    │
    ├── components/            # Reusable UI components
    │   ├── Header.tsx         # Title bar with context
    │   ├── Footer.tsx         # Keyboard shortcuts
    │   ├── StatusBox.tsx      # DB status widget
    │   ├── ProgressBar.tsx    # Real-time progress bar
    │   ├── ErrorPreview.tsx   # Sample errors + log link
    │   ├── StageMenu.tsx      # Numbered stage selector
    │   ├── ConfirmDialog.tsx  # Yes/No confirmation
    │   └── Spinner.tsx        # Loading indicator
    │
    └── screens/               # Full-screen views (create in later phases)
        └── help.tsx           # Help screen (this phase only)
```

---

## Implementation Steps

### Step 1: Install Dependencies

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
pnpm add -D @types/node
```

**Note:** Use `pnpm add` to get latest versions (NOT manual package.json editing)

---

### Step 2: Create Event System

**File:** `src/lib/events.ts`

**Purpose:** Type-safe event emitter for progress tracking

**Implementation:**
```typescript
import { EventEmitter } from 'eventemitter3';

export type WorkflowStage =
  | 'fetch_zones'
  | 'geocode_zones'
  | 'build_routes'
  | 'clear_data'
  | 'calculate_deciles'
  | 'export_routes'
  | 'process_map'
  | 'generate_svg';

export interface ProgressEvent {
  stage: WorkflowStage;
  type: 'start' | 'progress' | 'complete' | 'error';
  current?: number;
  total?: number;
  message?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export class ProgressEmitter extends EventEmitter<{
  progress: (event: ProgressEvent) => void;
}> {
  emitStart(stage: WorkflowStage, total?: number, message?: string) {
    this.emit('progress', { stage, type: 'start', total, message });
  }

  emitProgress(stage: WorkflowStage, current: number, total: number, message?: string) {
    this.emit('progress', { stage, type: 'progress', current, total, message });
  }

  emitComplete(stage: WorkflowStage, message?: string, metadata?: Record<string, any>) {
    this.emit('progress', { stage, type: 'complete', message, metadata });
  }

  emitError(stage: WorkflowStage, error: Error, message?: string) {
    this.emit('progress', { stage, type: 'error', error, message });
  }
}

/**
 * Create a progress emitter for a workflow
 */
export function createProgressEmitter(): ProgressEmitter {
  return new ProgressEmitter();
}
```

---

### Step 3: Create Database Utilities

**File:** `src/lib/db.ts`

**Purpose:** Centralized database connection + helper queries

**Implementation:**
```typescript
import Database from 'better-sqlite3';
import path from 'path';

/**
 * Get database path (from env or default)
 */
export function getDBPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), '../opas/public/varikko.db');
}

/**
 * Open database connection with standard configuration
 */
export function openDB(dbPath?: string): Database.Database {
  const db = new Database(dbPath || getDBPath());

  // Standard pragmas (match current implementation)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

/**
 * Get database statistics (for status displays)
 */
export function getDBStats(db: Database.Database) {
  const placeCount = db.prepare('SELECT COUNT(*) as count FROM places').get() as { count: number };

  const routeCounts = db.prepare(`
    SELECT
      status,
      COUNT(*) as count
    FROM routes
    GROUP BY status
  `).all() as Array<{ status: string; count: number }>;

  const decilesCalculated = db.prepare('SELECT COUNT(*) as count FROM deciles').get() as { count: number };

  const lastRun = db.prepare("SELECT value FROM metadata WHERE key = 'last_fetch'").get() as { value: string } | undefined;

  // Route counts by status
  const statusMap: Record<string, number> = {};
  for (const row of routeCounts) {
    statusMap[row.status] = row.count;
  }

  return {
    zones: placeCount.count,
    routes: {
      total: routeCounts.reduce((sum, r) => sum + r.count, 0),
      ok: statusMap['OK'] || 0,
      pending: statusMap['PENDING'] || 0,
      no_route: statusMap['NO_ROUTE'] || 0,
      error: statusMap['ERROR'] || 0,
    },
    deciles: {
      calculated: decilesCalculated.count === 10,
      count: decilesCalculated.count,
    },
    lastRun: lastRun ? JSON.parse(lastRun.value) : null,
  };
}

/**
 * Get recent errors (for error preview)
 */
export function getRecentErrors(db: Database.Database, limit: number = 5) {
  return db.prepare(`
    SELECT from_id, to_id, time_period, legs
    FROM routes
    WHERE status = 'ERROR'
    ORDER BY ROWID DESC
    LIMIT ?
  `).all(limit) as Array<{
    from_id: string;
    to_id: string;
    time_period: string;
    legs: string;
  }>;
}
```

---

### Step 4: Create Logger

**File:** `src/lib/logger.ts`

**Purpose:** Structured logging to files (not stdout in TUI mode)

**Implementation:**
```typescript
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  stage?: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Write log entry to file
 */
export function log(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  };

  if (error) {
    entry.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  // Write to daily log file
  const date = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  const logFile = path.join(LOG_DIR, `varikko-${date}.log`);

  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');

  // Also log to console if not in TUI mode
  if (!process.env.TUI_MODE) {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`, metadata || '');
    if (error) {
      console.error(error);
    }
  }
}

export function info(message: string, metadata?: Record<string, any>) {
  log('info', message, metadata);
}

export function warn(message: string, metadata?: Record<string, any>) {
  log('warn', message, metadata);
}

export function error(message: string, metadata?: Record<string, any>, err?: Error) {
  log('error', message, metadata, err);
}

export function debug(message: string, metadata?: Record<string, any>) {
  log('debug', message, metadata);
}

/**
 * Get path to today's log file
 */
export function getTodayLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `varikko-${date}.log`);
}
```

---

### Step 5: Create TUI Theme

**File:** `src/tui/theme.ts`

**Purpose:** Centralized colors, styles, constants (Omarchy-inspired)

**Implementation:**
```typescript
import chalk from 'chalk';

/**
 * Color palette (Omarchy-inspired)
 */
export const colors = {
  // Primary colors
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  highlight: chalk.magenta,

  // Semantic colors
  pending: chalk.yellow,
  completed: chalk.green,
  failed: chalk.red,

  // UI elements
  border: chalk.gray,
  title: chalk.bold.cyan,
  subtitle: chalk.gray,
  key: chalk.cyan,
  value: chalk.white,
};

/**
 * Unicode symbols
 */
export const symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '▶',
  arrowLeft: '◀',
  arrowUp: '▲',
  arrowDown: '▼',
  noRoute: '⊘',
  spinner: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏',  // Braille spinner frames
};

/**
 * Box drawing characters
 */
export const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  verticalRight: '├',
  verticalLeft: '┤',
  horizontalDown: '┬',
  horizontalUp: '┴',
  cross: '┼',
};

/**
 * Layout constants
 */
export const layout = {
  minWidth: 60,
  maxWidth: 120,
  padding: 1,
  headerHeight: 4,
  footerHeight: 1,
};

/**
 * Helper: Draw horizontal line
 */
export function drawHorizontalLine(width: number, char: string = box.horizontal): string {
  return char.repeat(width);
}

/**
 * Helper: Draw box border
 */
export function drawBoxBorder(width: number, position: 'top' | 'middle' | 'bottom'): string {
  const inner = drawHorizontalLine(width - 2);

  switch (position) {
    case 'top':
      return `${box.topLeft}${inner}${box.topRight}`;
    case 'middle':
      return `${box.verticalRight}${inner}${box.verticalLeft}`;
    case 'bottom':
      return `${box.bottomLeft}${inner}${box.bottomRight}`;
  }
}

/**
 * Helper: Pad text to fit width
 */
export function padText(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');  // Remove ANSI codes for length calc
  const padding = Math.max(0, width - stripped.length);

  switch (align) {
    case 'left':
      return text + ' '.repeat(padding);
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }
}
```

---

### Step 6: Create Shared TUI Components

**File:** `src/tui/components/Header.tsx`

**Implementation:**
```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { colors, drawBoxBorder } from '../theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  width?: number;
}

export function Header({ title, subtitle, width = 80 }: HeaderProps) {
  return (
    <Box flexDirection="column">
      <Text>{drawBoxBorder(width, 'top')}</Text>
      <Box>
        <Text>│ </Text>
        <Text color="cyan" bold>{title}</Text>
        {subtitle && (
          <>
            <Text> - </Text>
            <Text color="gray">{subtitle}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
```

**File:** `src/tui/components/Footer.tsx`

**Implementation:**
```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme';

interface FooterProps {
  shortcuts: Array<{ key: string; label: string }>;
  width?: number;
}

export function Footer({ shortcuts, width = 80 }: FooterProps) {
  return (
    <Box marginTop={1}>
      {shortcuts.map((shortcut, idx) => (
        <React.Fragment key={shortcut.key}>
          {idx > 0 && <Text> | </Text>}
          <Text color="cyan">[{shortcut.key}]</Text>
          <Text> {shortcut.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
```

**File:** `src/tui/components/ProgressBar.tsx`

**Implementation:**
```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme';

interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
  label?: string;
}

export function ProgressBar({ current, total, width = 40, label }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (current / total) * 100));
  const filled = Math.floor((percentage / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Box flexDirection="column">
      {label && <Text>{label}</Text>}
      <Box>
        <Text color="cyan">{bar}</Text>
        <Text> {current.toLocaleString()}/{total.toLocaleString()}</Text>
        <Text color="gray"> ({percentage.toFixed(1)}%)</Text>
      </Box>
    </Box>
  );
}
```

**File:** `src/tui/components/StatusBox.tsx`

**Implementation:**
```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { colors, symbols } from '../theme';

interface DBStats {
  zones: number;
  routes: {
    total: number;
    ok: number;
    pending: number;
    no_route: number;
    error: number;
  };
  deciles: {
    calculated: boolean;
    count: number;
  };
  lastRun: any;
}

interface StatusBoxProps {
  stats: DBStats;
}

export function StatusBox({ stats }: StatusBoxProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>Database: </Text>
        <Text color="cyan">/Users/teemu/Documents/Kantama/opas/public/varikko.db</Text>
      </Box>
      <Box>
        <Text>Zones: </Text>
        <Text color="green">{stats.zones}</Text>
        <Text> | Routes: </Text>
        <Text color="cyan">{stats.routes.total.toLocaleString()}</Text>
        <Text color="gray"> (</Text>
        <Text color="green">OK: {stats.routes.ok.toLocaleString()}</Text>
        <Text color="gray">, </Text>
        <Text color="yellow">PENDING: {stats.routes.pending.toLocaleString()}</Text>
        <Text color="gray">, </Text>
        <Text color="red">ERROR: {stats.routes.error.toLocaleString()}</Text>
        <Text color="gray">)</Text>
      </Box>
      <Box>
        <Text>Deciles: </Text>
        {stats.deciles.calculated ? (
          <Text color="green">{symbols.success} Calculated</Text>
        ) : (
          <Text color="gray">Not calculated</Text>
        )}
      </Box>
    </Box>
  );
}
```

**File:** `src/tui/components/Spinner.tsx`

**Implementation:**
```typescript
import React from 'react';
import { Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <Text>
      <Text color="cyan">
        <InkSpinner type="dots" />
      </Text>
      {label && <Text> {label}</Text>}
    </Text>
  );
}
```

---

### Step 7: Create CLI Parser

**File:** `src/cli.ts`

**Purpose:** Parse command-line arguments with commander

**Implementation:**
```typescript
import { Command } from 'commander';

export interface CLIOptions {
  interactive: boolean;
  test: boolean;
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  force?: boolean;
}

export interface CLICommand {
  command: string;
  options: CLIOptions;
}

export function parseCLI(): CLICommand | null {
  const program = new Command();

  program
    .name('varikko')
    .description('Varikko Data Pipeline - Interactive TUI and CLI for transit route calculation')
    .version('2.0.0');

  // Default (no subcommand) → interactive TUI
  program.action(() => {
    // Will be handled in main.ts
  });

  // Subcommands (non-interactive mode)
  // Note: Actual implementations will be added in later phases
  program
    .command('fetch')
    .description('Fetch postal code zones from WFS')
    .option('-t, --test', 'Test mode (5 zones only)')
    .action((options) => {
      // Will be implemented in Phase 03
    });

  program
    .command('geocode')
    .description('Geocode zones to routing addresses')
    .option('-t, --test', 'Test mode (5 zones only)')
    .action((options) => {
      // Will be implemented in Phase 04
    });

  program
    .command('routes')
    .description('Calculate transit routes')
    .option('-t, --test', 'Test mode (5 random routes per period)')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
    .action((options) => {
      // Will be implemented in Phase 05
    });

  program
    .command('clear')
    .description('Clear or reset data')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--routes', 'Reset routes to PENDING only')
    .option('--places', 'Clear places and routes')
    .option('--metadata', 'Clear metadata only')
    .action((options) => {
      // Will be implemented in Phase 06
    });

  program
    .command('deciles')
    .description('Calculate heatmap deciles')
    .option('-f, --force', 'Force recalculation even if already calculated')
    .action((options) => {
      // Will be implemented in Phase 07
    });

  program
    .command('export')
    .description('Export routes to JSON')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
    .action((options) => {
      // Will be implemented in Phase 09
    });

  program
    .command('map')
    .description('Process shapefiles and generate SVG')
    .action((options) => {
      // Will be implemented in Phase 08
    });

  program
    .command('status')
    .description('Show database status')
    .action(() => {
      // Will be implemented in Phase 10
    });

  program.parse();

  // Return parsed command (null = interactive mode)
  const options = program.opts();
  const [command] = program.args;

  if (!command) {
    return null;  // Interactive mode
  }

  return {
    command,
    options: options as CLIOptions,
  };
}
```

---

### Step 8: Create Root TUI Component

**File:** `src/tui/app.tsx`

**Purpose:** Root component (for now, just help screen placeholder)

**Implementation:**
```typescript
import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { StatusBox } from './components/StatusBox';
import { openDB, getDBStats } from '../lib/db';

export function App() {
  const { exit } = useApp();
  const [stats, setStats] = useState(() => {
    const db = openDB();
    const s = getDBStats(db);
    db.close();
    return s;
  });

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
    }

    // Refresh stats on 'r'
    if (input === 'r') {
      const db = openDB();
      setStats(getDBStats(db));
      db.close();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header title="VARIKKO DATA PIPELINE" width={80} />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <StatusBox stats={stats} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">
          TUI Interface Coming Soon!
        </Text>
        <Text color="gray" marginTop={1}>
          This is a placeholder. Full dashboard and workflow screens will be implemented in later phases.
        </Text>
        <Text color="gray">
          Press 'r' to refresh stats, or 'q' to quit.
        </Text>
      </Box>

      <Footer
        shortcuts={[
          { key: 'r', label: 'Refresh' },
          { key: 'q', label: 'Quit' },
        ]}
      />
    </Box>
  );
}
```

---

### Step 9: Create Main Entry Point

**File:** `src/main.ts`

**Purpose:** Application entry point (routes to TUI or CLI)

**Implementation:**
```typescript
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './tui/app';
import { parseCLI } from './cli';

async function main() {
  const command = parseCLI();

  if (!command) {
    // Interactive mode - launch TUI
    process.env.TUI_MODE = 'true';
    render(React.createElement(App));
  } else {
    // Non-interactive mode - execute command
    console.log(`Non-interactive mode not yet implemented: ${command.command}`);
    console.log('Use interactive mode by running "varikko" with no arguments.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

### Step 10: Update package.json

**File:** `package.json`

**Add bin entry:**
```json
{
  "bin": {
    "varikko": "./dist/main.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/main.ts",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

**Note:** After this phase, use `pnpm dev` to run TUI in development mode.

---

### Step 11: Update tsconfig.json

**File:** `tsconfig.json`

**Add JSX support for Ink:**
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ESNext"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "react",
    "jsxFactory": "React.createElement",
    "jsxFragmentFactory": "React.Fragment"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/tests"]
}
```

---

## Testing Strategy

### Unit Tests

**File:** `src/tests/lib/db.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDB, seedDB } from '../helpers/db';
import { getDBStats, getRecentErrors } from '../../lib/db';
import { loadZonesFixture, loadRoutesFixture } from '../helpers/fixtures';

describe('db utilities', () => {
  let testDB: ReturnType<typeof createTestDB>;

  beforeEach(() => {
    testDB = createTestDB();
  });

  afterEach(() => {
    testDB.cleanup();
  });

  it('should get database stats', () => {
    seedDB(testDB.db, {
      places: loadZonesFixture('5-zones'),
      routes: loadRoutesFixture('sample-routes'),
    });

    const stats = getDBStats(testDB.db);

    expect(stats.zones).toBe(5);
    expect(stats.routes.total).toBeGreaterThan(0);
  });

  it('should get recent errors', () => {
    seedDB(testDB.db, {
      places: loadZonesFixture('5-zones'),
      routes: loadRoutesFixture('edge-cases'),
    });

    const errors = getRecentErrors(testDB.db, 5);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty('from_id');
    expect(errors[0]).toHaveProperty('legs');
  });
});
```

**File:** `src/tests/lib/events.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createProgressEmitter } from '../../lib/events';

describe('progress emitter', () => {
  it('should emit start event', (done) => {
    const emitter = createProgressEmitter();

    emitter.on('progress', (event) => {
      expect(event.type).toBe('start');
      expect(event.stage).toBe('fetch_zones');
      done();
    });

    emitter.emitStart('fetch_zones', 100, 'Fetching zones...');
  });

  it('should emit progress event', (done) => {
    const emitter = createProgressEmitter();

    emitter.on('progress', (event) => {
      expect(event.type).toBe('progress');
      expect(event.current).toBe(50);
      expect(event.total).toBe(100);
      done();
    });

    emitter.emitProgress('fetch_zones', 50, 100);
  });

  it('should emit complete event', (done) => {
    const emitter = createProgressEmitter();

    emitter.on('progress', (event) => {
      expect(event.type).toBe('complete');
      done();
    });

    emitter.emitComplete('fetch_zones', 'Done!');
  });
});
```

---

## Acceptance Criteria

### Must Pass Before Phase 03

- ✅ All dependencies installed via `pnpm add`
- ✅ `pnpm dev` launches TUI with placeholder dashboard
- ✅ TUI shows database stats
- ✅ TUI responds to keyboard (q to quit, r to refresh)
- ✅ CLI parser recognizes all subcommands (even if not implemented)
- ✅ Event system can emit/receive progress events
- ✅ DB utilities can query stats and errors
- ✅ Logger writes to files in `logs/` directory
- ✅ All tests pass (`pnpm test`)

### Quality Gates

- ✅ TUI renders without errors
- ✅ No console warnings or errors
- ✅ TypeScript compiles with no errors
- ✅ All components have proper TypeScript types
- ✅ Code follows consistent style

---

## Manual Testing Checklist

- [ ] Run `pnpm dev` - TUI launches
- [ ] TUI shows correct zone count from existing DB
- [ ] TUI shows correct route counts
- [ ] Press 'r' - stats refresh
- [ ] Press 'q' - TUI exits cleanly
- [ ] Run `pnpm build` - compiles without errors
- [ ] Run `./dist/main.js` - TUI launches from compiled code
- [ ] Run `./dist/main.js fetch` - shows "not yet implemented" message
- [ ] Check `logs/` directory - log file created
- [ ] Run tests - all pass

---

## Dependencies Added This Phase

```bash
pnpm add ink react
pnpm add -D @types/react
pnpm add ink-spinner ink-text-input ink-select-input ink-table
pnpm add commander
pnpm add chalk eventemitter3
pnpm add -D @types/node
```

---

## Files Created This Phase

```
src/
├── main.ts
├── cli.ts
├── lib/
│   ├── db.ts
│   ├── events.ts
│   └── logger.ts
├── tui/
│   ├── app.tsx
│   ├── theme.ts
│   └── components/
│       ├── Header.tsx
│       ├── Footer.tsx
│       ├── StatusBox.tsx
│       ├── ProgressBar.tsx
│       └── Spinner.tsx
└── tests/
    └── lib/
        ├── db.test.ts
        └── events.test.ts
```

**Updated:**
- `package.json` (bin entry, scripts)
- `tsconfig.json` (JSX support)

---

## Migration Notes

- Old scripts (`fetch_zones.ts`, etc.) remain unchanged
- No breaking changes yet
- Can still use `pnpm fetch:zones`, etc. during transition

---

## Rollback Plan

If this phase fails:
1. Remove added files (`src/main.ts`, `src/cli.ts`, `src/lib/*`, `src/tui/*`)
2. Revert `package.json` and `tsconfig.json`
3. `pnpm remove ink react commander chalk eventemitter3 @types/react`

---

## Next Phase

After foundation is complete, proceed to:
- **Phase 03:** Fetch Zones (first workflow implementation)

---

## References

- **Ink Documentation:** https://github.com/vadimdemedes/ink
- **Commander.js:** https://github.com/tj/commander.js
- **Chalk:** https://github.com/chalk/chalk
- **EventEmitter3:** https://github.com/primus/eventemitter3
