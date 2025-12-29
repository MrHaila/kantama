import { afterAll, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Test database path (in-memory or temp file)
export const TEST_DB_PATH = ':memory:'; // Or path.join(process.cwd(), 'test-varikko.db');

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.USE_LOCAL_OTP = 'true'; // Always use local in tests

  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
});

afterAll(() => {
  // Cleanup: remove test database if file-based
  if (TEST_DB_PATH !== ':memory:' && fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});
