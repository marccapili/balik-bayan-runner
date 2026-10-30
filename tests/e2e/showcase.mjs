// Close-up renders of each hero model for art review.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto(process.env.BBR_URL ?? 'http://localhost:4173/');
await page.waitForFunction(() => window.__bbr?.fsm.state === 'playing');
for (const [i, id] of ['rizal', 'lapulapu', 'bonifacio', 'gabriela'].entries()) {
  for (const view of ['front', 'game']) {
    await page.evaluate(([id, view]) => {
      const g = window.__bbr;
      g.setHero(id);
      g.restart();
      const cam = g.museum.cam;
      if (view === 'front') Object.assign(cam.offset, { x: 0, y: 1.6, z: -3.6 });
      else Object.assign(cam.offset, { x: 0, y: 11.03, z: -8.62 });
      cam.snapTo({ x: 0, z: 0 });
      cam.camera.setTarget(new cam.camera.position.constructor(0, view === 'front' ? 0.9 : 0.6, 0));
    }, [id, view]);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `tests/e2e/screenshots/hero-${i}-${id}-${view}.png`, clip: view === 'front' ? { x: 350, y: 50, width: 500, height: 620 } : undefined });
  }
}
await browser.close();
