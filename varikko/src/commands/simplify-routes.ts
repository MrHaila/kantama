import { Command } from 'commander';
import { validatePeriod } from '../cli/validators';
import { simplifyRouteFiles } from '../lib/simplify-routes';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';
import type { TimePeriod } from '../shared/types';

interface SimplifyRoutesOptions {
  period: string;
  tolerance?: number;
  dryRun?: boolean;
}

export function register(program: Command): void {
  program
    .command('simplify-routes')
    .description('Simplify polylines in stored route files to reduce file size')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT, ALL)', 'ALL')
    .option('-t, --tolerance <number>', 'Simplification tolerance (default: 0.0005 ≈ 56m)', parseFloat)
    .option('--dry-run', 'Show what would change without writing files')
    .action(action);
}

export function action(options: SimplifyRoutesOptions): void {
  const emitter = createProgressEmitter();
  const startTime = Date.now();

  // Parse periods
  const periods: TimePeriod[] =
    options.period === 'ALL' ? ['MORNING', 'EVENING', 'MIDNIGHT'] : [validatePeriod(options.period) as TimePeriod];

  const tolerance = options.tolerance ?? 0.0005;
  const dryRun = options.dryRun ?? false;

  // Header
  console.log('');
  console.log(fmt.header('SIMPLIFYING ROUTE FILES', '🗜️'));
  console.log('');
  console.log(fmt.keyValue('Periods:', periods.join(', '), 15));
  console.log(fmt.keyValue('Tolerance:', `${tolerance} (~${Math.round(tolerance * 1e5)}m)`, 15));
  console.log(fmt.keyValue('Mode:', dryRun ? 'DRY RUN (no changes)' : 'WRITE', 15));
  console.log('');

  emitter.on('progress', (event) => {
    if (event.type === 'start') {
      console.log(fmt.infoMessage(event.message || 'Starting...'));
    } else if (event.type === 'progress') {
      if (event.message) console.log(fmt.dim(`  ${event.message}`));
    } else if (event.type === 'complete') {
      console.log(fmt.successMessage(event.message || 'Complete'));
    } else if (event.type === 'error') {
      console.error(fmt.errorMessage(event.message || 'Error'));
      if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
    }
  });

  try {
    const result = simplifyRouteFiles({ periods, tolerance, dryRun, emitter });

    const duration = Date.now() - startTime;

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('SUMMARY'));
    console.log(fmt.divider(50));
    console.log(fmt.keyValue('Files processed:', result.filesProcessed.toString(), 20));
    console.log(fmt.keyValue('Legs simplified:', result.legsSimplified.toString(), 20));
    console.log(fmt.keyValue('Original size:', fmt.formatBytes(result.originalBytes), 20));
    console.log(fmt.keyValue('New size:', fmt.formatBytes(result.newBytes), 20));
    console.log(fmt.keyValue('Reduction:', `${result.reductionPercent.toFixed(1)}%`, 20));
    console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 20));
    console.log('');

    if (dryRun) {
      console.log(fmt.infoMessage('DRY RUN - No files were modified'));
      console.log(fmt.dim('  Run without --dry-run to apply changes'));
    } else {
      console.log(fmt.successMessage('Route files simplified successfully'));
    }
    console.log('');
  } catch (error) {
    console.error('');
    console.error(fmt.errorMessage('Route simplification failed'));
    console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
    console.error('');
    process.exit(1);
  }
}
