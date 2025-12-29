import { Command } from 'commander';
import { fetchZonesMultiCity } from './lib/zones';
import { geocodeZones } from './lib/geocoding';
import { buildRoutes, getOTPConfig } from './lib/routing';
import { calculateTimeBuckets } from './lib/time-buckets';
import { processMaps } from './lib/maps';
import { validateData } from './lib/validate';
import { createProgressEmitter } from './lib/events';
import {
  readZones,
  readPipelineState,
  getAllZoneIds,
  countRoutesByStatus,
  readManifest,
  getDataDirectory,
} from './lib/datastore';
import { RouteStatus, TimePeriod } from './shared/types';
import * as fmt from './lib/cli-format';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

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
 * Display comprehensive data status
 */
function showStatus(): void {
  const dataDir = getDataDirectory();

  // Get data directory info
  let totalSize = 0;
  let zonesSize = 0;
  let routesSize = 0;

  try {
    const zonesPath = path.join(dataDir, 'zones.json');
    if (fs.existsSync(zonesPath)) {
      zonesSize = fs.statSync(zonesPath).size;
      totalSize += zonesSize;
    }

    const routesDir = path.join(dataDir, 'routes');
    if (fs.existsSync(routesDir)) {
      const files = fs.readdirSync(routesDir);
      for (const file of files) {
        const filePath = path.join(routesDir, file);
        routesSize += fs.statSync(filePath).size;
      }
      totalSize += routesSize;
    }
  } catch {
    // Files might not exist yet
  }

  // Header
  console.log('');
  console.log(fmt.boxTop(60, 'VARIKKO DATA STATUS'));
  console.log('');

  // Data Directory Overview
  console.log(fmt.header('DATA DIRECTORY', '💾'));
  console.log(fmt.keyValue('  Path:', dataDir, 18));
  console.log(fmt.keyValue('  Zones file:', fmt.formatBytes(zonesSize), 18));
  console.log(fmt.keyValue('  Routes files:', fmt.formatBytes(routesSize), 18));
  console.log(fmt.keyValue('  Total size:', fmt.formatBytes(totalSize), 18));
  console.log('');

  // Zones Status
  const zonesData = readZones();
  const zoneCount = zonesData ? zonesData.zones.length : 0;
  const pipelineState = readPipelineState();

  console.log(fmt.header('ZONES', '📍'));
  if (zoneCount === 0) {
    console.log(fmt.muted('  No zones fetched yet'));
    console.log(fmt.suggestion('  Run \'varikko fetch\' to fetch postal code zones'));
  } else {
    console.log(fmt.keyValue('  Total Zones:', zoneCount, 18));
    if (pipelineState?.lastFetch?.timestamp) {
      const lastFetch = new Date(pipelineState.lastFetch.timestamp);
      console.log(fmt.keyValue('  Last Fetch:', fmt.formatTimestamp(lastFetch), 18));
    }
  }
  console.log('');

  // Routes Status - show stats for both transport modes
  console.log(fmt.header('ROUTES', '🚌'));
  const periods: TimePeriod[] = ['MORNING', 'EVENING', 'MIDNIGHT'];
  const modes: ['WALK', 'BICYCLE'] = ['WALK', 'BICYCLE'];

  // Track totals across all modes for next steps logic
  let grandTotalOk = 0;
  let grandTotalPending = 0;
  let grandTotalRoutes = 0;

  for (const mode of modes) {
    console.log(fmt.dim(`  ${mode === 'WALK' ? '🚶 Walking' : '🚴 Bicycle'} Routes`));

    let totalOk = 0;
    let totalPending = 0;
    let totalNoRoute = 0;
    let totalError = 0;

    for (const period of periods) {
      const counts = countRoutesByStatus(period, mode);
      totalOk += counts[RouteStatus.OK];
      totalPending += counts[RouteStatus.PENDING];
      totalNoRoute += counts[RouteStatus.NO_ROUTE];
      totalError += counts[RouteStatus.ERROR];
    }

    const totalRoutes = totalOk + totalPending + totalNoRoute + totalError;

    if (totalRoutes === 0) {
      console.log(fmt.muted('    No routes calculated yet'));
      if (zoneCount > 0 && mode === 'WALK') {
        console.log(fmt.suggestion('    Run \'varikko geocode\' then \'varikko routes\' to calculate routes'));
      }
    } else {
      const totalPerPeriod = totalRoutes / 3;
      console.log(fmt.keyValue('    Total:', `${totalRoutes.toLocaleString()} (${totalPerPeriod.toLocaleString()}/period)`, 18));

      // Calculate percentages
      const okPct = totalRoutes > 0 ? ((totalOk / totalRoutes) * 100).toFixed(1) : '0.0';
      const pendingPct = totalRoutes > 0 ? ((totalPending / totalRoutes) * 100).toFixed(1) : '0.0';
      const noRoutePct = totalRoutes > 0 ? ((totalNoRoute / totalRoutes) * 100).toFixed(1) : '0.0';
      const errorPct = totalRoutes > 0 ? ((totalError / totalRoutes) * 100).toFixed(1) : '0.0';

      console.log(fmt.keyValue('    ' + fmt.symbols.success + ' Calculated:', `${totalOk.toLocaleString()} (${okPct}%)`, 18));

      if (totalPending > 0) {
        console.log(fmt.keyValue('    ' + fmt.symbols.pending + ' Pending:', `${totalPending.toLocaleString()} (${pendingPct}%)`, 18));
      }

      if (totalNoRoute > 0) {
        console.log(fmt.keyValue('    ' + fmt.symbols.noRoute + ' No Route:', `${totalNoRoute.toLocaleString()} (${noRoutePct}%)`, 18));
      }

      if (totalError > 0) {
        console.log(fmt.keyValue('    ' + fmt.symbols.error + ' Errors:', `${totalError.toLocaleString()} (${errorPct}%)`, 18));
      }
    }
    console.log('');

    // Accumulate grand totals
    grandTotalOk += totalOk;
    grandTotalPending += totalPending;
    grandTotalRoutes += totalRoutes;
  }
  console.log('');

  // Time Buckets Status
  const bucketCount = zonesData ? zonesData.timeBuckets.length : 0;

  console.log(fmt.header('TIME BUCKETS', '🗺️'));
  if (bucketCount === 6) {
    console.log(fmt.successMessage('  Calculated (6 buckets)'));
  } else if (bucketCount > 0) {
    console.log(fmt.warningMessage(`  Partially calculated (${bucketCount}/6 buckets)`));
    console.log(fmt.suggestion('  Run \'varikko time-buckets --force\' to recalculate'));
  } else {
    console.log(fmt.muted('  Not calculated yet'));
    if (grandTotalOk > 0) {
      console.log(fmt.suggestion('  Run \'varikko time-buckets\' to generate heatmap buckets'));
    }
  }
  console.log('');

  // Next Steps
  console.log(fmt.header('NEXT STEPS', '💡'));
  const suggestions: string[] = [];

  if (zoneCount === 0) {
    suggestions.push('Run \'varikko fetch\' to fetch postal code zones');
  } else if (grandTotalRoutes === 0) {
    suggestions.push('Run \'varikko geocode\' to geocode zones');
    suggestions.push('Run \'varikko routes\' to calculate transit routes');
  } else if (grandTotalPending > 0) {
    suggestions.push('Run \'varikko routes\' to calculate pending routes');
  } else if (bucketCount !== 6 && grandTotalOk > 0) {
    suggestions.push('Run \'varikko time-buckets\' to generate heatmap buckets');
  } else if (bucketCount === 6) {
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
    showStatus();
  });

  // Subcommands (non-interactive mode)

  program
    .command('fetch')
    .description('Fetch postal code zones from multi-city sources')
    .option('-l, --limit <count>', 'Limit number of zones to process', parseInt)
    .action(async (options) => {
      const emitter = createProgressEmitter();
      const startTime = Date.now();

      // Header
      console.log('');
      console.log(fmt.header('FETCHING POSTAL CODE ZONES', '🌍'));
      console.log('');
      console.log(fmt.keyValue('Mode:', options.limit ? `Limited (${options.limit} zones)` : 'Full dataset', 15));
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
        const result = await fetchZonesMultiCity({
          limit: options.limit,
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
      }
    });

  program
    .command('geocode')
    .description('Geocode zones to routing addresses')
    .option('-l, --limit <count>', 'Limit number of zones to process', parseInt)
    .action(async (options) => {
      const emitter = createProgressEmitter();
      const startTime = Date.now();

      const apiKey = process.env.DIGITRANSIT_API_KEY || process.env.HSL_API_KEY;

      // Header
      console.log('');
      console.log(fmt.header('GEOCODING ZONES', '📍'));
      console.log('');
      console.log(fmt.keyValue('API:', 'Digitransit Geocoding API', 15));
      console.log(fmt.keyValue('Auth:', apiKey ? fmt.success('Authenticated') : fmt.warning('No API key'), 15));
      console.log(fmt.keyValue('Mode:', options.limit ? `Limited (${options.limit} zones)` : 'Full dataset', 15));
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
        const result = await geocodeZones({
          limit: options.limit,
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
            console.log(fmt.muted(`  ${fmt.symbols.bullet} ${err.zoneId}: ${err.error}`));
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
      }
    });

  program
    .command('routes')
    .description('Calculate transit routes')
    .option('-z, --zones <count>', 'Number of random origin zones to process', parseInt)
    .option('-l, --limit <count>', 'Limit number of routes to process', parseInt)
    .option('-p, --period <period>', 'Time period (MORNING, EVENING, MIDNIGHT)')
    .option('-m, --mode <mode>', 'Transport mode (WALK, BICYCLE)', 'WALK')
    .action(async (options) => {
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

      // Validate transport mode
      const validModes = ['WALK', 'BICYCLE'];
      const transportMode = options.mode.toUpperCase();
      if (!validModes.includes(transportMode)) {
        console.error('');
        console.error(fmt.errorMessage(`Invalid transport mode: ${options.mode}`));
        console.error(fmt.dim(`  Valid modes: ${validModes.join(', ')}`));
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
      console.log(fmt.header(`CALCULATING ROUTES (${transportMode})`, transportMode === 'BICYCLE' ? '🚴' : '🚌'));
      console.log('');
      console.log(fmt.keyValue('OTP:', `${config.url} (${config.isLocal ? 'local' : 'remote'})`, 15));
      console.log(fmt.keyValue('Concurrency:', `${config.concurrency} requests`, 15));
      console.log(fmt.keyValue('Period:', options.period ? options.period.toUpperCase() : 'All (MORNING, EVENING, MIDNIGHT)', 15));
      console.log(fmt.keyValue('Transport:', transportMode, 15));

      let modeDesc = 'Full dataset';
      if (options.zones && options.limit) {
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
        const result = await buildRoutes({
          period: options.period ? options.period.toUpperCase() as 'MORNING' | 'EVENING' | 'MIDNIGHT' : undefined,
          mode: transportMode as 'WALK' | 'BICYCLE',
          zones: options.zones,
          limit: options.limit,
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
      }
    });

  program
    .command('time-buckets')
    .description('Calculate heatmap time buckets')
    .option('-f, --force', 'Force recalculation even if already calculated')
    .action((options) => {
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
      }
    });

  program
    .command('validate')
    .description('Validate data integrity and regenerate manifest')
    .action(() => {
      const emitter = createProgressEmitter();

      // Header
      console.log('');
      console.log(fmt.header('VALIDATING DATA', '✓'));
      console.log('');

      emitter.on('progress', (event) => {
        if (event.type === 'start') {
          console.log(fmt.infoMessage('Validating data files...'));
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
        const result = validateData({ emitter });

        console.log('');
        console.log(fmt.divider(50));
        console.log(fmt.bold('VALIDATION RESULTS'));
        console.log(fmt.divider(50));
        console.log(fmt.keyValue('Status:', result.valid ? fmt.success('VALID') : fmt.error('INVALID'), 20));
        console.log(fmt.keyValue('Zones:', result.stats.zones.toLocaleString(), 20));
        console.log(fmt.keyValue('Route files:', result.stats.routeFiles.toLocaleString(), 20));
        console.log(fmt.keyValue('Total routes:', result.stats.totalRoutes.toLocaleString(), 20));
        console.log(fmt.keyValue('OK routes:', result.stats.okRoutes.toLocaleString(), 20));
        console.log(fmt.keyValue('Pending routes:', result.stats.pendingRoutes.toLocaleString(), 20));
        console.log(fmt.keyValue('Total size:', fmt.formatBytes(result.stats.totalSize), 20));

        if (result.errors.length > 0) {
          console.log('');
          console.log(fmt.header('ERRORS', '⚠️'));
          result.errors.forEach((err) => {
            console.log(fmt.error(`  ${fmt.symbols.bullet} ${err}`));
          });
        }

        if (result.warnings.length > 0) {
          console.log('');
          console.log(fmt.header('WARNINGS', '⚡'));
          result.warnings.slice(0, 5).forEach((warn) => {
            console.log(fmt.warning(`  ${fmt.symbols.bullet} ${warn}`));
          });
          if (result.warnings.length > 5) {
            console.log(fmt.dim(`  ... and ${result.warnings.length - 5} more warnings`));
          }
        }

        console.log('');
        if (result.valid) {
          console.log(fmt.successMessage('Data validation passed!'));
        } else {
          console.log(fmt.errorMessage('Data validation failed'));
        }
        console.log('');
      } catch (error) {
        console.error('');
        console.error(fmt.errorMessage('Validation failed'));
        console.error(fmt.dim(`  ${error instanceof Error ? error.message : String(error)}`));
        console.error('');
        process.exit(1);
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
    .description('Show data status')
    .action(() => {
      showStatus();
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
