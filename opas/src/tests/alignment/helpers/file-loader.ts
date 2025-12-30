/**
 * File loading utilities for alignment tests
 *
 * Provides functions to load generated data files (zones, layers, manifest)
 * from the opas/public directory for validation.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ZonesData } from 'varikko'

export interface LayerDefinition {
  id: string
  path: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface LayerManifest {
  viewBox: string
  layers: LayerDefinition[]
}

// Get project root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..', '..', '..', '..') // opas/

/**
 * Load zones data from opas/public/data/zones.json
 *
 * @returns Parsed zones data
 */
export function loadZonesData(): ZonesData {
  const zonesPath = join(projectRoot, 'public', 'data', 'zones.json')
  const content = readFileSync(zonesPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Load layer manifest from opas/public/layers/manifest.json
 *
 * @returns Parsed manifest data
 */
export function loadManifest(): LayerManifest {
  const manifestPath = join(projectRoot, 'public', 'layers', 'manifest.json')
  const content = readFileSync(manifestPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Load a layer SVG file as a string
 *
 * @param layerId - Layer identifier (e.g., 'water', 'roads', 'railways', 'transit-M')
 * @returns SVG file content as string
 */
export function loadLayerSVG(layerId: string): string {
  const svgPath = join(projectRoot, 'public', 'layers', `${layerId}.svg`)
  return readFileSync(svgPath, 'utf-8')
}

/**
 * Check if a layer file exists
 *
 * @param layerId - Layer identifier
 * @returns true if the layer file exists
 */
export function layerExists(layerId: string): boolean {
  try {
    const svgPath = join(projectRoot, 'public', 'layers', `${layerId}.svg`)
    readFileSync(svgPath, 'utf-8')
    return true
  } catch {
    return false
  }
}
