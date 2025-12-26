import * as d3 from 'd3-geo'
import * as topojson from 'topojson-client'
import fs from 'fs'
import path from 'path'
import type { Feature } from 'geojson'
import type { Topology } from 'topojson-specification'

const OUTPUT_DIR = path.join(__dirname, '../../opas/public')
const TOPOJSON_FILE = path.join(OUTPUT_DIR, 'background_map.json')
const SVG_FILE = path.join(OUTPUT_DIR, 'background_map.svg')

// SVG dimensions - should match MAP_CONFIG in opas
const zoomLevel = 1.2 // 20% zoom out
const baseWidth = 800
const baseHeight = 800
const width = baseWidth * zoomLevel
const height = baseHeight * zoomLevel

// ViewBox parameters to keep bottom edge fixed while expanding
const viewBoxX = -(width - baseWidth) / 2 + 60 // Center horizontally, then move 60px right
const viewBoxY = -120 - (height - baseHeight) // Keep bottom fixed, moved up from -140

// Projection parameters - must match BackgroundMap.vue exactly
function createProjection() {
  return d3
    .geoMercator()
    .center([24.93, 60.17]) // Helsinki center
    .scale(120000)
    .translate([width / 2, height / 2])
}

function generateSVG() {
  console.log('Generating SVG from TopoJSON...')

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  try {
    // Load the TopoJSON file
    const topology: Topology = JSON.parse(fs.readFileSync(TOPOJSON_FILE, 'utf-8'))

    // Create projection
    const projection = createProjection()
    const pathGenerator = d3.geoPath().projection(projection)

    // Start building SVG
    let svg = `<svg viewBox="${viewBoxX} ${viewBoxY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`
    
    // Add CSS styles with CSS variables
    svg += `  <defs>
    <style>
      .background-rect { fill: var(--bg-color, #FDFBF7); }
      .water-layer { 
        fill: var(--water-color, #2A4D69); 
        stroke: none;
      }
      .road-layer { 
        fill: none;
        stroke: var(--road-color, #8B7355); 
        stroke-width: var(--road-width, 0.5);
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    </style>
  </defs>\n`

    // Add background rectangle
    svg += `  <rect class="background-rect" x="${viewBoxX}" y="${viewBoxY}" width="${width}" height="${height}"/>\n`

    // Add main group
    svg += `  <g>\n`

    // Extract and render water layer
    if (topology.objects.water) {
      const waterGeoJson = topojson.feature(topology, topology.objects.water) as { features: unknown[] }
      
      svg += `    <g class="water-layer">\n`
      waterGeoJson.features.forEach((feature, index) => {
        const path = pathGenerator(feature as Feature)
        if (path) {
          svg += `      <path d="${path}" data-index="${index}"/>\n`
        }
      })
      svg += `    </g>\n`
    }

    // Extract and render road layer
    if (topology.objects.roads) {
      const roadGeoJson = topojson.feature(topology, topology.objects.roads) as { features: unknown[] }
      
      svg += `    <g class="road-layer">\n`
      roadGeoJson.features.forEach((feature, index) => {
        const path = pathGenerator(feature as Feature)
        if (path) {
          svg += `      <path d="${path}" data-index="${index}"/>\n`
        }
      })
      svg += `    </g>\n`
    }

    // Close SVG
    svg += `  </g>\n</svg>`

    // Write SVG file
    fs.writeFileSync(SVG_FILE, svg, 'utf-8')
    
    console.log(`Successfully generated ${SVG_FILE}`)
    
    // Check file size
    const stats = fs.statSync(SVG_FILE)
    console.log(`SVG size: ${(stats.size / 1024).toFixed(2)} KB`)

  } catch (error) {
    console.error('Error generating SVG:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  generateSVG()
}

export { generateSVG }
