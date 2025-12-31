import { Command } from 'commander';
import { CommandRunner } from '../cli/command-runner';
import { geocodeZones } from '../lib/geocoding';
import * as fmt from '../lib/cli-format';

interface GeocodeOptions {
  limit?: number;
}

export function register(program: Command): void {
  program
    .command('geocode')
    .description('Geocode zones to routing addresses')
    .option('-l, --limit <count>', 'Limit number of zones to process', parseInt)
    .action(action);
}

export async function action(options: GeocodeOptions): Promise<void> {
  const apiKey = process.env.DIGITRANSIT_API_KEY || process.env.HSL_API_KEY;

  const runner = new CommandRunner<
    GeocodeOptions,
    Awaited<ReturnType<typeof geocodeZones>>
  >({
    title: 'GEOCODING ZONES',
    emoji: '📍',
    headerInfo: {
      API: 'Digitransit Geocoding API',
      Auth: apiKey ? fmt.success('Authenticated') : fmt.warning('No API key'),
      Mode: options.limit ? `Limited (${options.limit} zones)` : 'Full dataset',
    },
  });

  if (!apiKey) {
    console.log(fmt.warningMessage('No API key configured'));
    console.log(fmt.dim('  Set DIGITRANSIT_API_KEY or HSL_API_KEY environment variable'));
    console.log(fmt.dim('  Geocoding may be rate-limited without authentication'));
    console.log('');
  }

  await runner.run(
    options,
    async (opts, emitter) =>
      geocodeZones({
        limit: opts.limit,
        apiKey,
        emitter,
      }),
    (result, duration) => {
      const total = result.success + result.failed;
      const successPct = total > 0 ? ((result.success / total) * 100).toFixed(1) : '0.0';
      const failedPct = total > 0 ? ((result.failed / total) * 100).toFixed(1) : '0.0';

      console.log('');
      console.log(fmt.divider(50));
      console.log(fmt.bold('SUMMARY'));
      console.log(fmt.divider(50));

      // Check for complete failure
      if (result.failed === total && total > 0) {
        console.log(
          fmt.errorMessage(`ALL zones failed geocoding (${result.failed}/${total})`)
        );
        console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
        console.log('');
        console.log(fmt.header('ERRORS', '⚠️'));
        console.log(
          fmt.dim(
            `  Showing first ${Math.min(5, result.errors.length)} of ${result.errors.length} errors:`
          )
        );
        result.errors.slice(0, 5).forEach((err: { zoneId: string; error: string }) => {
          console.log(fmt.error(`  ${fmt.symbols.bullet} ${err.zoneId}: ${err.error}`));
        });
        console.log('');
        console.log(
          fmt.errorMessage('Geocoding completely failed - cannot proceed to routing')
        );
        console.log(fmt.dim('  Fix the errors above and retry geocoding'));
        console.log('');
        process.exit(1);
      }

      // Check for partial failure
      if (result.failed > 0) {
        console.log(
          fmt.successMessage(
            `Successfully geocoded: ${result.success.toLocaleString()} zones (${successPct}%)`
          )
        );
        console.log(
          fmt.errorMessage(
            `Failed geocoding: ${result.failed.toLocaleString()} zones (${failedPct}%)`
          )
        );
        console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
        console.log('');
        console.log(fmt.header('ERRORS', '⚠️'));
        console.log(
          fmt.dim(
            `  Showing first ${Math.min(5, result.errors.length)} of ${result.errors.length} errors:`
          )
        );
        result.errors.slice(0, 5).forEach((err: { zoneId: string; error: string }) => {
          console.log(fmt.error(`  ${fmt.symbols.bullet} ${err.zoneId}: ${err.error}`));
        });
        console.log('');
        console.log(fmt.errorMessage('Geocoding had failures - cannot proceed'));
        console.log(fmt.dim('  All zones must geocode successfully'));
        console.log(fmt.dim('  Fix the errors above and retry geocoding'));
        console.log('');
        process.exit(1);
      }

      // Complete success
      console.log(
        fmt.successMessage(
          `Successfully geocoded: ${result.success.toLocaleString()} zones (${successPct}%)`
        )
      );
      console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
      console.log('');
      console.log(fmt.suggestion("Next: Run 'varikko routes' to calculate transit routes"));
      console.log('');
    }
  );
}
