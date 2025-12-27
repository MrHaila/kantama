import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/tests/**',
        'src/tui/**',  // UI tests separate concern
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 30000,  // 30s for route calculation tests
    hookTimeout: 10000,
  },
});
