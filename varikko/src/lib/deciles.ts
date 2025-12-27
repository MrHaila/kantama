import Database from 'better-sqlite3';
import { ProgressEmitter } from './events.js';

// Vintage color scheme for 10 deciles (fastest to slowest)
const DECILE_COLORS = [
  '#E76F51', // Deep Orange - Fastest
  '#F4A261', // Light Orange
  '#F9C74F', // Yellow
  '#90BE6D', // Light Green
  '#43AA8B', // Teal
  '#277DA1', // Blue
  '#4D5061', // Dark Blue-Gray
  '#6C5B7B', // Purple
  '#8B5A8C', // Dark Purple
  '#355C7D', // Very Dark Blue - Slowest
];

export interface CalculateDecilesOptions {
  force?: boolean; // Recalculate even if exists
  emitter?: ProgressEmitter;
}

export interface Decile {
  number: number;
  min: number;
  max: number;
  color: string;
  label: string;
}

/**
 * Convert seconds to minutes (rounded)
 */
function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * Format a human-readable label for a decile
 * Examples: "8-15 min", "15 min", ">60 min"
 */
function formatDecileLabel(
  minDuration: number,
  maxDuration: number | null,
  decileNumber: number
): string {
  const minMinutes = secondsToMinutes(minDuration);

  if (decileNumber === 10 && maxDuration === null) {
    // Last decile shows "more than X minutes"
    return `>${minMinutes} min`;
  }

  const maxMinutes = secondsToMinutes(maxDuration!);

  if (minMinutes === maxMinutes) {
    return `${minMinutes} min`;
  }

  return `${minMinutes}-${maxMinutes} min`;
}

/**
 * Calculate 10-quantile distribution of route durations for heatmap coloring.
 * Divides successful routes into 10 equal buckets and assigns vintage color palette.
 *
 * Algorithm:
 * 1. Query all routes with status='OK' and duration NOT NULL
 * 2. Sort by duration ascending
 * 3. Divide into 10 equal quantiles
 * 4. Calculate min/max duration for each decile
 * 5. Assign color from vintage palette
 * 6. Generate human-readable labels (e.g., "8-15 min")
 * 7. Insert into deciles table
 * 8. Store calculation timestamp
 *
 * @param db - SQLite database instance
 * @param options - Calculation options (force, emitter)
 * @returns Array of calculated deciles
 * @throws Error if no successful routes exist
 */
export function calculateDeciles(
  db: Database.Database,
  options: CalculateDecilesOptions = {}
): { deciles: Decile[] } {
  const { force = false, emitter } = options;

  emitter?.emitStart('calculate_deciles', 10, 'Calculating deciles...');

  try {
    // Check if deciles already exist
    const existingDeciles = db.prepare('SELECT COUNT(*) as count FROM deciles').get() as {
      count: number;
    };

    if (existingDeciles.count > 0 && !force) {
      const message = `Deciles already exist (${existingDeciles.count} rows). Use --force to recalculate.`;
      emitter?.emitComplete('calculate_deciles', message);
      throw new Error(message);
    }

    if (force && existingDeciles.count > 0) {
      emitter?.emitProgress('calculate_deciles', 1, 10, 'Clearing existing deciles...');
      db.prepare('DELETE FROM deciles').run();
    }

    // Get all successful routes across all time periods
    emitter?.emitProgress('calculate_deciles', 2, 10, 'Querying successful routes...');
    const routesQuery = db.prepare(`
      SELECT duration
      FROM routes
      WHERE status = 'OK' AND duration IS NOT NULL
      ORDER BY duration ASC
    `);

    const routes = routesQuery.all() as { duration: number }[];

    if (routes.length === 0) {
      throw new Error('No successful routes found. Please run route calculation first.');
    }

    emitter?.emitProgress(
      'calculate_deciles',
      3,
      10,
      `Found ${routes.length} successful routes`
    );

    // Calculate decile thresholds
    const totalRoutes = routes.length;
    const decileSize = Math.floor(totalRoutes / 10);
    const remainder = totalRoutes % 10;

    const insertDecile = db.prepare(`
      INSERT INTO deciles (decile_number, min_duration, max_duration, color_hex, label)
      VALUES (?, ?, ?, ?, ?)
    `);

    const deciles: Decile[] = [];
    let startIndex = 0;

    for (let decileNumber = 1; decileNumber <= 10; decileNumber++) {
      emitter?.emitProgress(
        'calculate_deciles',
        3 + decileNumber,
        10,
        `Calculating decile ${decileNumber}/10...`
      );

      // Distribute remainder among first few deciles
      const currentDecileSize = decileNumber <= remainder ? decileSize + 1 : decileSize;

      // Skip deciles with no routes (edge case: fewer than 10 routes)
      if (currentDecileSize === 0 || startIndex >= routes.length) {
        // Use previous decile's max as min/max for empty deciles
        const prevMin = startIndex > 0 ? routes[startIndex - 1].duration : 0;
        const label = formatDecileLabel(prevMin, null, decileNumber);
        const colorHex = DECILE_COLORS[decileNumber - 1];

        insertDecile.run(decileNumber, prevMin, -1, colorHex, label);

        deciles.push({
          number: decileNumber,
          min: prevMin,
          max: -1,
          color: colorHex,
          label,
        });
        continue;
      }

      const endIndex = startIndex + currentDecileSize - 1;

      const minDuration = routes[startIndex].duration;
      const maxDuration = endIndex < routes.length - 1 ? routes[endIndex].duration : null;

      const label = formatDecileLabel(minDuration, maxDuration, decileNumber);
      const colorHex = DECILE_COLORS[decileNumber - 1];

      insertDecile.run(
        decileNumber,
        minDuration,
        maxDuration !== null ? maxDuration : -1, // Use -1 to indicate open-ended
        colorHex,
        label
      );

      deciles.push({
        number: decileNumber,
        min: minDuration,
        max: maxDuration !== null ? maxDuration : -1,
        color: colorHex,
        label,
      });

      startIndex = endIndex + 1;
    }

    // Store metadata
    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value) VALUES ('deciles_calculated_at', datetime('now'))
    `);
    insertMetadata.run();

    emitter?.emitComplete(
      'calculate_deciles',
      `Deciles calculation completed successfully! (${routes.length} routes processed)`
    );

    return { deciles };
  } catch (error) {
    emitter?.emitError(
      'calculate_deciles',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to calculate deciles'
    );
    throw error;
  }
}
