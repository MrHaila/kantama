import { Command } from 'commander';
import Database from 'better-sqlite3';
import { openDB, getDBStats, getDBPath, getRecentErrors } from './lib/db';
import { fetchZones, initializeSchema } from './lib/zones';
import { geocodeZones } from './lib/geocoding';
import { buildRoutes, getOTPConfig } from './lib/routing';
import { clearData, getCounts } from './lib/clearing';
import { calculateTimeBuckets } from './lib/time-buckets';
import { processMaps } from './lib/maps';
import { createProgressEmitter } from './lib/events';
import * as fmt from './lib/cli-format';
import readline from 'readline';
import fs from 'fs';

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

/**
 * Display comprehensive database status
 */
function showStatus(db: Database.Database): void {
  const dbPath = getDBPath();
  const stats = getDBStats(db);

  // Get database file info
  let dbSize = 'Unknown';
  let dbModified = 'Unknown';
  try {
    const fileStats = fs.statSync(dbPath);
    dbSize = fmt.formatBytes(fileStats.size);
    dbModified = fmt.formatTimestamp(fileStats.mtime);
  } catch {
    // File might not exist yet
  }

  // Header
  console.log('');
  console.log(fmt.boxTop(60, 'VARIKKO DATABASE STATUS'));
  console.log('');

  // Database Overview
  console.log(fmt.header('DATABASE', '💾'));
  console.log(fmt.keyValue('  Path:', dbPath, 18));
  console.log(fmt.keyValue('  Size:', dbSize, 18));
  console.log(fmt.keyValue('  Last Modified:', dbModified, 18));
  console.log('');

  // Zones Status
  console.log(fmt.header('ZONES', '📍'));
  if (stats.zones === 0) {
    console.log(fmt.muted('  No zones fetched yet'));
    console.log(fmt.suggestion('  Run \'varikko fetch\' to fetch postal code zones'));
  } else {
    console.log(fmt.keyValue('  Total Zones:', stats.zones, 18));
    if (stats.lastRun?.timestamp) {
      const lastFetch = new Date(stats.lastRun.timestamp);
      console.log(fmt.keyValue('  Last Fetch:', fmt.formatTimestamp(lastFetch), 18));
    }
  }
  console.log('');

  // Routes Status
  console.log(fmt.header('ROUTES', '🚌'));
  if (stats.routes.total === 0) {
    console.log(fmt.muted('  No routes calculated yet'));
    if (stats.zones > 0) {
      console.log(fmt.suggestion('  Run \'varikko geocode\' then \'varikko routes\' to calculate routes'));
    }
  } else {
    const totalPerPeriod = stats.routes.total / 3; // 3 periods: MORNING, EVENING, MIDNIGHT
    console.log(fmt.keyValue('  Total Routes:', `${stats.routes.total.toLocaleString()} (${totalPerPeriod.toLocaleString()}/period)`, 18));

    // Calculate percentages
    const okPct = stats.routes.total > 0 ? ((stats.routes.ok / stats.routes.total) * 100).toFixed(1) : '0.0';
    const pendingPct = stats.routes.total > 0 ? ((stats.routes.pending / stats.routes.total) * 100).toFixed(1) : '0.0';
    const noRoutePct = stats.routes.total > 0 ? ((stats.routes.no_route / stats.routes.total) * 100).toFixed(1) : '0.0';
    const errorPct = stats.routes.total > 0 ? ((stats.routes.error / stats.routes.total) * 100).toFixed(1) : '0.0';

    console.log(fmt.keyValue('  ' + fmt.symbols.success + ' Calculated:', `${stats.routes.ok.toLocaleString()} (${okPct}%)`, 18));

    if (stats.routes.pending > 0) {
      console.log(fmt.keyValue('  ' + fmt.symbols.pending + ' Pending:', `${stats.routes.pending.toLocaleString()} (${pendingPct}%)`, 18));
    }

    if (stats.routes.no_route > 0) {
      console.log(fmt.keyValue('  ' + fmt.symbols.noRoute + ' No Route:', `${stats.routes.no_route.toLocaleString()} (${noRoutePct}%)`, 18));
    }

    if (stats.routes.error > 0) {
      console.log(fmt.keyValue('  ' + fmt.symbols.error + ' Errors:', `${stats.routes.error.toLocaleString()} (${errorPct}%)`, 18));
    }
  }
  console.log('');

  // Time Buckets Status
  console.log(fmt.header('TIME BUCKETS', '🗺️'));
  if (stats.timeBuckets.calculated) {
    console.log(fmt.successMessage('  Calculated (6 buckets)'));
  } else if (stats.timeBuckets.count > 0) {
    console.log(fmt.warningMessage(`  Partially calculated (${stats.timeBuckets.count}/6 buckets)`));
    console.log(fmt.suggestion('  Run \'varikko time-buckets --force\' to recalculate'));
  } else {
    console.log(fmt.muted('  Not calculated yet'));
    if (stats.routes.ok > 0) {
      console.log(fmt.suggestion('  Run \'varikko time-buckets\' to generate heatmap buckets'));
    }
  }
  console.log('');

  // Recent Errors (if any)
  if (stats.routes.error > 0) {
    const errors = getRecentErrors(db, 5);
    console.log(fmt.header('RECENT ERRORS', '⚠️'));
    console.log(fmt.muted(`  Showing ${Math.min(5, errors.length)} of ${stats.routes.error.toLocaleString()} total errors`));
    console.log('');
    errors.forEach((err) => {
      try {
        const legsData = JSON.parse(err.legs);
        const errorMsg = legsData.error || 'Unknown error';
        console.log(fmt.muted(`  ${fmt.symbols.bullet} ${err.from_id} → ${err.to_id} (${err.time_period})`));
        console.log(`    ${fmt.error(errorMsg)}`);
      } catch {
        console.log(fmt.muted(`  ${fmt.symbols.bullet} ${err.from_id} → ${err.to_id} (${err.time_period})`));
      }
    });
    console.log('');
  }

  // Next Steps
  console.log(fmt.header('NEXT STEPS', '💡'));
  const suggestions: string[] = [];

  if (stats.zones === 0) {
    suggestions.push('Run \'varikko fetch\' to fetch postal code zones');
  } else if (stats.routes.total === 0) {
    suggestions.push('Run \'varikko geocode\' to geocode zones');
    suggestions.push('Run \'varikko routes\' to calculate transit routes');
  } else if (stats.routes.pending > 0) {
    suggestions.push('Run \'varikko routes\' to calculate pending routes');
  } else if (!stats.timeBuckets.calculated && stats.routes.ok > 0) {
    suggestions.push('Run \'varikko time-buckets\' to generate heatmap buckets');
  } else if (stats.timeBuckets.calculated) {
    suggestions.push('All data calculated! Ready for visualization');
  }

  if (suggestions.length > 0) {
    console.log(fmt.numberedList(suggestions, 2));
  } else {
    console.log(fmt.muted('  No actions needed'));
  }
  console.log('');

  console.log(fmt.boxBottom(60));
  console.log('');
}

export async function parseCLI(): Promise<CLICommand | null> {
  const program = new Command();

  program
    .name('varikko')
    .description('Varikko Data Pipeline - CLI for transit route calculation')
    .version('3.0.0');

  // Default (no subcommand) → show status
  program.action(() => {
    const db = openDB();
    try {
      showStatus(db);
    } finally {
      db.close();
    }
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
      const startTime = Date.now();

      // Header
      console.log('');
      console.log(fmt.header('FETCHING POSTAL CODE ZONES', '🌍'));
      console.log('');
      console.log(fmt.keyValue('Mode:', options.test ? 'Test (5 zones only)' : 'Full dataset', 15));
      console.log(fmt.keyValue('Sources:', 'Helsinki, Espoo, Vantaa WFS', 15));
      console.log('');

      let lastProgress = 0;
      emitter.on('progress', (event) => {
        if (event.type === 'start') {
          console.log(fmt.infoMessage('Fetching zones...'));
        } else if (event.type === 'progress') {
          // Show progress bar for significant updates
          if (event.current && event.total) {
            const progress = Math.floor((event.current / event.total) * 100);
            if (progress >= lastProgress + 10 || event.current === event.total) {
              console.log(fmt.progressBar(event.current, event.total, { width: 30 }));
              lastProgress = progress;
            }
          } else if (event.message) {
            console.log(fmt.dim(event.message));
          }
        } else if (event.type === 'complete') {
          console.log(fmt.successMessage(event.message || 'Complete'));
        } else if (event.type === 'error') {
          console.error(fmt.errorMessage(event.message || 'Error'));
          if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
        }
      });

      try {
        const result = await fetchZones(db, {
          testMode: options.test,
          testLimit: 5,
          emitter,
        });

        const duration = Date.now() - startTime;

        console.log('');
        console.log(fmt.divider(50));
        console.log(fmt.bold('SUMMARY'));
        console.log(fmt.divider(50));
        console.log(fmt.successMessage(`Fetched ${result.zoneCount.toLocaleString()} zones`));
        console.log(fmt.successMessage(`Created ${result.routeCount.toLocaleString()} route combinations`));
        console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
        console.log('');
        console.log(fmt.suggestion('Next: Run \'varikko geocode\' to geocode zones to routing addresses'));
        console.log('');
      } catch (error) {
        console.error('');
        console.error(fmt.errorMessage('Fetch failed'));
        console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        console.error('');
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
      const startTime = Date.now();

      const apiKey = process.env.DIGITRANSIT_API_KEY || process.env.HSL_API_KEY;

      // Header
      console.log('');
      console.log(fmt.header('GEOCODING ZONES', '📍'));
      console.log('');
      console.log(fmt.keyValue('API:', 'Digitransit Geocoding API', 15));
      console.log(fmt.keyValue('Auth:', apiKey ? fmt.success('Authenticated') : fmt.warning('No API key'), 15));
      console.log(fmt.keyValue('Mode:', options.test ? 'Test (5 zones only)' : 'Full dataset', 15));
      console.log('');

      if (!apiKey) {
        console.log(fmt.warningMessage('No API key configured'));
        console.log(fmt.dim('  Set DIGITRANSIT_API_KEY or HSL_API_KEY environment variable'));
        console.log(fmt.dim('  Geocoding may be rate-limited without authentication'));
        console.log('');
      }

      let lastProgress = 0;
      emitter.on('progress', (event) => {
        if (event.type === 'start') {
          console.log(fmt.infoMessage('Geocoding zones...'));
        } else if (event.type === 'progress') {
          if (event.current && event.total) {
            const progress = Math.floor((event.current / event.total) * 100);
            if (progress >= lastProgress + 10 || event.current === event.total) {
              console.log(fmt.progressBar(event.current, event.total, { width: 30 }));
              lastProgress = progress;
            }
          } else if (event.message) {
            console.log(fmt.dim(event.message));
          }
        } else if (event.type === 'complete') {
          console.log(fmt.successMessage(event.message || 'Complete'));
        } else if (event.type === 'error') {
          console.error(fmt.errorMessage(event.message || 'Error'));
          if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
        }
      });

      try {
        const result = await geocodeZones(db, {
          testMode: options.test,
          testLimit: 5,
          apiKey,
          emitter,
        });

        const duration = Date.now() - startTime;
        const total = result.success + result.failed;
        const successPct = total > 0 ? ((result.success / total) * 100).toFixed(1) : '0.0';
        const failedPct = total > 0 ? ((result.failed / total) * 100).toFixed(1) : '0.0';

        console.log('');
        console.log(fmt.divider(50));
        console.log(fmt.bold('SUMMARY'));
        console.log(fmt.divider(50));
        console.log(fmt.successMessage(`Successfully geocoded: ${result.success.toLocaleString()} zones (${successPct}%)`));
        if (result.failed > 0) {
          console.log(fmt.warningMessage(`Geometric fallback: ${result.failed.toLocaleString()} zones (${failedPct}%)`));
        }
        console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));

        if (result.errors.length > 0) {
          console.log('');
          console.log(fmt.header('ERRORS', '⚠️'));
          console.log(fmt.dim(`  Showing ${Math.min(3, result.errors.length)} of ${result.errors.length} errors`));
          result.errors.slice(0, 3).forEach((err) => {
            console.log(fmt.muted(`  ${fmt.symbols.bullet} ${err.id}: ${err.error}`));
          });
        }

        console.log('');
        console.log(fmt.suggestion('Next: Run \'varikko routes\' to calculate transit routes'));
        console.log('');
      } catch (error) {
        console.error('');
        console.error(fmt.errorMessage('Geocoding failed'));
        console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        console.error('');
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
      const startTime = Date.now();

      // Validate period if specified
      const validPeriods = ['MORNING', 'EVENING', 'MIDNIGHT'];
      if (options.period && !validPeriods.includes(options.period.toUpperCase())) {
        console.error('');
        console.error(fmt.errorMessage(`Invalid period: ${options.period}`));
        console.error(fmt.dim(`  Valid periods: ${validPeriods.join(', ')}`));
        console.error('');
        process.exit(1);
      }

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
      console.log(fmt.header('CALCULATING ROUTES', '🚌'));
      console.log('');
      console.log(fmt.keyValue('OTP:', `${config.url} (${config.isLocal ? 'local' : 'remote'})`, 15));
      console.log(fmt.keyValue('Concurrency:', `${config.concurrency} requests`, 15));
      console.log(fmt.keyValue('Period:', options.period ? options.period.toUpperCase() : 'All (MORNING, EVENING, MIDNIGHT)', 15));
      console.log(fmt.keyValue('Mode:', options.test ? 'Test (5 routes/period)' : 'Full dataset', 15));
      console.log('');

      if (!config.isLocal) {
        console.log(fmt.warningMessage('Using remote API - processing will be slower'));
        console.log(fmt.dim('  Consider running local OTP server for faster processing'));
        console.log('');
      }

      let lastProgress = 0;
      emitter.on('progress', (event) => {
        if (event.type === 'start') {
          console.log(fmt.infoMessage('Starting route calculation...'));
        } else if (event.type === 'progress') {
          const current = event.current || 0;
          const total = event.total || 0;
          const metadata = event.metadata || {};

          const progress = total ? Math.floor((current / total) * 100) : 0;
          if (progress >= lastProgress + 5 || current === total) {
            const bar = fmt.progressBar(current, total, { width: 30 });
            const stats = fmt.formatRouteStats({
              ok: metadata.ok,
              noRoute: metadata.noRoute,
              errors: metadata.errors,
            });
            console.log(`${bar} ${stats}`);
            lastProgress = progress;
          }
        } else if (event.type === 'complete') {
          console.log(fmt.successMessage(event.message || 'Complete'));
        } else if (event.type === 'error') {
          console.error(fmt.errorMessage(event.message || 'Error'));
          if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
        }
      });

      try {
        const result = await buildRoutes(db, {
          period: options.period ? options.period.toUpperCase() as 'MORNING' | 'EVENING' | 'MIDNIGHT' : undefined,
          testMode: options.test,
          testLimit: 5,
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
          console.log(fmt.warningMessage(`No route found: ${result.noRoute.toLocaleString()} routes`));
        }
        if (result.errors > 0) {
          console.log(fmt.errorMessage(`Errors: ${result.errors.toLocaleString()} routes`));
        }
        console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 20));

        console.log('');
        if (result.ok > 0) {
          console.log(fmt.suggestion('Next: Run \'varikko time-buckets\' to calculate heatmap data'));
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
        console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        console.error('');
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
    .option('--time-buckets', 'Clear time buckets only')
    .action(async (options) => {
      const db = openDB();

      try {
        const { routes, places, metadata, timeBuckets } = options;
        const clearAll = !routes && !places && !metadata && !timeBuckets;

        // Get current counts
        const counts = getCounts(db);

        // Build target description
        let targetMsg = 'ALL data (routes, places, metadata, time_buckets)';
        const targets: string[] = [];
        if (!clearAll) {
          if (routes) targets.push('routes (reset to PENDING)');
          if (places) targets.push('places and routes');
          if (metadata) targets.push('metadata');
          if (timeBuckets) targets.push('time_buckets');
          targetMsg = targets.join(', ');
        } else {
          targets.push('routes', 'places', 'metadata', 'time_buckets');
        }

        // Header
        console.log('');
        console.log(fmt.header('CLEAR DATA', '🗑️'));
        console.log('');

        // Show current state
        console.log(fmt.bold('Current database state:'));
        console.log(fmt.keyValue('  Places:', counts.places.toLocaleString(), 18));
        console.log(fmt.keyValue('  Routes:', counts.routes.toLocaleString(), 18));
        console.log(fmt.keyValue('  Metadata:', counts.metadata.toLocaleString(), 18));
        console.log(fmt.keyValue('  Time Buckets:', counts.timeBuckets.toLocaleString(), 18));
        console.log('');

        console.log(fmt.bold('Target:'));
        console.log(fmt.dim(`  ${targetMsg}`));
        console.log('');

        // Confirmation prompt
        if (!options.force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(fmt.warning(`⚠️  Clear ${targetMsg}? (y/N) `), (ans) => {
              rl.close();
              resolve(ans);
            });
          });

          if (answer.toLowerCase() !== 'y') {
            console.log(fmt.dim('Aborted.'));
            console.log('');
            db.close();
            process.exit(0);
          }
        }

        const emitter = createProgressEmitter();

        emitter.on('progress', (event) => {
          if (event.type === 'start') {
            console.log(fmt.infoMessage(`Clearing ${targetMsg}...`));
          } else if (event.type === 'progress') {
            if (event.message) console.log(fmt.dim(event.message));
          } else if (event.type === 'complete') {
            console.log(fmt.successMessage(event.message || 'Complete'));
          } else if (event.type === 'error') {
            console.error(fmt.errorMessage(event.message || 'Error'));
            if (event.error) console.error(fmt.dim(`  ${event.error.message}`));
          }
        });

        const result = clearData(db, {
          routes,
          places,
          metadata,
          timeBuckets,
          emitter,
        });

        console.log('');
        console.log(fmt.divider(50));
        console.log(fmt.bold('DELETED'));
        console.log(fmt.divider(50));
        if (result.deleted.places !== undefined) {
          console.log(fmt.keyValue('Places:', result.deleted.places.toLocaleString(), 15));
        }
        if (result.deleted.routes !== undefined) {
          const note = routes && !places ? ' (reset to PENDING)' : '';
          console.log(fmt.keyValue('Routes:', `${result.deleted.routes.toLocaleString()}${note}`, 15));
        }
        if (result.deleted.metadata !== undefined) {
          console.log(fmt.keyValue('Metadata:', result.deleted.metadata.toLocaleString(), 15));
        }
        if (result.deleted.timeBuckets !== undefined) {
          console.log(fmt.keyValue('Time Buckets:', result.deleted.timeBuckets.toLocaleString(), 15));
        }
        console.log('');
      } catch (error) {
        console.error('');
        console.error(fmt.errorMessage('Clear operation failed'));
        console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        console.error('');
        process.exit(1);
      } finally {
        db.close();
      }
    });

  program
    .command('time-buckets')
    .description('Calculate heatmap time buckets')
    .option('-f, --force', 'Force recalculation even if already calculated')
    .action((options) => {
      const db = openDB();
      const emitter = createProgressEmitter();
      const startTime = Date.now();

      // Header
      console.log('');
      console.log(fmt.header('CALCULATING TIME BUCKETS', '📊'));
      console.log('');
      console.log(fmt.keyValue('Mode:', options.force ? 'Force recalculation' : 'Normal', 15));
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
        const result = calculateTimeBuckets(db, {
          force: options.force,
          emitter,
        });

        const duration = Date.now() - startTime;

        console.log('');
        console.log(fmt.divider(50));
        console.log(fmt.bold('TIME BUCKET DISTRIBUTION'));
        console.log(fmt.divider(50));

        result.timeBuckets.forEach((bucket) => {
          console.log(fmt.keyValue(`  Bucket ${bucket.number}:`, `${bucket.label} ${fmt.dim('(' + bucket.color + ')')}`, 18));
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
          console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
          console.error('');
          process.exit(1);
        }
      } finally {
        db.close();
      }
    });

  program
    .command('map')
    .description('Process shapefiles and generate SVG')
    .action(async () => {
      const emitter = createProgressEmitter();
      const startTime = Date.now();

      // Header
      console.log('');
      console.log(fmt.header('PROCESSING MAPS', '🗺️'));
      console.log('');
      console.log(fmt.keyValue('Source:', 'data/maastokartta_esri/', 15));
      console.log(fmt.keyValue('Output:', 'TopoJSON + SVG layers', 15));
      console.log('');

      emitter.on('progress', (event) => {
        if (event.type === 'start') {
          console.log(fmt.infoMessage('Processing shapefiles...'));
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
        await processMaps({ emitter });

        const duration = Date.now() - startTime;

        console.log('');
        console.log(fmt.divider(50));
        console.log(fmt.bold('FILES CREATED'));
        console.log(fmt.divider(50));
        console.log(fmt.successMessage('background_map.json (TopoJSON)'));
        console.log(fmt.successMessage('layers/water.svg'));
        console.log(fmt.successMessage('layers/roads.svg'));
        console.log(fmt.successMessage('layers/railways.svg'));
        console.log(fmt.successMessage('layers/ferries.svg'));
        console.log(fmt.successMessage('layers/manifest.json'));
        console.log('');
        console.log(fmt.keyValue('Duration:', fmt.formatDuration(duration), 15));
        console.log('');
        console.log(fmt.successMessage('Map layers ready for visualization'));
        console.log('');
      } catch (error) {
        console.error('');
        console.error(fmt.errorMessage('Map processing failed'));
        console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        console.error('');
        console.error(fmt.warning('Make sure shapefile data exists in data/maastokartta_esri/'));
        console.error('');
        process.exit(1);
      }
    });

  program
    .command('status')
    .description('Show database status')
    .action(() => {
      const db = openDB();
      try {
        showStatus(db);
      } finally {
        db.close();
      }
    });

  await program.parseAsync();

  // All commands now execute via Commander actions
  // Return a dummy command to indicate execution completed
  const options = program.opts();
  const [command] = program.args;

  return {
    command: command || 'status', // Default command is status
    options: options as CLIOptions,
  };
}
