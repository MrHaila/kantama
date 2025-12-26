import Database from 'better-sqlite3';
import path from 'path';

// Database path - must match where fetch_zones.ts creates it
const DB_PATH = path.resolve(__dirname, '../../opas/public/varikko.db');

function main() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('=== Kantama Route Status ===\n');
    
    // Check if database has any routes
    const routeCount = db.prepare('SELECT COUNT(*) as count FROM routes').get() as { count: number };
    
    if (routeCount.count === 0) {
      console.log('❌ No routes found in database.');
      console.log('   Run "pnpm fetch:zones" first to create zones and routes.');
      return;
    }
    
    // Overall statistics
    const overallSummary = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM routes 
      GROUP BY status
    `).all() as { status: string; count: number }[];
    
    console.log('Overall Summary:');
    overallSummary.forEach(s => {
      const icon = s.status === 'OK' ? '✅' : s.status === 'ERROR' ? '❌' : s.status === 'NO_ROUTE' ? '⚠️' : '⏳';
      console.log(`  ${icon} ${s.status}: ${s.count} routes`);
    });
    
    // Per period breakdown
    const periods = ['MORNING', 'EVENING', 'MIDNIGHT'];
    
    console.log('\nPer Period Breakdown:');
    periods.forEach(period => {
      const periodSummary = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM routes 
        WHERE time_period = ?
        GROUP BY status
      `).all(period) as { status: string; count: number }[];
      
      console.log(`\n${period}:`);
      if (periodSummary.length === 0) {
        console.log('  No routes found');
      } else {
        periodSummary.forEach(s => {
          const icon = s.status === 'OK' ? '✅' : s.status === 'ERROR' ? '❌' : s.status === 'NO_ROUTE' ? '⚠️' : '⏳';
          console.log(`  ${icon} ${s.status}: ${s.count}`);
        });
      }
    });
    
    // Check for deciles
    const decileCount = db.prepare('SELECT COUNT(*) as count FROM deciles').get() as { count: number };
    
    console.log('\nDeciles:');
    if (decileCount.count > 0) {
      console.log(`✅ Deciles calculated: ${decileCount.count} deciles`);
      
      // Show decile ranges
      const deciles = db.prepare('SELECT * FROM deciles ORDER BY decile_number').all() as {
        decile_number: number;
        label: string;
        color_hex: string;
      }[];
      
      console.log('\nDecile Ranges:');
      deciles.forEach(d => {
        console.log(`  ${d.decile_number}. ${d.label} (${d.color_hex})`);
      });
    } else {
      console.log('❌ No deciles found');
      const successfulRoutes = db.prepare('SELECT COUNT(*) as count FROM routes WHERE status = \'OK\'').get() as { count: number };
      if (successfulRoutes.count > 0) {
        console.log('   Run "pnpm calculate:deciles" to generate deciles for heatmap');
      }
    }
    
    // Show recent errors if any
    const recentErrors = db.prepare(`
      SELECT from_id, to_id, time_period, legs 
      FROM routes 
      WHERE status = 'ERROR' 
      LIMIT 5
    `).all() as { from_id: string; to_id: string; time_period: string; legs: string }[];
    
    if (recentErrors.length > 0) {
      console.log('\nRecent Errors (up to 5):');
      recentErrors.forEach(e => {
        // Error details are stored as plain text in the legs column for ERROR status
        console.log(`  ${e.from_id} → ${e.to_id} (${e.time_period}): ${e.legs || 'Unknown error'}`);
      });
    }
    
    // Metadata
    console.log('\nMetadata:');
    const metadata = db.prepare('SELECT key, value FROM metadata ORDER BY key').all() as {
      key: string;
      value: string;
    }[];
    
    if (metadata.length > 0) {
      metadata.forEach(m => {
        console.log(`  ${m.key}: ${m.value}`);
      });
    } else {
      console.log('  No metadata found');
    }
    
  } catch (error) {
    console.error('Error checking status:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
