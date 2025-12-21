import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../data/intermediate.db');
const OUT_FILE = path.resolve(__dirname, '../data/matrix.json');

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("Database not found:", DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  
  console.log("Reading from DB...");
  const rows = db.prepare('SELECT from_id, to_id, duration FROM matrix').all();

  // Structure: { "00100": { "00120": 120, "00130": 400 }, ... }
  // Use a simple object map.
  const matrix: Record<string, Record<string, number>> = {};

  for (const row of rows as any[]) {
    if (!matrix[row.from_id]) {
      matrix[row.from_id] = {};
    }
    // Duration in seconds. 
    // -1 or null could imply unreachable.
    // We strictly use integer seconds.
    matrix[row.from_id][row.to_id] = row.duration;
  }

  // Statistics
  const originCount = Object.keys(matrix).length;
  console.log(`Exporting matrix for ${originCount} origins.`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(matrix));
  console.log(`Saved matrix to ${OUT_FILE}`);
}

main();
