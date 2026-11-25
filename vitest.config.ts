import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./packages/shared/src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/ui/**/*.test.tsx',
    ],
    testTimeout: 20000,
    hookTimeout: 30000,
    maxWorkers: 2,
  },
});
