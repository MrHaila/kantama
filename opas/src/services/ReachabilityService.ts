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
 * Generates color scale for reachability scores
 * Green (best) -> Yellow -> Orange -> Red (worst)
 */
export function getReachabilityColor(score: number): string {
  // Ensure score is 0-1
  const normalizedScore = Math.max(0, Math.min(1, score))

  // Color stops: green -> yellow -> orange -> red
  if (normalizedScore >= 0.75) {
    // Green to yellow-green
    const t = (normalizedScore - 0.75) / 0.25
    return interpolateColor('#22c55e', '#84cc16', t) // green-500 to lime-500
  } else if (normalizedScore >= 0.5) {
    // Yellow-green to yellow
    const t = (normalizedScore - 0.5) / 0.25
    return interpolateColor('#eab308', '#84cc16', t) // yellow-500 to lime-500
  } else if (normalizedScore >= 0.25) {
    // Yellow to orange
    const t = (normalizedScore - 0.25) / 0.25
    return interpolateColor('#f97316', '#eab308', t) // orange-500 to yellow-500
  } else {
    // Orange to red
    const t = normalizedScore / 0.25
    return interpolateColor('#ef4444', '#f97316', t) // red-500 to orange-500
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
    { min: 0.75, max: 1.0, color: '#22c55e', label: 'Excellent' },
    { min: 0.5, max: 0.75, color: '#84cc16', label: 'Good' },
    { min: 0.25, max: 0.5, color: '#eab308', label: 'Moderate' },
    { min: 0.0, max: 0.25, color: '#f97316', label: 'Poor' },
  ]
}
