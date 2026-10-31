import { describe, expect, it } from 'vitest';
import { cleanNickname, migrate, SaveManager } from '../../src/core/SaveManager';
import { INTRO, LEADERBOARD } from '../../src/data/lobby';
import { IntroSequence, type IntroEvent } from '../../src/gameplay/IntroSequence';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('IntroSequence', () => {
  const run = (seq: IntroSequence, seconds: number, drop = false) => {
    const ev: IntroEvent[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) ev.push(...seq.update(1 / 60, drop));
    return ev;
  };

  it('floats and waits forever until the player drops', () => {
    const seq = new IntroSequence();
    expect(run(seq, INTRO.revealSeconds + 0.1)).toContain('awaitDrop');
    run(seq, 30);
    expect(seq.phase).toBe('float');
    expect(seq.heroY).toBeGreaterThan(INTRO.floatHeight - INTRO.floatBob - 0.01);
  });

  it('ignores taps during the reveal', () => {
    const seq = new IntroSequence();
    run(seq, 0.5, true);
    expect(seq.phase).toBe('reveal');
  });

  it('falls with accelerating speed, lands, then the guard reacts and the chase starts', () => {
    const seq = new IntroSequence();
    run(seq, INTRO.revealSeconds + 0.1);
    const ev = seq.update(1 / 60, true);
    expect(ev).toEqual(['drop']);
    const ys: number[] = [];
    const all: IntroEvent[] = [];
    for (let i = 0; i < 600 && seq.phase !== 'done'; i++) {
      all.push(...seq.update(1 / 60, false));
      if (seq.phase === 'fall') ys.push(seq.heroY);
    }
    // Hop up first, then accelerate downwards (each step drops more than the last).
    const peak = ys.indexOf(Math.max(...ys));
    const d1 = ys[peak + 5]! - ys[peak + 6]!;
    const d2 = ys[peak + 15]! - ys[peak + 16]!;
    expect(d2).toBeGreaterThan(d1);
    expect(all).toEqual(['landed', 'guardTurns', 'guardAlert', 'chase']);
    expect(seq.heroY).toBe(0);
    expect(seq.phase).toBe('done');
  });
});

const run = (score: number, time: number, runCoins: number) => ({ score, time, runCoins, coinsPicked: runCoins, bestMultiplier: 1, abilityUses: 0, exhibits: 0 });

describe('SaveManager v2', () => {
  it('migrates a v1 save (keeps wallet, best, mute)', () => {
    const d = migrate({ version: 1, coins: 42, diamonds: 0, bestScore: 900, bestTime: 61.5, runs: 3, muted: true });
    expect(d.version).toBe(4);
    expect(d.coins).toBe(42);
    expect(d.bestScore).toBe(900);
    expect(d.settings.muted).toBe(true);
    expect(d.ownedHeroes).toEqual(['rizal']);
    expect(d.selectedHero).toBe('rizal');
  });

  it('repairs corrupted values', () => {
    const d = migrate({ coins: -50, ownedHeroes: ['rizal', 'batman', 'gabriela'], selectedHero: 'bonifacio', leaderboard: [{ name: '<script>', score: 5, hero: 'rizal' }, 7] });
    expect(d.coins).toBe(0);
    expect(d.ownedHeroes).toEqual(['rizal', 'gabriela']);
    expect(d.selectedHero).toBe('rizal'); // not owned → falls back
    expect(d.leaderboard).toEqual([]);
    expect(migrate("garbage").version).toBe(4);
  });

  it('unlocks heroes without going negative or charging twice', () => {
    const s = new SaveManager(memStore());
    s.data.coins = 350;
    expect(s.unlockHero('bonifacio')).toBe('insufficient');
    expect(s.data.coins).toBe(350);
    expect(s.unlockHero('lapulapu')).toBe('ok');
    expect(s.data.coins).toBe(50);
    expect(s.unlockHero('lapulapu')).toBe('owned');
    expect(s.data.coins).toBe(50);
    expect(s.selectHero('lapulapu')).toBe(true);
    expect(s.selectHero('gabriela')).toBe(false);
  });

  it('persists across reloads', () => {
    const store = memStore();
    const a = new SaveManager(store);
    a.data.coins = 1000;
    a.unlockHero('gabriela');
    a.selectHero('gabriela');
    const b = new SaveManager(store);
    expect(b.data.ownedHeroes).toContain('gabriela');
    expect(b.data.selectedHero).toBe('gabriela');
    expect(b.data.coins).toBe(300);
  });

  it('validates nicknames', () => {
    expect(cleanNickname('  Juan   Dela Cruz ')).toBe('Juan Dela Cruz');
    expect(cleanNickname('a')).toBeNull();
    expect(cleanNickname('x'.repeat(LEADERBOARD.nameMax + 1))).toBeNull();
    expect(cleanNickname('<b>hi</b>')).toBeNull();
    expect(cleanNickname('Ñiño_23')).toBe('Ñiño_23');
  });

  it('leaderboard keeps one best row per nickname, sorted, capped', () => {
    const s = new SaveManager(memStore());
    s.setNickname('Rei');
    s.recordRun(run(500, 40, 3), 'rizal');
    s.recordRun(run(300, 20, 1), 'rizal');
    expect(s.data.leaderboard).toHaveLength(1);
    expect(s.data.leaderboard[0]!.score).toBe(500);
    s.recordRun(run(800, 50, 2), 'rizal');
    expect(s.data.leaderboard[0]!.score).toBe(800);
    for (let i = 0; i < 15; i++) {
      s.setNickname(`P${i}x`);
      s.recordRun(run(100 + i, 10, 0), 'rizal');
    }
    expect(s.data.leaderboard).toHaveLength(LEADERBOARD.size);
    expect(s.data.leaderboard[0]!.name).toBe('Rei');
    expect(s.data.coins).toBe(6);
  });

  it('reset wipes progress', () => {
    const s = new SaveManager(memStore());
    s.data.coins = 999;
    s.reset();
    expect(s.data.coins).toBe(0);
  });
});
