// Close-up renders of each hero model for art review.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto(process.env.BBR_URL ?? 'http://localhost:4173/');
await page.waitForFunction(() => window.__bbr?.fsm.state === 'playing');
for (const [i, id] of ['rizal', 'lapulapu', 'bonifacio', 'gabriela'].entries()) {
  for (const view of ['front', 'back', 'game']) {
    await page.evaluate(([id, view]) => {
      const g = window.__bbr;
      g.setHero(id);
      g.restart();
      const cam = g.museum.cam;
      document.getElementById('ui').style.display = 'none';
      if (view === 'front') Object.assign(cam.offset, { x: 0, y: 1.75, z: -4.6 });
      else if (view === 'back') { Object.assign(cam.offset, { x: 0, y: 1.75, z: -4.6 }); g.museum.player.motor.state.yaw = 0.6; }
      else Object.assign(cam.offset, { x: 0, y: 11.03, z: -8.62 });
      cam.snapTo({ x: 0, z: 0 });
      cam.camera.setTarget(new cam.camera.position.constructor(0, view === 'game' ? 0.6 : 1.05, 0));
    }, [id, view]);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `tests/e2e/screenshots/hero-${i}-${id}-${view}.png`, clip: view !== 'game' ? { x: 400, y: 40, width: 400, height: 620 } : undefined });
  }
}
await browser.close();
