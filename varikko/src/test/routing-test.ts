#!/usr/bin/env node

// Quick test of zone-based routing
import { openDB } from '../lib/db.js';
import { getZonesByCity } from '../lib/routing-zoned.js';

const db = openDB();

try {
  // Test zone grouping
  const zonesByCity = getZonesByCity(db);
  
  console.log('Zone distribution by city:');
  for (const [city, zones] of zonesByCity.entries()) {
    console.log(`  ${city}: ${zones.length} zones`);
  }
  
  // Test route count calculation
  let totalRoutes = 0;
  for (const [city, zones] of zonesByCity.entries()) {
    const routes = zones.length * zones.length * 3; // 3 time periods
    totalRoutes += routes;
    console.log(`  ${city}: ${routes.toLocaleString()} routes (all periods)`);
  }
  
  console.log(`\nTotal routes to calculate: ${totalRoutes.toLocaleString()}`);
  
  // Check existing progress
  const progress = db.prepare(`
    SELECT key, value FROM metadata 
    WHERE key LIKE 'progress_%'
  `).all() as { key: string; value: string }[];
  
  if (progress.length > 0) {
    console.log('\nExisting progress:');
    progress.forEach((p: { key: string; value: string }) => {
      const data = JSON.parse(p.value);
      console.log(`  ${p.key}: ${data.completed}/${data.total} completed`);
    });
  } else {
    console.log('\nNo existing progress found');
  }
  
} catch (error) {
  console.error('Test failed:', error);
} finally {
  db.close();
}
