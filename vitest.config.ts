import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: {
      mainFields: ['module', 'main'],
    },
  },
  test: {
    environment: 'node',
    // Only *.test.ts is collected, so __tests__ directories may hold shared fixtures and helpers.
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
