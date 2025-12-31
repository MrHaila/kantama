/**
 * Global test setup for vitest
 *
 * This file runs before all test files.
 */

import { beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, 'fixtures', 'test-data');

beforeAll(() => {
  // Ensure test data directory exists
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
});

afterAll(() => {
  // Cleanup is handled by individual test files or helpers
  // as they may want to inspect test data after tests complete
});
