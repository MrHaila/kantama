import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

export function loadFixture<T = unknown>(relativePath: string): T {
  const fullPath = path.join(FIXTURES_DIR, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${relativePath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

export function loadZonesFixture(name: '5-zones' | '50-zones' | 'full-zones') {
  return loadFixture(`zones/${name}.json`);
}

export function loadRoutesFixture(name: 'sample-routes' | 'edge-cases') {
  return loadFixture(`routes/${name}.json`);
}
