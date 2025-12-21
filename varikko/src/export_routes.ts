import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../data/varikko.db');
const OUT_FILE = path.resolve(__dirname, '../data/routes_export.json');

const PERIOD_ARG = process.argv.find(a => a.startsWith('--period='));
const PERIOD = PERIOD_ARG ? PERIOD_ARG.split('=')[1] : 'MORNING';

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("Database not found:", DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  
  console.log(`Reading ${PERIOD} routes from DB...`);
  const rows = db.prepare('SELECT from_id, to_id, duration FROM routes WHERE status = "OK" AND time_period = ?').all(PERIOD);

  // Structure: { "00100": { "00120": 120, "00130": 400 }, ... }
  const exportData: Record<string, Record<string, number>> = {};

  for (const row of rows as any[]) {
    if (!exportData[row.from_id]) {
      exportData[row.from_id] = {};
    }
    exportData[row.from_id][row.to_id] = row.duration;
  }

  const originCount = Object.keys(exportData).length;
  console.log(`Exporting ${PERIOD} routes for ${originCount} origins.`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(exportData));
  console.log(`Saved export to ${OUT_FILE}`);
}

main();
