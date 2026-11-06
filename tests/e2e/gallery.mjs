// Future Heroes Gallery check: lobby banner → room → walk to exhibits → book (page turn), scroll, TV, list,
// game plaque → back to the lobby. Phone portrait + desktop. Screenshots in tests/e2e/screenshots/gallery-*.
// Usage: npm run build && (npx vite preview --port 4173 &) && node tests/e2e/gallery.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.BBR_URL ?? 'http://localhost:4173/';
const OUT = 'tests/e2e/screenshots';
mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function run(browser, label, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/youtube|ytimg|googlevideo/i.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL + '?nolore');
  await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  check(`${label}: event banner shows in the lobby`, await page.isVisible('.gl-banner'));
  await page.screenshot({ path: `${OUT}/gallery-${label}-1-lobby.png` });
  await page.click('.gl-banner', { force: true });
  await page.waitForFunction(() => window.__bbr.fsm.state === 'gallery', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/gallery-${label}-2-room.png` });

  const spots = await page.evaluate(() => window.__bbr.gallery.layout.spots.map((s) => ({ x: s.at.x, z: s.at.z, kind: s.kind, i: s.index })));
  check(`${label}: 16 works + TV + game plaque`, spots.length === 18);
  const tp = (x, z) => page.evaluate(([x, z]) => (window.__bbr.gallery.player.motor.state.pos = { x, z }), [x, z]);

  // Walk (keyboard) a little to prove movement works in the room.
  const p0 = await page.evaluate(() => ({ ...window.__bbr.gallery.player.position }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction((z0) => window.__bbr.gallery.player.position.z > z0 + 0.6, p0.z, { timeout: 15000 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ ...window.__bbr.gallery.player.position }));
  check(`${label}: hero walks in the gallery`, p1.z > p0.z + 0.5, `z ${p0.z.toFixed(2)} → ${p1.z.toFixed(2)}`);

  // Book (first work: Casantusan, 11 pages).
  const book = spots.find((s) => s.kind === 'work' && s.i === 0);
  await tp(book.x - Math.sign(book.x) * 0.95, book.z);
  await page.waitForSelector('.gl-prompt:not([hidden])', { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/gallery-${label}-3-near.png` });
  await page.click('.gl-prompt', { force: true });
  await page.waitForSelector('.gl-overlay.is-book', { timeout: 10000 });
  await page.waitForTimeout(800);
  const before = await page.textContent('.gv-pageno');
  await page.click('.gv-next');
  await page.waitForFunction((b) => document.querySelector('.gv-pageno')?.textContent !== b, before, { timeout: 10000 }).catch(() => {});
  const after = await page.textContent('.gv-pageno');
  check(`${label}: book turns the page`, before !== after, `${before} → ${after}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/gallery-${label}-4-book.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${label}: Esc closes the book`, await page.isHidden('.gl-overlay'));

  // Scroll (a one-pager).
  const si = await page.evaluate(() => window.__bbr.gallery.layout.spots.find((s) => s.kind === 'work' && s.index === 7)?.index);
  const scroll = spots.find((s) => s.kind === 'work' && s.i === si);
  await tp(scroll.x - Math.sign(scroll.x) * 0.95, scroll.z);
  await page.waitForSelector('.gl-prompt:not([hidden])', { timeout: 15000 });
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.gl-overlay.is-scroll', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/gallery-${label}-5-scroll.png` });
  await page.click('.gv-close');

  // TV.
  const tv = spots.find((s) => s.kind === 'tv');
  await tp(tv.x, tv.z - 1.6);
  await page.waitForSelector('.gl-prompt:not([hidden])', { timeout: 15000 });
  await page.click('.gl-prompt', { force: true });
  await page.waitForSelector('.gl-overlay.is-tv iframe', { timeout: 10000 });
  const src = await page.getAttribute('.gl-overlay.is-tv iframe', 'src');
  check(`${label}: TV plays the class video`, /N294xA7iqTQ/.test(src ?? ''), src ?? '');
  await page.click('.gv-close');

  // List view + game plaque.
  await page.click('.gl-list-btn');
  const items = await page.$$eval('.gv-item', (els) => els.length);
  check(`${label}: list shows every work`, items === 18, `${items} cards`);
  await page.screenshot({ path: `${OUT}/gallery-${label}-6-list.png` });
  await page.click('.gv-item[data-act="game"]');
  await page.waitForSelector('.gl-overlay.is-game', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.click('.gl-back');
  await page.waitForFunction(() => window.__bbr.fsm.state === 'lobby', null, { timeout: 20000 });
  check(`${label}: back to the lobby`, true);
  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

const browser = await chromium.launch();
await run(browser, 'phone', { width: 390, height: 844 });
await run(browser, 'desktop', { width: 1280, height: 720 });
await browser.close();
if (failed) {
  console.log(`${failed} gallery check(s) failed`);
  process.exit(1);
}
console.log('Gallery checks passed');
