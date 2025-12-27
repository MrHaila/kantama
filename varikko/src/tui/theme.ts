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
  // eslint-disable-next-line no-control-regex
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');  // Remove ANSI codes for length calc
  const padding = Math.max(0, width - stripped.length);

  switch (align) {
    case 'left':
      return text + ' '.repeat(padding);
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
  }
}
