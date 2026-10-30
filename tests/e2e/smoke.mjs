// Browser smoke test: boots the production build, checks for console errors,
// drives keyboard + touch joystick, verifies collision, and saves screenshots.
// Usage: npm run build && (npx vite preview --port 4173 &) && npm run test:e2e
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}

const URL = process.env.BBR_URL ?? 'http://localhost:4173/';
const OUT = 'tests/e2e/screenshots';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const snap = (page) => page.evaluate(() => window.__bbr.debugSnapshot());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Headless Chromium renders on the CPU (~10 fps) and the game clamps dt, so drive by
// condition instead of wall-clock: hold keys until the predicate passes or time runs out.
async function holdUntil(page, keys, pred, maxMs = 15000) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now();
  let s = await snap(page);
  while (!pred(s) && Date.now() - t0 < maxMs) {
    await wait(100);
    s = await snap(page);
  }
  for (const k of keys) await page.keyboard.up(k);
  return s;
}

async function bootPage(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__bbr?.fsm.state === 'playing', null, { timeout: 30000 });
  await wait(800);
  return { ctx, page, errors };
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// ── Desktop ──
{
  const { ctx, page, errors } = await bootPage(browser, { viewport: { width: 1280, height: 720 } });
  await page.screenshot({ path: `${OUT}/desktop-spawn.png` });
  const s0 = await snap(page);
  check('desktop boots into playing state', s0.state === 'playing');

  await page.keyboard.down('KeyD');
  await wait(900);
  await page.keyboard.up('KeyD');
  await wait(400);
  const s1 = await snap(page);
  check('D key moves hero east', s1.x > s0.x + 1.5, `x ${s0.x.toFixed(2)} → ${s1.x.toFixed(2)}`);
  check('hero decelerates to a stop', s1.speed < 0.2, `speed ${s1.speed.toFixed(2)}`);

  // Diagonal speed must not exceed straight speed.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await wait(600);
  const sd = await snap(page);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyA');
  check('diagonal speed is normalised', sd.speed <= 6.3, `speed ${sd.speed.toFixed(2)}`);

  // Run west into the bench at x = -6.5 (east face at -6.1) from the spawn row.
  await page.evaluate(() => window.__bbr.restart());
  await wait(200);
  let lx = 1;
  const s2 = await holdUntil(page, ['ArrowLeft'], (s) => {
    const stuck = Math.abs(s.x - lx) < 0.001 && s.x < -4;
    lx = s.x;
    return stuck;
  });
  check('bench blocks movement (no clipping)', s2.x > -6.1 && s2.x < -5.3, `x = ${s2.x.toFixed(2)}`);

  // Long run into the outer north wall (z = 24 - 0.3 thickness - 0.42 radius = 23.28).
  await page.evaluate(() => window.__bbr.restart());
  await holdUntil(page, ['KeyD'], (s) => s.x > 3);
  let last = -1;
  const s3 = await holdUntil(page, ['KeyW'], (s) => {
    const stuck = Math.abs(s.z - last) < 0.001 && s.z > 20;
    last = s.z;
    return stuck;
  }, 25000);
  check('outer wall stops hero', s3.z < 23.3 && s3.z > 22.5, `z = ${s3.z.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/desktop-north.png` });

  // Pause freezes the simulation.
  await page.keyboard.press('Escape');
  await wait(100);
  const p0 = await snap(page);
  await wait(500);
  const p1 = await snap(page);
  check('Escape pauses (sim time frozen)', p0.state === 'paused' && p1.simTime === p0.simTime);
  await page.screenshot({ path: `${OUT}/desktop-pause.png` });
  await page.click('[data-act="resume"]');
  await wait(100);
  check('Resume button resumes', (await snap(page)).state === 'playing');

  // Walk into the library through the west doorway (z 10.5..15.5 on x = -10).
  await page.evaluate(() => window.__bbr.restart());
  await holdUntil(page, ['KeyW'], (s) => s.z > 12.5);
  const s4 = await holdUntil(page, ['KeyA'], (s) => s.x < -14);
  await wait(500);
  check('hero can walk through a doorway into the library', s4.x < -10.5, `x=${s4.x.toFixed(2)} z=${s4.z.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/desktop-library.png` });

  for (const [i, k] of ['Digit2', 'Digit3', 'Digit4'].entries()) {
    await page.evaluate(() => window.__bbr.restart());
    await page.keyboard.press(k);
    await page.keyboard.down('KeyS');
    await wait(120);
    await page.keyboard.up('KeyS');
    await wait(700);
    await page.screenshot({ path: `${OUT}/desktop-hero${i + 2}.png` });
  }
  const perf = await snap(page);
  check('no console errors (desktop)', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`   perf (headless SwiftShader, CPU-rendered): ${perf.fps.toFixed(0)} fps, ${perf.meshes} meshes, drawCalls=${perf.drawCalls}`);
  await ctx.close();
}

// ── Phone (landscape + portrait) with touch joystick ──
for (const [label, viewport] of [['phone-landscape', { width: 844, height: 390 }], ['phone-portrait', { width: 390, height: 844 }]]) {
  const { ctx, page, errors } = await bootPage(browser, { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const s0 = await snap(page);
  const cdp = await ctx.newCDPSession(page);
  const sx = Math.round(viewport.width * 0.2);
  const sy = Math.round(viewport.height * 0.7);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', sx + i * 10, sy - i * 6);
    await wait(16);
  }
  await wait(900);
  await page.screenshot({ path: `${OUT}/${label}-joystick.png` });
  await touch('touchEnd', 0, 0);
  await wait(400);
  const s1 = await snap(page);
  const moved = Math.hypot(s1.x - s0.x, s1.z - s0.z);
  check(`${label}: joystick drag moves hero up-right`, s1.x > s0.x + 1 && s1.z > s0.z + 0.5, `moved ${moved.toFixed(2)}`);
  check(`${label}: releasing joystick stops hero`, s1.speed < 0.2);
  // Tap the pause button with touch.
  await page.tap('[data-act="pause"]');
  await wait(150);
  check(`${label}: pause button works on touch`, (await snap(page)).state === 'paused');
  await page.screenshot({ path: `${OUT}/${label}-pause.png` });
  await page.tap('[data-act="resume"]');
  await page.tap('[data-act="hero"]');
  await wait(300);
  check(`${label}: hero switch chip works`, (await snap(page)).hero === 'lapulapu');
  await page.screenshot({ path: `${OUT}/${label}.png` });
  check(`no console errors (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
