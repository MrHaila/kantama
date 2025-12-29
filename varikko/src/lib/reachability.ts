import { ProgressEmitter } from './events.js';
import { readZones, writeZones, readZoneRoutes, getAllZoneIds, updatePipelineMetadata } from './datastore.js';
import { TimePeriod, RouteStatus, ZoneReachability } from '../shared/types';

export interface CalculateReachabilityOptions {
  period?: TimePeriod;
  force?: boolean;
  emitter?: ProgressEmitter;
}

export interface ReachabilityResult {
  zonesProcessed: number;
  zonesWithData: number;
  bestConnected: { zoneId: string; score: number } | null;
  worstConnected: { zoneId: string; score: number } | null;
}

interface ZoneMetrics {
  zoneId: string;
  zones15: number;
  zones30: number;
  zones45: number;
  medianTime: number;
  reachableCount: number;
  durations: number[];
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute composite reachability score (0-1, higher = better connected)
 * Weights: zones within 15min (40%), zones within 30min (30%), zones within 45min (20%), inverse median time (10%)
 */
function computeScore(metrics: ZoneMetrics, totalZones: number, maxMedianTime: number): number {
  const weight15 = 0.4;
  const weight30 = 0.3;
  const weight45 = 0.2;
  const weightMedian = 0.1;

  // Normalize each metric to 0-1 scale
  const norm15 = metrics.zones15 / Math.max(totalZones, 1);
  const norm30 = metrics.zones30 / Math.max(totalZones, 1);
  const norm45 = metrics.zones45 / Math.max(totalZones, 1);
  // Inverse median time (lower time = higher score)
  const normMedian = maxMedianTime > 0 ? 1 - metrics.medianTime / maxMedianTime : 1;

  return weight15 * norm15 + weight30 * norm30 + weight45 * norm45 + weightMedian * normMedian;
}

/**
 * Calculate reachability scores for all zones.
 * Reads route data from msgpack files and computes accessibility metrics.
 *
 * Algorithm:
 * 1. Load all zone routes for the specified period
 * 2. For each zone, count reachable destinations within time thresholds
 * 3. Compute composite score based on weighted metrics
 * 4. Rank zones by score (1 = best connected)
 * 5. Update zones.json with reachability data
 *
 * @param options - Calculation options
 * @returns Result with statistics
 */
export function calculateReachability(
  options: CalculateReachabilityOptions = {}
): ReachabilityResult {
  const { period = 'MORNING', force = false, emitter } = options;

  emitter?.emitStart('calculate_reachability', 5, 'Calculating reachability scores...');

  try {
    // Read zones data
    const zonesData = readZones();
    if (!zonesData) {
      throw new Error('No zones data found - run fetch first');
    }

    // Check if reachability already exists
    const hasReachability = zonesData.zones.some((z) => z.reachability);
    if (hasReachability && !force) {
      const message = 'Reachability already calculated. Use --force to recalculate.';
      emitter?.emitComplete('calculate_reachability', message);
      throw new Error(message);
    }

    const zoneIds = getAllZoneIds();
    if (zoneIds.length === 0) {
      throw new Error('No zones found');
    }

    emitter?.emitProgress('calculate_reachability', 1, 5, `Processing ${zoneIds.length} zones...`);

    // Time thresholds in seconds
    const THRESHOLD_15 = 15 * 60;
    const THRESHOLD_30 = 30 * 60;
    const THRESHOLD_45 = 45 * 60;

    // Collect metrics for all zones
    const metricsMap = new Map<string, ZoneMetrics>();
    let zonesWithData = 0;

    for (const zoneId of zoneIds) {
      const routesData = readZoneRoutes(zoneId, period);
      if (!routesData) continue;

      const durations: number[] = [];
      let zones15 = 0;
      let zones30 = 0;
      let zones45 = 0;

      for (const route of routesData.r) {
        if (route.s === RouteStatus.OK && route.d !== null && route.d > 0) {
          durations.push(route.d);
          if (route.d <= THRESHOLD_15) zones15++;
          if (route.d <= THRESHOLD_30) zones30++;
          if (route.d <= THRESHOLD_45) zones45++;
        }
      }

      if (durations.length > 0) {
        zonesWithData++;
        metricsMap.set(zoneId, {
          zoneId,
          zones15,
          zones30,
          zones45,
          medianTime: median(durations),
          reachableCount: durations.length,
          durations,
        });
      }
    }

    if (zonesWithData === 0) {
      throw new Error('No route data found. Run route calculation first.');
    }

    emitter?.emitProgress(
      'calculate_reachability',
      2,
      5,
      `Collected metrics for ${zonesWithData} zones`
    );

    // Find max median time for normalization
    let maxMedianTime = 0;
    for (const metrics of metricsMap.values()) {
      if (metrics.medianTime > maxMedianTime) {
        maxMedianTime = metrics.medianTime;
      }
    }

    // Compute scores
    emitter?.emitProgress('calculate_reachability', 3, 5, 'Computing scores...');

    const scores: Array<{ zoneId: string; score: number; metrics: ZoneMetrics }> = [];
    for (const [zoneId, metrics] of metricsMap) {
      const score = computeScore(metrics, zoneIds.length, maxMedianTime);
      scores.push({ zoneId, score, metrics });
    }

    // Sort by score descending (best first) and assign ranks
    scores.sort((a, b) => b.score - a.score);

    emitter?.emitProgress('calculate_reachability', 4, 5, 'Updating zones.json...');

    // Create reachability map
    const reachabilityMap = new Map<string, ZoneReachability>();
    for (let i = 0; i < scores.length; i++) {
      const { zoneId, score, metrics } = scores[i];
      reachabilityMap.set(zoneId, {
        rank: i + 1, // 1-indexed rank
        score: Math.round(score * 1000) / 1000, // 3 decimal places
        zones15: metrics.zones15,
        zones30: metrics.zones30,
        zones45: metrics.zones45,
        medianTime: Math.round(metrics.medianTime),
      });
    }

    // Update zones with reachability data
    for (const zone of zonesData.zones) {
      const reachability = reachabilityMap.get(zone.id);
      if (reachability) {
        zone.reachability = reachability;
      } else {
        // Zone has no route data - assign worst rank
        zone.reachability = {
          rank: scores.length + 1,
          score: 0,
          zones15: 0,
          zones30: 0,
          zones45: 0,
          medianTime: 0,
        };
      }
    }

    // Write updated zones data
    writeZones(zonesData);

    // Update pipeline metadata
    updatePipelineMetadata('reachabilityCalculatedAt', new Date().toISOString());

    const result: ReachabilityResult = {
      zonesProcessed: zoneIds.length,
      zonesWithData,
      bestConnected: scores.length > 0 ? { zoneId: scores[0].zoneId, score: scores[0].score } : null,
      worstConnected:
        scores.length > 0
          ? { zoneId: scores[scores.length - 1].zoneId, score: scores[scores.length - 1].score }
          : null,
    };

    emitter?.emitComplete(
      'calculate_reachability',
      `Reachability calculated for ${zonesWithData} zones (period: ${period})`
    );

    return result;
  } catch (error) {
    emitter?.emitError(
      'calculate_reachability',
      error instanceof Error ? error : new Error(String(error)),
      'Failed to calculate reachability'
    );
    throw error;
  }
}
