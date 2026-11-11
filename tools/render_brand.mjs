// Renders the PNG versions of the brand art (app icons + the link-preview image) from the SVGs
// that tools/build_logo.py writes. Run after changing the logo:  node tools/render_brand.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const icon = readFileSync('public/icon.svg', 'utf8');
const logo = readFileSync('src/assets/brand/logo.svg', 'utf8');
const browser = await chromium.launch();

async function shot(html, width, height, path, transparent = false) {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(`<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden">${html}</body>`);
  await page.screenshot({ path, omitBackground: transparent });
  await page.close();
  console.log(path);
}

for (const size of [180, 192, 512]) {
  // The 180 px Apple icon is a full-bleed square (iOS rounds the corners itself).
  const svg = icon.replace('<svg ', `<svg width="${size}" height="${size}" `);
  const html = size === 180 ? `<div style="background:#0f1430">${svg.replace('rx="112"', 'rx="0"')}</div>` : svg;
  await shot(html, size, size, `public/icon-${size}.png`, size !== 180);
}

await shot(
  `<div style="width:1200px;height:630px;display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,#2b3d8f,#1f2d6b 45%,#0f1430 85%)">
     ${logo.replace('<svg ', '<svg width="940" ')}
   </div>`,
  1200,
  630,
  'public/share.png',
);
await browser.close();
