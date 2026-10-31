import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/NavGrid';
import { GADGETS } from '../../src/data/gadgets';
import { buildColliders, MUSEUM_BOUNDS } from '../../src/data/museumLayout';
import { GadgetField, rollGadget } from '../../src/gameplay/Gadgets';
import { SurvivalRun } from '../../src/gameplay/SurvivalRun';
import { CollisionWorld } from '../../src/physics/Collision';

const boxes = buildColliders();
const nav = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.45);
const sight = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.05);
const world = new CollisionWorld(boxes);
const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, 0.7).walkableCells();
const seeded = (seed = 7) => {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const DT = 1 / 30;
const hero = { x: 0, z: 0 };

const freshRun = (): SurvivalRun => {
  const run = new SurvivalRun(nav, sight, world, spots, seeded(9));
  run.peaceful = true;
  run.reset(hero, 'shockwave');
  return run;
};

describe('Gadget field', () => {
  it('rolls every kind by weight', () => {
    expect(rollGadget(0)).toBe('smoke');
    expect(rollGadget(0.999)).toBe('freeze');
    const seen = new Set(Array.from({ length: 200 }, (_, i) => rollGadget(i / 200)));
    expect(seen.size).toBe(4);
  });

  it('spawns after a delay, away from the hero, never more than the cap', () => {
    const f = new GadgetField(spots, seeded(2));
    f.reset();
    for (let t = 0; t < GADGETS.firstAfter - 1; t += DT) f.update(DT, hero, true);
    expect(f.items.length).toBe(0);
    for (let t = 0; t < 200; t += DT) f.update(DT, { x: 40, z: 40 }, true);
    expect(f.items.length).toBeGreaterThan(0);
    expect(f.items.length).toBeLessThanOrEqual(GADGETS.maxOnMap);
  });

  it('a full slot leaves holdable gadgets on the floor, but the magnet is always taken', () => {
    const f = new GadgetField(spots, seeded(3));
    f.spawn(hero, 'smoke', hero);
    expect(f.update(DT, hero, false)).toEqual([]);
    expect(f.items.length).toBe(1);
    f.spawn(hero, 'magnet', hero);
    expect(f.update(DT, hero, false).map((g) => g.kind)).toEqual(['magnet']);
  });

  it('untouched gadgets expire', () => {
    const f = new GadgetField(spots, seeded(4));
    f.spawn(hero, 'bubble', { x: 30, z: 30 });
    for (let t = 0; t < GADGETS.lifetime + 1; t += DT) f.update(DT, hero, true);
    expect(f.items.some((g) => g.kind === 'bubble' && g.pos.x === 30)).toBe(false);
  });
});

describe('Gadgets in a run', () => {
  it('only one gadget can be held; the magnet fires on pickup', () => {
    const run = freshRun();
    run.gadgets.spawn(hero, 'smoke', hero);
    run.update(DT, hero);
    expect(run.gadget).toBe('smoke');
    run.gadgets.spawn(hero, 'bubble', hero);
    run.update(DT, hero);
    expect(run.gadget).toBe('smoke');
    expect(run.gadgets.items.some((g) => g.kind === 'bubble')).toBe(true);
    run.gadgets.spawn(hero, 'magnet', hero);
    run.update(DT, hero);
    expect(run.gadget).toBe('smoke');
    expect(run.magnetLeft).toBeGreaterThan(0);
  });

  it('using the gadget empties the slot; an empty slot does nothing', () => {
    const run = freshRun();
    expect(run.useGadget(hero)).toBe(false);
    run.giveGadget('freeze', hero);
    expect(run.useGadget(hero)).toBe(true);
    expect(run.gadget).toBeNull();
    expect(run.freezeLeft).toBeGreaterThan(0);
  });

  it('coin magnet pulls nearby coins in', () => {
    const run = freshRun();
    const coin = run.pickups.items.find((c) => c.active && c.kind !== 'heart')!;
    coin.pos = { x: hero.x + 5, z: hero.z };
    run.giveGadget('magnet', hero);
    const before = run.score.runCoins;
    for (let i = 0; i < 60; i++) run.update(DT, hero);
    expect(run.score.runCoins).toBeGreaterThan(before);
  });

  it('smoke bomb: a chasing guard loses the hero and heads for the smoke', () => {
    const run = freshRun();
    run.peaceful = false;
    const g = run.spawnEnemy('guard', hero, { x: 3, z: 0 });
    g.hunting = true;
    run.giveGadget('smoke', hero);
    run.useGadget(hero);
    expect(g.state).toBe('search');
    // The hero runs off while the smoke is up: the guard never chases them.
    const away = { x: -20, z: 0 };
    for (let t = 0; t < GADGETS.smoke.seconds; t += DT) run.update(DT, away);
    expect(Math.hypot(g.pos.x - 0, g.pos.z - 0)).toBeLessThan(4);
  });

  it('time freeze slows enemies in range only', () => {
    const run = freshRun();
    run.peaceful = false;
    const near = run.spawnEnemy('guard', hero, { x: 5, z: 0 });
    const far = run.spawnEnemy('guard', hero, { x: 0, z: GADGETS.freeze.radius + 8 });
    run.giveGadget('freeze', hero);
    run.useGadget(hero);
    expect(near.slowLeft).toBeGreaterThan(0);
    expect(far.slowLeft).toBe(0);
  });

  it('protective bubble absorbs exactly one collision', () => {
    const run = freshRun();
    run.peaceful = false;
    run.health.setInvuln(0);
    run.giveGadget('bubble', hero);
    run.useGadget(hero);
    expect(run.bubble).toBe(true);
    const g = run.spawnEnemy('guard', hero, { x: 0.6, z: 0 });
    const ev = run.update(DT, hero);
    expect(ev.some((e) => e.type === 'bubblePop')).toBe(true);
    expect(run.health.hearts).toBe(run.health.max);
    expect(run.bubble).toBe(false);
    void g;
  });

  it('training mode has no gadgets', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(1));
    run.reset(hero, 'shockwave', true);
    for (let t = 0; t < 120; t += DT) run.update(DT, hero);
    expect(run.gadgets.items.length).toBe(0);
  });
});
