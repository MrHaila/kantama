import { Command } from 'commander';
import { validatePeriod } from '../cli/validators';
import { generateTransitLayer } from '../lib/transit-layer';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';
import type { TimePeriod } from '../shared/types';

interface TransitLayerOptions {
  period: string;
  tolerance?: number;
}

export function register(program: Command): void {
  program
    .command('transit-layer')
    .description('Generate SVG visualization of transit route usage')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT, ALL)', 'ALL')
    .option('-t, --tolerance <number>', 'Simplification tolerance (default: 0.0005 ≈ 56m)', parseFloat)
    .action(action);
}

export function action(options: TransitLayerOptions): void {
  const emitter = createProgressEmitter();
  const startTime = Date.now();

  // Parse periods
  const periods: TimePeriod[] =
    options.period === 'ALL' ? ['MORNING', 'EVENING', 'MIDNIGHT'] : [validatePeriod(options.period) as TimePeriod];

  const tolerance = options.tolerance ?? 0.0005;

  // Header
  console.log('');
  console.log(fmt.header('GENERATING TRANSIT LAYERS', '🚇'));
  console.log('');
  console.log(fmt.keyValue('Periods:', periods.join(', '), 15));
  console.log(fmt.keyValue('Tolerance:', `${tolerance} (~${Math.round(tolerance * 1e5)}m)`, 15));
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
    const results = generateTransitLayer({ periods, tolerance, emitter });

    const duration = Date.now() - startTime;

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('SUMMARY'));
    console.log(fmt.divider(50));
    for (const result of results) {
      console.log(fmt.keyValue(`${result.period}:`, `${result.segmentCount} unique segments`, 20));
    }
    console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 20));
    console.log('');
    console.log(fmt.successMessage('Transit layers ready in opas/public/layers/'));
    console.log('');
  } catch (error) {
    console.error('');
    console.error(fmt.errorMessage('Transit layer generation failed'));
    console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
    console.error('');
    process.exit(1);
  }
}
