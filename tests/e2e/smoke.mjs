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

// Movement/collision checks run with ?peaceful (no guards) so a hit can't nudge the hero.
async function bootPage(browser, opts, query = '?peaceful&play') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL + query);
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
  // "Stuck" = no progress across 3 polls (a single slow CPU frame must not count).
  let lx = 1;
  let still = 0;
  const s2 = await holdUntil(page, ['ArrowLeft'], (s) => {
    still = Math.abs(s.x - lx) < 0.001 && s.x < -4 ? still + 1 : 0;
    lx = s.x;
    return still >= 3;
  });
  check('bench blocks movement (no clipping)', s2.x > -6.1 && s2.x < -5.3, `x = ${s2.x.toFixed(2)}`);

  // Long run into the outer north wall (z = 24 - 0.3 thickness - 0.42 radius = 23.28).
  await page.evaluate(() => window.__bbr.restart());
  await holdUntil(page, ['KeyD'], (s) => s.x > 3);
  let last = -1;
  still = 0;
  const s3 = await holdUntil(page, ['KeyW'], (s) => {
    still = Math.abs(s.z - last) < 0.001 && s.z > 20 ? still + 1 : 0;
    last = s.z;
    return still >= 3;
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

// ── M2 survival loop: guard chase, coins, hearts, game over, replay ──
{
  const { ctx, page, errors } = await bootPage(browser, { viewport: { width: 1280, height: 720 } }, '?play');
  const until = async (pred, maxMs = 20000, each) => {
    const t0 = Date.now();
    let s = await snap(page);
    while (!pred(s) && Date.now() - t0 < maxMs) {
      if (each) await each(s);
      await wait(100);
      s = await snap(page);
    }
    return s;
  };
  const dist = (s) => (s.guards[0] ? Math.hypot(s.guards[0].x - s.x, s.guards[0].z - s.z) : NaN);
  const g0 = await until((s) => s.guards.length >= 1);
  const d0 = dist(g0);
  check('a guard spawns at run start, far from the hero', g0.guards.length === 1 && d0 >= 9.9 && d0 <= 18.1, `d=${d0.toFixed(1)}`);
  const g1 = await until((s) => dist(s) < d0 - 2 || s.hearts < 3);
  check('guard pursues the hero', dist(g1) < d0 - 2 || g1.hearts < 3, `d ${d0.toFixed(1)} → ${dist(g1).toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/m2-chase.png` });

  // Outrun: put the hero beyond loseRange → guard gives up ("?") and goes back to patrol.
  // (A fresh guard hunts from any distance; let it close in first so normal rules apply.)
  const s5 = await snap(page);
  await page.evaluate(([x, z]) => window.__bbr.debug.moveGuard(0, x + 4, z), [s5.x, s5.z]);
  await until((s) => s.guards[0] && !s.guards[0].hunting, 5000);
  await page.evaluate(() => {
    const b = window.__bbr;
    const g = b.museum.run.guards[0];
    b.debug.teleport(g.pos.x > 0 ? -24 : 24, g.pos.z > 0 ? -20 : 20);
  });
  const lost = await until((s) => s.guards[0]?.state === 'search', 8000);
  check('outrunning past the lose range stops the chase', lost.guards[0]?.state === 'search', `d=${dist(lost).toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/m2-lost.png` });
  const pat = await until((s) => s.guards[0]?.state === 'patrol' || s.guards[0]?.state === 'alert', 20000);
  check('guard returns to patrol after searching', pat.guards[0]?.state === 'patrol' || pat.guards[0]?.state === 'alert', pat.guards[0]?.state);
  await page.screenshot({ path: `${OUT}/m2-patrol.png` });
  // Walk into its sight range → it spots the hero again.
  await page.evaluate(() => {
    const b = window.__bbr;
    const g = b.museum.run.guards[0];
    b.debug.teleport(g.pos.x + 2.5, g.pos.z);
  });
  const re = await until((s) => s.guards[0]?.state === 'alert' || s.guards[0]?.state === 'chase', 8000);
  check('entering sight range restarts the chase', re.guards[0]?.state === 'alert' || re.guards[0]?.state === 'chase', re.guards[0]?.state);

  // Coins: stand on the nearest coin.
  const c = g1.coins.filter((k) => k.kind === 'coin').sort((a, b) => Math.hypot(a.x - g1.x, a.z - g1.z) - Math.hypot(b.x - g1.x, b.z - g1.z))[0];
  const sc0 = g1.score;
  await page.evaluate(([x, z]) => window.__bbr.debug.teleport(x, z), [c.x, c.z]);
  const sc1 = await until((s) => s.score > sc0, 5000);
  check('collecting a coin raises score and run coins', sc1.score >= sc0 + 10 && sc1.runCoins >= 1, `score ${sc0} → ${sc1.score}, coins ${sc1.runCoins}`);
  await page.screenshot({ path: `${OUT}/m2-coin.png` });

  // One hit removes exactly one heart.
  const ready = await until((s) => !s.invulnerable && s.guards[0]?.state !== 'stunned' && s.state === 'playing');
  const h0 = ready.hearts;
  const hit = await until((s) => s.hearts < h0, 8000, (s) => page.evaluate(([x, z]) => window.__bbr.debug.moveGuard(0, x + 0.3, z), [s.x, s.z]));
  check('guard contact removes exactly one heart', hit.hearts === h0 - 1, `hearts ${h0} → ${hit.hearts}`);
  check('hit starts invulnerability frames', hit.invulnerable === true);
  await page.screenshot({ path: `${OUT}/m2-hit.png` });

  // Keep getting caught until the run ends.
  const over = await until((s) => s.state === 'gameover', 40000, (s) =>
    s.state === 'playing' && !s.invulnerable
      ? page.evaluate(([x, z, n]) => { for (let i = 0; i < n; i++) window.__bbr.debug.moveGuard(i, x + 0.3, z); }, [s.x, s.z, s.guards.length])
      : null);
  check('zero hearts ends the run', over.state === 'gameover' && over.hearts === 0, `state=${over.state} hearts=${over.hearts}`);
  const res = await until((s) => s.results, 15000);
  check('results panel appears after the knockout beat', res.results);
  check('run is saved (best score + wallet)', res.save.runs === 1 && res.save.bestScore === res.score && res.save.coins === res.runCoins, JSON.stringify(res.save));
  await page.screenshot({ path: `${OUT}/m2-gameover.png` });

  await page.click('[data-act="replay"]');
  await wait(200);
  const rp = await snap(page);
  check('Laro ulit replays the intro with a clean run', rp.state === 'intro' && rp.hearts === 3 && rp.score === 0 && rp.runTime === 0 && !rp.results && rp.guards.length <= 1,
    `state=${rp.state} hearts=${rp.hearts} score=${rp.score} t=${rp.runTime?.toFixed(2)} guards=${rp.guards.length}`);
  await until((s) => s.dropPrompt, 15000);
  await page.keyboard.press('Space');
  await until((s) => s.state === 'playing', 20000);
  await until((s) => s.runTime > 0.5, 8000);
  await page.keyboard.press('Escape');
  await wait(300);
  const pa = await snap(page);
  await wait(600);
  const pb = await snap(page);
  check('run time freezes while paused', pa.state === 'paused' && pa.runTime === pb.runTime, `${pa.state} ${pa.runTime} ${pb.runTime}`);
  await page.click('.pause-menu [data-act="mute"]');
  await wait(100);
  const mu = await snap(page);
  check('mute toggle works and is saved', mu.save.settings.muted === true && (await page.textContent('.mute-label')).includes('OFF'));
  await page.click('.pause-menu [data-act="mute"]');
  await page.screenshot({ path: `${OUT}/m2-pause.png` });
  await page.click('[data-act="resume"]');

  // Results → Lobby button.
  const over2 = await until((s) => s.results, 50000, (s) =>
    s.state === 'playing' && !s.invulnerable
      ? page.evaluate(([x, z, n]) => { for (let i = 0; i < n; i++) window.__bbr.debug.moveGuard(i, x + 0.3, z); }, [s.x, s.z, s.guards.length])
      : null);
  check('second run ends with results', over2.results);
  await page.click('.results [data-act="lobby"]');
  const lb = await until((s) => s.state === 'lobby', 10000);
  check('results Lobby button returns to the lobby', lb.state === 'lobby' && !lb.results);
  check('no console errors (survival)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── M3 lobby + cinematic intro (normal boot, no query) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 30000 });
  await wait(1500);
  const until = async (pred, maxMs = 20000) => {
    const t0 = Date.now();
    let s = await snap(page);
    while (!pred(s) && Date.now() - t0 < maxMs) {
      await wait(100);
      s = await snap(page);
    }
    return s;
  };
  check('game opens on the lobby', (await snap(page)).state === 'lobby');
  await page.screenshot({ path: `${OUT}/m3-lobby.png` });

  for (const panel of ['heroes', 'leaderboard', 'settings', 'profile']) {
    await page.click(`.lobby [data-act="${panel}"]`);
    await wait(150);
    const open = (await snap(page)).lobbyPanel === panel && (await page.isVisible('.lobby .sheet'));
    if (panel === 'heroes') await page.screenshot({ path: `${OUT}/m3-heroes.png` });
    await page.click('.lobby [data-act="close"]');
    await wait(150);
    check(`lobby ${panel} panel opens and closes`, open && (await snap(page)).lobbyPanel === null);
  }

  await page.click('.lobby [data-act="settings"]');
  await page.click('.lobby [data-act="mute"]');
  await page.click('.lobby [data-act="reduced"]');
  const st = (await snap(page)).save.settings;
  check('settings toggles save (sound, reduced effects)', st.muted === true && st.reducedEffects === true, JSON.stringify(st));
  await page.click('.lobby [data-act="mute"]');
  await page.click('.lobby [data-act="reduced"]');
  await page.evaluate(() => window.__bbr.debug.addCoins(77));
  await page.click('.lobby [data-act="reset"]');
  const armed = (await snap(page)).save.coins === 77;
  await page.click('.lobby [data-act="reset"]');
  check('reset needs two taps, then wipes progress', armed && (await snap(page)).save.coins === 0);
  await page.click('.lobby [data-act="close"]');

  await page.click('.lobby [data-act="profile"]');
  await page.fill('.nick-input', '<bad>');
  await page.click('.nick-form [type="submit"]');
  const bad = await page.isVisible('.nick-msg.bad');
  await page.fill('.nick-input', 'Rei Tester');
  await page.click('.nick-form [type="submit"]');
  await wait(100);
  check('profile nickname validates and saves', bad && (await snap(page)).save.nickname === 'Rei Tester');
  await page.click('.lobby [data-act="close"]');

  await page.click('.lobby [data-act="next"]');
  await wait(200);
  const nx = await snap(page);
  check('next arrow previews the next hero', nx.previewHero === 'lapulapu');
  await page.click('.lobby [data-act="play"]', { force: true });
  await wait(300);
  check('locked hero cannot start a run without coins', (await snap(page)).state === 'lobby' && !(await snap(page)).save.ownedHeroes.includes('lapulapu'));
  await page.evaluate(() => window.__bbr.debug.addCoins(300));
  await page.click('.lobby [data-act="play"]');
  await wait(200);
  const un = await snap(page);
  check('PLAY on a locked hero unlocks it when affordable', un.state === 'lobby' && un.save.ownedHeroes.includes('lapulapu') && un.save.coins === 0 && un.save.selectedHero === 'lapulapu');
  await page.click('.lobby [data-act="prev"]');
  await wait(200);
  check('prev arrow goes back and selects owned hero', (await snap(page)).save.selectedHero === 'rizal');

  await page.click('.lobby [data-act="play"]');
  await wait(300);
  check('PLAY starts the intro, not the chase', ['lobby', 'intro'].includes((await snap(page)).state) && (await snap(page)).runTime === 0);
  const fl = await until((s) => s.dropPrompt, 30000);
  check('hero floats with TAP TO DROP', fl.state === 'intro' && fl.introPhase === 'float' && fl.dropPrompt);
  await wait(2500);
  const still = await snap(page);
  check('hero keeps floating until input (no timer, no damage)', still.introPhase === 'float' && still.runTime === 0 && still.hearts === 3);
  await page.screenshot({ path: `${OUT}/m3-float.png` });
  await page.mouse.click(640, 400);
  const fall = await until((s) => s.introPhase !== 'float', 5000);
  check('tap drops the hero', ['fall', 'land', 'notice', 'done'].includes(fall.introPhase) && !fall.dropPrompt, fall.introPhase);
  const nt = await until((s) => s.introPhase === 'notice' || s.state === 'playing', 20000);
  check('hero lands, then the guard reacts', nt.introPhase === 'notice' || nt.state === 'playing');
  const pl = await until((s) => s.state === 'playing', 20000);
  check('chase + timer start after the intro', pl.state === 'playing' && pl.guards.length >= 1 && ['alert', 'chase'].includes(pl.guards[0].state), JSON.stringify(pl.guards));
  const later = await until((s) => s.runTime > 0.5, 10000);
  check('run timer ticks once playing', later.runTime > 0.5);

  await page.keyboard.press('Escape');
  await wait(200);
  await page.click('.pause-menu [data-act="lobby"]');
  const back = await until((s) => s.state === 'lobby', 10000);
  check('pause → Balik sa lobby works', back.state === 'lobby');
  check('no console errors (lobby + intro)', errors.length === 0, errors.slice(0, 3).join(' | '));
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
  await wait(200);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  await page.tap('[data-act="pause"]');
  await wait(150);
  await page.tap('.pause-menu [data-act="lobby"]');
  const t0 = Date.now();
  while ((await snap(page)).state !== 'lobby' && Date.now() - t0 < 10000) await wait(100);
  check(`${label}: pause → lobby works on touch`, (await snap(page)).state === 'lobby');
  await wait(1200);
  await page.screenshot({ path: `${OUT}/${label}-lobby.png` });
  await page.tap('[data-act="heroes"]');
  await wait(200);
  check(`${label}: Heroes button opens on touch`, (await snap(page)).lobbyPanel === 'heroes');
  check(`no console errors (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
