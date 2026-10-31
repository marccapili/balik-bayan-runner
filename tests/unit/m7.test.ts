import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/NavGrid';
import { migrate, SaveManager } from '../../src/core/SaveManager';
import { ABILITIES } from '../../src/data/abilities';
import { ENDLESS } from '../../src/data/enemies';
import { EXHIBIT_BY_ID, EXHIBITS } from '../../src/data/exhibits';
import { GUARD, SCORING } from '../../src/data/gameplay';
import { HERO_ORDER, HEROES, STARTER_HERO } from '../../src/data/heroes';
import { BAYBAYIN, MINIGAME } from '../../src/data/minigames';
import { buildColliders, MUSEUM_BOUNDS } from '../../src/data/museumLayout';
import { DAILY, EXHIBIT_REWARDS, HERO_LEVEL, PLAYER_LEVEL, PROFILE_FRAMES } from '../../src/data/progression';
import { SKINS } from '../../src/data/skins';
import { guideTarget } from '../../src/history/exhibitMath';
import { Ability } from '../../src/gameplay/Ability';
import {
  BaybayinMatch,
  CodeLock,
  DustGrid,
  makeRoute,
  RouteGame,
  SwapPuzzle,
  swipeVerdict,
  TimelineSort,
  WiresGame,
} from '../../src/gameplay/MiniGames';
import {
  applyDaily,
  dailyTasksFor,
  heroDiamondsBetween,
  heroLevel,
  heroPerks,
  localDay,
  playerLevel,
  playerXpForNext,
  playerXpToReach,
  secondsToMidnight,
} from '../../src/gameplay/Progression';
import { SurvivalRun } from '../../src/gameplay/SurvivalRun';
import { CollisionWorld } from '../../src/physics/Collision';

const boxes = buildColliders();
const nav = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.45);
const sight = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.05);
const world = new CollisionWorld(boxes);
const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, 0.7).walkableCells();
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const runSummary = (o: Partial<Parameters<SaveManager['recordRun']>[0]> = {}) => ({
  score: 0,
  time: 0,
  runCoins: 0,
  coinsPicked: 0,
  bestMultiplier: 1,
  abilityUses: 0,
  exhibits: 0,
  gamesWon: 0,
  ...o,
});

describe('Owner numbers (M7)', () => {
  it('Gabriela 20 s cooldown, Bonifacio free starter, other heroes 500, skins 300 diamonds', () => {
    expect(ABILITIES.dash.cooldown).toBe(20);
    expect(STARTER_HERO).toBe('bonifacio');
    expect(HEROES.bonifacio.unlockCost).toBe(0);
    for (const h of HERO_ORDER.filter((x) => x !== 'bonifacio')) expect(HEROES[h].unlockCost).toBe(500);
    for (const s of SKINS) expect(s.cost).toBe(s.name === 'Classic' ? 0 : 300);
    const d = new SaveManager(memStore()).data;
    expect(d.ownedHeroes).toEqual(['bonifacio']);
    expect(d.selectedHero).toBe('bonifacio');
  });

  it('hero level rewards match the spec', () => {
    const at = (lv: number) => HERO_LEVEL.rewards.find((r) => r.level === lv);
    expect(at(3)?.diamonds).toBe(10);
    expect(at(4)?.perk).toBe('badge');
    expect(at(5)?.perk).toBe('ability');
    expect(at(7)?.perk).toBe('cooldown');
    expect(at(8)?.diamonds).toBe(10);
    expect(at(9)?.perk).toBe('boost');
    expect(at(10)).toMatchObject({ diamonds: 20, perk: 'master' });
    expect(HERO_LEVEL.cap).toBe(10);
  });

  it('player level: cap 300, 10 diamonds per level, a frame every 5 levels', () => {
    expect(PLAYER_LEVEL.cap).toBe(300);
    expect(PLAYER_LEVEL.diamondsPerLevel).toBe(10);
    expect(PROFILE_FRAMES).toHaveLength(1 + 300 / 5);
    expect(PROFILE_FRAMES.slice(1).every((f, i) => f.level === (i + 1) * 5)).toBe(true);
  });

  it('exhibit diamonds: +20 at 5 and 10, +30 at the 15th', () => {
    expect(EXHIBIT_REWARDS.milestones).toEqual([
      { at: 5, diamonds: 20 },
      { at: 10, diamonds: 20 },
      { at: 15, diamonds: 30 },
    ]);
  });
});

describe('Level math', () => {
  it('hero levels follow the XP table and pay diamonds once per level', () => {
    expect(heroLevel(0)).toBe(1);
    expect(heroLevel(HERO_LEVEL.xpToReach[5]! - 1)).toBe(4);
    expect(heroLevel(HERO_LEVEL.xpToReach[5]!)).toBe(5);
    expect(heroLevel(1e9)).toBe(10);
    expect(heroDiamondsBetween(1, 10)).toBe(40);
    expect(heroDiamondsBetween(2, 3)).toBe(10);
    expect(heroDiamondsBetween(3, 7)).toBe(0);
  });

  it('perks unlock at the right levels', () => {
    expect(heroPerks(4)).toMatchObject({ abilityUnlocked: false, badge: true, cooldownMult: 1, boost: 1, master: false });
    expect(heroPerks(5).abilityUnlocked).toBe(true);
    expect(heroPerks(7).cooldownMult).toBeCloseTo(0.9);
    expect(heroPerks(9).boost).toBeCloseTo(1.2);
    expect(heroPerks(10).master).toBe(true);
  });

  it('player level inverts the XP curve exactly, and caps at 300', () => {
    for (const n of [1, 2, 3, 10, 57, 150, 299, 300]) {
      expect(playerLevel(playerXpToReach(n)), `n=${n}`).toBe(n);
      if (n > 1) expect(playerLevel(playerXpToReach(n) - 1), `n=${n}`).toBe(n - 1);
    }
    expect(playerXpToReach(3) - playerXpToReach(2)).toBe(playerXpForNext(2));
    expect(playerLevel(1e12)).toBe(300);
  });

  it('recordRun pays hero + player XP and their diamonds', () => {
    const s = new SaveManager(memStore());
    const rec = s.recordRun(runSummary({ score: 5000, time: 200, coinsPicked: 60, exhibits: 6 }), 'bonifacio');
    expect(rec.hero.xp).toBe(200 + 6 * 20 + 60);
    expect(rec.hero.to).toBe(heroLevel(380));
    expect(rec.player.xp).toBe(500 + 6 * 25);
    const playerDiamonds = (rec.player.to - rec.player.from) * 10;
    expect(rec.player.diamonds).toBe(playerDiamonds);
    expect(s.data.diamonds).toBe(rec.hero.diamonds + playerDiamonds);
  });

  it('player XP never goes past the level cap', () => {
    const s = new SaveManager(memStore());
    const r = s.addPlayerXp(1e12);
    expect(r.to).toBe(300);
    expect(r.diamonds).toBe(299 * 10);
    expect(s.addPlayerXp(1000).diamonds).toBe(0);
  });
});

describe('Save v5', () => {
  it('migrates a v4 save: keeps wallet and archive, starts levels at 1, fresh daily tasks', () => {
    const d = migrate({ version: 4, coins: 900, diamonds: 40, ownedHeroes: ['rizal', 'gabriela'], selectedHero: 'gabriela', discovered: ['rizal'] }, new Date(2026, 9, 31, 10));
    expect(d.version).toBe(5);
    expect(d.coins).toBe(900);
    expect(d.diamonds).toBe(40);
    expect(d.ownedHeroes).toEqual(['bonifacio', 'rizal', 'gabriela']);
    expect(d.selectedHero).toBe('gabriela');
    expect(d.discovered).toEqual(['rizal']);
    expect(d.heroXp.gabriela).toBe(0);
    expect(d.playerXp).toBe(0);
    expect(d.daily.day).toBe('2026-10-31');
    expect(d.daily.tasks).toHaveLength(DAILY.count);
  });

  it('rejects tampered frames, XP and daily rewards', () => {
    const now = new Date(2026, 9, 31, 10);
    const day = localDay(now);
    const real = dailyTasksFor(day);
    const d = migrate({ version: 5, profileFrame: 40, playerXp: -5, heroXp: { rizal: 'lots' }, daily: { day, tasks: real.map((t) => ({ ...t, coins: 1e9, progress: 1e9, claimed: true })) } }, now);
    expect(d.profileFrame).toBe(0); // level 1 can't wear frame 40
    expect(d.playerXp).toBe(0);
    expect(d.heroXp.rizal).toBe(0);
    expect(d.daily.tasks.map((t) => t.coins)).toEqual(real.map((t) => t.coins));
    expect(d.daily.tasks.every((t) => t.progress === t.target && t.claimed)).toBe(true);
  });
});

describe('Daily tasks', () => {
  it('same day → same tasks; distinct kinds; reset at local midnight', () => {
    const a = dailyTasksFor('2026-10-31');
    expect(dailyTasksFor('2026-10-31')).toEqual(a);
    expect(new Set(a.map((t) => t.kind)).size).toBe(DAILY.count);
    expect(secondsToMidnight(new Date(2026, 9, 31, 23, 59, 0))).toBe(60);
  });

  it('progress, claim once for coins, roll over the next day', () => {
    const s = new SaveManager(memStore());
    const today = new Date();
    s.ensureDaily(today);
    for (const t of s.data.daily.tasks) t.progress = t.target;
    const coins = s.data.coins;
    const pay = s.claimDaily(0, today);
    expect(pay).toBe(s.data.daily.tasks[0]!.coins);
    expect(s.data.coins).toBe(coins + pay!);
    expect(s.claimDaily(0, today)).toBeNull();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 9);
    expect(s.ensureDaily(tomorrow)).toBe(true);
    expect(s.data.daily.tasks.every((t) => t.progress === 0 && !t.claimed)).toBe(true);
  });

  it('applyDaily counts totals and best runs', () => {
    const tasks = DAILY.pool.map((p) => ({ ...p, progress: 0, claimed: false }));
    applyDaily(tasks, { exhibits: 3, coinsPicked: 30, time: 100, gamesWon: 2, abilityUses: 1, score: 1500 });
    applyDaily(tasks, { exhibits: 3, coinsPicked: 30, time: 50, gamesWon: 2, abilityUses: 2, score: 900 });
    const by = Object.fromEntries(tasks.map((t) => [t.kind, t.progress]));
    expect(by).toEqual({ exhibits: 5, coins: 50, runs: 2, survive: 100, minigames: 4, ability: 3, score: 1500 });
  });
});

describe('Exhibits (M7)', () => {
  it('there are 15, each with a mini-game; code + timeline data are sane', () => {
    expect(EXHIBITS).toHaveLength(15);
    for (const id of ['spoliarium', 'rice-terraces', 'edsa']) expect(EXHIBIT_BY_ID[id], id).toBeDefined();
    for (const e of EXHIBITS) {
      expect(e.game, e.id).toBeTruthy();
      if (e.game === 'code') expect(e.code?.answer, e.id).toMatch(/^\d{4}$/);
      if (e.game === 'timeline') {
        const years = e.timeline!.map((t) => t.year);
        expect(new Set(years).size, e.id).toBe(years.length);
      }
    }
    expect(EXHIBIT_BY_ID.katipunan!.code!.answer).toBe('1892');
    expect(EXHIBIT_BY_ID.edsa!.code!.answer).toBe('1986');
    expect(EXHIBITS.some((e) => e.game === 'swipe')).toBe(true);
  });
});

describe('Mini-game rules', () => {
  it('wires: only matching colours connect, each once', () => {
    const g = new WiresGame(0, seeded(3));
    expect(g.left).toHaveLength(MINIGAME.wires.min);
    expect(g.right).not.toEqual(g.left); // actually shuffled
    const wrong = g.right.findIndex((c) => c !== g.left[0]);
    expect(g.connect(0, wrong)).toBe(false);
    for (let li = 0; li < g.left.length; li++) expect(g.connect(li, g.right.indexOf(g.left[li]!))).toBe(true);
    expect(g.connect(0, g.right.indexOf(g.left[0]!))).toBe(false);
    expect(g.done).toBe(true);
    expect(new WiresGame(1, seeded(3)).left).toHaveLength(MINIGAME.wires.max);
  });

  it('card swipe needs the full reader at the right speed (stricter later)', () => {
    expect(swipeVerdict(0.5, 0.6, 0)).toBe('short');
    expect(swipeVerdict(1, 0.1, 0)).toBe('fast');
    expect(swipeVerdict(1, 0.6, 0)).toBe('ok');
    expect(swipeVerdict(1, 1.1, 0)).toBe('ok');
    expect(swipeVerdict(1, 1.1, 1)).toBe('slow');
  });

  it('code lock: wrong tries reveal digits, right code opens', () => {
    const c = new CodeLock('1892');
    for (const d of '1234') c.press(d);
    c.press('9'); // ignored, already full
    expect(c.entry).toBe('1234');
    expect(c.submit()).toBe('wrong');
    expect(c.hint).toBe('1___');
    c.press('1');
    expect(c.submit()).toBe('incomplete');
    c.back();
    for (const d of '1892') c.press(d);
    expect(c.submit()).toBe('ok');
    expect(c.solved).toBe(true);
  });

  it('navigator: islands spread out and must be visited in order', () => {
    const { stops } = makeRoute(1, seeded(5));
    expect(stops).toHaveLength(MINIGAME.navigate.max);
    for (let i = 0; i < stops.length; i++)
      for (let j = i + 1; j < stops.length; j++) expect(Math.hypot(stops[i]!.x - stops[j]!.x, stops[i]!.y - stops[j]!.y)).toBeGreaterThanOrEqual(MINIGAME.navigate.minGap);
    const g = new RouteGame(stops);
    expect(g.visit(stops[1]!)).toBe(false); // skipping ahead does nothing
    for (const s of stops) expect(g.visit(s)).toBe(true);
    expect(g.done).toBe(true);
  });

  it('restore: starts scrambled, swaps fix it', () => {
    const p = new SwapPuzzle(3, 0.5, seeded(9));
    expect(p.solved).toBe(false);
    let guard = 0;
    while (!p.solved && guard++ < 20) {
      const slot = p.order.findIndex((v, i) => v !== i);
      p.tap(slot);
      p.tap(p.order.indexOf(slot));
    }
    expect(p.solved).toBe(true);
  });

  it('dust: rubbing everything reaches the target', () => {
    const g = new DustGrid(MINIGAME.dust.cols, MINIGAME.dust.rows, 0);
    expect(g.done).toBe(false);
    for (let y = 0; y <= 1; y += 0.05) for (let x = 0; x <= 1; x += 0.05) g.rub(x, y, MINIGAME.dust.brush);
    expect(g.fraction).toBeGreaterThan(0.95);
    expect(g.done).toBe(true);
  });

  it('timeline: only the next event in time is accepted', () => {
    const t = new TimelineSort(EXHIBIT_BY_ID['american-japanese']!.timeline!, seeded(4));
    const byYear = t.events.map((_, i) => i).sort((a, b) => t.events[a]!.year - t.events[b]!.year);
    expect(t.tap(byYear[1]!)).toBe(false);
    expect(t.mistakes).toBe(1);
    for (const i of byYear) expect(t.tap(i)).toBe(true);
    expect(t.done).toBe(true);
  });

  it('baybayin: glyph then matching sound', () => {
    const g = new BaybayinMatch(0, seeded(8));
    expect(g.picks).toHaveLength(MINIGAME.baybayin.min);
    expect(g.pickSound(0)).toBe(false); // nothing selected
    g.selectGlyph(0);
    expect(g.pickSound(1)).toBe(false);
    for (let p = 0; p < g.picks.length; p++) {
      g.selectGlyph(p);
      expect(g.pickSound(p)).toBe(true);
    }
    expect(g.done).toBe(true);
    expect(BAYBAYIN.every((b) => /^[ᜀ-ᜟ]$/u.test(b.glyph))).toBe(true);
  });
});

describe('Exhibit Mode → Endless Mode', () => {
  const fresh = () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(11));
    run.reset({ x: 0, z: 0 }, 'shockwave');
    return run;
  };

  it('pays score + coins per exhibit and diamonds at 5 / 10 / 15', () => {
    const run = fresh();
    const pays = EXHIBITS.map((e) => run.discover(e.id));
    expect(pays[0]).toEqual({ points: SCORING.artifactDiscovery, coins: EXHIBIT_REWARDS.coins, diamonds: 0 });
    expect(pays.map((p) => p.diamonds)).toEqual([0, 0, 0, 0, 20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 30]);
    expect(run.score.runCoins).toBe(15 * EXHIBIT_REWARDS.coins);
    expect(run.endless).toBe(true);
    const ev = run.update(1 / 30, { x: 0, z: 0 });
    expect(ev.filter((e) => e.type === 'endless')).toHaveLength(1);
  });

  it('endless: chase speed climbs past the hero and new enemies keep arriving', () => {
    const run = fresh();
    for (const e of EXHIBITS) run.discover(e.id);
    expect(run.chaseSpeed).toBeCloseTo(GUARD.chaseSpeedMax);
    const before = run.guards.length;
    for (let i = 0; i < 30 * 40; i++) {
      run.health.grantInvuln(1);
      run.update(1 / 30, { x: 0, z: 0 });
    }
    expect(run.endlessTime).toBeGreaterThan(39);
    expect(run.chaseSpeed).toBeGreaterThan(GUARD.chaseSpeedMax + 1);
    expect(run.guards.length - before).toBeGreaterThanOrEqual(Math.floor(40 / ENDLESS.spawnEvery) - 1);
    expect(ENDLESS.speedCap).toBeGreaterThan(6.2); // faster than the hero → every endless run ends
  });

  it('Curator ID card lies far away and is picked up by walking over it', () => {
    const run = fresh();
    const c = run.idCard!;
    expect(Math.hypot(c.pos.x, c.pos.z)).toBeGreaterThanOrEqual(14);
    expect(run.hasIdCard).toBe(false);
    const ev = run.update(1 / 30, c.pos);
    expect(ev.some((e) => e.type === 'idCard')).toBe(true);
    expect(run.hasIdCard).toBe(true);
  });

  it('guide arrow: nearest uncleared exhibit, or the ID card for swipe exhibits', () => {
    const swipe = EXHIBITS.find((e) => e.game === 'swipe')!;
    const card = { pos: { x: -25, z: -20 }, taken: false };
    const others = new Set(EXHIBITS.filter((e) => e.game !== 'swipe').map((e) => e.id));
    expect(guideTarget(swipe.at, others, card)?.kind).toBe('card');
    card.taken = true;
    expect(guideTarget(swipe.at, others, card)?.id).toBe(swipe.id);
    expect(guideTarget({ x: 0, z: 0 }, new Set(EXHIBITS.map((e) => e.id)), card)).toBeNull();
  });

  it('ability is locked below hero level 5; perks change cooldown and reach', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(2));
    run.reset({ x: 0, z: 0 }, 'shockwave', false, { abilityUnlocked: false, cooldownMult: 1, boost: 1 });
    expect(run.useAbility({ x: 0, z: 0 }, { x: 0, z: 1 })).toBe(false);
    expect(run.ability.cooldownFrac).toBe(0);
    run.reset({ x: 0, z: 0 }, 'dash', false, { abilityUnlocked: true, cooldownMult: 0.9, boost: 1.2 });
    expect(run.ability.cooldown).toBeCloseTo(18);
    expect(run.ability.duration).toBeCloseTo(ABILITIES.dash.duration * 1.2);
    // Training always lets you try it.
    run.reset({ x: 0, z: 0 }, 'dash', true, { abilityUnlocked: false, cooldownMult: 1, boost: 1 });
    expect(run.ability.locked).toBe(false);
    expect(new Ability('sprint', 90, 1, true).trigger()).toBe(false);
  });
});
