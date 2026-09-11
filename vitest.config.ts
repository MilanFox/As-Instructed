import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: {
      mainFields: ['module', 'main'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
