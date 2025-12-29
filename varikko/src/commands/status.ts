import { Command } from 'commander';
import {
  readZones,
  readPipelineState,
  countRoutesByStatus,
  getDataDirectory,
} from '../lib/datastore';
import { RouteStatus, TimePeriod } from '../shared/types';
import * as fmt from '../lib/cli-format';
import fs from 'fs';
import path from 'path';

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
    console.log(fmt.suggestion("  Run 'varikko fetch' to fetch postal code zones"));
  } else {
    console.log(fmt.keyValue('  Total Zones:', zoneCount, 18));
    if (pipelineState?.lastFetch?.timestamp) {
      const lastFetch = new Date(pipelineState.lastFetch.timestamp);
      console.log(fmt.keyValue('  Last Fetch:', fmt.formatTimestamp(lastFetch), 18));
    }

    // Show geocoding status and errors
    if (pipelineState?.lastGeocoding) {
      const geocoding = pipelineState.lastGeocoding;
      const successRate =
        geocoding.processed > 0
          ? ((geocoding.successful / geocoding.processed) * 100).toFixed(1)
          : '0.0';

      if (geocoding.successful === geocoding.processed) {
        console.log(
          fmt.keyValue(
            '  Geocoding:',
            fmt.success(
              `${geocoding.successful}/${geocoding.processed} (${successRate}%)`
            ),
            18
          )
        );
      } else if (geocoding.failed === geocoding.processed) {
        console.log(
          fmt.keyValue(
            '  Geocoding:',
            fmt.error(`ALL FAILED (${geocoding.errors.length} errors)`),
            18
          )
        );
        console.log(
          fmt.errorMessage('  ⚠ Geocoding completely failed - zones lack routing addresses')
        );
        if (geocoding.errors.length > 0) {
          console.log(fmt.dim(`  First error: ${geocoding.errors[0].error}`));
        }
      } else {
        console.log(
          fmt.keyValue(
            '  Geocoding:',
            fmt.warning(
              `${geocoding.successful}/${geocoding.processed} (${successRate}%)`
            ),
            18
          )
        );
        if (geocoding.failed > 0) {
          console.log(
            fmt.warningMessage(`  ⚠ ${geocoding.failed} zones failed geocoding`)
          );
        }
      }
    } else if (zoneCount > 0) {
      console.log(fmt.keyValue('  Geocoding:', fmt.warning('Not run yet'), 18));
      console.log(fmt.suggestion("  Run 'varikko geocode' to geocode zones"));
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
        console.log(
          fmt.suggestion(
            "    Run 'varikko geocode' then 'varikko routes' to calculate routes"
          )
        );
      }
    } else {
      const totalPerPeriod = totalRoutes / 3;
      console.log(
        fmt.keyValue(
          '    Total:',
          `${totalRoutes.toLocaleString()} (${totalPerPeriod.toLocaleString()}/period)`,
          18
        )
      );

      // Calculate percentages
      const okPct = totalRoutes > 0 ? ((totalOk / totalRoutes) * 100).toFixed(1) : '0.0';
      const pendingPct =
        totalRoutes > 0 ? ((totalPending / totalRoutes) * 100).toFixed(1) : '0.0';
      const noRoutePct =
        totalRoutes > 0 ? ((totalNoRoute / totalRoutes) * 100).toFixed(1) : '0.0';
      const errorPct =
        totalRoutes > 0 ? ((totalError / totalRoutes) * 100).toFixed(1) : '0.0';

      console.log(
        fmt.keyValue(
          '    ' + fmt.symbols.success + ' Calculated:',
          `${totalOk.toLocaleString()} (${okPct}%)`,
          18
        )
      );

      if (totalPending > 0) {
        console.log(
          fmt.keyValue(
            '    ' + fmt.symbols.pending + ' Pending:',
            `${totalPending.toLocaleString()} (${pendingPct}%)`,
            18
          )
        );
      }

      if (totalNoRoute > 0) {
        console.log(
          fmt.keyValue(
            '    ' + fmt.symbols.noRoute + ' No Route:',
            `${totalNoRoute.toLocaleString()} (${noRoutePct}%)`,
            18
          )
        );
      }

      if (totalError > 0) {
        console.log(
          fmt.keyValue(
            '    ' + fmt.symbols.error + ' Errors:',
            `${totalError.toLocaleString()} (${errorPct}%)`,
            18
          )
        );
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
  const timeBucketsTimestamp = pipelineState?.timeBucketsCalculatedAt;
  const routeCalculationTimestamp = pipelineState?.lastRouteCalculation?.timestamp;

  // Check if time buckets are stale (calculated before routes)
  const bucketsAreStale =
    timeBucketsTimestamp &&
    routeCalculationTimestamp &&
    new Date(timeBucketsTimestamp) < new Date(routeCalculationTimestamp);

  console.log(fmt.header('TIME BUCKETS', '🗺️'));
  console.log(
    fmt.keyValue(
      '  Status:',
      bucketCount === 6
        ? bucketsAreStale
          ? fmt.warning('Stale')
          : fmt.success('Calculated')
        : bucketCount > 0
        ? fmt.warning(`Partial (${bucketCount}/6)`)
        : fmt.muted('Not calculated'),
      18
    )
  );

  if (bucketCount === 6) {
    console.log(fmt.keyValue('  Buckets:', '6 time ranges for heatmap', 18));
    if (bucketsAreStale) {
      console.log(
        fmt.warningMessage('  ⚠ Outdated - routes updated after buckets calculated')
      );
      console.log(fmt.suggestion("  Run 'varikko time-buckets --force' to recalculate"));
    }
  } else if (bucketCount > 0) {
    console.log(fmt.keyValue('  Buckets:', `${bucketCount}/6 (incomplete)`, 18));
    console.log(fmt.suggestion("  Run 'varikko time-buckets --force' to recalculate"));
  } else {
    console.log(fmt.muted('  Required for heatmap visualization'));
    if (grandTotalOk > 0) {
      console.log(fmt.suggestion("  Run 'varikko time-buckets' to generate buckets"));
    }
  }
  console.log('');

  // Reachability Status
  const reachabilityTimestamp = pipelineState?.reachabilityCalculatedAt;
  const zonesWithReachability = zonesData
    ? zonesData.zones.filter((z) => z.reachability).length
    : 0;
  const hasReachability = zonesWithReachability > 0;

  // Check if reachability is stale (calculated before routes)
  const reachabilityIsStale =
    reachabilityTimestamp &&
    routeCalculationTimestamp &&
    new Date(reachabilityTimestamp) < new Date(routeCalculationTimestamp);

  console.log(fmt.header('REACHABILITY', '📊'));
  console.log(
    fmt.keyValue(
      '  Status:',
      hasReachability
        ? reachabilityIsStale
          ? fmt.warning('Stale')
          : fmt.success('Calculated')
        : fmt.muted('Not calculated'),
      18
    )
  );

  if (hasReachability) {
    console.log(
      fmt.keyValue(
        '  Zones:',
        `${zonesWithReachability}/${zoneCount} zones have scores`,
        18
      )
    );
    if (reachabilityIsStale) {
      console.log(
        fmt.warningMessage('  ⚠ Outdated - routes updated after reachability calculated')
      );
      console.log(fmt.suggestion("  Run 'varikko reachability --force' to recalculate"));
    }
  } else {
    console.log(fmt.muted('  Required for opas default heatmap'));
    if (grandTotalOk > 0) {
      console.log(fmt.suggestion("  Run 'varikko reachability' to calculate scores"));
    }
  }
  console.log('');

  // Next Steps
  console.log(fmt.header('NEXT STEPS', '💡'));
  const suggestions: string[] = [];
  let hasBlockingErrors = false;

  if (zoneCount === 0) {
    suggestions.push("Run 'varikko fetch' to fetch postal code zones");
  } else {
    // Check for geocoding errors that block progress
    const geocoding = pipelineState?.lastGeocoding;
    if (geocoding && geocoding.failed > 0) {
      hasBlockingErrors = true;
      console.log(fmt.errorMessage('  ⛔ BLOCKED: Geocoding has errors'));
      console.log(fmt.dim(`  ${geocoding.failed} zones failed to geocode`));
      if (geocoding.errors.length > 0) {
        console.log(
          fmt.dim(
            `  First error: ${geocoding.errors[0].zoneId} - ${geocoding.errors[0].error}`
          )
        );
      }
      console.log('');
      suggestions.push("Fix geocoding errors and re-run 'varikko geocode'");
    } else if (!geocoding && grandTotalRoutes === 0) {
      suggestions.push("Run 'varikko geocode' to geocode zones");
      suggestions.push("Run 'varikko routes' to calculate transit routes");
    } else if (grandTotalRoutes === 0) {
      suggestions.push("Run 'varikko routes' to calculate transit routes");
    } else if (grandTotalPending > 0) {
      suggestions.push("Run 'varikko routes' to calculate pending routes");
    } else if (bucketsAreStale) {
      suggestions.push("Run 'varikko time-buckets --force' to recalculate stale buckets");
    } else if (reachabilityIsStale) {
      suggestions.push(
        "Run 'varikko reachability --force' to recalculate stale reachability"
      );
    } else if (bucketCount !== 6 && grandTotalOk > 0) {
      suggestions.push("Run 'varikko time-buckets' to generate heatmap buckets");
    } else if (!hasReachability && grandTotalOk > 0) {
      suggestions.push("Run 'varikko reachability' to calculate connectivity scores");
    } else if (bucketCount === 6 && hasReachability) {
      suggestions.push('All data calculated! Ready for visualization');
    }
  }

  if (suggestions.length > 0 && !hasBlockingErrors) {
    console.log(fmt.numberedList(suggestions, 2));
  } else if (suggestions.length > 0) {
    console.log(fmt.numberedList(suggestions, 2));
  } else if (!hasBlockingErrors) {
    console.log(fmt.muted('  No actions needed'));
  }
  console.log('');

  console.log(fmt.boxBottom(60));
  console.log('');
}

export function register(program: Command): void {
  program
    .command('status')
    .description('Show data status')
    .action(action);
}

export function action(): void {
  showStatus();
}
