// Close-up renders of each hero model for art review.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
await page.goto((process.env.BBR_URL ?? 'http://localhost:4173/') + '?peaceful&play');
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
// Security guard close-ups: spawn one, park it at the origin facing the camera, freeze with pause.
for (const view of ['front', 'game']) {
  await page.evaluate(() => {
    const g = window.__bbr;
    g.restart();
    g.debug.setPeaceful(false);
  });
  await page.waitForFunction(() => window.__bbr.museum.run.guards.length > 0);
  await page.evaluate(() => {
    const g = window.__bbr;
    g.debug.teleport(2.6, -3.2);
    g.debug.moveGuard(0, 0, 0);
    g.museum.run.guards[0].yaw = Math.PI;
  });
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate((view) => {
    const g = window.__bbr;
    g.pause();
    const cam = g.museum.cam;
    document.getElementById('ui').style.display = 'none';
    if (view === 'front') Object.assign(cam.offset, { x: 0.4, y: 1.75, z: -4.6 });
    else Object.assign(cam.offset, { x: 0, y: 11.03, z: -8.62 });
    cam.snapTo({ x: 0, z: 0 });
    cam.camera.setTarget(new cam.camera.position.constructor(0, view === 'game' ? 0.6 : 1.2, 0));
  }, view);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `tests/e2e/screenshots/guard-${view}.png`, clip: view !== 'game' ? { x: 400, y: 40, width: 400, height: 620 } : undefined });
  await page.evaluate(() => {
    document.getElementById('ui').style.display = '';
    window.__bbr.resume();
    window.__bbr.debug.setPeaceful(true);
  });
}
// M5 enemies: dog, multo, tikbalang and a tikbalang illusion, frozen at the origin facing the camera.
const FRAMES = { dog: [1.2, -3.4, 0.55], multo: [1.6, -4.8, 1.2], tikbalang: [2.3, -6.4, 1.7], decoy: [2.3, -6.4, 1.7] };
for (const kind of ['dog', 'multo', 'tikbalang', 'decoy']) {
  for (const view of ['front', 'game']) {
    await page.evaluate(([kind, view, f]) => {
      const g = window.__bbr;
      g.restart();
      g.debug.teleport(2.6, -3.2);
      const run = g.museum.run;
      if (kind === 'decoy') run.decoys.push({ pos: { x: 0, z: 0 }, yaw: Math.PI, ttl: 2, angle: 0, spin: 1 });
      else run.spawnEnemy(kind, { x: 2.6, z: -3.2 }, { x: 0, z: 0 }).yaw = Math.PI;
      const cam = g.museum.cam;
      document.getElementById('ui').style.display = 'none';
      if (view === 'front') Object.assign(cam.offset, { x: 0.4, y: f[0], z: f[1] });
      else Object.assign(cam.offset, { x: 0, y: 11.03, z: -8.62 });
      cam.snapTo({ x: 0, z: 0 });
      cam.camera.setTarget(new cam.camera.position.constructor(0, view === 'game' ? 0.6 : f[2], 0));
    }, [kind, view, FRAMES[kind]]);
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(([view, f]) => {
      const g = window.__bbr;
      g.pause();
      const cam = g.museum.cam;
      cam.snapTo({ x: 0, z: 0 });
      cam.camera.setTarget(new cam.camera.position.constructor(0, view === 'game' ? 0.6 : f[2], 0));
    }, [view, FRAMES[kind]]);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `tests/e2e/screenshots/enemy-${kind}-${view}.png`, clip: view !== 'game' ? { x: 340, y: 40, width: 520, height: 620 } : undefined });
    await page.evaluate(() => {
      document.getElementById('ui').style.display = '';
      window.__bbr.resume();
    });
  }
}
await browser.close();
