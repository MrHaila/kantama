/**
 * LayerService - Manages loading and caching of map layers and manifest
 */

import { getLayerStyles, type MapThemeName, type LayerId, type LayerStyles } from '../config/mapThemes'

export type { MapThemeName as ThemeName, LayerId, LayerStyles }

export interface LayerDefinition {
  id: string
  file: string
  description: string
  zIndex: number
}

export interface LayerManifest {
  viewBox: string
  layers: LayerDefinition[]
}

class LayerService {
  private manifest: LayerManifest | null = null
  private loadedLayers: Map<string, SVGElement> = new Map()
  private loadingPromises: Map<string, Promise<SVGElement>> = new Map()

  /**
   * Load and parse the layer manifest
   */
  async loadManifest(): Promise<LayerManifest> {
    if (this.manifest) {
      return this.manifest
    }

    try {
      const response = await fetch('/layers/manifest.json')
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.statusText}`)
      }
      this.manifest = await response.json()
      return this.manifest
    } catch (error) {
      console.error('Failed to load layer manifest:', error)
      throw error
    }
  }

  /**
   * Load a specific layer SVG
   */
  async loadLayer(layerId: LayerId): Promise<SVGElement> {
    // Return cached layer if already loaded
    if (this.loadedLayers.has(layerId)) {
      return this.loadedLayers.get(layerId)!.cloneNode(true) as SVGElement
    }

    // Return existing loading promise if already in progress
    if (this.loadingPromises.has(layerId)) {
      const svg = await this.loadingPromises.get(layerId)!
      return svg.cloneNode(true) as SVGElement
    }

    // Start loading the layer
    const loadingPromise = this.fetchAndParseLayer(layerId)
    this.loadingPromises.set(layerId, loadingPromise)

    try {
      const svg = await loadingPromise
      this.loadedLayers.set(layerId, svg)
      this.loadingPromises.delete(layerId)
      return svg.cloneNode(true) as SVGElement
    } catch (error) {
      this.loadingPromises.delete(layerId)
      throw error
    }
  }

  /**
   * Fetch and parse a layer SVG file
   */
  private async fetchAndParseLayer(layerId: LayerId): Promise<SVGElement> {
    try {
      const response = await fetch(`/layers/${layerId}.svg`)
      if (!response.ok) {
        throw new Error(`Failed to load layer ${layerId}: ${response.statusText}`)
      }

      const svgContent = await response.text()
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml')
      const svgElement = svgDoc.documentElement

      if (svgElement.tagName !== 'svg') {
        throw new Error(`Invalid SVG content for layer ${layerId}`)
      }

      return svgElement
    } catch (error) {
      console.error(`Failed to fetch layer ${layerId}:`, error)
      throw error
    }
  }

  /**
   * Get theme styles for a specific layer
   * Uses frontend theme definitions from mapThemes.ts
   */
  getThemeStyles(theme: MapThemeName, layerId: LayerId): LayerStyles {
    return getLayerStyles(theme, layerId)
  }

  /**
   * Get the viewBox from manifest
   */
  getViewBox(): string | null {
    return this.manifest?.viewBox || null
  }

  /**
   * Extract road paths from the roads layer for rendering
   */
  async getRoadPaths(): Promise<string[]> {
    try {
      const roadsSvg = await this.loadLayer('roads')
      const paths = roadsSvg.querySelectorAll('path')
      return Array.from(paths).map((p) => p.getAttribute('d') || '')
    } catch (error) {
      console.error('Failed to load road paths:', error)
      return []
    }
  }

  /**
   * Clear all cached layers (useful for hot-reload during development)
   */
  clearCache(): void {
    this.manifest = null
    this.loadedLayers.clear()
    this.loadingPromises.clear()
  }
}

// Export singleton instance
export const layerService = new LayerService()
