import { describe, expect, it } from 'vitest';
import { GAME_TRANSITIONS, StateMachine, type GameState } from '../../src/core/StateMachine';
import { LORE, LORE_CUES, LORE_SCENES, VIGNETTE } from '../../src/data/lore';
import { ease, LoreTimeline, type LoreEvent } from '../../src/gameplay/LoreTimeline';

const play = (tl: LoreTimeline, seconds: number, dt = 1 / 60): LoreEvent[] => {
  const out: LoreEvent[] = [];
  for (let t = 0; t < seconds && !tl.done; t += dt) out.push(...tl.update(dt));
  return out;
};

describe('lore data', () => {
  it('scenes are back to back, about a minute, and every hero gets an equal vignette', () => {
    let t = 0;
    for (const s of LORE_SCENES) {
      expect(s.start).toBeCloseTo(t, 6);
      t += s.dur;
    }
    expect(LORE.duration).toBeCloseTo(60, 6);
    const v = LORE_SCENES.filter((s) => s.hero);
    expect(v.map((s) => s.hero)).toEqual(['lapulapu', 'gabriela', 'rizal', 'bonifacio']);
    expect(new Set(v.map((s) => s.dur)).size).toBe(1);
  });

  it('camera shots stay 1.5-5 s (cut on action) and start at 0', () => {
    for (const s of LORE_SCENES) {
      expect(s.cams[0]!.at).toBe(0);
      if (s.cams.length < 2) continue;
      s.cams.forEach((c, i) => {
        const end = s.cams[i + 1]?.at ?? s.dur;
        expect(end - c.at).toBeGreaterThanOrEqual(1.5);
        expect(end - c.at).toBeLessThanOrEqual(5);
      });
    }
  });

  it('vignette beats are in order (anticipation before the pull)', () => {
    const b = [VIGNETTE.crack, VIGNETTE.startle, VIGNETTE.open, VIGNETTE.resist, VIGNETTE.windup, VIGNETTE.sip, VIGNETTE.flash, VIGNETTE.close];
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]!);
    expect(VIGNETTE.close).toBeLessThan(VIGNETTE.dur);
  });

  it('bubbles and cues sit inside their scenes, every bubble has a name and pitch', () => {
    for (const s of LORE_SCENES) for (const bb of s.bubbles) {
      expect(bb.until).toBeGreaterThan(bb.at);
      expect(bb.until).toBeLessThanOrEqual(s.dur);
      expect(bb.text.length).toBeGreaterThan(0);
      expect(LORE.voice[bb.who]).toBeDefined();
    }
    for (const c of LORE_CUES) {
      const s = LORE_SCENES.find((x) => x.id === c.scene)!;
      expect(s).toBeDefined();
      expect(c.at).toBeLessThan(s.dur);
    }
  });
});

describe('LoreTimeline', () => {
  it('plays every scene in order, fires every cue once, then ends', () => {
    const tl = new LoreTimeline();
    const ev = play(tl, LORE.duration + 1);
    const scenes = ev.filter((e) => e.type === 'scene').map((e) => (e.type === 'scene' ? e.scene.id : ''));
    expect(scenes).toEqual(LORE_SCENES.map((s) => s.id));
    expect(ev.filter((e) => e.type === 'sfx')).toHaveLength(LORE_CUES.length);
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

  it('seek jumps without replaying passed sounds, then continues normally', () => {
    const tl = new LoreTimeline();
    const manila = LORE_SCENES.find((s) => s.id === 'manila')!;
    const ev = tl.seek(manila.start + VIGNETTE.sip + 0.1);
    expect(ev.some((e) => e.type === 'sfx')).toBe(false);
    expect(tl.scene.id).toBe('manila');
    expect(tl.cam.index).toBe(manila.cams.length - 1);
    const next = play(tl, 1);
    expect(next.filter((e) => e.type === 'sfx').map((e) => (e.type === 'sfx' ? e.sfx : ''))).toEqual(['flash']);
  });

  it('camera eases from the shot start to its end pose', () => {
    const tl = new LoreTimeline();
    const s = LORE_SCENES[1]!;
    tl.seek(s.start + 0.0001);
    const a = tl.camPose();
    expect(a.pos[0]).toBeCloseTo(s.cams[0]!.pos0[0], 2);
    tl.seek(s.start + s.cams[1]!.at - 0.0001);
    const b = tl.camPose();
    expect(b.pos[0]).toBeCloseTo(s.cams[0]!.pos1[0], 2);
  });

  it('easing curves start at 0 and land on 1 (back overshoots in between)', () => {
    for (const k of ['linear', 'inOut', 'out', 'back'] as const) {
      expect(ease(k, 0)).toBeCloseTo(0, 6);
      expect(ease(k, 1)).toBeCloseTo(1, 6);
    }
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => ease('back', t)))).toBeGreaterThan(1);
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
