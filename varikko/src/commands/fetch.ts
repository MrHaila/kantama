import { Command } from 'commander';
import { CommandRunner } from '../cli/command-runner';
import { fetchZonesMultiCity } from '../lib/zones';
import * as fmt from '../lib/cli-format';

interface FetchOptions {
  limit?: number;
}

export function register(program: Command): void {
  program
    .command('fetch')
    .description('Fetch postal code zones from multi-city sources')
    .option('-l, --limit <count>', 'Limit number of zones to process', parseInt)
    .action(action);
}

export async function action(options: FetchOptions): Promise<void> {
  const runner = new CommandRunner<
    FetchOptions,
    Awaited<ReturnType<typeof fetchZonesMultiCity>>
  >({
    title: 'FETCHING POSTAL CODE ZONES',
    emoji: '🌍',
    headerInfo: {
      Mode: options.limit ? `Limited (${options.limit} zones)` : 'Full dataset',
      Sources: 'Helsinki, Espoo, Vantaa, Kauniainen WFS',
    },
  });

  await runner.run(
    options,
    async (opts, emitter) =>
      fetchZonesMultiCity({
        limit: opts.limit,
        emitter,
      }),
    (result, duration) => {
      console.log('');
      console.log(fmt.divider(50));
      console.log(fmt.bold('SUMMARY'));
      console.log(fmt.divider(50));
      console.log(
        fmt.successMessage(`Fetched ${result.zoneCount.toLocaleString()} zones`)
      );
      console.log(
        fmt.successMessage(`Created ${result.routeCount.toLocaleString()} route combinations`)
      );
      console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
      console.log('');
      console.log(
        fmt.suggestion("Next: Run 'varikko geocode' to geocode zones to routing addresses")
      );
      console.log('');
    }
  );
}
