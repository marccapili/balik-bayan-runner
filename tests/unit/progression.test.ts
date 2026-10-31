import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/NavGrid';
import { PlayerMotor } from '../../src/characters/PlayerMotor';
import { migrate, SaveManager } from '../../src/core/SaveManager';
import { ABILITIES } from '../../src/data/abilities';
import { PLAYER_CONFIG } from '../../src/data/config';
import { HERO_ORDER, HEROES } from '../../src/data/heroes';
import { MISSION_POOL, MISSIONS } from '../../src/data/missions';
import { buildColliders, MUSEUM_BOUNDS } from '../../src/data/museumLayout';
import { EXCHANGE, SKINS } from '../../src/data/skins';
import { Ability } from '../../src/gameplay/Ability';
import { applyRun, describe as describeMission, makeMission, type RunSummary } from '../../src/gameplay/Missions';
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
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const hero = { x: 0, z: 0 };
const newRun = (kind: (typeof HEROES)['rizal']['abilityKind'], seed = 3) => {
  const run = new SurvivalRun(nav, sight, world, spots, seeded(seed));
  run.reset(hero, kind);
  run.update(1 / 30, hero); // first guard joins
  return run;
};
const step = (run: SurvivalRun, seconds: number) => {
  const ev = [];
  for (let t = 0; t < seconds; t += 1 / 30) ev.push(...run.update(1 / 30, hero));
  return ev;
};

describe('Ability cooldowns', () => {
  it('fires once, then waits for the full cooldown', () => {
    const a = new Ability('dash');
    expect(a.trigger()).toBe(true);
    expect(a.trigger()).toBe(false);
    expect(a.cooldownFrac).toBeCloseTo(0);
    a.update(ABILITIES.dash.cooldown / 2);
    expect(a.cooldownFrac).toBeCloseTo(0.5);
    a.update(ABILITIES.dash.cooldown / 2 + 0.01);
    expect(a.ready).toBe(true);
    expect(a.trigger()).toBe(true);
    expect(a.uses).toBe(2);
  });

  it('every hero has a working ability with a sensible cooldown', () => {
    for (const id of HERO_ORDER) {
      const d = ABILITIES[HEROES[id].abilityKind];
      expect(d.cooldown).toBeGreaterThan(d.duration);
    }
  });
});

describe('Hero abilities in a run', () => {
  it('Rizal sprint raises top speed only while active', () => {
    const run = newRun('sprint');
    expect(run.speedMultiplier).toBe(1);
    expect(run.useAbility(hero, { x: 0, z: 1 })).toBe(true);
    expect(run.speedMultiplier).toBe(ABILITIES.sprint.speedMultiplier);
    expect(run.useAbility(hero, { x: 0, z: 1 })).toBe(false);
    run.peaceful = true;
    step(run, ABILITIES.sprint.duration + 0.1);
    expect(run.speedMultiplier).toBe(1);
  });

  it('Lapu-Lapu shield blocks one hit and stuns that guard', () => {
    const run = newRun('shield');
    step(run, 2.1); // past the start grace
    run.useAbility(hero, { x: 0, z: 1 });
    const g = run.guards[0]!;
    g.pos = { x: 0.3, z: 0 };
    const ev = run.update(1 / 30, hero);
    expect(ev.some((e) => e.type === 'blocked')).toBe(true);
    expect(run.health.hearts).toBe(3);
    expect(g.state).toBe('stunned');
    expect(run.shielded).toBe(false);
    // The next hit (after the brief bounce window) lands normally.
    step(run, 2.5);
    g.pos = { x: 0.3, z: 0 };
    step(run, 0.2);
    expect(run.health.hearts).toBe(2);
  });

  it('Bonifacio shockwave stuns and shoves only guards in range', () => {
    const run = newRun('shockwave');
    const g = run.guards[0]!;
    g.pos = { x: 2, z: 0 };
    expect(run.useAbility(hero, { x: 0, z: 1 })).toBe(true);
    expect(g.state).toBe('stunned');
    expect(Math.hypot(g.pos.x, g.pos.z)).toBeGreaterThan(3);
    const ev = run.update(1 / 30, hero);
    expect(ev.find((e) => e.type === 'ability')).toMatchObject({ kind: 'shockwave', affected: 1 });

    const far = newRun('shockwave', 4);
    const g2 = far.guards[0]!;
    g2.pos = { x: 0, z: 12 };
    far.useAbility(hero, { x: 0, z: 1 });
    expect(g2.state).not.toBe('stunned');
  });

  it('Gabriela dash makes the hero untouchable for a moment', () => {
    const run = newRun('dash');
    step(run, 2.1);
    expect(run.health.invulnerable).toBe(false);
    run.useAbility(hero, { x: 1, z: 0 });
    expect(run.health.invulnerable).toBe(true);
    run.guards[0]!.pos = { x: 0.3, z: 0 };
    run.update(1 / 30, hero);
    expect(run.health.hearts).toBe(3);
  });

  it('abilities do nothing after the run is over', () => {
    const run = newRun('dash');
    run.over = true;
    expect(run.useAbility(hero, { x: 1, z: 0 })).toBe(false);
  });
});

describe('PlayerMotor dash', () => {
  it('bursts forward far faster than running, ignores input, then returns to run speed', () => {
    const m = new PlayerMotor({ x: 0, z: 0 }, world);
    m.dash({ x: 1, z: 0 }, ABILITIES.dash.speed, ABILITIES.dash.duration);
    for (let t = 0; t < ABILITIES.dash.duration; t += 1 / 60) m.update({ x: -1, z: 0 }, 1 / 60);
    expect(m.state.pos.x).toBeGreaterThan(PLAYER_CONFIG.maxSpeed * ABILITIES.dash.duration * 2);
    expect(m.dashing).toBe(false);
    expect(m.speed).toBeLessThanOrEqual(PLAYER_CONFIG.maxSpeed + 1e-6);
  });

  it('walls still stop a dash', () => {
    const m = new PlayerMotor({ x: 0, z: 0 }, world);
    m.dash({ x: 0, z: -1 }, 200, 1);
    for (let i = 0; i < 60; i++) m.update({ x: 0, z: 0 }, 1 / 60);
    expect(m.state.pos.z).toBeGreaterThan(MUSEUM_BOUNDS.minZ);
  });
});

describe('Missions', () => {
  const r = (o: Partial<RunSummary>): RunSummary => ({ score: 0, time: 0, runCoins: 0, coinsPicked: 0, bestMultiplier: 1, abilityUses: 0, ...o });

  it('run missions keep the best run, total missions add up', () => {
    const ms = [makeMission(0), makeMission(1), makeMission(3)]; // coinsRun 15, abilityTotal 3, runsTotal 3
    applyRun(ms, r({ coinsPicked: 10, abilityUses: 2 }));
    applyRun(ms, r({ coinsPicked: 8, abilityUses: 0 }));
    expect(ms[0]!.progress).toBe(10);
    expect(ms[1]!.progress).toBe(2);
    expect(ms[2]!.progress).toBe(2);
    const done = applyRun(ms, r({ coinsPicked: 20, abilityUses: 5 }));
    expect(done.map((m) => m.kind)).toEqual(['coinsRun', 'abilityTotal', 'runsTotal']);
    expect(ms[1]!.progress).toBe(3); // capped at target
  });

  it('later cycles are harder and pay more; combo targets stay reachable', () => {
    const n = MISSION_POOL.length;
    const a = makeMission(0);
    const b = makeMission(n);
    expect(b.target).toBeGreaterThan(a.target);
    expect(b.coins).toBeGreaterThan(a.coins);
    for (let i = 0; i < n * 6; i++) {
      const m = makeMission(i);
      if (m.kind === 'comboRun') expect(m.target).toBeLessThanOrEqual(MISSIONS.maxCombo);
      expect(describeMission(m).length).toBeGreaterThan(5);
    }
  });
});

describe('SaveManager v3: shop + missions', () => {
  it('migrates a v2 save: keeps progress, adds classic skins and fresh missions', () => {
    const d = migrate({ version: 2, coins: 500, diamonds: 3, ownedHeroes: ['rizal', 'lapulapu'], selectedHero: 'lapulapu' });
    expect(d.version).toBe(3);
    expect(d.coins).toBe(500);
    expect(d.selectedHero).toBe('lapulapu');
    expect(d.equippedSkins.lapulapu).toBe('lapulapu.classic');
    expect(d.ownedSkins).toContain('rizal.classic');
    expect(d.missions).toHaveLength(MISSIONS.active);
  });

  it('rejects tampered skins and mission data', () => {
    const d = migrate({ ownedSkins: ['fake.skin'], equippedSkins: { rizal: 'rizal.puti', gabriela: 'rizal.classic' }, missions: [{ seq: 0, progress: 9999, target: 1, coins: 1e9 }, { seq: 'x' }] });
    expect(d.ownedSkins).not.toContain('fake.skin');
    expect(d.equippedSkins.rizal).toBe('rizal.classic'); // not owned
    expect(d.equippedSkins.gabriela).toBe('gabriela.classic');
    expect(d.missions[0]!.coins).toBe(makeMission(0).coins);
    expect(d.missions[0]!.progress).toBe(makeMission(0).target);
    expect(d.missions).toHaveLength(MISSIONS.active);
  });

  it('skins cost Hiyas, need the hero, never charge twice', () => {
    const s = new SaveManager(memStore());
    const puti = SKINS.find((k) => k.id === 'rizal.puti')!;
    expect(s.buySkin('rizal.puti')).toBe('insufficient');
    s.data.diamonds = puti.cost + 5;
    expect(s.buySkin('lapulapu.dagat')).toBe('locked');
    expect(s.buySkin('rizal.puti')).toBe('ok');
    expect(s.data.diamonds).toBe(5);
    expect(s.buySkin('rizal.puti')).toBe('owned');
    expect(s.data.diamonds).toBe(5);
    expect(s.skinOf('rizal')).toBe('rizal.classic');
    expect(s.equipSkin('rizal.puti')).toBe(true);
    expect(s.skinOf('rizal')).toBe('rizal.puti');
    expect(s.equipSkin('gabriela.berde')).toBe(false);
  });

  it('exchange trades coins for Hiyas at the shop rate only when affordable', () => {
    const s = new SaveManager(memStore());
    s.data.coins = EXCHANGE.coins - 1;
    expect(s.exchange()).toBe(false);
    s.data.coins = EXCHANGE.coins * 2;
    expect(s.exchange()).toBe(true);
    expect(s.data.coins).toBe(EXCHANGE.coins);
    expect(s.data.diamonds).toBe(EXCHANGE.hiyas);
  });

  it('runs progress missions; claiming pays once and brings the next mission', () => {
    const store = memStore();
    const s = new SaveManager(store);
    const first = s.data.missions[0]!;
    const rec = s.recordRun({ score: 100, time: 30, runCoins: first.target, coinsPicked: first.target, bestMultiplier: 1, abilityUses: 0 }, 'rizal');
    expect(rec.completedMissions.map((m) => m.seq)).toContain(first.seq);
    expect(s.claimableMissions).toBe(1);
    const coins = s.data.coins;
    expect(s.claimMission(first.seq)).toEqual({ coins: first.coins, hiyas: first.hiyas });
    expect(s.data.coins).toBe(coins + first.coins);
    expect(s.claimMission(first.seq)).toBeNull();
    expect(s.data.missions.map((m) => m.seq)).toEqual([MISSIONS.active, 1, 2]);
    expect(new SaveManager(store).data.missions[0]!.seq).toBe(MISSIONS.active); // persisted
    expect(s.claimMission(1)).toBeNull(); // not finished
  });
});
