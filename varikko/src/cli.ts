import { Command } from 'commander';
import { openDB } from './lib/db';
import { fetchZones, initializeSchema } from './lib/zones';
import { geocodeZones } from './lib/geocoding';
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

  // Schema initialization command
  program
    .command('init')
    .description('Initialize database schema (DESTRUCTIVE - drops existing data)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action((options) => {
      const db = openDB();

      try {
        if (!options.force) {
          console.log('⚠️  WARNING: This will DROP all existing data in the database!');
          console.log('Run with --force flag to confirm: varikko init --force');
          process.exit(0);
        }

        console.log('Initializing database schema...');
        initializeSchema(db);
        console.log('✓ Database schema initialized successfully');
        console.log('\nYou can now run workflows like:');
        console.log('  varikko fetch --test');
        console.log('  varikko geocode');
      } catch (error) {
        console.error('Error initializing schema:', error);
        process.exit(1);
      } finally {
        db.close();
      }
    });

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
        const apiKey = process.env.DIGITRANSIT_API_KEY || process.env.HSL_API_KEY;

        if (!apiKey) {
          console.log('⚠️  No API key configured (set DIGITRANSIT_API_KEY or HSL_API_KEY)');
          console.log('   Geocoding may fail without authentication\n');
        }

        const result = await geocodeZones(db, {
          testMode: options.test,
          testLimit: 5,
          apiKey,
          emitter,
        });

        console.log(`\nSuccessfully geocoded: ${result.success} zones`);
        console.log(`Failed (fallback to geometric): ${result.failed} zones`);

        if (result.errors.length > 0) {
          console.log('\nSample errors (first 3):');
          result.errors.slice(0, 3).forEach((err) => {
            console.log(`  • ${err.id}: ${err.error}`);
          });
        }
      } catch (error) {
        console.error('Error:', error);
        process.exit(1);
      } finally {
        db.close();
      }
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
