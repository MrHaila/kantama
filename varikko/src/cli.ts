import { Command } from 'commander';
import { openDB } from './lib/db';
import { fetchZones } from './lib/zones';
import { createProgressEmitter } from './lib/events';

export interface CLIOptions {
  interactive: boolean;
  test: boolean;
  period?: 'MORNING' | 'EVENING' | 'MIDNIGHT';
  force?: boolean;
}

export interface CLICommand {
  command: string;
  options: CLIOptions;
}

export function parseCLI(): CLICommand | null {
  const program = new Command();

  program
    .name('varikko')
    .description('Varikko Data Pipeline - Interactive TUI and CLI for transit route calculation')
    .version('2.0.0');

  // Default (no subcommand) → interactive TUI
  program.action(() => {
    // Will be handled in main.ts
  });

  // Subcommands (non-interactive mode)
  program
    .command('fetch')
    .description('Fetch postal code zones from WFS')
    .option('-t, --test', 'Test mode (5 zones only)')
    .action(async (options) => {
      const db = openDB();
      const emitter = createProgressEmitter();

      emitter.on('progress', (event) => {
        if (event.type === 'start' || event.type === 'progress') {
          console.log(event.message || '');
        } else if (event.type === 'complete') {
          console.log('✓', event.message || 'Complete');
        } else if (event.type === 'error') {
          console.error('✗', event.message || 'Error', event.error);
        }
      });

      try {
        const result = await fetchZones(db, {
          testMode: options.test,
          testLimit: 5,
          emitter,
        });

        console.log(`\nZones: ${result.zoneCount}`);
        console.log(`Routes: ${result.routeCount}`);
      } catch (error) {
        console.error('Error:', error);
        process.exit(1);
      } finally {
        db.close();
      }
    });

  program
    .command('geocode')
    .description('Geocode zones to routing addresses')
    .option('-t, --test', 'Test mode (5 zones only)')
    .action((_options) => {
      // Will be implemented in Phase 04
    });

  program
    .command('routes')
    .description('Calculate transit routes')
    .option('-t, --test', 'Test mode (5 random routes per period)')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
    .action((_options) => {
      // Will be implemented in Phase 05
    });

  program
    .command('clear')
    .description('Clear or reset data')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--routes', 'Reset routes to PENDING only')
    .option('--places', 'Clear places and routes')
    .option('--metadata', 'Clear metadata only')
    .action((_options) => {
      // Will be implemented in Phase 06
    });

  program
    .command('deciles')
    .description('Calculate heatmap deciles')
    .option('-f, --force', 'Force recalculation even if already calculated')
    .action((_options) => {
      // Will be implemented in Phase 07
    });

  program
    .command('export')
    .description('Export routes to JSON')
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
    .action((_options) => {
      // Will be implemented in Phase 09
    });

  program
    .command('map')
    .description('Process shapefiles and generate SVG')
    .action((_options) => {
      // Will be implemented in Phase 08
    });

  program
    .command('status')
    .description('Show database status')
    .action(() => {
      // Will be implemented in Phase 10
    });

  program.parse();

  // Return parsed command (null = interactive mode)
  const options = program.opts();
  const [command] = program.args;

  if (!command) {
    return null;  // Interactive mode
  }

  return {
    command,
    options: options as CLIOptions,
  };
}
