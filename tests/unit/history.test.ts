import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../src/ai/NavGrid';
import { migrate, SaveManager } from '../../src/core/SaveManager';
import { GAME_TRANSITIONS, StateMachine, type GameState } from '../../src/core/StateMachine';
import { PLAYER_CONFIG } from '../../src/data/config';
import { EXHIBIT_BY_ID, EXHIBITS } from '../../src/data/exhibits';
import { SCORING } from '../../src/data/gameplay';
import { MISSION_POOL } from '../../src/data/missions';
import { buildColliders, MUSEUM_BOUNDS, ROOMS, roomAt } from '../../src/data/museumLayout';
import { exhibitInReach } from '../../src/history/exhibitMath';
import { applyRun, describe as describeMission, makeMission, type RunSummary } from '../../src/gameplay/Missions';
import { SurvivalRun } from '../../src/gameplay/SurvivalRun';
import { CollisionWorld, resolveCircleAabb } from '../../src/physics/Collision';

const boxes = buildColliders();
const nav = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.45);
const sight = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.05);
const world = new CollisionWorld(boxes);
const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, 0.7).walkableCells();
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const free = (p: { x: number; z: number }) => boxes.every((b) => !resolveCircleAabb(p, PLAYER_CONFIG.radius, b));

describe('Exhibit content', () => {
  it('has at least five history entries, unique ids, and every entry is sourced', () => {
    expect(EXHIBITS.filter((e) => e.kind !== 'folklore').length).toBeGreaterThanOrEqual(5);
    expect(new Set(EXHIBITS.map((e) => e.id)).size).toBe(EXHIBITS.length);
    for (const e of EXHIBITS) {
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      expect(e.body.length, e.id).toBeGreaterThanOrEqual(2);
      for (const s of e.sources) expect(s.length, e.id).toBeGreaterThan(20);
    }
  });

  it('covers the five topics the brief asks for', () => {
    for (const id of ['mactan', 'rizal', 'katipunan', 'gabriela', 'american-japanese']) expect(EXHIBIT_BY_ID[id], id).toBeDefined();
  });

  it('folklore entries say they are folklore, not history', () => {
    const folk = EXHIBITS.filter((e) => e.kind === 'folklore');
    expect(folk.length).toBeGreaterThan(0);
    for (const e of folk) {
      expect(e.room).toBe('folklore');
      expect(e.body.join(' ')).toMatch(/folklore/i);
    }
  });

  it('every gallery has at least one exhibit, placed inside its own room', () => {
    for (const r of ROOMS) expect(EXHIBITS.some((e) => e.room === r.id), r.id).toBe(true);
    for (const e of EXHIBITS) expect(roomAt(e.at.x, e.at.z)?.id, e.id).toBe(e.room);
  });

  it('every exhibit can actually be reached: some free floor spot lies within its reach', () => {
    for (const e of EXHIBITS) {
      let ok = false;
      for (let a = 0; a < 32 && !ok; a++) {
        const ang = (a / 32) * Math.PI * 2;
        const p = { x: e.at.x + Math.sin(ang) * (e.reach - 0.15), z: e.at.z + Math.cos(ang) * (e.reach - 0.15) };
        ok = free(p) && exhibitInReach(p) === e;
      }
      expect(ok, e.id).toBe(true);
    }
  });
});

describe('exhibitInReach', () => {
  it('finds the exhibit only inside its reach', () => {
    const e = EXHIBIT_BY_ID.manunggul!;
    expect(exhibitInReach({ x: e.at.x + e.reach - 0.1, z: e.at.z })).toBe(e);
    expect(exhibitInReach({ x: e.at.x + e.reach + 0.1, z: e.at.z })).toBeNull();
    expect(exhibitInReach({ x: 0, z: 0 })).toBeNull(); // spawn is not next to anything
  });
});

describe('Discovering in a run', () => {
  it('pays the discovery bonus once per exhibit per run, never in training', () => {
    const run = new SurvivalRun(nav, sight, world, spots);
    run.reset({ x: 0, z: 0 }, 'sprint');
    expect(run.discover('rizal')).toBe(SCORING.artifactDiscovery);
    expect(run.discover('rizal')).toBe(0);
    expect(run.score.score).toBe(SCORING.artifactDiscovery);
    expect(run.score.discoveries).toBe(1);
    const ev = run.update(1 / 30, { x: 0, z: 0 });
    expect(ev.filter((e) => e.type === 'discovered')).toHaveLength(1);
    // A new run can earn it again.
    run.reset({ x: 0, z: 0 }, 'sprint');
    expect(run.discover('rizal')).toBe(SCORING.artifactDiscovery);
    run.reset({ x: 0, z: 0 }, 'sprint', true);
    expect(run.discover('mactan')).toBe(0);
    expect(run.score.score).toBe(0);
  });

  it('reading is a frozen state: playing ⇄ reading, no shortcut to game over', () => {
    const fsm = new StateMachine<GameState>('playing', GAME_TRANSITIONS);
    expect(fsm.transition('reading')).toBe(true);
    expect(fsm.can('gameover')).toBe(false);
    expect(fsm.can('paused')).toBe(false);
    expect(fsm.transition('playing')).toBe(true);
  });
});

describe('Archive save (v4)', () => {
  it('records each exhibit once and survives a reload', () => {
    const store = memStore();
    const s = new SaveManager(store);
    expect(s.discover('balangay')).toBe(true);
    expect(s.discover('balangay')).toBe(false);
    expect(s.discover('not-a-real-exhibit')).toBe(false);
    expect(new SaveManager(store).data.discovered).toEqual(['balangay']);
  });

  it('migrates older saves to an empty archive and drops unknown or duplicate ids', () => {
    expect(migrate({ version: 3, coins: 5 }).discovered).toEqual([]);
    expect(migrate({ version: 4, discovered: ['rizal', 'rizal', 'ufo', 7] }).discovered).toEqual(['rizal']);
  });
});

describe('Exhibit mission', () => {
  it('"discover N exhibits in a run" keeps the best run', () => {
    const seq = MISSION_POOL.findIndex((t) => t.kind === 'exhibitsRun');
    expect(seq).toBeGreaterThanOrEqual(0);
    const m = makeMission(seq);
    expect(describeMission(m)).toMatch(/exhibit/);
    const r = (exhibits: number): RunSummary => ({ score: 0, time: 0, runCoins: 0, coinsPicked: 0, bestMultiplier: 1, abilityUses: 0, exhibits });
    applyRun([m], r(1));
    applyRun([m], r(0));
    expect(m.progress).toBe(1);
    expect(applyRun([m], r(m.target))).toHaveLength(1);
  });
});
