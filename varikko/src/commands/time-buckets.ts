import { Command } from 'commander';
import { calculateTimeBuckets } from '../lib/time-buckets';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';

interface TimeBucketsOptions {
  force?: boolean;
}

export function register(program: Command): void {
  program
    .command('time-buckets')
    .description('Calculate heatmap time buckets')
    .option('-f, --force', 'Force recalculation even if already calculated')
    .action(action);
}

export function action(options: TimeBucketsOptions): void {
  const emitter = createProgressEmitter();
  const startTime = Date.now();

  // Header
  console.log('');
  console.log(fmt.header('CALCULATING TIME BUCKETS', '📊'));
  console.log('');
  console.log(
    fmt.keyValue('Mode:', options.force ? 'Force recalculation' : 'Normal', 15)
  );
  console.log('');

  emitter.on('progress', (event) => {
    if (event.type === 'start') {
      console.log(fmt.infoMessage('Analyzing route durations...'));
    } else if (event.type === 'progress') {
      if (event.message) console.log(fmt.dim(event.message));
    } else if (event.type === 'complete') {
      console.log(fmt.successMessage(event.message || 'Complete'));
    } else if (event.type === 'error') {
      console.error(fmt.errorMessage(event.message || 'Error'));
      if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
    }
  });

  try {
    const result = calculateTimeBuckets({
      force: options.force,
      emitter,
    });

    const duration = Date.now() - startTime;

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('TIME BUCKET DISTRIBUTION'));
    console.log(fmt.divider(50));

    result.timeBuckets.forEach((bucket) => {
      console.log(
        fmt.keyValue(
          `  Bucket ${bucket.number}:`,
          `${bucket.label} ${fmt.dim('(' + bucket.color + ')')}`,
          18
        )
      );
    });

    console.log('');
    console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
    console.log('');
    console.log(fmt.successMessage('Time buckets ready for heatmap visualization'));
    console.log('');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exist')) {
      console.log('');
      console.log(fmt.warningMessage('Time buckets already calculated'));
      console.log(fmt.dim('  Use --force flag to recalculate'));
      console.log('');
      process.exit(0);
    } else {
      console.error('');
      console.error(fmt.errorMessage('Time bucket calculation failed'));
      console.error(
        fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`)
      );
      console.error('');
      process.exit(1);
    }
  }
}
