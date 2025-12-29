import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fmt from '../../lib/cli-format';

describe('CLI Formatting Utilities', () => {
  // Store original stdout.isTTY
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY;
  });

  describe('Color Support', () => {
    it('should detect TTY support', () => {
      process.stdout.isTTY = true;
      expect(fmt.supportsColor()).toBe(true);

      process.stdout.isTTY = false;
      expect(fmt.supportsColor()).toBe(false);
    });

    it('should strip ANSI color codes', () => {
      const colored = '\x1b[31mRed Text\x1b[0m';
      expect(fmt.stripColors(colored)).toBe('Red Text');

      const multiColor = '\x1b[32mGreen\x1b[0m and \x1b[34mBlue\x1b[0m';
      expect(fmt.stripColors(multiColor)).toBe('Green and Blue');
    });
  });

  describe('Color Helpers', () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it('should apply success color (green)', () => {
      const result = fmt.success('OK');
      expect(result).toContain('OK');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[32m/); // Green code
    });

    it('should apply error color (red)', () => {
      const result = fmt.error('Failed');
      expect(result).toContain('Failed');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[31m/); // Red code
    });

    it('should apply warning color (yellow)', () => {
      const result = fmt.warning('Warning');
      expect(result).toContain('Warning');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[33m/); // Yellow code
    });

    it('should apply info color (cyan)', () => {
      const result = fmt.info('Info');
      expect(result).toContain('Info');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[36m/); // Cyan code
    });

    it('should apply muted color (gray)', () => {
      const result = fmt.muted('Muted');
      expect(result).toContain('Muted');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[90m/); // Gray code
    });

    it('should apply bold formatting', () => {
      const result = fmt.bold('Bold');
      expect(result).toContain('Bold');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[1m/); // Bold code
    });

    it('should apply dim formatting', () => {
      const result = fmt.dim('Dim');
      expect(result).toContain('Dim');
      // eslint-disable-next-line no-control-regex
      expect(result).toMatch(/\x1b\[2m/); // Dim code
    });

    it('should not apply colors when not TTY', () => {
      process.stdout.isTTY = false;

      expect(fmt.success('OK')).toBe('OK');
      expect(fmt.error('Failed')).toBe('Failed');
      expect(fmt.bold('Bold')).toBe('Bold');
    });
  });

  describe('Symbols', () => {
    it('should provide status symbols', () => {
      expect(fmt.symbols.success).toBe('✓');
      expect(fmt.symbols.error).toBe('✗');
      expect(fmt.symbols.warning).toBe('⚠');
      expect(fmt.symbols.noRoute).toBe('⊘');
    });

    it('should provide box drawing symbols', () => {
      expect(fmt.symbols.horizontalLine).toBe('─');
      expect(fmt.symbols.verticalLine).toBe('│');
      expect(fmt.symbols.topLeft).toBe('╭');
      expect(fmt.symbols.topRight).toBe('╮');
    });

    it('should provide progress symbols', () => {
      expect(fmt.symbols.progressFull).toBe('=');
      expect(fmt.symbols.progressHead).toBe('>');
      expect(fmt.symbols.progressEmpty).toBe(' ');
    });
  });

  describe('Box Drawing', () => {
    it('should create horizontal line', () => {
      const line = fmt.horizontalLine(10);
      expect(fmt.stripColors(line)).toBe('─'.repeat(10));
    });

    it('should create horizontal line with centered text', () => {
      const line = fmt.horizontalLine(20, 'TEST');
      const stripped = fmt.stripColors(line);
      expect(stripped).toContain('TEST');
      expect(stripped.length).toBe(20);
    });

    it('should create box top', () => {
      const top = fmt.boxTop(20);
      const stripped = fmt.stripColors(top);
      expect(stripped).toMatch(/^╭─+╮$/);
      expect(stripped.length).toBe(20);
    });

    it('should create box top with title', () => {
      const top = fmt.boxTop(30, 'TITLE');
      const stripped = fmt.stripColors(top);
      expect(stripped).toContain('TITLE');
      expect(stripped.startsWith('╭')).toBe(true);
      expect(stripped.endsWith('╮')).toBe(true);
    });

    it('should create box bottom', () => {
      const bottom = fmt.boxBottom(20);
      const stripped = fmt.stripColors(bottom);
      expect(stripped).toMatch(/^╰─+╯$/);
      expect(stripped.length).toBe(20);
    });

    it('should create divider', () => {
      const divider = fmt.divider(40);
      const stripped = fmt.stripColors(divider);
      expect(stripped).toBe('─'.repeat(40));
    });
  });

  describe('Progress Bar', () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it('should create progress bar at 0%', () => {
      const bar = fmt.progressBar(0, 100);
      const stripped = fmt.stripColors(bar);
      expect(stripped).toContain('[');
      expect(stripped).toContain(']');
      expect(stripped).toContain('0%');
      expect(stripped).toContain('(0/100)');
    });

    it('should create progress bar at 50%', () => {
      const bar = fmt.progressBar(50, 100, { width: 20 });
      const stripped = fmt.stripColors(bar);
      expect(stripped).toContain('50%');
      expect(stripped).toContain('(50/100)');
    });

    it('should create progress bar at 100%', () => {
      const bar = fmt.progressBar(100, 100, { width: 20 });
      const stripped = fmt.stripColors(bar);
      expect(stripped).toContain('100%');
      expect(stripped).toContain('(100/100)');
    });

    it('should handle zero total', () => {
      const bar = fmt.progressBar(0, 0);
      const stripped = fmt.stripColors(bar);
      expect(stripped).toContain('0%');
    });

    it('should hide percentage when requested', () => {
      const bar = fmt.progressBar(50, 100, { showPercentage: false });
      const stripped = fmt.stripColors(bar);
      expect(stripped).not.toContain('%');
    });

    it('should hide fraction when requested', () => {
      const bar = fmt.progressBar(50, 100, { showFraction: false });
      const stripped = fmt.stripColors(bar);
      expect(stripped).not.toContain('(50/100)');
    });

    it('should format large numbers with locale', () => {
      const bar = fmt.progressBar(1234, 5678);
      const stripped = fmt.stripColors(bar);
      expect(stripped).toContain('1,234');
      expect(stripped).toContain('5,678');
    });
  });

  describe('Statistics Formatting', () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it('should format route stats with all fields', () => {
      const stats = { ok: 100, noRoute: 20, errors: 5 };
      const result = fmt.formatRouteStats(stats);
      const stripped = fmt.stripColors(result);

      expect(stripped).toContain('100');
      expect(stripped).toContain('20 no route');
      expect(stripped).toContain('5 errors');
    });

    it('should omit zero values for noRoute and errors', () => {
      const stats = { ok: 100, noRoute: 0, errors: 0 };
      const result = fmt.formatRouteStats(stats);
      const stripped = fmt.stripColors(result);

      expect(stripped).toContain('100');
      expect(stripped).not.toContain('no route');
      expect(stripped).not.toContain('errors');
    });

    it('should format key-value pairs', () => {
      const result = fmt.keyValue('Database', '/path/to/db', 15);
      const stripped = fmt.stripColors(result);

      expect(stripped).toContain('Database');
      expect(stripped).toContain('/path/to/db');
    });

    it('should format numbers in key-value pairs', () => {
      const result = fmt.keyValue('Count', 1234, 15);
      const stripped = fmt.stripColors(result);

      expect(stripped).toContain('1,234');
    });
  });

  describe('Table Formatting', () => {
    beforeEach(() => {
      process.stdout.isTTY = false; // Disable colors for easier testing
    });

    it('should format simple table', () => {
      const rows = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const columns = [
        { header: 'Name', key: 'name' },
        { header: 'Age', key: 'age', align: 'right' as const },
      ];

      const result = fmt.table(rows, columns);

      expect(result).toContain('Name');
      expect(result).toContain('Age');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
      expect(result).toContain('30');
      expect(result).toContain('25');
    });

    it('should apply custom formatters', () => {
      const rows = [{ value: 1234 }];
      const columns = [
        {
          header: 'Value',
          key: 'value',
          format: (val: number) => `$${val.toFixed(2)}`,
        },
      ];

      const result = fmt.table(rows, columns);
      expect(result).toContain('$1234.00');
    });

    it('should respect column widths', () => {
      const rows = [{ name: 'A' }];
      const columns = [{ header: 'Name', key: 'name', width: 20 }];

      const result = fmt.table(rows, columns);
      const lines = result.split('\n');
      // Header should be padded to width
      expect(lines[0].length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('List Formatting', () => {
    beforeEach(() => {
      process.stdout.isTTY = false;
    });

    it('should format bullet list', () => {
      const items = ['First', 'Second', 'Third'];
      const result = fmt.bulletList(items);

      expect(result).toContain('• First');
      expect(result).toContain('• Second');
      expect(result).toContain('• Third');
    });

    it('should format numbered list', () => {
      const items = ['First', 'Second', 'Third'];
      const result = fmt.numberedList(items);

      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
      expect(result).toContain('3. Third');
    });

    it('should respect indent parameter', () => {
      const items = ['Item'];
      const result = fmt.bulletList(items, 4);

      expect(result.startsWith('    •')).toBe(true);
    });
  });

  describe('Message Formatting', () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it('should format success message', () => {
      const msg = fmt.successMessage('Done');
      const stripped = fmt.stripColors(msg);
      expect(stripped).toContain('✓');
      expect(stripped).toContain('Done');
    });

    it('should format error message', () => {
      const msg = fmt.errorMessage('Failed');
      const stripped = fmt.stripColors(msg);
      expect(stripped).toContain('✗');
      expect(stripped).toContain('Failed');
    });

    it('should format warning message', () => {
      const msg = fmt.warningMessage('Careful');
      const stripped = fmt.stripColors(msg);
      expect(stripped).toContain('⚠');
      expect(stripped).toContain('Careful');
    });

    it('should format info message', () => {
      const msg = fmt.infoMessage('Note');
      const stripped = fmt.stripColors(msg);
      expect(stripped).toContain('ℹ');
      expect(stripped).toContain('Note');
    });

    it('should format suggestion', () => {
      const msg = fmt.suggestion('Try this');
      expect(msg).toContain('💡');
      expect(msg).toContain('Try this');
    });
  });

  describe('Duration Formatting', () => {
    it('should format milliseconds', () => {
      expect(fmt.formatDuration(500)).toBe('500ms');
      expect(fmt.formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(fmt.formatDuration(1000)).toBe('1.0s');
      expect(fmt.formatDuration(5500)).toBe('5.5s');
      expect(fmt.formatDuration(59000)).toBe('59.0s');
    });

    it('should format minutes and seconds', () => {
      expect(fmt.formatDuration(60000)).toBe('1m 0s');
      expect(fmt.formatDuration(90000)).toBe('1m 30s');
      expect(fmt.formatDuration(3599000)).toBe('59m 59s');
    });

    it('should format hours and minutes', () => {
      expect(fmt.formatDuration(3600000)).toBe('1h 0m');
      expect(fmt.formatDuration(5400000)).toBe('1h 30m');
      expect(fmt.formatDuration(7200000)).toBe('2h 0m');
    });
  });

  describe('File Size Formatting', () => {
    it('should format bytes', () => {
      expect(fmt.formatBytes(0)).toBe('0 B');
      expect(fmt.formatBytes(500)).toBe('500.0 B');
      expect(fmt.formatBytes(1023)).toBe('1023.0 B');
    });

    it('should format kilobytes', () => {
      expect(fmt.formatBytes(1024)).toBe('1.0 KB');
      expect(fmt.formatBytes(5120)).toBe('5.0 KB');
      expect(fmt.formatBytes(1024 * 500)).toBe('500.0 KB');
    });

    it('should format megabytes', () => {
      expect(fmt.formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(fmt.formatBytes(1024 * 1024 * 5.5)).toBe('5.5 MB');
    });

    it('should format gigabytes', () => {
      expect(fmt.formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
      expect(fmt.formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
    });
  });

  describe('Header and Section', () => {
    beforeEach(() => {
      process.stdout.isTTY = true;
    });

    it('should format header', () => {
      const h = fmt.header('TITLE');
      expect(h).toContain('TITLE');
    });

    it('should format header with emoji', () => {
      const h = fmt.header('ROUTES', '🚌');
      expect(h).toContain('🚌');
      expect(h).toContain('ROUTES');
    });

    it('should format section', () => {
      const s = fmt.section('Title', 'Content', '📊');
      expect(s).toContain('Title');
      expect(s).toContain('Content');
      expect(s).toContain('📊');
    });
  });

  describe('Status Line', () => {
    beforeEach(() => {
      process.stdout.isTTY = false;
    });

    it('should format status line with number', () => {
      const line = fmt.statusLine('✓', 'Processed', 1234);
      expect(line).toContain('✓');
      expect(line).toContain('Processed');
      expect(line).toContain('1,234');
    });

    it('should format status line with string', () => {
      const line = fmt.statusLine('📍', 'Database', '/path/to/db');
      expect(line).toContain('📍');
      expect(line).toContain('Database');
      expect(line).toContain('/path/to/db');
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format timestamp', () => {
      const date = new Date('2025-01-15T14:30:45');
      const formatted = fmt.formatTimestamp(date);

      // Format may vary by locale, but should contain key elements
      expect(formatted).toMatch(/2025/);
      expect(formatted).toMatch(/01/);
      expect(formatted).toMatch(/15/);
      expect(formatted).toMatch(/14/);
      expect(formatted).toMatch(/30/);
    });
  });
});
