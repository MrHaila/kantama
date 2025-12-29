import { ProgressEmitter } from './events.js';
import {  readZones, writeZones, getAllRouteDurations, updatePipelineMetadata } from './datastore.js';

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
 * 3. Assign vibrant color palette to each bucket
 * 4. Update zones.json with time buckets
 * 5. Store calculation timestamp
 *
 * @param options - Calculation options (force, emitter)
 * @returns Array of calculated time buckets
 * @throws Error if no successful routes exist or no zones data
 */
export function calculateTimeBuckets(
  options: CalculateTimeBucketsOptions = {}
): { timeBuckets: TimeBucket[] } {
  const { force = false, emitter } = options;

  emitter?.emitStart('calculate_time_buckets', 8, 'Calculating time buckets...');

  try {
    // Read zones data
    const zonesData = readZones();
    if (!zonesData) {
      throw new Error('No zones data found - run fetch first');
    }

    // Check if time buckets already exist
    if (zonesData.timeBuckets.length > 0 && !force) {
      const message = `Time buckets already exist (${zonesData.timeBuckets.length} buckets). Use --force to recalculate.`;
      emitter?.emitComplete('calculate_time_buckets', message);
      throw new Error(message);
    }

    // Verify successful routes exist
    emitter?.emitProgress('calculate_time_buckets', 2, 8, 'Querying successful routes...');
    const durations = getAllRouteDurations();

    if (durations.length === 0) {
      throw new Error('No successful routes found. Please run route calculation first.');
    }

    emitter?.emitProgress(
      'calculate_time_buckets',
      3,
      8,
      `Found ${durations.length} successful routes`
    );

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

      timeBuckets.push({
        number: bucketNumber,
        min: minDuration,
        max: maxDurationValue,
        color: colorHex,
        label: bucket.label,
      });
    }

    // Update zones data with time buckets
    zonesData.timeBuckets = timeBuckets;
    writeZones(zonesData);

    // Store metadata
    updatePipelineMetadata('timeBucketsCalculatedAt', new Date().toISOString());

    emitter?.emitComplete(
      'calculate_time_buckets',
      `Time buckets calculation completed successfully! (${durations.length} routes processed)`
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
