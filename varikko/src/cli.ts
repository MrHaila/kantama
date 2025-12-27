import { Command } from 'commander';
import { openDB } from './lib/db';
import { fetchZones, initializeSchema } from './lib/zones';
import { geocodeZones } from './lib/geocoding';
import { buildRoutes, getOTPConfig } from './lib/routing';
import { clearData, getCounts } from './lib/clearing';
import { createProgressEmitter } from './lib/events';
import readline from 'readline';

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
    .action(async (options) => {
      const db = openDB();
      const emitter = createProgressEmitter();

      // Validate period if specified
      const validPeriods = ['MORNING', 'EVENING', 'MIDNIGHT'];
      if (options.period && !validPeriods.includes(options.period.toUpperCase())) {
        console.error(`Invalid period: ${options.period}`);
        console.error(`Valid periods: ${validPeriods.join(', ')}`);
        process.exit(1);
      }

      const config = getOTPConfig();
      console.log(`Using OTP: ${config.url} (${config.isLocal ? 'local' : 'remote'})`);
      console.log(`Concurrency: ${config.concurrency} requests`);
      if (options.period) {
        console.log(`Period: ${options.period.toUpperCase()}`);
      } else {
        console.log('Processing all periods: MORNING, EVENING, MIDNIGHT');
      }
      if (options.test) {
        console.log('⚠️  Test mode: 5 random routes per period\n');
      }

      if (!config.isLocal && !config.apiKey) {
        console.error('Missing HSL_API_KEY or DIGITRANSIT_API_KEY environment variable');
        console.error('Required for remote OTP API');
        process.exit(1);
      }

      if (!config.isLocal) {
        console.log('⚠️  Using remote API - this will be slow');
        console.log('   Consider running local OTP for faster processing\n');
      }

      emitter.on('progress', (event) => {
        if (event.type === 'start') {
          console.log('Starting route calculation...');
        } else if (event.type === 'progress') {
          const current = event.current || 0;
          const total = event.total || 0;
          const pct = total ? Math.floor((current / total) * 100) : 0;
          const metadata = event.metadata || {};
          console.log(
            `Progress: ${current}/${total} (${pct}%) - ` +
            `OK: ${metadata.ok || 0}, No Route: ${metadata.noRoute || 0}, Errors: ${metadata.errors || 0}`
          );
        } else if (event.type === 'complete') {
          console.log('✓', event.message || 'Complete');
        } else if (event.type === 'error') {
          console.error('✗', event.message || 'Error', event.error);
        }
      });

      try {
        const result = await buildRoutes(db, {
          period: options.period ? options.period.toUpperCase() as 'MORNING' | 'EVENING' | 'MIDNIGHT' : undefined,
          testMode: options.test,
          testLimit: 5,
          emitter,
        });

        console.log('\n=== Route Calculation Summary ===');
        console.log(`Total processed: ${result.processed}`);
        console.log(`✓ Successful: ${result.ok}`);
        console.log(`⊘ No route found: ${result.noRoute}`);
        console.log(`✗ Errors: ${result.errors}`);

        if (result.ok > 0) {
          console.log('\nNext step: Run `varikko deciles` to calculate heatmap data');
        } else {
          console.log('\n⚠️  No successful routes calculated');
          console.log('   Check that OTP server is running (if using local mode)');
          console.log('   or verify API credentials (if using remote mode)');
        }
      } catch (error) {
        console.error('Error:', error);
        process.exit(1);
      } finally {
        db.close();
      }
    });

  program
    .command('clear')
    .description('Clear or reset data')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--routes', 'Reset routes to PENDING only')
    .option('--places', 'Clear places and routes')
    .option('--metadata', 'Clear metadata only')
    .option('--deciles', 'Clear deciles only')
    .action(async (options) => {
      const db = openDB();

      try {
        const { routes, places, metadata, deciles } = options;
        const clearAll = !routes && !places && !metadata && !deciles;

        // Get current counts
        const counts = getCounts(db);

        // Build target description
        let targetMsg = 'ALL data (routes, places, metadata, deciles)';
        if (!clearAll) {
          const targets = [];
          if (routes) targets.push('routes (reset to PENDING)');
          if (places) targets.push('places and routes');
          if (metadata) targets.push('metadata');
          if (deciles) targets.push('deciles');
          targetMsg = targets.join(', ');
        }

        // Show current state
        console.log('Current database state:');
        console.log(`  Places: ${counts.places.toLocaleString()}`);
        console.log(`  Routes: ${counts.routes.toLocaleString()}`);
        console.log(`  Metadata: ${counts.metadata.toLocaleString()}`);
        console.log(`  Deciles: ${counts.deciles.toLocaleString()}`);
        console.log();

        // Confirmation prompt
        if (!options.force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(`Are you sure you want to clear ${targetMsg}? (y/N) `, (ans) => {
              rl.close();
              resolve(ans);
            });
          });

          if (answer.toLowerCase() !== 'y') {
            console.log('Aborted.');
            db.close();
            process.exit(0);
          }
        }

        const emitter = createProgressEmitter();

        emitter.on('progress', (event) => {
          if (event.type === 'start') {
            console.log(`Clearing ${targetMsg}...`);
          } else if (event.type === 'progress') {
            console.log(event.message || '');
          } else if (event.type === 'complete') {
            console.log('✓', event.message || 'Complete');
          } else if (event.type === 'error') {
            console.error('✗', event.message || 'Error', event.error);
          }
        });

        const result = clearData(db, {
          routes,
          places,
          metadata,
          deciles,
          emitter,
        });

        console.log('\nDeleted records:');
        if (result.deleted.places !== undefined) {
          console.log(`  Places: ${result.deleted.places.toLocaleString()}`);
        }
        if (result.deleted.routes !== undefined) {
          console.log(
            `  Routes: ${result.deleted.routes.toLocaleString()}${routes && !places ? ' (reset to PENDING)' : ''}`
          );
        }
        if (result.deleted.metadata !== undefined) {
          console.log(`  Metadata: ${result.deleted.metadata.toLocaleString()}`);
        }
        if (result.deleted.deciles !== undefined) {
          console.log(`  Deciles: ${result.deleted.deciles.toLocaleString()}`);
        }
      } catch (error) {
        console.error('Error:', error);
        process.exit(1);
      } finally {
        db.close();
      }
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
