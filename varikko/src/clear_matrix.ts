import Database from 'better-sqlite3';
import path from 'path';
import readline from 'readline';

const DB_PATH = path.resolve(__dirname, '../data/intermediate.db');

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

  if (!force) {
    console.log(`Target Database: ${DB_PATH}`);
    const answer = await ask('Are you sure you want to DELETE ALL matrix data? (y/N) ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  try {
    const db = new Database(DB_PATH);
    console.log('Clearing matrix table...');
    const info = db.prepare('DELETE FROM matrix').run();
    console.log(`Deleted ${info.changes} rows.`);
    
    console.log('Vacuuming database...');
    db.exec('VACUUM');
    console.log('Done.');
  } catch (error: any) {
    if (error.code === 'SQLITE_ERROR' && error.message.includes('no such table')) {
        console.log("Table 'matrix' does not exist. Nothing to clear.");
    } else {
        console.error("Error clearing database:", error);
        process.exit(1);
    }
  }
}

main();
