import Database from 'better-sqlite3';
import path from 'path';

// Database path - must match where fetch_zones.ts creates it
const DB_PATH = path.resolve(__dirname, '../../opas/public/varikko.db');

// Vintage color scheme for 10 deciles (fastest to slowest)
const DECILE_COLORS = [
  '#E76F51', // Deep Orange - Fastest
  '#F4A261', // Light Orange
  '#F9C74F', // Yellow
  '#90BE6D', // Light Green
  '#43AA8B', // Teal
  '#277DA1', // Blue
  '#4D5061', // Dark Blue-Gray
  '#6C5B7B', // Purple
  '#8B5A8C', // Dark Purple
  '#355C7D', // Very Dark Blue - Slowest
];

function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

function formatDecileLabel(minDuration: number, maxDuration: number | null, decileNumber: number): string {
  const minMinutes = secondsToMinutes(minDuration);
  
  if (decileNumber === 10 && maxDuration === null) {
    // Last decile shows "more than X minutes"
    return `>${minMinutes} min`;
  }
  
  const maxMinutes = secondsToMinutes(maxDuration!);
  
  if (minMinutes === maxMinutes) {
    return `${minMinutes} min`;
  }
  
  return `${minMinutes}-${maxMinutes} min`;
}

function calculateDeciles(db: Database.Database, force: boolean = false) {
  console.log('Calculating deciles for all routes...');
  
  // Check if deciles already exist
  const existingDeciles = db.prepare('SELECT COUNT(*) as count FROM deciles').get() as { count: number };
  
  if (existingDeciles.count > 0 && !force) {
    console.log(`Deciles already exist (${existingDeciles.count} rows). Use --force to recalculate.`);
    return;
  }
  
  if (force) {
    console.log('Clearing existing deciles...');
    db.prepare('DELETE FROM deciles').run();
  }
  
  // Get all successful routes across all time periods
  const routesQuery = db.prepare(`
    SELECT duration 
    FROM routes 
    WHERE status = 'OK' AND duration IS NOT NULL
    ORDER BY duration ASC
  `);
  
  const routes = routesQuery.all() as { duration: number }[];
  
  if (routes.length === 0) {
    console.log('No successful routes found. Please run route calculation first.');
    return;
  }
  
  console.log(`Found ${routes.length} successful routes`);
  
  // Calculate decile thresholds
  const totalRoutes = routes.length;
  const decileSize = Math.floor(totalRoutes / 10);
  const remainder = totalRoutes % 10;
  
  const insertDecile = db.prepare(`
    INSERT INTO deciles (decile_number, min_duration, max_duration, color_hex, label)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  let startIndex = 0;
  
  for (let decileNumber = 1; decileNumber <= 10; decileNumber++) {
    // Distribute remainder among first few deciles
    const currentDecileSize = decileNumber <= remainder ? decileSize + 1 : decileSize;
    const endIndex = startIndex + currentDecileSize - 1;
    
    const minDuration = routes[startIndex].duration;
    const maxDuration = endIndex < routes.length - 1 ? routes[endIndex].duration : null;
    
    const label = formatDecileLabel(minDuration, maxDuration, decileNumber);
    
    insertDecile.run(
      decileNumber,
      minDuration,
      maxDuration !== null ? maxDuration : -1, // Use -1 to indicate open-ended
      DECILE_COLORS[decileNumber - 1],
      label
    );
    
    console.log(`Decile ${decileNumber}: ${label} (${routes.length > 0 ? routes[startIndex].duration : 0}s - ${maxDuration || '∞'}s)`);
    
    startIndex = endIndex + 1;
  }
  
  // Store metadata
  const insertMetadata = db.prepare(`
    INSERT OR REPLACE INTO metadata (key, value) VALUES ('deciles_calculated_at', datetime('now'))
  `);
  insertMetadata.run();
  
  console.log('Deciles calculation completed successfully!');
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  
  const db = new Database(DB_PATH);
  
  try {
    calculateDeciles(db, force);
  } catch (error) {
    console.error('Error calculating deciles:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

export { calculateDeciles };
