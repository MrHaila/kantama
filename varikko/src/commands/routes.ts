import { Command } from 'commander';
import { validatePeriod, validateTransportMode } from '../cli/validators';
import { buildRoutes, getOTPConfig } from '../lib/routing';
import { createProgressEmitter } from '../lib/events';
import * as fmt from '../lib/cli-format';

interface RoutesOptions {
  zones?: number;
  limit?: number;
  period?: string;
  mode: string;
  retry?: boolean;
}

export function register(program: Command): void {
  program
    .command('routes')
    .description('Calculate transit routes')
    .option('-z, --zones <count>', 'Number of random origin zones to process', parseInt)
    .option('-l, --limit <count>', 'Limit number of routes to process', parseInt)
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
    .option('-m, --mode <mode>', 'Transport mode (WALK, BICYCLE)', 'WALK')
    .option('-r, --retry', 'Retry previously failed routes (ERROR status)')
    .action(action);
}

export async function action(options: RoutesOptions): Promise<void> {
  const emitter = createProgressEmitter();
  const startTime = Date.now();

  // Validate period if specified
  const period = options.period ? validatePeriod(options.period) : undefined;

  // Validate transport mode
  const transportMode = validateTransportMode(options.mode);

  const config = getOTPConfig();

  // Check for missing API key
  if (!config.isLocal && !config.apiKey) {
    console.error('');
    console.error(fmt.errorMessage('Missing API key'));
    console.error(fmt.dim('  Set HSL_API_KEY or DIGITRANSIT_API_KEY environment variable'));
    console.error(fmt.dim('  Required for remote OTP API'));
    console.error('');
    process.exit(1);
  }

  // Header
  console.log('');
  console.log(
    fmt.header(
      `CALCULATING ROUTES (${transportMode})`,
      transportMode === 'BICYCLE' ? '🚴' : '🚌'
    )
  );
  console.log('');
  console.log(
    fmt.keyValue('OTP:', `${config.url} (${config.isLocal ? 'local' : 'remote'})`, 15)
  );
  console.log(fmt.keyValue('Concurrency:', `${config.concurrency} requests`, 15));
  console.log(
    fmt.keyValue(
      'Period:',
      options.period
        ? options.period.toUpperCase()
        : 'All (MORNING, EVENING, MIDNIGHT)',
      15
    )
  );
  console.log(fmt.keyValue('Transport:', transportMode, 15));

  let modeDesc = 'Full dataset';
  if (options.retry) {
    modeDesc = 'Retry failed routes';
  } else if (options.zones && options.limit) {
    modeDesc = `${options.zones} zones, ${options.limit} routes`;
  } else if (options.zones) {
    modeDesc = `${options.zones} random origin zones`;
  } else if (options.limit) {
    modeDesc = `${options.limit} random routes`;
  }
  console.log(fmt.keyValue('Mode:', modeDesc, 15));
  console.log('');

  if (!config.isLocal) {
    console.log(fmt.warningMessage('Using remote API - processing will be slower'));
    console.log(fmt.dim('  Consider running local OTP server for faster processing'));
    console.log('');
  }

  let lastProgress = 0;
  let lastPeriod = '';
  let lastUpdateTime = 0;
  let progressStartTime = startTime;
  emitter.on('progress', (event) => {
    if (event.type === 'start') {
      console.log(fmt.infoMessage('Starting route calculation...'));
      progressStartTime = Date.now();
      // Show initial progress immediately
      const total = event.total || 0;
      const bar = fmt.progressBar(0, total, { width: 30 });
      fmt.writeProgress(`${bar} ${fmt.dim('initializing...')}`);
    } else if (event.type === 'progress') {
      const current = event.current || 0;
      const total = event.total || 0;
      const metadata = event.metadata || {};
      const now = Date.now();

      // Show period change (print on new line, then continue progress)
      if (metadata.period && metadata.period !== lastPeriod) {
        if (lastPeriod) {
          fmt.endProgress();
        }
        console.log(fmt.dim(`  Processing ${metadata.period}...`));
        lastPeriod = metadata.period;
      }

      const progress = total ? Math.floor((current / total) * 100) : 0;
      // Update every 1% or every 500ms or at completion
      const shouldUpdate =
        progress > lastProgress || now - lastUpdateTime >= 500 || current === total;

      if (shouldUpdate) {
        const elapsed = now - progressStartTime;
        const elapsedStr = fmt.formatDuration(elapsed);

        // Calculate ETA based on progress
        let etaStr = '';
        if (current > 0 && current < total) {
          const rate = current / elapsed; // items per ms
          const remaining = total - current;
          const etaMs = remaining / rate;
          etaStr = ` ETA: ${fmt.formatDuration(etaMs)}`;
        }

        const bar = fmt.progressBar(current, total, { width: 30 });
        const stats = fmt.formatRouteStats({
          ok: metadata.ok,
          noRoute: metadata.noRoute,
          errors: metadata.errors,
        });
        const timeInfo = fmt.dim(` [${elapsedStr}${etaStr}]`);
        fmt.writeProgress(`${bar} ${stats}${timeInfo}`);
        lastProgress = progress;
        lastUpdateTime = now;
      }
    } else if (event.type === 'complete') {
      fmt.endProgress();
      console.log(fmt.successMessage(event.message || 'Complete'));
    } else if (event.type === 'error') {
      fmt.endProgress();
      console.error(fmt.errorMessage(event.message || 'Error'));
      if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
    }
  });

  try {
    const result = await buildRoutes({
      period: period as 'MORNING' | 'EVENING' | 'MIDNIGHT' | undefined,
      mode: transportMode as 'WALK' | 'BICYCLE',
      zones: options.zones,
      limit: options.limit,
      retryFailed: options.retry,
      emitter,
    });

    const duration = Date.now() - startTime;

    console.log('');
    console.log(fmt.divider(50));
    console.log(fmt.bold('SUMMARY'));
    console.log(fmt.divider(50));
    console.log(fmt.keyValue('Total processed:', result.processed.toLocaleString(), 20));
    console.log(fmt.successMessage(`Successful: ${result.ok.toLocaleString()} routes`));
    if (result.noRoute > 0) {
      console.log(
        fmt.warningMessage(`No route found: ${result.noRoute.toLocaleString()} routes`)
      );
    }
    if (result.errors > 0) {
      console.log(fmt.errorMessage(`Errors: ${result.errors.toLocaleString()} routes`));
    }
    console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 20));

    console.log('');
    if (result.ok > 0) {
      console.log(
        fmt.suggestion("Next: Run 'varikko time-buckets' to calculate heatmap data")
      );
    } else {
      console.log(fmt.warningMessage('No successful routes calculated'));
      if (config.isLocal) {
        console.log(fmt.dim('  Check that OTP server is running locally'));
      } else {
        console.log(fmt.dim('  Verify API credentials and network connectivity'));
      }
    }
    console.log('');
  } catch (error) {
    console.error('');
    console.error(fmt.errorMessage('Route calculation failed'));
    console.error(
      fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`)
    );
    console.error('');
    process.exit(1);
  }
}
