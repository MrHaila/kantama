import { Command } from 'commander';
import { validatePeriod } from '../cli/validators';
import { calculateReachability } from '../lib/reachability';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';

interface ReachabilityOptions {
  period: string;
  force?: boolean;
}

export function register(program: Command): void {
  program
    .command('reachability')
    .description('Calculate reachability scores for heatmap')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)', 'MORNING')
    .option('-f, --force', 'Force recalculation even if already calculated')
    .action(action);
}

export function action(options: ReachabilityOptions): void {
  const emitter = createProgressEmitter();
  const startTime = Date.now();

  const period = validatePeriod(options.period);

  // Header
  console.log('');
  console.log(fmt.header('CALCULATING REACHABILITY', '📊'));
  console.log('');
  console.log(fmt.keyValue('Period:', period, 15));
  console.log(
    fmt.keyValue('Mode:', options.force ? 'Force recalculation' : 'Normal', 15)
  );
  console.log('');

  emitter.on('progress', (event) => {
    if (event.type === 'start') {
      console.log(fmt.infoMessage('Analyzing zone connectivity...'));
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
    const result = calculateReachability({
      period: period as 'MORNING' | 'EVENING' | 'MIDNIGHT',
      force: options.force,
      emitter,
    });

    const duration = Date.now() - startTime;

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('SUMMARY'));
    console.log(fmt.divider(50));
    console.log(
      fmt.keyValue('Zones processed:', result.zonesProcessed.toLocaleString(), 20)
    );
    console.log(
      fmt.keyValue('Zones with data:', result.zonesWithData.toLocaleString(), 20)
    );
    console.log(
      fmt.keyValue('No connections:', result.zonesWithNoConnections.length.toLocaleString(), 20)
    );
    if (result.bestConnected) {
      console.log(
        fmt.keyValue(
          'Best connected:',
          `${result.bestConnected.zoneId} (score: ${result.bestConnected.score.toFixed(3)})`,
          20
        )
      );
    }
    if (result.worstConnected) {
      console.log(
        fmt.keyValue(
          'Worst connected:',
          `${result.worstConnected.zoneId} (score: ${result.worstConnected.score.toFixed(3)})`,
          20
        )
      );
    }
    console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 20));

    if (result.zonesWithNoConnections.length > 0) {
      console.log('');
      console.log(fmt.bold('ZONES WITH NO CONNECTIONS:'));
      console.log(fmt.divider(50));
      result.zonesWithNoConnections.forEach(zoneId => {
        console.log(fmt.dim(`  ${zoneId}`));
      });
    }

    console.log('');
    console.log(fmt.successMessage('Reachability scores ready for opas heatmap'));
    console.log('');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already calculated')) {
      console.log('');
      console.log(fmt.warningMessage('Reachability already calculated'));
      console.log(fmt.dim('  Use --force flag to recalculate'));
      console.log('');
      process.exit(0);
    } else {
      console.error('');
      console.error(fmt.errorMessage('Reachability calculation failed'));
      console.error(
        fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`)
      );
      console.error('');
      process.exit(1);
    }
  }
}
