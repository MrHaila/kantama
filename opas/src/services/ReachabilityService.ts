/**
 * Reachability Service
 * Computes zone connectivity scores using cumulative accessibility metrics
 * Based on 15/20-minute city planning literature
 */

import type { CompactRoute } from './DataService'

export interface ReachabilityScore {
  zoneId: string
  score: number // 0-1, higher = better connected
  rank: number // 1 = best connected
  zonesWithin15min: number
  zonesWithin30min: number
  zonesWithin45min: number
  medianTravelTime: number // seconds
  avgTravelTime: number // seconds
}

/**
 * Calculates cumulative accessibility score for a zone
 * Based on weighted time buckets (15/30/45 min thresholds)
 */
function calculateAccessibilityScore(
  routes: CompactRoute[],
  totalZones: number
): Omit<ReachabilityScore, 'zoneId' | 'rank'> {
  const validRoutes = routes.filter((r) => r.s === 0 && r.d !== null) as Array<CompactRoute & { d: number }>

  if (validRoutes.length === 0) {
    return {
      score: 0,
      zonesWithin15min: 0,
      zonesWithin30min: 0,
      zonesWithin45min: 0,
      medianTravelTime: 0,
      avgTravelTime: 0,
    }
  }

  const durations = validRoutes.map((r) => r.d).sort((a, b) => a - b)

  // Count zones within time thresholds
  const within15min = durations.filter((d) => d <= 15 * 60).length
  const within30min = durations.filter((d) => d <= 30 * 60).length
  const within45min = durations.filter((d) => d <= 45 * 60).length

  // Median and average
  const median = durations[Math.floor(durations.length / 2)] || 0
  const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length

  // Max travel time for normalization
  const maxDuration = Math.max(...durations)

  // Composite score based on cumulative accessibility
  // Weights: 40% near (15min), 30% medium (30min), 20% far (45min), 10% speed (inverted avg)
  const score =
    0.4 * (within15min / totalZones) +
    0.3 * (within30min / totalZones) +
    0.2 * (within45min / totalZones) +
    0.1 * (1 - avg / Math.max(maxDuration, 1))

  return {
    score,
    zonesWithin15min: within15min,
    zonesWithin30min: within30min,
    zonesWithin45min: within45min,
    medianTravelTime: median,
    avgTravelTime: avg,
  }
}

/**
 * Computes reachability scores for all zones
 */
export function computeReachabilityScores(
  routesByZone: Map<string, CompactRoute[]>,
  zoneIds: string[]
): Map<string, ReachabilityScore> {
  const totalZones = zoneIds.length
  const scores: ReachabilityScore[] = []

  // Calculate raw scores for each zone
  for (const zoneId of zoneIds) {
    const routes = routesByZone.get(zoneId) || []
    const metrics = calculateAccessibilityScore(routes, totalZones)

    scores.push({
      zoneId,
      rank: 0, // Will be set after sorting
      ...metrics,
    })
  }

  // Sort by score (descending) and assign ranks
  scores.sort((a, b) => b.score - a.score)
  scores.forEach((s, index) => {
    s.rank = index + 1
  })

  // Convert to map
  return new Map(scores.map((s) => [s.zoneId, s]))
}

/**
 * Generates color based on rank percentile
 * Uses rank (1=best) and totalZones to create smooth gradient
 * Green (best connected) -> Yellow -> Orange -> Red (least connected)
 */
export function getReachabilityColorByRank(rank: number, totalZones: number): string {
  // Convert rank to percentile (0=best, 1=worst)
  const percentile = (rank - 1) / Math.max(totalZones - 1, 1)

  // Color stops: green (0) -> lime -> yellow -> orange -> red (1)
  if (percentile <= 0.25) {
    // Green to lime (best 25%)
    const t = percentile / 0.25
    return interpolateColor('#22c55e', '#84cc16', t) // green-500 to lime-500
  } else if (percentile <= 0.5) {
    // Lime to yellow
    const t = (percentile - 0.25) / 0.25
    return interpolateColor('#84cc16', '#eab308', t) // lime-500 to yellow-500
  } else if (percentile <= 0.75) {
    // Yellow to orange
    const t = (percentile - 0.5) / 0.25
    return interpolateColor('#eab308', '#f97316', t) // yellow-500 to orange-500
  } else {
    // Orange to red (worst 25%)
    const t = (percentile - 0.75) / 0.25
    return interpolateColor('#f97316', '#ef4444', t) // orange-500 to red-500
  }
}

/**
 * Linear color interpolation
 */
function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16)
  const g1 = parseInt(color1.slice(3, 5), 16)
  const b1 = parseInt(color1.slice(5, 7), 16)

  const r2 = parseInt(color2.slice(1, 3), 16)
  const g2 = parseInt(color2.slice(3, 5), 16)
  const b2 = parseInt(color2.slice(5, 7), 16)

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Generate legend buckets for reachability scores
 */
export interface ReachabilityBucket {
  min: number // score 0-1
  max: number
  color: string
  label: string
}

export function generateReachabilityLegend(): ReachabilityBucket[] {
  return [
    { min: 0.0, max: 0.25, color: '#22c55e', label: 'Top 25%' },
    { min: 0.25, max: 0.5, color: '#84cc16', label: 'Top 50%' },
    { min: 0.5, max: 0.75, color: '#eab308', label: 'Bottom 50%' },
    { min: 0.75, max: 1.0, color: '#f97316', label: 'Bottom 25%' },
  ]
}
