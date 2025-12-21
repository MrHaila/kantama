import Database from 'better-sqlite3';
import path from 'path';
import readline from 'readline';

const DB_PATH = path.resolve(__dirname, '../../opas/public/data/varikko.db');

const ask = (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
};

async function main() {
  const force = process.argv.includes('--force') || process.argv.includes('-f');
  const clearRoutesOnly = process.argv.includes('--routes');
  const clearPlacesOnly = process.argv.includes('--places');
  const clearMetadataOnly = process.argv.includes('--metadata');
  
  // Default to clearing everything if no specific flags
  const clearAll = !clearRoutesOnly && !clearPlacesOnly && !clearMetadataOnly;

  if (!force) {
    console.log(`Target Database: ${DB_PATH}`);
    let targetMsg = 'ALL tables';
    if (!clearAll) {
      const targets = [];
      if (clearRoutesOnly) targets.push('routes (status reset)');
      if (clearPlacesOnly) targets.push('places (and routes)');
      if (clearMetadataOnly) targets.push('metadata');
      targetMsg = targets.join(', ');
    }
    const answer = await ask(`Are you sure you want to clear ${targetMsg}? (y/N) `);
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  try {
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');

    if (clearAll) {
      console.log('Clearing ALL data...');
      db.prepare('DELETE FROM routes').run();
      db.prepare('DELETE FROM places').run();
      db.prepare('DELETE FROM metadata').run();
    } else {
      if (clearRoutesOnly) {
        console.log('Resetting routes table status to PENDING...');
        db.prepare(`
          UPDATE routes 
          SET duration = NULL, 
              numberOfTransfers = NULL, 
              walkDistance = NULL, 
              legs = NULL, 
              status = 'PENDING'
        `).run();
      }

      if (clearPlacesOnly) {
        console.log('Clearing places and routes...');
        db.prepare('DELETE FROM routes').run();
        db.prepare('DELETE FROM places').run();
      }

      if (clearMetadataOnly) {
        console.log('Clearing metadata...');
        db.prepare('DELETE FROM metadata').run();
      }
    }

    console.log('Vacuuming database...');
    db.exec('VACUUM');
    console.log('Done.');
  } catch (error: any) {
    if (error.code === 'SQLITE_ERROR' && error.message.includes('no such table')) {
        console.log("Database tables do not exist or are already empty.");
    } else {
        console.error("Error clearing database:", error);
        process.exit(1);
    }
  }
}

main();
