#!/usr/bin/env tsx
/**
 * Fixture Generator
 *
 * Generates minimal test fixtures from production data for reliable E2E testing.
 * Snapshots a subset of zones and their routes to tests/fixtures/
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Selected test zones covering different scenarios
const FIXTURE_ZONES = [
  'HEL-030', // Kaartinkaupunki - Central Helsinki, excellent connectivity
  'HEL-050', // Punavuori - Also central, good connectivity
  'HEL-457', // Itäkeskus - Eastern Helsinki, good connectivity
  'HEL-331', // Kannelmäki - Western Helsinki, moderate connectivity
  'HEL-473', // Mellunmäki - Far eastern, likely lower connectivity
  'ESP-111', // Pohjois-Leppävaara - Espoo, moderate connectivity
  'ESP-712', // Bodom - Far western Espoo, likely poor connectivity
  'VAN-Ylästö', // Ylästö - Vantaa
]

async function generateFixtures() {
  console.log('🔧 Generating test fixtures...\n')

  const sourceDir = path.join(__dirname, '../../public/data')
  const fixtureDir = path.join(__dirname, '../fixtures')
  const fixtureRoutesDir = path.join(fixtureDir, 'routes')

  // Ensure fixture directories exist
  await fs.mkdir(fixtureRoutesDir, { recursive: true })

  // Read source data
  console.log('📖 Reading source data...')
  const zonesData = JSON.parse(await fs.readFile(path.join(sourceDir, 'zones.json'), 'utf-8'))

  // Filter to test zones only
  const testZones = zonesData.zones.filter((z: { id: string }) => FIXTURE_ZONES.includes(z.id))

  if (testZones.length !== FIXTURE_ZONES.length) {
    const found = testZones.map((z: { id: string }) => z.id)
    const missing = FIXTURE_ZONES.filter((id) => !found.includes(id))
    console.warn(`⚠️  Warning: Missing zones in source data: ${missing.join(', ')}`)
  }

  console.log(`✅ Found ${testZones.length}/${FIXTURE_ZONES.length} test zones`)

  // Create minimal zones.json
  const fixtureData = {
    ...zonesData,
    zones: testZones,
  }

  console.log('\n📝 Writing zones.json fixture...')
  await fs.writeFile(path.join(fixtureDir, 'zones.json'), JSON.stringify(fixtureData, null, 2))

  // Copy route files for test zones
  console.log('\n📦 Copying route files...')
  let copiedCount = 0
  let missingCount = 0

  for (const zoneId of FIXTURE_ZONES) {
    for (const period of ['M', 'E', 'N']) {
      const filename = `${zoneId}-${period}.msgpack`
      const source = path.join(sourceDir, 'routes', filename)
      const dest = path.join(fixtureRoutesDir, filename)

      try {
        await fs.copyFile(source, dest)
        copiedCount++
      } catch (e) {
        console.warn(`  ⚠️  Missing: ${filename}`)
        missingCount++
      }
    }
  }

  console.log(`✅ Copied ${copiedCount} route files`)
  if (missingCount > 0) {
    console.log(`⚠️  ${missingCount} route files not found`)
  }

  // Copy manifest
  console.log('\n📋 Copying manifest...')
  const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf-8'))

  // Update manifest stats for fixtures
  const fixtureManifest = {
    ...manifest,
    zones: testZones.length,
    routeFiles: copiedCount,
    generated: new Date().toISOString(),
    note: 'Test fixture data - subset of production data',
  }

  await fs.writeFile(path.join(fixtureDir, 'manifest.json'), JSON.stringify(fixtureManifest, null, 2))

  // Create README
  console.log('\n📝 Creating README...')
  const readme = `# Test Fixtures

This directory contains minimal test data for E2E tests.

## Contents

- **zones.json**: ${testZones.length} zones covering different connectivity levels and cities
- **manifest.json**: Data summary metadata
- **routes/**: Route files for ${FIXTURE_ZONES.length} zones × 3 time periods = ${FIXTURE_ZONES.length * 3} files (if all exist)

## Selected Zones

${testZones.map((z: { id: string; name: string; city: string }) => `- ${z.id}: ${z.name}, ${z.city}`).join('\n')}

## Regenerating Fixtures

To update fixtures from current production data:

\`\`\`bash
pnpm test:create-fixtures
\`\`\`

This will snapshot the current data structure and ensure tests stay in sync.

## Last Generated

${new Date().toISOString()}

Generated from: ${manifest.generated || 'unknown'}
`

  await fs.writeFile(path.join(fixtureDir, 'README.md'), readme)

  console.log('\n✅ Test fixtures generated successfully!\n')
  console.log(`📁 Location: ${fixtureDir}`)
  console.log(`📊 Zones: ${testZones.length}`)
  console.log(`📦 Routes: ${copiedCount} files`)
  console.log('\nNext steps:')
  console.log('  1. Run: pnpm test')
  console.log('  2. Commit fixtures to git for CI/CD')
}

generateFixtures().catch((err) => {
  console.error('❌ Error generating fixtures:', err)
  process.exit(1)
})
