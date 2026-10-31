import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/NavGrid';
import { ABILITIES } from '../../src/data/abilities';
import { DOG, MULTO, SPAWN_SCHEDULE, TIKBALANG } from '../../src/data/enemies';
import { buildColliders, MUSEUM_BOUNDS } from '../../src/data/museumLayout';
import { DogBrain, TikbalangBrain } from '../../src/enemies/LungerBrain';
import { MultoBrain } from '../../src/enemies/MultoBrain';
import { SurvivalRun, type RunEvent } from '../../src/gameplay/SurvivalRun';
import { CollisionWorld } from '../../src/physics/Collision';
import type { Vec2 } from '../../src/utils/math';

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

/** A run with an invincible hero and no guards from the schedule (enemies are dropped in by hand). */
const quietRun = (hero: Vec2): SurvivalRun => {
  const run = new SurvivalRun(nav, sight, world, spots, seeded(5));
  run.reset(hero, 'shockwave');
  run.health.grantInvuln(1e9);
  return run;
};

describe('Difficulty director', () => {
  it('brings enemies in exactly in SPAWN_SCHEDULE order and time', () => {
    const hero = { x: 0, z: 0 };
    const run = new SurvivalRun(nav, sight, world, spots, seeded(3));
    run.reset(hero, 'sprint');
    run.health.grantInvuln(1e9);
    const joined: { kind: string; at: number }[] = [];
    const end = SPAWN_SCHEDULE[SPAWN_SCHEDULE.length - 1]!.at + 2;
    while (run.score.time < end) {
      for (const e of run.update(DT, hero)) if (e.type === 'guardJoined') joined.push({ kind: e.kind, at: run.score.time });
    }
    expect(joined.map((j) => j.kind)).toEqual(SPAWN_SCHEDULE.map((s) => s.kind));
    joined.forEach((j, i) => expect(j.at).toBeGreaterThanOrEqual(SPAWN_SCHEDULE[i]!.at));
    expect(run.guards.map((g) => g.kind)).toEqual(SPAWN_SCHEDULE.map((s) => s.kind));
    // Nothing extra after the schedule runs out.
    for (let i = 0; i < 300; i++) run.update(DT, hero);
    expect(run.guards.length).toBe(SPAWN_SCHEDULE.length);
  });

  it('the intro guard counts as the first scheduled entry', () => {
    const run = new SurvivalRun(nav, sight, world, spots, seeded(4));
    const hero = { x: 0, z: 0 };
    run.reset(hero, 'sprint');
    expect(run.placeIntroGuard(hero, [5, 9])?.kind).toBe(SPAWN_SCHEDULE[0]!.kind);
    const ev = run.update(DT, hero);
    expect(ev.some((e) => e.type === 'guardJoined')).toBe(false);
    expect(run.guards.length).toBe(1);
  });

  it('the schedule ramps: folklore creatures only arrive after the first minute', () => {
    for (const s of SPAWN_SCHEDULE) if (s.kind === 'multo' || s.kind === 'tikbalang') expect(s.at).toBeGreaterThanOrEqual(60);
    const times = SPAWN_SCHEDULE.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('Guard dog', () => {
  const start = { x: 0, z: 4 };
  const target = { x: 4, z: 4 };

  it('telegraphs (windup, standing still) before a straight dash along the locked aim', () => {
    expect(sight.lineClear(start, target)).toBe(true);
    const run = quietRun(target);
    const dog = run.spawnEnemy('dog', target, start) as DogBrain;
    expect(dog).toBeInstanceOf(DogBrain);
    const events: RunEvent[] = [];
    let hero = { ...target };
    let windupAt: Vec2 | null = null;
    for (let i = 0; i < 90 && dog.state !== 'dash'; i++) {
      events.push(...run.update(DT, hero));
      if (dog.state === 'windup' && !windupAt) {
        windupAt = { ...dog.pos };
        hero = { x: target.x, z: target.z + 3 }; // side-step during the telegraph
      }
    }
    expect(events.some((e) => e.type === 'windup' && e.kind === 'dog')).toBe(true);
    expect(windupAt).not.toBeNull();
    // Windup lasted the data value and the dog barely moved during it.
    expect(Math.hypot(dog.pos.x - windupAt!.x, dog.pos.z - windupAt!.z)).toBeLessThan(0.4);
    const aim = { ...dog.aim };
    expect(aim.x).toBeGreaterThan(0.9); // locked toward where the hero WAS (east), not the new spot
    const before = { ...dog.pos };
    while (dog.state === 'dash') run.update(DT, hero);
    const moved = Math.hypot(dog.pos.x - before.x, dog.pos.z - before.z);
    expect(moved).toBeGreaterThan(DOG.dashSpeed * DOG.dashSeconds * 0.7);
    expect(Math.abs(dog.pos.z - before.z)).toBeLessThan(0.3); // straight line
    expect(dog.state).toBe('recover');
  });

  it('cannot lunge again until its cooldown has passed', () => {
    const run = quietRun(target);
    const dog = run.spawnEnemy('dog', target, start) as DogBrain;
    let windups = 0;
    for (let t = 0; t < DOG.dashCooldown + 0.5; t += DT) for (const e of run.update(DT, target)) if (e.type === 'windup') windups++;
    expect(windups).toBe(1);
    void dog;
  });
});

describe('Multo', () => {
  it('floats straight through walls toward the hero', () => {
    const hero = { x: 16, z: 4 };
    const from = { x: 4, z: 4 };
    expect(sight.lineClear(from, hero)).toBe(false); // the x = 10 wall is in between
    const run = quietRun(hero);
    const m = run.spawnEnemy('multo', hero, from) as MultoBrain;
    let maxZDrift = 0;
    for (let t = 0; t < 20 && m.pos.x < 12; t += DT) {
      run.update(DT, hero);
      maxZDrift = Math.max(maxZDrift, Math.abs(m.pos.z - from.z));
    }
    expect(m.pos.x).toBeGreaterThan(12);
    expect(maxZDrift).toBeLessThan(0.2); // never detoured to a doorway
  });

  it('is harmless while faded, solid again afterwards', () => {
    const hero = { x: 0, z: 0 };
    const run = new SurvivalRun(nav, sight, world, spots, seeded(9));
    run.reset(hero, 'sprint');
    run.health.update(10); // clear the opening grace
    const m = run.spawnEnemy('multo', hero, { x: 0, z: 0.3 }) as MultoBrain;
    m.stun(0);
    // Advance its fade cycle to the hidden window while it hovers on the hero.
    let hurtWhileHidden = false;
    for (let t = 0; t < MULTO.visibleSeconds + MULTO.fadeSeconds + MULTO.hiddenSeconds; t += DT) {
      const visBefore = m.visibility;
      const ev = run.update(DT, hero);
      if (visBefore < 0.5 && ev.some((e) => e.type === 'hit')) hurtWhileHidden = true;
      if (m.visibility === 0) expect(m.canHurt).toBe(false);
    }
    expect(hurtWhileHidden).toBe(false);
    expect(new MultoBrain({ x: 0, z: 0 }, nav, sight, world, spots, seeded(1)).canHurt).toBe(true);
  });
});

describe('Tikbalang', () => {
  it('rears up, charges, and stuns itself on a wall it slams into', () => {
    const start = { x: 2, z: 3 };
    const hero0 = { x: 8.5, z: 3 };
    expect(sight.lineClear(start, hero0)).toBe(true);
    const run = quietRun(hero0);
    const tk = run.spawnEnemy('tikbalang', hero0, start) as TikbalangBrain;
    let hero = { ...hero0 };
    const events: RunEvent[] = [];
    for (let t = 0; t < 6 && tk.state !== 'stunned'; t += DT) {
      events.push(...run.update(DT, hero));
      if (tk.state === 'windup') hero = { x: 8.5, z: 7 }; // dodge sideways; the charge keeps going east
    }
    expect(events.some((e) => e.type === 'windup' && e.kind === 'tikbalang')).toBe(true);
    expect(events.some((e) => e.type === 'bonk')).toBe(true);
    expect(tk.state).toBe('stunned');
    expect(tk.pos.x).toBeGreaterThan(8.5); // ran all the way to the x = 10 wall
  });

  it('casts harmless illusion copies that expire on their own', () => {
    const hero = { x: 0, z: 0 };
    const run = quietRun(hero);
    run.spawnEnemy('tikbalang', hero, { x: 0, z: -12 });
    const events: RunEvent[] = [];
    for (let t = 0; t < TIKBALANG.illusionEvery && run.decoys.length === 0; t += DT) events.push(...run.update(DT, hero));
    expect(events.filter((e) => e.type === 'illusion').length).toBe(1);
    // Even cast right on top of the hero, the copies survive their first moments.
    run.update(DT, hero);
    expect(run.decoys.length).toBe(TIKBALANG.illusionCount);
    expect(run.decoys.length).toBe(TIKBALANG.illusionCount);
    const pops: RunEvent[] = [];
    for (let t = 0; t < TIKBALANG.illusionSeconds + 0.2; t += DT) pops.push(...run.update(DT, hero).filter((e) => e.type === 'decoyPop'));
    expect(run.decoys.length).toBe(0);
    expect(pops.length).toBe(TIKBALANG.illusionCount);
  });

  it('touching an illusion pops it without costing a heart', () => {
    const hero = { x: 0, z: 0 };
    const run = new SurvivalRun(nav, sight, world, spots, seeded(1));
    run.reset(hero, 'sprint');
    run.health.update(10);
    run.decoys.push({ pos: { x: 0.3, z: 0 }, yaw: 0, ttl: TIKBALANG.illusionSeconds, angle: 0, spin: 1 });
    expect(run.update(DT, hero).some((e) => e.type === 'decoyPop')).toBe(false); // fresh copy: still spreading out
    run.decoys[0]!.ttl = 2;
    run.decoys[0]!.pos = { x: 0.3, z: 0 };
    const ev = run.update(DT, hero);
    expect(ev.some((e) => e.type === 'decoyPop')).toBe(true);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(run.health.hearts).toBe(run.health.max);
  });
});

describe('Abilities work on every enemy kind', () => {
  it("Bonifacio's shockwave stuns guards, dogs, multo and tikbalang alike, and pops illusions", () => {
    const hero = { x: 0, z: 0 };
    const run = quietRun(hero);
    const near: Vec2[] = [{ x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 }];
    const kinds = ['guard', 'dog', 'multo', 'tikbalang'] as const;
    const enemies = kinds.map((k, i) => run.spawnEnemy(k, hero, near[i]));
    run.decoys.push({ pos: { x: 1.5, z: 1.5 }, yaw: 0, ttl: 3, angle: 0, spin: 1 });
    run.useAbility(hero, { x: 0, z: 1 });
    const ev = run.update(DT, hero);
    const ab = ev.find((e) => e.type === 'ability');
    expect(ab && ab.type === 'ability' && ab.affected).toBe(4);
    for (const g of enemies) expect(g.state).toBe('stunned');
    expect(run.decoys.length).toBe(0);
    expect(ev.some((e) => e.type === 'decoyPop')).toBe(true);
    expect(ABILITIES.shockwave.radius).toBeGreaterThan(2);
  });

  it("Lapu-Lapu's shield blocks a dog's lunge", () => {
    const hero = { x: 4, z: 4 };
    const run = new SurvivalRun(nav, sight, world, spots, seeded(2));
    run.reset(hero, 'shield');
    run.health.update(10);
    const dog = run.spawnEnemy('dog', hero, { x: 0, z: 4 });
    run.useAbility(hero, { x: 0, z: 1 });
    const ev: RunEvent[] = [];
    for (let t = 0; t < 4 && !ev.some((e) => e.type === 'blocked'); t += DT) ev.push(...run.update(DT, hero));
    expect(ev.some((e) => e.type === 'blocked')).toBe(true);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(dog.state).toBe('stunned');
  });
});
