/**
 * CLI Output Formatting Utilities
 *
 * Provides consistent, high-quality terminal output formatting for Varikko CLI commands.
 * Uses ANSI escape codes for colors and formatting.
 */

// ============================================================================
// ANSI Color Codes
// ============================================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Foreground colors
const FG_RED = '\x1b[31m';
const FG_GREEN = '\x1b[32m';
const FG_YELLOW = '\x1b[33m';
const FG_BLUE = '\x1b[34m';
const FG_MAGENTA = '\x1b[35m';
const FG_CYAN = '\x1b[36m';
const FG_GRAY = '\x1b[90m';

/**
 * Check if output supports colors (TTY check)
 */
export function supportsColor(): boolean {
  return process.stdout.isTTY ?? false;
}

/**
 * Strip ANSI color codes from string (for testing)
 */
export function stripColors(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ============================================================================
// Color Helpers
// ============================================================================

export function color(text: string, code: string): string {
  if (!supportsColor()) return text;
  return `${code}${text}${RESET}`;
}

export function bold(text: string): string {
  if (!supportsColor()) return text;
  return `${BOLD}${text}${RESET}`;
}

export function dim(text: string): string {
  if (!supportsColor()) return text;
  return `${DIM}${text}${RESET}`;
}

export function success(text: string): string {
  return color(text, FG_GREEN);
}

export function error(text: string): string {
  return color(text, FG_RED);
}

export function warning(text: string): string {
  return color(text, FG_YELLOW);
}

export function info(text: string): string {
  return color(text, FG_CYAN);
}

export function muted(text: string): string {
  return color(text, FG_GRAY);
}

export function highlight(text: string): string {
  return color(text, FG_MAGENTA);
}

export function primary(text: string): string {
  return color(text, FG_BLUE);
}

// ============================================================================
// Symbols
// ============================================================================

export const symbols = {
  // Status
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '○',
  noRoute: '⊘',
  arrow: '➜',
  bullet: '•',

  // Box drawing
  horizontalLine: '─',
  verticalLine: '│',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',

  // Progress
  progressFull: '=',
  progressHead: '>',
  progressEmpty: ' ',
} as const;

// ============================================================================
// Box Drawing
// ============================================================================

/**
 * Create a horizontal line with optional text
 */
export function horizontalLine(width: number, text?: string): string {
  if (!text) {
    return symbols.horizontalLine.repeat(width);
  }

  const padding = width - text.length - 2;
  if (padding < 0) return text;

  const leftPad = Math.floor(padding / 2);
  const rightPad = Math.ceil(padding / 2);

  return (
    symbols.horizontalLine.repeat(leftPad) +
    ' ' + text + ' ' +
    symbols.horizontalLine.repeat(rightPad)
  );
}

/**
 * Create a box border
 */
export function boxTop(width: number, title?: string): string {
  const innerWidth = width - 2;
  if (title) {
    return symbols.topLeft + horizontalLine(innerWidth, title) + symbols.topRight;
  }
  return symbols.topLeft + symbols.horizontalLine.repeat(innerWidth) + symbols.topRight;
}

export function boxBottom(width: number): string {
  return symbols.bottomLeft + symbols.horizontalLine.repeat(width - 2) + symbols.bottomRight;
}

export function boxLine(content: string, width: number): string {
  const padding = width - content.length - 2;
  if (padding < 0) return symbols.verticalLine + content + symbols.verticalLine;
  return symbols.verticalLine + content + ' '.repeat(padding) + symbols.verticalLine;
}

/**
 * Create a section header
 */
export function header(text: string, emoji?: string): string {
  const prefix = emoji ? `${emoji} ` : '';
  return bold(prefix + text);
}

/**
 * Create a section divider
 */
export function divider(width: number = 60): string {
  return muted(symbols.horizontalLine.repeat(width));
}

// ============================================================================
// Progress Bar
// ============================================================================

export interface ProgressBarOptions {
  width?: number;
  showPercentage?: boolean;
  showFraction?: boolean;
}

/**
 * Create a progress bar
 * Example: [=========>    ] 67% (2/3)
 */
export function progressBar(
  current: number,
  total: number,
  options: ProgressBarOptions = {}
): string {
  const {
    width = 20,
    showPercentage = true,
    showFraction = true,
  } = options;

  if (total === 0) {
    const emptyBar = `[${symbols.progressEmpty.repeat(width)}]`;
    return showPercentage ? `${emptyBar} 0%` : emptyBar;
  }

  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;

  let bar = '[';

  if (filled > 0) {
    bar += success(symbols.progressFull.repeat(Math.max(0, filled - 1)));
    bar += success(symbols.progressHead);
  }

  if (empty > 0) {
    bar += symbols.progressEmpty.repeat(empty);
  }

  bar += ']';

  let result = bar;

  if (showPercentage) {
    result += ` ${percentage}%`;
  }

  if (showFraction) {
    result += ` ${dim(`(${current.toLocaleString()}/${total.toLocaleString()})`)}`;
  }

  return result;
}

/**
 * Create a simple spinner frame
 */
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

export function spinner(): string {
  const frame = spinnerFrames[spinnerIndex];
  spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
  return info(frame);
}

// ============================================================================
// Statistics Formatting
// ============================================================================

export interface RouteStats {
  ok?: number;
  noRoute?: number;
  errors?: number;
}

/**
 * Format route statistics inline
 * Example: ✓ 123 | ⊘ 45 no route | ✗ 12 errors
 */
export function formatRouteStats(stats: RouteStats): string {
  const parts: string[] = [];

  if (stats.ok !== undefined) {
    parts.push(`${success(symbols.success)} ${stats.ok.toLocaleString()}`);
  }

  if (stats.noRoute !== undefined && stats.noRoute > 0) {
    parts.push(`${warning(symbols.noRoute)} ${stats.noRoute.toLocaleString()} no route`);
  }

  if (stats.errors !== undefined && stats.errors > 0) {
    parts.push(`${error(symbols.error)} ${stats.errors.toLocaleString()} errors`);
  }

  return parts.join(dim(' | '));
}

/**
 * Format a key-value pair with alignment
 */
export function keyValue(key: string, value: string | number, keyWidth: number = 20): string {
  const k = key.padEnd(keyWidth);
  const v = typeof value === 'number' ? value.toLocaleString() : value;
  return `${muted(k)} ${v}`;
}

// ============================================================================
// Table Formatting
// ============================================================================

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'right';
  format?: (value: unknown) => string;
}

/**
 * Format a simple table
 */
export function table(rows: Record<string, unknown>[], columns: TableColumn[]): string {
  const lines: string[] = [];

  // Calculate column widths
  const widths = columns.map((col) => {
    if (col.width) return col.width;
    const maxContentWidth = Math.max(
      col.header.length,
      ...rows.map((row) => {
        const value = col.format ? col.format(row[col.key]) : String(row[col.key]);
        return stripColors(value).length;
      })
    );
    return maxContentWidth;
  });

  // Header
  const headerRow = columns
    .map((col, i) => {
      const text = col.header.padEnd(widths[i]);
      return bold(text);
    })
    .join('  ');
  lines.push(headerRow);

  // Separator
  const separator = columns
    .map((col, i) => symbols.horizontalLine.repeat(widths[i]))
    .join('  ');
  lines.push(muted(separator));

  // Rows
  for (const row of rows) {
    const rowStr = columns
      .map((col, i) => {
        const value = col.format ? col.format(row[col.key]) : String(row[col.key]);
        const cleanValue = stripColors(value);
        const padding = widths[i] - cleanValue.length;

        if (col.align === 'right') {
          return ' '.repeat(padding) + value;
        }
        return value + ' '.repeat(padding);
      })
      .join('  ');
    lines.push(rowStr);
  }

  return lines.join('\n');
}

// ============================================================================
// List Formatting
// ============================================================================

/**
 * Format a bulleted list
 */
export function bulletList(items: string[], indent: number = 2): string {
  const prefix = ' '.repeat(indent);
  return items.map((item) => `${prefix}${muted(symbols.bullet)} ${item}`).join('\n');
}

/**
 * Format a numbered list
 */
export function numberedList(items: string[], indent: number = 2): string {
  const prefix = ' '.repeat(indent);
  return items
    .map((item, i) => `${prefix}${muted(`${i + 1}.`)} ${item}`)
    .join('\n');
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format a success message
 */
export function successMessage(text: string): string {
  return `${success(symbols.success)} ${text}`;
}

/**
 * Format an error message
 */
export function errorMessage(text: string): string {
  return `${error(symbols.error)} ${text}`;
}

/**
 * Format a warning message
 */
export function warningMessage(text: string): string {
  return `${warning(symbols.warning)} ${text}`;
}

/**
 * Format an info message
 */
export function infoMessage(text: string): string {
  return `${info(symbols.info)} ${text}`;
}

/**
 * Format a suggestion/next step message
 */
export function suggestion(text: string): string {
  return `💡 ${text}`;
}

// ============================================================================
// Status Display
// ============================================================================

/**
 * Format a status line with icon and value
 */
export function statusLine(icon: string, label: string, value: string | number): string {
  const v = typeof value === 'number' ? value.toLocaleString() : value;
  return `${icon} ${bold(label)}: ${v}`;
}

/**
 * Format a section with header and content
 */
export function section(title: string, content: string, emoji?: string): string {
  return `\n${header(title, emoji)}\n${content}`;
}

// ============================================================================
// Duration Formatting
// ============================================================================

/**
 * Format a duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a timestamp to human-readable string
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ============================================================================
// File Size Formatting
// ============================================================================

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
