#!/usr/bin/env node

import { Command } from 'commander';
import { openDB } from '../lib/db';
import { buildRoutesByZone, resumeRoutesByZone } from '../lib/routing-zoned';
import { createProgressEmitter } from '../lib/events';

const program = new Command();

program
  .name('varikko-routes')
  .description('Zone-based route calculation for Varikko')
  .version('1.0.0');

program
  .command('build')
  .description('Build routes using zone-based approach')
  .option('-p, --period <period>', 'Specific time period (MORNING, EVENING, MIDNIGHT)')
  .option('-t, --test', 'Run in test mode (5 routes per city)')
  .option('-r, --resume', 'Resume from last completed city/period')
  .action(async (options) => {
    const db = openDB();
    const emitter = createProgressEmitter();

    emitter.on('progress', (event) => {
      switch (event.type) {
        case 'start':
          console.log(`\n🚀 ${event.message}`);
          if (event.metadata?.cities) {
            console.log(`   Cities: ${event.metadata.cities.join(', ')}`);
            console.log(`   Periods: ${event.metadata.periods?.join(', ')}`);
            console.log(`   Total zones: ${event.metadata.totalZones}`);
          }
          break;
        
        case 'progress':
          if (event.metadata?.currentCity) {
            const { currentCity, currentPeriod, elapsed, eta } = event.metadata;
            console.log(`\n📍 ${currentCity} (${currentPeriod})`);
            if (elapsed) console.log(`   Elapsed: ${Math.round(elapsed / 1000)}s`);
            if (eta) console.log(`   ETA: ${Math.round(eta / 1000)}s`);
            
            if (event.metadata.cityResults) {
              const { processed, ok, noRoute, errors } = event.metadata.cityResults;
              console.log(`   Progress: ${processed} routes`);
              console.log(`   ✓ OK: ${ok} | ⊘ No route: ${noRoute} | ✗ Errors: ${errors}`);
            }
          }
          break;
        
        case 'complete':
          console.log(`\n✅ ${event.message}`);
          if (event.metadata?.processed) {
            console.log(`   Total processed: ${event.metadata.processed}`);
            console.log(`   ✓ OK: ${event.metadata.ok} | ⊘ No route: ${event.metadata.noRoute} | ✗ Errors: ${event.metadata.errors}`);
            console.log(`   Time: ${Math.round(event.metadata.elapsed! / 1000)}s`);
          }
          break;
        
        case 'error':
          console.error(`\n❌ ${event.message}`);
          if (event.error) {
            console.error(`   ${event.error.message}`);
          }
          break;
      }
    });

    try {
      const fn = options.resume ? resumeRoutesByZone : buildRoutesByZone;
      await fn(db, {
        period: options.period,
        testMode: options.test,
        emitter,
      });
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    } finally {
      db.close();
    }
  });

program.parse();
