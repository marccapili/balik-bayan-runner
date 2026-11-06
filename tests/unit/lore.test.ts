import { describe, expect, it } from 'vitest';
import { GAME_TRANSITIONS, StateMachine, type GameState } from '../../src/core/StateMachine';
import { LORE, LORE_SCENES } from '../../src/data/lore';
import { LoreTimeline, type LoreEvent } from '../../src/gameplay/LoreTimeline';
import filmLines from '../../cutscene/src/scenes/lines.js?raw';

const play = (tl: LoreTimeline, seconds: number, dt = 1 / 60): LoreEvent[] => {
  const out: LoreEvent[] = [];
  for (let t = 0; t < seconds && !tl.done; t += dt) out.push(...tl.update(dt));
  return out;
};

describe('lore data', () => {
  it('scenes are back to back, under a minute, and every hero gets an equal vignette', () => {
    let t = 0;
    for (const s of LORE_SCENES) {
      expect(s.start).toBeCloseTo(t, 6);
      t += s.dur;
    }
    expect(LORE.duration).toBeGreaterThan(45);
    expect(LORE.duration).toBeLessThan(60);
    const v = LORE_SCENES.filter((s) => s.hero);
    expect(v.map((s) => s.hero)).toEqual(['lapulapu', 'gabriela', 'rizal', 'bonifacio']);
    expect(new Set(v.map((s) => s.dur)).size).toBe(1);
  });

  it('every vignette has an era card, and bubbles in a scene never overlap', () => {
    for (const s of LORE_SCENES) {
      if (s.hero) expect(s.era).toBeTruthy();
      s.bubbles.forEach((b, i) => {
        const next = s.bubbles[i + 1];
        if (next) expect(next.at).toBeGreaterThanOrEqual(b.until);
      });
    }
  });

  it('every line stays up long enough to read (~14 characters a second)', () => {
    for (const s of LORE_SCENES) for (const b of s.bubbles) expect(b.until - b.at).toBeGreaterThanOrEqual(Math.min(2.4, b.text.length / 14 - 0.6));
  });

  it('bubbles sit inside their scenes, every speaker has a name entry', () => {
    for (const s of LORE_SCENES) for (const bb of s.bubbles) {
      expect(bb.until).toBeGreaterThan(bb.at);
      expect(bb.until).toBeLessThanOrEqual(s.dur);
      expect(bb.text.length).toBeGreaterThan(0);
      expect(LORE.names[bb.who]).toBeDefined();
    }
  });
});

describe('LoreTimeline', () => {
  it('plays every scene in order, then ends', () => {
    const tl = new LoreTimeline();
    const ev = play(tl, LORE.duration + 1);
    const scenes = ev.filter((e) => e.type === 'scene').map((e) => (e.type === 'scene' ? e.scene.id : ''));
    expect(scenes).toEqual(LORE_SCENES.map((s) => s.id));
    const ends = ev.filter((e) => e.type === 'end');
    expect(ends).toEqual([{ type: 'end', skipped: false }]);
    expect(tl.done).toBe(true);
    expect(tl.update(1)).toEqual([]);
  });

  it('shows each bubble while its window is open and clears it after', () => {
    const tl = new LoreTimeline();
    const s = LORE_SCENES.find((x) => x.id === 'guard')!;
    tl.seek(s.start + s.bubbles[0]!.at + 0.05);
    expect(tl.currentBubble?.text).toContain('HOY');
    tl.seek(s.start + s.bubbles[0]!.until + 0.05);
    expect(tl.currentBubble?.text ?? '').not.toContain('HOY');
  });

  it('skip ends at once, from any point, exactly once', () => {
    const tl = new LoreTimeline();
    play(tl, 0.5);
    expect(tl.skip()).toEqual([{ type: 'end', skipped: true }]);
    expect(tl.skip()).toEqual([]);
    expect(tl.update(1 / 60)).toEqual([]);
  });

  it('seek jumps to a scene, then continues normally', () => {
    const tl = new LoreTimeline();
    const manila = LORE_SCENES.find((s) => s.id === 'manila')!;
    tl.seek(manila.start + 5.86);
    expect(tl.scene.id).toBe('manila');
    const next = play(tl, 3);
    expect(next.filter((e) => e.type === 'scene').map((e) => (e.type === 'scene' ? e.scene.id : ''))).toEqual(['tunnel']);
  });

  it('follows the video clock: syncTo fires what it passes and never runs backwards', () => {
    const tl = new LoreTimeline();
    const ev = tl.syncTo(7.5);
    expect(tl.scene.id).toBe('mactan');
    expect(ev.filter((e) => e.type === 'scene')).toHaveLength(2);
    expect(tl.syncTo(1)).toEqual([]);
    expect(tl.time).toBeCloseTo(7.5, 6);
    expect(tl.syncTo(LORE.duration + 0.2)).toContainEqual({ type: 'end', skipped: false });
    expect(tl.done).toBe(true);
  });
});

describe('lore state flow', () => {
  it('boot → lore → lobby, and the lobby can replay it', () => {
    const f = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
    expect(f.transition('lore')).toBe(true);
    expect(f.can('playing')).toBe(false);
    expect(f.transition('lobby')).toBe(true);
    expect(f.transition('lore')).toBe(true);
  });
});

describe('lore film text', () => {
  it('the painted film (cutscene/src/scenes/lines.js) has the same scenes, eras and lines as data/lore.ts', () => {
    const src = filmLines;
    const win: { LORE_FILM?: { scenes: { id: string; start: number; era: string | null; lines: [number, number, string, string][] }[] } } = {};
    new Function('window', src)(win);
    const film = win.LORE_FILM!.scenes;
    expect(film.map((s) => [s.id, s.start, s.era ?? undefined])).toEqual(LORE_SCENES.map((s) => [s.id, s.start, s.era]));
    film.forEach((s, i) => expect(s.lines).toEqual(LORE_SCENES[i]!.bubbles.map((b) => [b.at, b.until, b.who, b.text])));
  });
});
