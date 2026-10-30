import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/NavGrid';
import { buildColliders, MUSEUM_BOUNDS, ROOMS } from '../../src/data/museumLayout';
import { CollisionWorld } from '../../src/physics/Collision';
import { Health } from '../../src/gameplay/Health';
import { ScoreKeeper } from '../../src/gameplay/ScoreKeeper';
import { PickupField } from '../../src/gameplay/PickupField';
import { GuardBrain } from '../../src/enemies/GuardBrain';
import { GUARD, HEALTH, SCORING } from '../../src/data/gameplay';
import { SurvivalRun } from '../../src/gameplay/SurvivalRun';

const boxes = buildColliders();
const nav = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.45);
const sight = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.05);
const world = new CollisionWorld(boxes);

function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('NavGrid', () => {
  const centers = ROOMS.map((r) => ({ x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 + 4 }));
  it('finds a path between every pair of galleries', () => {
    for (const a of centers) for (const b of centers) if (a !== b) expect(nav.findPath(a, b), `${JSON.stringify(a)}→${JSON.stringify(b)}`).not.toBeNull();
  });
  it('paths never pass through blocked cells', () => {
    const path = nav.findPath({ x: -20, z: 4 }, { x: 20, z: -20 })!;
    let prev = { x: -20, z: 4 };
    for (const p of path) {
      expect(nav.lineClear(prev, p)).toBe(true);
      prev = p;
    }
  });
  it('line of sight is blocked by walls', () => {
    expect(sight.lineClear({ x: -5, z: 13 }, { x: -15, z: 5 })).toBe(false);
    expect(sight.lineClear({ x: -3, z: 2 }, { x: 3, z: 2 })).toBe(true);
  });
});

describe('Health', () => {
  it('removes one heart per hit and ignores hits during i-frames', () => {
    const h = new Health(3, 1, 0);
    expect(h.damage()).toBe(true);
    expect(h.damage()).toBe(false);
    expect(h.hearts).toBe(2);
    h.update(1.01);
    expect(h.damage()).toBe(true);
    expect(h.hearts).toBe(1);
  });
  it('dies at zero and never heals above max', () => {
    const h = new Health(3, 0, 0);
    expect(h.heal()).toBe(false);
    h.damage(); h.update(0.01); h.damage(); h.update(0.01); h.damage();
    expect(h.dead).toBe(true);
    expect(h.heal()).toBe(false);
  });
  it('start grace blocks early damage', () => {
    const h = new Health(3, 1, 2);
    expect(h.damage()).toBe(false);
    h.update(2.01);
    expect(h.damage()).toBe(true);
  });
});

describe('ScoreKeeper', () => {
  it('scores coins with a capped combo multiplier', () => {
    const s = new ScoreKeeper();
    for (let i = 0; i < 5; i++) s.collect('coin');
    expect(s.score).toBe(50);
    expect(s.multiplier).toBe(2);
    expect(s.collect('coin')).toBe(20);
    for (let i = 0; i < 100; i++) s.collect('coin');
    expect(s.multiplier).toBe(SCORING.maxMultiplier);
  });
  it('combo expires and breaks on damage', () => {
    const s = new ScoreKeeper();
    for (let i = 0; i < 6; i++) s.collect('coin');
    s.breakCombo();
    expect(s.multiplier).toBe(1);
    for (let i = 0; i < 6; i++) s.collect('coin');
    s.update(SCORING.comboWindow + 0.1);
    expect(s.multiplier).toBe(1);
  });
  it('pays the survival bonus exactly once per interval, at any frame rate', () => {
    const a = new ScoreKeeper();
    for (let i = 0; i < 61 * 30; i++) a.update(1 / 30);
    const b = new ScoreKeeper();
    b.update(61);
    expect(a.score).toBe(200);
    expect(b.score).toBe(200);
  });
  it('tracks spendable coins separately from score', () => {
    const s = new ScoreKeeper();
    s.collect('rareCoin');
    expect(s.score).toBe(100);
    expect(s.runCoins).toBe(5);
  });
});

describe('PickupField', () => {
  const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, 0.7).walkableCells();
  it('spawns only on valid floor and collects each coin once', () => {
    const f = new PickupField(spots, seeded());
    f.reset({ x: 0, z: 0 });
    for (const it of f.items) expect(world.overlaps(it.pos, 0.3)).toBe(false);
    const target = f.items[0]!;
    const first = f.update(0.016, target.pos, false);
    const second = f.update(0.016, target.pos, false);
    expect(first.filter((g) => g.id === target.id)).toHaveLength(1);
    expect(second.filter((g) => g.id === target.id)).toHaveLength(0);
  });
  it('respawns collected coins away from the player', () => {
    const f = new PickupField(spots, seeded(3));
    f.reset({ x: 0, z: 0 });
    const it = f.items[0]!;
    const at = { ...it.pos };
    f.update(0.016, at, false);
    f.update(10, at, false);
    expect(it.active).toBe(true);
    expect(Math.hypot(it.pos.x - at.x, it.pos.z - at.z)).toBeGreaterThanOrEqual(6);
  });
  it('only offers hearts when the hero is hurt', () => {
    const f = new PickupField(spots, () => 0.01);
    f.reset({ x: 0, z: 0 });
    for (let i = 0; i < 100; i++) f.update(1, { x: 100, z: 100 }, false);
    expect(f.items.some((i) => i.kind === 'heart')).toBe(false);
    for (let i = 0; i < 20; i++) f.update(1, { x: 100, z: 100 }, true);
    expect(f.items.filter((i) => i.kind === 'heart' && i.active).length).toBeLessThanOrEqual(1);
    expect(f.items.some((i) => i.kind === 'heart')).toBe(true);
  });
});

describe('GuardBrain', () => {
  it('alerts, then chases a visible hero and closes the distance', () => {
    const g = new GuardBrain({ x: 0, z: -10 }, nav, sight, world, [{ x: 0, z: -10 }], seeded());
    const hero = { x: 0, z: -6 };
    g.update(0.05, hero);
    expect(g.state).toBe('alert');
    for (let i = 0; i < 20; i++) g.update(0.05, hero);
    expect(g.state).toBe('chase');
    const d0 = Math.hypot(hero.x - g.pos.x, hero.z - g.pos.z);
    for (let i = 0; i < 20; i++) g.update(0.05, hero);
    expect(Math.hypot(hero.x - g.pos.x, hero.z - g.pos.z)).toBeLessThan(d0 - 2);
  });
  it('navigates around walls into another gallery', () => {
    const g = new GuardBrain({ x: -8, z: 8 }, nav, sight, world, [{ x: 0, z: 0 }], seeded());
    const hero = { x: -13, z: 8.5 }; // other side of the x=-10 wall, door is at z 10.5..15.5
    g.alertTo(hero);
    for (let i = 0; i < 400; i++) {
      g.update(0.05, hero);
      expect(world.overlaps(g.pos, 0.44)).toBe(false);
    }
    expect(Math.hypot(hero.x - g.pos.x, hero.z - g.pos.z), g.state).toBeLessThan(1.5);
  });
  it('gives up once the hero escapes past loseRange, then patrols', () => {
    const g = new GuardBrain({ x: 0, z: -10 }, nav, sight, world, [{ x: 0, z: -10 }], seeded());
    g.alertTo({ x: 0, z: -6 });
    for (let i = 0; i < 20; i++) g.update(0.05, { x: 0, z: -6 });
    expect(g.state).toBe('chase');
    // Hero teleports beyond loseRange (main hall, far north): chase ends.
    const far = { x: 0, z: g.pos.z + GUARD.loseRange + 2 };
    g.update(0.05, far);
    expect(g.state).toBe('search');
    for (let i = 0; i < (GUARD.searchSeconds + 0.5) / 0.05; i++) g.update(0.05, far);
    expect(g.state).toBe('patrol');
  });
  it('keeps chasing between sightRange and loseRange (hysteresis)', () => {
    const g = new GuardBrain({ x: 0, z: -10 }, nav, sight, world, [{ x: 0, z: -10 }], seeded());
    g.alertTo({ x: 0, z: -6 });
    for (let i = 0; i < 20; i++) g.update(0.05, { x: 0, z: -6 });
    const mid = { x: 0, z: g.pos.z + (GUARD.sightRange + GUARD.loseRange) / 2 };
    g.update(0.05, mid);
    expect(g.state).toBe('chase');
  });
  it('a patrolling guard only re-spots the hero inside sightRange', () => {
    const g = new GuardBrain({ x: 0, z: -10 }, nav, sight, world, [{ x: 0, z: -10 }], seeded());
    expect(g.state).toBe('patrol');
    g.update(0.05, { x: 0, z: -10 + GUARD.sightRange + 2 });
    expect(g.state).toBe('patrol');
    g.update(0.05, { x: 0, z: -10 + GUARD.sightRange - 1 });
    expect(g.state).toBe('alert');
  });
  it('a freshly spawned guard hunts from beyond loseRange, then follows normal rules', () => {
    const g = new GuardBrain({ x: 0, z: -10 }, nav, sight, world, [{ x: 0, z: -10 }], seeded());
    const far = { x: 0, z: -10 + GUARD.loseRange + 6 };
    g.hunt(far);
    for (let i = 0; i < 40; i++) g.update(0.05, far);
    expect(g.state).toBe('chase');
    // Once it has closed in, escaping past loseRange makes it give up as usual.
    for (let i = 0; i < 200 && Math.hypot(far.x - g.pos.x, far.z - g.pos.z) > GUARD.loseRange - 1; i++) g.update(0.05, far);
    expect(g.hunting).toBe(false);
    g.update(0.05, { x: 0, z: g.pos.z - GUARD.loseRange - 3 });
    expect(g.state).toBe('search');
  });
  it('stun freezes the guard', () => {
    const g = new GuardBrain({ x: 0, z: -10 }, nav, sight, world, [{ x: 0, z: -10 }], seeded());
    g.alertTo({ x: 0, z: 0 });
    g.stun(1);
    const p = { ...g.pos };
    for (let i = 0; i < 10; i++) g.update(0.05, { x: 0, z: 0 });
    expect(g.state).toBe('stunned');
    expect(Math.hypot(g.pos.x - p.x, g.pos.z - p.z)).toBeLessThan(0.3);
  });
});

describe('SurvivalRun (M2 acceptance)', () => {
  const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, 0.7).walkableCells();
  const step = (run: SurvivalRun, seconds: number, player: { x: number; z: number }) => {
    const ev = [];
    for (let t = 0; t < seconds; t += 1 / 30) ev.push(...run.update(1 / 30, player));
    return ev;
  };

  it('spawns the first guard far from the hero and it closes in', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(3));
    const hero = { x: 0, z: 0 };
    run.reset(hero);
    step(run, 0.1, hero);
    expect(run.guards.length).toBe(1);
    const g = run.guards[0]!;
    const d0 = Math.hypot(g.pos.x, g.pos.z);
    expect(d0).toBeGreaterThanOrEqual(GUARD.minSpawnDistance);
    expect(d0).toBeLessThanOrEqual(GUARD.maxSpawnDistance);
    expect(g.state === 'alert' || g.state === 'chase').toBe(true);
    expect(GUARD.sightRange).toBeLessThan(GUARD.loseRange);
    step(run, 6, hero); // may route through a doorway first
    expect(Math.hypot(g.pos.x, g.pos.z), `${g.state} ${JSON.stringify(g.pos)}`).toBeLessThan(d0 - 4);
  });

  it('coins raise the score, damage removes one heart at a time, zero hearts ends the run', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(5));
    run.reset({ x: 0, z: 0 });
    const coin = run.pickups.items.find((p) => p.kind === 'coin')!;
    const ev = run.update(1 / 30, coin.pos);
    expect(ev.some((e) => e.type === 'pickup')).toBe(true);
    expect(run.score.score).toBeGreaterThan(0);

    const hero = { x: 0, z: 0 };
    const hits: number[] = [];
    let dead = false;
    for (let i = 0; i < 30 * 40 && !dead; i++) {
      const g = run.guards[0];
      if (g && g.state !== 'stunned') g.pos = { x: 0.3, z: 0 }; // force contact
      for (const e of run.update(1 / 30, hero)) {
        if (e.type === 'hit') hits.push(e.hearts);
        if (e.type === 'dead') dead = true;
      }
    }
    expect(hits).toEqual([2, 1, 0]);
    expect(dead).toBe(true);
    expect(run.over).toBe(true);
    // Nothing advances once over.
    const t = run.score.time;
    run.update(1, hero);
    expect(run.score.time).toBe(t);
  });

  it('respects the start grace period', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(9));
    const hero = { x: 0, z: 0 };
    run.reset(hero);
    step(run, 0.05, hero);
    run.guards[0]!.pos = { x: 0.3, z: 0 };
    const ev = step(run, HEALTH.startGrace * 0.5, hero);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
  });

  it('replay resets to a clean state', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(11));
    run.reset({ x: 0, z: 0 });
    step(run, 50, { x: 0, z: 0 });
    run.reset({ x: 0, z: 0 });
    expect(run.guards.length).toBe(0);
    expect(run.health.hearts).toBe(HEALTH.maxHearts);
    expect(run.score.score).toBe(0);
    expect(run.score.time).toBe(0);
    expect(run.over).toBe(false);
  });

  it('peaceful mode never spawns guards', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(2));
    run.peaceful = true;
    run.reset({ x: 0, z: 0 });
    step(run, 5, { x: 0, z: 0 });
    expect(run.guards.length).toBe(0);
  });

  it('chase speed ramps but stays capped', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(2));
    run.reset({ x: 0, z: 0 });
    expect(run.chaseSpeed).toBe(GUARD.chaseSpeedStart);
    run.score.time = 10_000;
    expect(run.chaseSpeed).toBe(GUARD.chaseSpeedMax);
  });
});

describe('Intro guard', () => {
  const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, 0.7).walkableCells();
  it('stands up-screen of the hero, in sight, back turned, and counts as the first guard', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(4));
    const hero = { x: 0, z: 0 };
    run.reset(hero);
    const g = run.placeIntroGuard(hero, [6, 8])!;
    const d = Math.hypot(g.pos.x, g.pos.z);
    expect(d).toBeGreaterThanOrEqual(6);
    expect(d).toBeLessThanOrEqual(8);
    expect(g.pos.z).toBeGreaterThan(0);
    expect(sight.lineClear(g.pos, hero)).toBe(true);
    const facing = { x: Math.sin(g.yaw), z: Math.cos(g.yaw) };
    expect(facing.x * -g.pos.x + facing.z * -g.pos.z).toBeLessThan(0); // looking away
    g.hunt(hero);
    run.update(1 / 30, hero);
    expect(run.guards).toHaveLength(1);
  });
});
