import Database from 'better-sqlite3';
import { ProgressEmitter } from './events.js';

// 6 time buckets with vibrant green-orange-blue color scheme (fastest to slowest)
const TIME_BUCKET_COLORS = [
  '#1b9e77', // Vibrant Green - 0-15min (Fastest/Good)
  '#66c2a5', // Light Green - 15-30min
  '#fc8d62', // Light Orange - 30-45min
  '#8da0cb', // Soft Blue - 45-60min
  '#4574b4', // Medium Blue - 60-75min
  '#1e3a8a', // Deep Blue - 75-90min+ (Slowest/Far)
];

// Fixed time buckets in minutes
const TIME_BUCKETS = [
  { min: 0, max: 15, label: '15min' },
  { min: 15, max: 30, label: '30min' },
  { min: 30, max: 45, label: '45min' },
  { min: 45, max: 60, label: '1h' },
  { min: 60, max: 75, label: '1h 15min' },
  { min: 75, max: 90, label: '1h 30min' },
];

export interface CalculateTimeBucketsOptions {
  force?: boolean; // Recalculate even if exists
  emitter?: ProgressEmitter;
}

export interface TimeBucket {
  number: number;
  min: number;
  max: number;
  color: string;
  label: string;
}

/**
 * Calculate fixed time bucket distribution of route durations for heatmap coloring.
 * Assigns routes to 6 fixed time buckets: 15min, 30min, 45min, 1h, 1h 15min, 1h 30min.
 *
 * Algorithm:
 * 1. Query all routes with status='OK' and duration NOT NULL
 * 2. Create 6 fixed time buckets (0-15min, 15-30min, ..., 75-90min+)
 * 3. Assign vintage color palette to each bucket
 * 4. Insert into time_buckets table
 * 5. Store calculation timestamp
 *
 * @param db - SQLite database instance
 * @param options - Calculation options (force, emitter)
 * @returns Array of calculated time buckets
 * @throws Error if no successful routes exist
 */
export function calculateTimeBuckets(
  db: Database.Database,
  options: CalculateTimeBucketsOptions = {}
): { timeBuckets: TimeBucket[] } {
  const { force = false, emitter } = options;

  emitter?.emitStart('calculate_time_buckets', 8, 'Calculating time buckets...');

  try {
    // Check if time buckets already exist
    const existingBuckets = db.prepare('SELECT COUNT(*) as count FROM time_buckets').get() as {
      count: number;
    };

    if (existingBuckets.count > 0 && !force) {
      const message = `Time buckets already exist (${existingBuckets.count} rows). Use --force to recalculate.`;
      emitter?.emitComplete('calculate_time_buckets', message);
      throw new Error(message);
    }

    if (force && existingBuckets.count > 0) {
      emitter?.emitProgress('calculate_time_buckets', 1, 8, 'Clearing existing time buckets...');
      db.prepare('DELETE FROM time_buckets').run();
    }

    // Verify successful routes exist
    emitter?.emitProgress('calculate_time_buckets', 2, 8, 'Querying successful routes...');
    const routeCount = db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM routes
      WHERE status = 'OK' AND duration IS NOT NULL
    `
      )
      .get() as { count: number };

    if (routeCount.count === 0) {
      throw new Error('No successful routes found. Please run route calculation first.');
    }

    emitter?.emitProgress(
      'calculate_time_buckets',
      3,
      8,
      `Found ${routeCount.count} successful routes`
    );

    const insertBucket = db.prepare(`
      INSERT INTO time_buckets (bucket_number, min_duration, max_duration, color_hex, label)
      VALUES (?, ?, ?, ?, ?)
    `);

    const timeBuckets: TimeBucket[] = [];

    for (let i = 0; i < TIME_BUCKETS.length; i++) {
      emitter?.emitProgress(
        'calculate_time_buckets',
        4 + i,
        8,
        `Creating bucket ${i + 1}/6: ${TIME_BUCKETS[i].label}...`
      );

      const bucket = TIME_BUCKETS[i];
      const bucketNumber = i + 1;
      const minDuration = bucket.min * 60; // Convert to seconds
      const maxDuration = bucket.max * 60; // Convert to seconds
      const colorHex = TIME_BUCKET_COLORS[i];

      // Last bucket is open-ended (75min+), use -1 to indicate
      const maxDurationValue = i === TIME_BUCKETS.length - 1 ? -1 : maxDuration;

      insertBucket.run(bucketNumber, minDuration, maxDurationValue, colorHex, bucket.label);

      timeBuckets.push({
        number: bucketNumber,
        min: minDuration,
        max: maxDurationValue,
        color: colorHex,
        label: bucket.label,
      });
    }

    // Store metadata
    const insertMetadata = db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value) VALUES ('time_buckets_calculated_at', datetime('now'))
    `);
    insertMetadata.run();

    emitter?.emitComplete(
      'calculate_time_buckets',
      `Time buckets calculation completed successfully! (${routeCount.count} routes processed)`
    );

    return { timeBuckets };
  } catch (error) {
    emitter?.emitError(
      'calculate_time_buckets',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to calculate time buckets'
    );
    throw error;
  }
}
