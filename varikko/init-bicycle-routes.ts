#!/usr/bin/env tsx
/**
 * Initialize bicycle route files for a subset of zones
 */
import { initializeRoutes, getAllZoneIds } from './src/lib/datastore.js';

async function main() {
  // Initialize bicycle routes for first 5 zones only
  const allZones = getAllZoneIds();
  const testZones = allZones.slice(0, 5);
  const periods = ['MORNING'] as const;
  const modes = ['BICYCLE'] as const;

  console.log('Initializing bicycle routes for zones:', testZones.join(', '));
  initializeRoutes(testZones, periods, modes);
  console.log(`✓ Created bicycle route files for ${testZones.length} zones`);
  console.log('  Files created:', testZones.map(z => `${z}-morning-bicycle.msgpack`).join(', '));
}

main().catch(console.error);
