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
async function bootPage(browser, opts, query = '?peaceful&play', save = null) {
  const ctx = await browser.newContext(opts);
  if (save) await ctx.addInitScript((s) => localStorage.setItem('bbr.save', JSON.stringify(s)), save);
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

  for (const panel of ['leaderboard', 'settings', 'profile', 'missions', 'daily', 'archive']) {
    await page.click(`.lobby [data-act="${panel}"]`);
    await wait(150);
    const open = (await snap(page)).lobbyPanel === panel && (await page.isVisible('.lobby .sheet'));
    if (panel === 'daily') await page.screenshot({ path: `${OUT}/m7-daily.png` });
    await page.click('.lobby [data-act="close"]');
    await wait(150);
    check(`lobby ${panel} panel opens and closes`, open && (await snap(page)).lobbyPanel === null);
  }
  check('no hero arrows in the lobby (heroes are picked in the Shop)', (await page.locator('.lobby [data-act="next"], .lobby [data-act="prev"]').count()) === 0);
  const fresh = await snap(page);
  check('Bonifacio is the free starter', fresh.save.selectedHero === 'bonifacio' && fresh.save.ownedHeroes.join() === 'bonifacio', fresh.save.ownedHeroes.join());

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

  // ── M7 Shop / Collection: left tabs, cards with portraits + prices, choose hero there ──
  await page.click('.lb-left [data-act="collection"]');
  await wait(300);
  check('Shop opens full screen on the Heroes tab', (await snap(page)).lobbyPanel === 'collection' && (await page.isVisible('.col-tab.on[data-tab="heroes"]')));
  check('hero cards show photos and 500-coin prices', (await page.locator('.ccard img').count()) === 4 && (await page.locator('.ccard.locked .c-price').allTextContents()).every((t) => t.includes('500')));
  await page.screenshot({ path: `${OUT}/m7-shop-heroes.png` });
  await page.click('.chip[data-f="owned"]');
  check('Owned filter shows only Bonifacio', (await page.locator('.ccard').count()) === 1);
  await page.click('.chip[data-f="all"]');
  await page.click('.ccard[data-id="lapulapu"]');
  await wait(200);
  check('locked hero detail: Buy is disabled without coins', await page.isDisabled('.col-detail [data-act="unlock"]'));
  await page.evaluate(() => window.__bbr.debug.addCoins(500));
  await wait(100);
  await page.click('.col-detail [data-act="unlock"]');
  await wait(200);
  const un = await snap(page);
  check('buying a hero costs 500 and selects it', un.save.ownedHeroes.includes('lapulapu') && un.save.coins === 0 && un.save.selectedHero === 'lapulapu');
  await page.screenshot({ path: `${OUT}/m7-shop-detail.png` });
  await page.click('[data-act="detailBack"]');
  await page.click('.ccard[data-id="bonifacio"]');
  await page.click('.col-detail [data-act="use"]');
  await wait(150);
  check('"Gamitin" switches the hero', (await snap(page)).save.selectedHero === 'bonifacio');
  await page.click('[data-act="detailBack"]');
  await page.click('.col-tab[data-tab="skins"]');
  await wait(200);
  check('Skins tab lists skins with 300-diamond prices', (await page.locator('.ccard.skin').count()) === 8 && (await page.locator('.ccard.skin .c-price.gem').first().textContent()).includes('300'));
  await page.screenshot({ path: `${OUT}/m7-shop-skins.png` });
  await page.keyboard.press('Escape');
  const te = Date.now();
  while ((await snap(page)).lobbyPanel !== null && Date.now() - te < 3000) await wait(100);
  check('Esc closes the Shop', (await snap(page)).lobbyPanel === null);
  check('hero card shows the locked skill (hero Lv 1)', /Lv 5/.test(await page.textContent('.hc-ab-text')));

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

// ── M4 hero abilities, shop, missions ──
{
  // Hero XP 850 = level 5, so every ability is unlocked (M7: skills unlock at hero Lv 5).
  const allHeroes = (hero) => ({ version: 5, coins: 900, diamonds: 400, ownedHeroes: ['rizal', 'lapulapu', 'bonifacio', 'gabriela'], selectedHero: hero, heroXp: { rizal: 850, lapulapu: 850, bonifacio: 850, gabriela: 850 } });
  const desk = { viewport: { width: 1280, height: 720 } };
  const pollUntil = async (page, pred, maxMs = 10000) => {
    const t0 = Date.now();
    let s = await snap(page);
    while (!pred(s) && Date.now() - t0 < maxMs) {
      await wait(100);
      s = await snap(page);
    }
    return s;
  };

  // Gabriela: dash bursts forward, then cools down.
  {
    const { ctx, page, errors } = await bootPage(browser, desk, '?peaceful&play', allHeroes('gabriela'));
    const s0 = await snap(page);
    await page.keyboard.press('Space');
    const s1 = await pollUntil(page, (s) => s.ability.uses === 1 && Math.hypot(s.x - s0.x, s.z - s0.z) > 2.5, 5000);
    check('Gabriela dash: Space bursts the hero forward', s1.ability.kind === 'dash' && Math.hypot(s1.x - s0.x, s1.z - s0.z) > 2.5, `moved ${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2)}`);
    await page.keyboard.press('Space');
    await wait(300);
    const s2 = await snap(page);
    check('dash fires once (no repeating effect)', s2.abilityEvents === 1, `events=${s2.abilityEvents}`);
    check('Gabriela dash cooldown is 20 s', s2.ability.cooldownLeft > 15 && s2.ability.cooldownLeft <= 20, `left=${s2.ability.cooldownLeft?.toFixed(1)}`);
    check('ability respects its cooldown', s2.ability.uses === 1 && !s2.ability.ready && (await page.getAttribute('.ability-btn', 'data-left')) !== '');
    await page.screenshot({ path: `${OUT}/m4-dash.png` });
    check('no console errors (dash)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // Rizal: sprint raises top speed.
  {
    const { ctx, page, errors } = await bootPage(browser, desk, '?peaceful&play', allHeroes('rizal'));
    await page.click('[data-act="ability"]');
    const s = await holdUntil(page, ['KeyD'], (x) => x.speed > 7.5, 6000);
    check('Rizal sprint: ability button speeds the hero up', s.speedMultiplier > 1.4 && s.speed > 7.5, `speed ${s.speed?.toFixed(2)} x${s.speedMultiplier}`);
    await page.screenshot({ path: `${OUT}/m4-sprint.png` });
    check('no console errors (sprint)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // Lapu-Lapu: shield blocks a hit.
  {
    const { ctx, page, errors } = await bootPage(browser, desk, '?play', allHeroes('lapulapu'));
    await pollUntil(page, (s) => s.runTime > 2.3 && !s.invulnerable, 10000);
    await page.keyboard.press('Space');
    const up = await pollUntil(page, (s) => s.shielded, 3000);
    check('Lapu-Lapu shield goes up', up.shielded);
    await page.screenshot({ path: `${OUT}/m4-shield.png` });
    // Push the guard into the hero until the shield is spent.
    const t0 = Date.now();
    let s = await snap(page);
    while (s.shielded && Date.now() - t0 < 6000) {
      await page.evaluate(([x, z]) => window.__bbr.debug.moveGuard(0, x + 0.3, z), [s.x, s.z]);
      await wait(100);
      s = await snap(page);
    }
    check('shield blocks the hit (no heart lost) and is spent', !s.shielded && s.hearts === 3 && s.guards[0].state === 'stunned', `hearts=${s.hearts} guard=${s.guards[0]?.state}`);
    check('no console errors (shield)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // Bonifacio: shockwave stuns a nearby guard.
  {
    const { ctx, page, errors } = await bootPage(browser, desk, '?play', allHeroes('bonifacio'));
    const s0 = await pollUntil(page, (s) => s.guards.length > 0, 5000);
    await page.evaluate(([x, z]) => window.__bbr.debug.moveGuard(0, x + 2, z), [s0.x, s0.z]);
    await page.keyboard.press('Space');
    const s1 = await pollUntil(page, (s) => s.ability.uses === 1, 3000);
    check('Bonifacio shockwave stuns and shoves a nearby guard', s1.guards[0].state === 'stunned' && Math.hypot(s1.guards[0].x - s1.x, s1.guards[0].z - s1.z) > 3,
      `guard=${s1.guards[0].state} d=${Math.hypot(s1.guards[0].x - s1.x, s1.guards[0].z - s1.z).toFixed(2)}`);
    await page.screenshot({ path: `${OUT}/m4-shockwave.png` });
    await wait(2000);
    const s2 = await snap(page);
    check('shockwave fires once (sound + shake do not repeat)', s2.abilityEvents === 1, `events=${s2.abilityEvents}`);
    check('no console errors (shockwave)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }


  // Training: try a locked hero in the Hall of Heroes.
  {
    const ctx = await browser.newContext(desk);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL);
    await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 30000 });
    await page.click('.lb-left [data-act="collection"]');
    await page.click('.ccard[data-id="lapulapu"]');
    await page.click('.col-detail [data-act="train"]');
    const tr = await pollUntil(page, (s) => s.state === 'playing' && s.training, 15000);
    check('Training starts with a locked hero (no purchase)', tr.training && tr.hero === 'lapulapu' && !tr.save.ownedHeroes.includes('lapulapu'));
    await wait(1500);
    const quiet = await snap(page);
    check('Training has no guards and no coins', quiet.guards.length === 0 && quiet.coins.length === 0 && quiet.dummies.length === 3 && quiet.score === 0);
    check('Training HUD shows the training tag', await page.isVisible('.train-tag'));
    await page.keyboard.press('Space');
    const sh = await pollUntil(page, (s) => s.shielded, 3000);
    await page.screenshot({ path: `${OUT}/m4-training.png` });
    const again = await pollUntil(page, (s) => s.ability.ready, 8000);
    check('Training uses a short practice cooldown', sh.shielded && again.ability.ready && again.ability.uses === 1);
    // The doorway south of the hall is roped off.
    const wall = await holdUntil(page, ['KeyS'], (s) => s.z < -0.5, 5000);
    check('Training room is closed off (rope barrier)', wall.z > 0, `z=${wall.z?.toFixed(2)}`);
    await page.click('.train-tag [data-act="lobby"]');
    const back = await pollUntil(page, (s) => s.state === 'lobby', 10000);
    check('Training Exit returns to the lobby, nothing unlocked', back.state === 'lobby' && !back.training && back.hero === 'bonifacio' && !back.save.ownedHeroes.includes('lapulapu'));
    await page.click('.lobby [data-act="play"]');
    const run = await pollUntil(page, (s) => s.state === 'intro', 15000);
    check('normal PLAY after training is a real run again', run.state === 'intro' && !run.training && run.hero === 'bonifacio');
    check('no console errors (training)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // Shop + missions in the lobby.
  {
    const ctx = await browser.newContext(desk);
    await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('bbr.save', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, allHeroes('rizal'));
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL);
    await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 30000 });
    check('no diamond exchange anywhere', (await page.locator('[data-act="exchange"]').count()) === 0);
    await page.click('.lb-left [data-act="collection"]');
    await page.click('.col-tab[data-tab="skins"]');
    await page.click('.ccard[data-id="lapulapu.dagat"]');
    await page.click('.col-detail [data-act="try"]');
    await wait(150);
    let s = await snap(page);
    check('Try on previews a skin without buying it', s.lobbyPanel === null && !s.save.ownedSkins.includes('lapulapu.dagat'));
    await page.click('.lb-left [data-act="collection"]');
    await page.click('.col-tab[data-tab="skins"]');
    await page.click('.ccard[data-id="rizal.puti"]');
    await page.click('.col-detail [data-act="buy"]');
    await wait(150);
    s = await snap(page);
    check('buying a skin spends 300 diamonds and equips it', s.save.ownedSkins.includes('rizal.puti') && s.save.equippedSkins.rizal === 'rizal.puti' && s.save.diamonds === 100 && s.skin === 'rizal.puti');
    await page.click('[data-act="detailBack"]');
    await page.click('.ccard[data-id="rizal.classic"]');
    await page.click('.col-detail [data-act="equip"]');
    await wait(150);
    check('equip switches back to an owned skin', (await snap(page)).save.equippedSkins.rizal === 'rizal.classic');
    await page.click('[data-act="detailBack"]');
    await page.click('[data-act="closeCollection"]');
    await page.evaluate(() => window.__bbr.debug.finishMissions());
    check('missions badge shows claimable rewards', await page.isVisible('.lobby .m-badge'));
    await page.click('.lobby [data-act="missions"]');
    s = await snap(page);
    const first = s.save.missions[0];
    await page.click(`[data-act="claim"][data-seq="${first.seq}"]`);
    await wait(150);
    const c = await snap(page);
    check('claiming a mission pays player XP (not coins) once and brings a new one', c.save.playerXp === s.save.playerXp + first.xp && c.save.coins === s.save.coins && c.save.missions[0].seq !== first.seq);
    await page.screenshot({ path: `${OUT}/m4-missions.png` });
    await page.click('.lobby [data-act="close"]');
    // Daily tasks: finish one through the save, claim it for coins.
    await page.evaluate(() => {
      const t = window.__bbr.save.data.daily.tasks[0];
      t.progress = t.target;
      window.__bbr.save.save();
      window.__bbr.debug.addCoins(0);
    });
    check('daily badge shows a claimable task', await page.isVisible('.lobby .d-badge'));
    await page.click('.lobby [data-act="daily"]');
    const d0 = await snap(page);
    await page.click('[data-act="claimDaily"][data-i="0"]');
    await wait(150);
    const d1 = await snap(page);
    check('claiming a daily task pays coins once', d1.save.coins === d0.save.coins + d0.save.daily.tasks[0].coins && d1.save.daily.tasks[0].claimed && (await page.locator('[data-act="claimDaily"][data-i="0"]').count()) === 0);
    await page.click('.lobby [data-act="close"]');
    await page.reload();
    await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 30000 });
    const r = await snap(page);
    check('shop, mission and daily progress survive a reload', r.save.ownedSkins.includes('rizal.puti') && r.save.missions[0].seq === c.save.missions[0].seq && r.save.daily.tasks[0].claimed);
    check('no console errors (shop + missions)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// ── M5 enemies: dog telegraph + lunge, multo through walls, tikbalang illusions, director toasts ──
{
  const { ctx, page, errors } = await bootPage(browser, { viewport: { width: 1280, height: 720 } }, '?play');
  const until = async (pred, maxMs = 15000) => {
    const t0 = Date.now();
    let s = await snap(page);
    while (!pred(s) && Date.now() - t0 < maxMs) {
      await wait(80);
      s = await snap(page);
    }
    return s;
  };
  await until((s) => s.guards.length >= 1);
  // Park the opening guard far away and keep the hero safe while we watch the new enemies.
  await page.evaluate(() => {
    const b = window.__bbr;
    b.debug.setInvulnerable(1e6);
    b.debug.moveGuard(0, -26, -20);
    b.debug.teleport(0, 4);
    b.debug.spawnEnemy('dog', 4.5, 4);
  });
  await page.waitForFunction(() => /aso/i.test(document.querySelector('.room-toast')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  const toast = await page.textContent('.room-toast');
  check('a new enemy kind announces itself with its own toast', /aso/i.test(toast ?? ''), toast);
  const dogIdx = (s) => s.guards.findIndex((g) => g.kind === 'dog');
  const wu = await until((s) => s.guards[dogIdx(s)]?.state === 'windup', 12000);
  check('dog telegraphs its lunge (windup)', wu.guards[dogIdx(wu)]?.state === 'windup', wu.guards[dogIdx(wu)]?.state);
  await page.screenshot({ path: `${OUT}/m5-dog-windup.png` });
  const dash = await until((s) => ['dash', 'recover'].includes(s.guards[dogIdx(s)]?.state), 6000);
  check('dog lunges after the telegraph', ['dash', 'recover'].includes(dash.guards[dogIdx(dash)]?.state), dash.guards[dogIdx(dash)]?.state);

  // Multo drifts straight through the x = 10 wall.
  await page.evaluate(() => {
    const b = window.__bbr;
    const run = b.museum.run;
    run.guards.forEach((g, i) => i > 0 && b.debug.moveGuard(i, -26, 20));
    b.debug.teleport(16, 4);
    b.debug.spawnEnemy('multo', 5, 4);
  });
  const mIdx = (s) => s.guards.findIndex((g) => g.kind === 'multo');
  const through = await until((s) => s.guards[mIdx(s)]?.x > 11, 20000);
  check('multo floats through walls', through.guards[mIdx(through)]?.x > 11, `x=${through.guards[mIdx(through)]?.x?.toFixed(1)}`);
  await page.screenshot({ path: `${OUT}/m5-multo.png` });

  // Tikbalang: casts its illusion copies while chasing.
  await page.evaluate(() => {
    const b = window.__bbr;
    b.museum.run.guards.forEach((g, i) => b.debug.moveGuard(i, -26, i % 2 ? 20 : -20));
    b.debug.teleport(0, 0);
    b.debug.spawnEnemy('tikbalang', 0, -9);
  });
  await wait(300);
  await page.screenshot({ path: `${OUT}/m5-tikbalang.png` });
  const ill = await until((s) => s.decoys.length > 0, 30000);
  check('tikbalang casts illusion copies', ill.decoys.length > 0, `decoys=${ill.decoys.length}`);
  await page.screenshot({ path: `${OUT}/m5-illusion.png` });
  const gone = await until((s) => s.decoys.length === 0, 20000);
  check('illusions vanish on their own', gone.decoys.length === 0);
  const kinds = new Set(gone.guards.map((g) => g.kind));
  check('all four enemy kinds are in play', ['guard', 'dog', 'multo', 'tikbalang'].every((k) => kinds.has(k)), [...kinds].join(','));
  check('no console errors (enemies)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── M6/M7 exhibits: mini-game gate, Curator ID, payout once, Endless, archive ──
{
  const { ctx, page, errors } = await bootPage(browser, { viewport: { width: 1280, height: 720 } }, '?play');
  const until = async (pred, maxMs = 10000) => {
    const t0 = Date.now();
    let s = await snap(page);
    while (!pred(s) && Date.now() - t0 < maxMs) {
      await wait(80);
      s = await snap(page);
    }
    return s;
  };
  await until((s) => s.guards.length >= 1);
  check('HUD shows exhibit progress 0/15', /0\s*\/\s*15/.test(await page.textContent('.exp-chip')));
  check('Bonifacio Lv1: ability is locked until Lv5', (await snap(page)).abilityLocked && /Lv5/.test((await page.getAttribute('.ability-btn', 'data-left')) ?? ''));
  await page.evaluate(() => {
    window.__bbr.debug.setInvulnerable(1e6);
    window.__bbr.debug.teleport(25, 4.9);
  });
  const near = await until((s) => s.exhibitPrompt);
  check('walking up to an exhibit shows its prompt', near.exhibitPrompt && near.nearExhibit === 'rizal', `near=${near.nearExhibit}`);
  check('Card Swipe exhibit asks for the Curator ID first', /Curator ID/.test(await page.textContent('.exhibit-prompt')));
  await page.keyboard.press('e');
  await wait(300);
  check('E without the ID does not open the mini-game', !(await snap(page)).mini);
  await page.screenshot({ path: `${OUT}/m7-need-id.png` });
  await page.evaluate(() => window.__bbr.debug.giveIdCard());
  const got = await until((s) => s.hasIdCard, 5000);
  check('picking up the Curator ID card', got.hasIdCard);
  await page.evaluate(() => window.__bbr.debug.teleport(25, 4.9));
  await until((s) => s.exhibitPrompt && s.nearExhibit === 'rizal');
  check('prompt now offers the mini-game', /Mini-game/.test(await page.textContent('.exhibit-prompt')));
  await page.keyboard.press('e');
  const mg = await until((s) => !!s.mini, 4000);
  check('E opens the Card Swipe mini-game', mg.mini?.kind === 'swipe' && mg.state === 'playing');
  await page.screenshot({ path: `${OUT}/m7-swipe.png` });
  // Enemies keep moving while the hero is busy with the mini-game.
  const g0 = (await snap(page)).guards;
  await wait(1500);
  const g1 = (await snap(page)).guards;
  check('enemies keep moving during a mini-game', g1.some((g, i) => g0[i] && Math.hypot(g.x - g0[i].x, g.z - g0[i].z) > 0.05));
  const before = await snap(page);
  await page.evaluate(() => window.__bbr.debug.winMiniGame());
  const open = await until((s) => s.state === 'reading', 6000);
  check('winning the mini-game opens the history panel', open.state === 'reading' && open.exhibitOpen);
  const panelText = await page.textContent('.exhibit-panel');
  check('panel shows title, sources and the fiction note', /Propaganda Movement/.test(panelText) && /Sources/.test(panelText) && /Schumacher/.test(panelText) && /Fiction/.test(panelText));
  check('clearing pays +250 score and +20 coins', open.score === before.score + 250 && open.runCoins === before.runCoins + 20, `score ${before.score}→${open.score}, coins ${before.runCoins}→${open.runCoins}`);
  check('exhibit counter shows 1/15', open.cleared === 1);
  await page.screenshot({ path: `${OUT}/m6-panel.png` });
  await wait(1000);
  const still = await snap(page);
  const moved = still.guards.some((g, i) => Math.hypot(g.x - open.guards[i].x, g.z - open.guards[i].z) > 0.01);
  check('while reading: timer, score and enemies are frozen', still.runTime === open.runTime && still.score === open.score && !moved && still.state === 'reading');
  await page.keyboard.press('e');
  const closed = await until((s) => s.state === 'playing', 4000);
  check('E closes the panel and resumes with a short grace', closed.state === 'playing' && !closed.exhibitOpen && closed.invulnerable);
  check('the exhibit is saved to the archive', closed.save.discovered.includes('rizal'));
  await until((s) => s.exhibitPrompt);
  check('cleared exhibit offers a re-read', /Basahin ulit/.test(await page.textContent('.exhibit-prompt')));
  await page.click('.exhibit-prompt');
  const again = await until((s) => s.state === 'reading', 4000);
  check('clicking the prompt re-opens the panel (no mini-game)', again.state === 'reading' && !again.mini);
  check('re-reading the same exhibit pays nothing', again.score === closed.score && again.runCoins === closed.runCoins, `${closed.score} → ${again.score}`);
  await page.keyboard.press('Escape');
  await until((s) => s.state === 'playing', 4000);
  // Danger warning + a hit cancels the mini-game.
  await page.evaluate(() => window.__bbr.debug.teleport(16, 4.9));
  await until((s) => s.nearExhibit === 'mactan');
  await page.keyboard.press('e');
  await until((s) => !!s.mini, 4000);
  const p = await snap(page);
  await page.evaluate(([x, z]) => {
    window.__bbr.debug.setInvulnerable(0);
    window.__bbr.debug.spawnEnemy('guard', x + 3, z);
  }, [p.x, p.z]);
  await page.waitForFunction(() => !document.querySelector('.mg-danger')?.hidden, null, { timeout: 8000 }).catch(() => {});
  check('danger warning shows when an enemy gets close', !(await page.locator('.mg-danger').first().isHidden()));
  await page.screenshot({ path: `${OUT}/m7-danger.png` });
  const hit = await until((s) => !s.mini, 15000);
  check('getting caught cancels the mini-game', !hit.mini && hit.hearts < p.hearts, `hearts ${p.hearts}→${hit.hearts}`);
  await page.evaluate(() => window.__bbr.debug.setInvulnerable(1e6));
  // Folklore exhibit is clearly labelled (via a cleared re-read path: win its game).
  await page.evaluate(() => window.__bbr.debug.setPeaceful(true));
  let fm = null;
  for (let tries = 0; tries < 3 && !fm?.mini; tries++) {
    await page.evaluate(() => window.__bbr.debug.teleport(23.8, -19.5));
    await until((s) => s.nearExhibit === 'tikbalang' && s.exhibitPrompt);
    await page.keyboard.press('e');
    fm = await until((s) => !!s.mini, 4000);
  }
  await page.evaluate(() => window.__bbr.debug.winMiniGame());
  const fr = await until((s) => s.state === 'reading', 15000);
  if (fr.state !== 'reading') console.log('  folklore debug:', JSON.stringify({ state: fr.state, mini: fr.mini, near: fr.nearExhibit, x: fr.x, z: fr.z, hearts: fr.hearts }));
  const folk = await page.textContent('.exhibit-panel');
  check('folklore exhibit is labelled folklore, not history', /Folklore · alamat, hindi history/.test(folk) && /Ramos/.test(folk));
  await page.screenshot({ path: `${OUT}/m6-folklore.png` });
  await page.click('[data-act="closeExhibit"]');
  await until((s) => s.state === 'playing', 4000);
  await page.evaluate(() => window.__bbr.debug.setPeaceful(false));
  // Clear the rest → Endless.
  await page.evaluate(() => window.__bbr.debug.clearExhibits(9));
  await wait(600);
  check('no folklore enemies before 10 exhibits', !(await snap(page)).guards.some((g) => g.kind === 'multo' || g.kind === 'tikbalang'));
  await page.evaluate(() => window.__bbr.debug.clearExhibits(10));
  const ten = await until((s) => s.guards.some((g) => g.kind === 'multo'), 6000);
  check('the multo joins on the 10th exhibit', ten.guards.some((g) => g.kind === 'multo'), `${ten.cleared} cleared, ${ten.guards.map((g) => g.kind).join(',')} · ${await page.textContent('.room-toast')}`);
  const pre = await snap(page);
  await page.evaluate(() => window.__bbr.debug.clearExhibits(15));
  const end = await until((s) => s.endless, 4000);
  check('clearing all 15 starts Endless Mode', end.endless && end.cleared === 15);
  await wait(300);
  const chipT = await page.textContent('.exp-chip');
  const toastT = await page.textContent('.room-toast');
  check('Endless banner + HUD badge', /ENDLESS/.test(chipT) && /MUSEUM CLEARED/.test(toastT), `${chipT} · ${toastT}`);
  await page.screenshot({ path: `${OUT}/m7-endless.png` });
  const later = await until((s) => s.endlessTime > 3, 60000);
  check('Endless ramps the chase speed', later.chaseSpeed > pre.chaseSpeed, `${pre.chaseSpeed} → ${later.chaseSpeed}`);
  // Archive in the lobby.
  await page.keyboard.press('Escape');
  await wait(200);
  await page.click('.pause-menu [data-act="lobby"]');
  await until((s) => s.state === 'lobby', 10000);
  await wait(900);
  check('Archive button shows discoveries out of 15', /2\/15/.test(await page.textContent('.arch-count')), await page.textContent('.arch-count'));
  await page.click('[data-act="archive"]');
  await wait(200);
  check('Archive lists found exhibits and hides the rest', (await page.locator('.ex-tile.found').count()) === 2 && (await page.locator('.ex-tile:not(.found)').count()) === 13);
  await page.screenshot({ path: `${OUT}/m6-archive.png` });
  await page.click('.ex-tile.found[data-id="rizal"]');
  await wait(200);
  check('tapping a found exhibit opens it in the Archive', /Propaganda Movement/.test(await page.textContent('.sheet-body')));
  await page.click('[data-act="archiveBack"]');
  await page.reload();
  await page.waitForFunction(() => ['lobby', 'playing'].includes(window.__bbr?.fsm.state), null, { timeout: 30000 });
  const r = await snap(page);
  check('archive survives a reload', r.save.discovered.length === 2 && r.save.discovered.includes('tikbalang'));
  check('no console errors (history)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── Gadgets: pickup, one slot, Q to use, magnet auto, bubble absorbs a hit ──
{
  const { ctx, page, errors } = await bootPage(browser, { viewport: { width: 1280, height: 720 } }, '?play');
  const until = async (pred, maxMs = 8000) => {
    const t0 = Date.now();
    let s = await snap(page);
    while (!pred(s) && Date.now() - t0 < maxMs) {
      await wait(80);
      s = await snap(page);
    }
    return s;
  };
  await until((s) => s.guards.length >= 1);
  check('gadget slot starts empty', (await snap(page)).gadget === null && (await page.getAttribute('.gadget-btn', 'class')).includes('empty'));
  await page.keyboard.press('q');
  await wait(300);
  check('Q with an empty slot does nothing', (await snap(page)).smokeLeft === 0);
  // Bubble absorbs a hit.
  await page.evaluate(() => {
    window.__bbr.debug.setInvulnerable(0);
    window.__bbr.debug.giveGadget('bubble');
  });
  await page.click('.gadget-btn');
  const bub = await until((s) => s.bubble);
  check('the gadget button fires the Protective Bubble', bub.bubble);
  await page.screenshot({ path: `${OUT}/gadget-bubble.png` });
  await page.evaluate(([x, z]) => window.__bbr.debug.spawnEnemy('guard', x + 2, z), [bub.x, bub.z]);
  const popped = await until((s) => !s.bubble, 15000);
  check('bubble absorbs one collision (no heart lost)', !popped.bubble && popped.hearts === bub.hearts, `hearts ${bub.hearts}→${popped.hearts}`);
  await page.evaluate(() => window.__bbr.debug.setInvulnerable(1e6));
  const p0 = await snap(page);
  await page.evaluate(([x, z]) => window.__bbr.debug.spawnGadget('smoke', x + 1.5, z), [p0.x, p0.z]);
  await wait(300);
  await page.screenshot({ path: `${OUT}/gadget-pickup.png` });
  await page.evaluate(([x, z]) => window.__bbr.debug.teleport(x + 1.5, z), [p0.x, p0.z]);
  const got = await until((s) => s.gadget === 'smoke');
  check('walking over a gadget puts it in the slot', got.gadget === 'smoke' && !(await page.getAttribute('.gadget-btn', 'class')).includes('empty'));
  await page.evaluate(([x, z]) => window.__bbr.debug.spawnGadget('freeze', x, z), [got.x, got.z]);
  await wait(600);
  const full = await snap(page);
  check('only one gadget at a time (second stays on the floor)', full.gadget === 'smoke' && full.gadgetItems.some((g) => g.kind === 'freeze'));
  await page.evaluate(([x, z]) => window.__bbr.debug.spawnGadget('magnet', x, z), [got.x, got.z]);
  const mag = await until((s) => s.magnetLeft > 0);
  check('Coin Magnet fires on pickup without using the slot', mag.magnetLeft > 0 && mag.gadget === 'smoke');
  await page.screenshot({ path: `${OUT}/gadget-magnet.png` });
  await page.keyboard.press('q');
  const sm = await until((s) => s.smokeLeft > 0);
  check('Q uses the Smoke Bomb', sm.smokeLeft > 0 && sm.gadget !== 'smoke');
  const refill = await until((s) => s.gadget === 'freeze', 4000);
  check('the freed slot picks up the gadget left on the floor', refill.gadget === 'freeze');
  await page.evaluate(() => window.__bbr.debug.teleport(0, 4));
  await page.keyboard.press('q');
  const used = await until((s) => s.gadget === null && s.freezeLeft > 0, 4000);
  check('slot is empty after using a gadget', used.gadget === null);
  await wait(400);
  await page.screenshot({ path: `${OUT}/gadget-smoke.png` });
  await page.evaluate(() => {
    window.__bbr.debug.setInvulnerable(1e6);
    window.__bbr.debug.giveGadget('freeze');
  });
  const pf = await snap(page);
  await page.evaluate(([x, z]) => window.__bbr.debug.spawnEnemy('guard', x + 4, z), [pf.x, pf.z]);
  await wait(300);
  await page.keyboard.press('q');
  const fr = await until((s) => s.freezeLeft > 0);
  check('Time Freeze slows enemies nearby', fr.freezeLeft > 0 && fr.slowed > 0, `slowed=${fr.slowed}`);
  await wait(300);
  await page.screenshot({ path: `${OUT}/gadget-freeze.png` });
  check('no console errors (gadgets)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── Phase 7 polish: settings (music/SFX sliders, quality, FPS, large text) + first-run tips ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 30000 });
  await page.click('[data-act="settings"]');
  await wait(200);
  const setVol = (which, v) =>
    page.evaluate(([w, val]) => {
      const el = document.querySelector(`[data-vol="${w}"]`);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [which, v]);
  await setVol('music', 20);
  await setVol('sfx', 65);
  await page.click('.seg-btn[data-q="low"]');
  await page.click('[data-act="fps"]');
  await page.click('[data-act="largeText"]');
  await wait(150);
  let st = await page.evaluate(() => window.__bbr.save.data.settings);
  check('music + SFX sliders are separate and saved', st.musicVolume === 0.2 && st.sfxVolume === 0.65);
  check('graphics quality buttons work', st.quality === 'low' && (await page.locator('.seg-btn.on').textContent()).includes('Low'));
  check('Show FPS + large text toggles work', st.showFps && st.largeText && (await page.evaluate(() => document.body.classList.contains('large-text'))));
  await page.screenshot({ path: `${OUT}/p7-settings.png` });
  await page.reload();
  await page.waitForFunction(() => window.__bbr?.fsm.state === 'lobby', null, { timeout: 30000 });
  st = await page.evaluate(() => window.__bbr.save.data.settings);
  check('settings survive a reload', st.musicVolume === 0.2 && st.quality === 'low' && st.largeText);
  // First run: coach tips (fresh save, ?tutorial lets ?play show them).
  await page.evaluate(() => localStorage.removeItem('bbr.save'));
  await page.goto(URL + '?play&peaceful&tutorial');
  await page.waitForFunction(() => window.__bbr?.fsm.state === 'playing', null, { timeout: 30000 });
  await page.waitForSelector('.tip-card:not([hidden])', { timeout: 8000 }).catch(() => {});
  check('first run shows the movement tip', /Takbo na/.test((await page.textContent('.tip-card')) ?? '') && (await page.isVisible('.tip-card')));
  await page.screenshot({ path: `${OUT}/p7-tip.png` });
  await page.click('.tip-ok');
  await wait(400);
  const next = await page.textContent('.tip-card');
  check('"Gets!" moves on to the next tip', !/Takbo na/.test(next ?? '') || !(await page.isVisible('.tip-card')));
  check('no console errors (polish)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── Phone (landscape + portrait) with touch joystick ──
for (const [label, viewport] of [['phone-landscape', { width: 844, height: 390 }], ['phone-portrait', { width: 390, height: 844 }]]) {
  const { ctx, page, errors } = await bootPage(browser, { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?peaceful&play', { version: 5, heroXp: { bonifacio: 850 } });
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
  await page.tap('[data-act="ability"]');
  await wait(300);
  check(`${label}: ability button works on touch`, (await snap(page)).ability.uses === 1);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  // Exhibit prompt is a tappable button on phones.
  await page.evaluate(() => window.__bbr.debug.teleport(-20, -9.4));
  const tw = Date.now();
  while (!(await snap(page)).exhibitPrompt && Date.now() - tw < 5000) await wait(80);
  await page.tap('.exhibit-prompt');
  await wait(250);
  check(`${label}: tapping the exhibit prompt opens its mini-game`, (await snap(page)).mini?.kind === 'restore');
  await page.screenshot({ path: `${OUT}/${label}-minigame.png` });
  // Solve the swap puzzle with real taps.
  for (let n = 0; n < 12; n++) {
    const order = await page.$$eval('.rs-tile', (els) => els.map((e) => e.classList.contains('right')));
    const wrong = order.indexOf(false);
    if (wrong < 0) break;
    const target = await page.evaluate((w) => {
      const tiles = [...document.querySelectorAll('.rs-tile')];
      const pos = tiles[w].style.backgroundPosition.split(' ').map(parseFloat);
      const piece = Math.round(pos[1] / 50) * 3 + Math.round(pos[0] / 50);
      return piece;
    }, wrong);
    await page.tap(`.rs-tile[data-i="${wrong}"]`);
    await page.tap(`.rs-tile[data-i="${target}"]`);
    await wait(80);
  }
  const tr0 = Date.now();
  while ((await snap(page)).state !== 'reading' && Date.now() - tr0 < 20000) await wait(150);
  check(`${label}: solving the puzzle by touch opens the exhibit panel`, (await snap(page)).state === 'reading');
  await page.screenshot({ path: `${OUT}/${label}-exhibit.png` });
  await page.tap('[data-act="closeExhibit"]');
  await wait(250);
  check(`${label}: exhibit panel closes on touch`, (await snap(page)).state === 'playing');
  await page.tap('[data-act="pause"]');
  await wait(150);
  await page.tap('.pause-menu [data-act="lobby"]');
  const t0 = Date.now();
  while ((await snap(page)).state !== 'lobby' && Date.now() - t0 < 25000) await wait(100);
  check(`${label}: pause → lobby works on touch`, (await snap(page)).state === 'lobby');
  await wait(1200);
  await page.screenshot({ path: `${OUT}/${label}-lobby.png` });
  await page.tap('.lb-left [data-act="collection"]');
  await wait(300);
  check(`${label}: Shop opens on touch`, (await snap(page)).lobbyPanel === 'collection');
  await page.screenshot({ path: `${OUT}/${label}-shop.png` });
  await page.tap('.ccard[data-id="gabriela"]');
  await wait(200);
  await page.screenshot({ path: `${OUT}/${label}-shop-detail.png` });
  await page.tap('[data-act="detailBack"]');
  await page.tap('[data-act="closeCollection"]');
  check(`no console errors (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
