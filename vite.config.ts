import { defineConfig } from 'vitest/config';

// base './' keeps the build portable: it works on GitHub Pages sub-paths and any static host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
