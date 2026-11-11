import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// base './' keeps the build portable: it works on GitHub Pages sub-paths and any static host.
export default defineConfig({
  base: './',
  plugins: [
    {
      // The loading screen shows the logo before any script or image request finishes,
      // so the SVG (tools/build_logo.py) is written straight into index.html.
      name: 'bbr-inline-logo',
      transformIndexHtml: (html) => html.replace('<!--bbr:logo-->', new TextDecoder().decode(readFileSync('src/assets/brand/logo.svg')).trim()),
    },
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
