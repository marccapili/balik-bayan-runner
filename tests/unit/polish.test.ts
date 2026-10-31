import { describe, expect, it } from 'vitest';
import { MUSIC } from '../../src/data/audio';
import { migrate } from '../../src/core/SaveManager';
import { Tutorial, TIP_SECONDS } from '../../src/gameplay/Tutorial';

const idle = { moved: 0, openedExhibit: false, usedAbility: false, holdingGadget: false, usedGadget: false };

describe('First-run tutorial', () => {
  it('shows move → exhibit → ability in order, each until done or timed out', () => {
    const t = new Tutorial();
    expect(t.update(0.1, idle)).toBe('move');
    // Doing the thing clears the tip (after it was readable for 2 s).
    t.update(1, { ...idle, moved: 10 });
    expect(t.tip).toBe('move');
    t.update(1.5, { ...idle, moved: 10 });
    expect(t.update(0.1, { ...idle, moved: 10 })).toBe('exhibit');
    for (let i = 0; i < TIP_SECONDS.exhibit * 10 + 5; i++) t.update(0.1, idle);
    expect(t.update(0.1, idle)).toBe('ability');
  });

  it('gadget tip waits for the first held gadget, then the tutorial is done', () => {
    const t = new Tutorial();
    for (let i = 0; i < 400; i++) t.update(0.1, idle);
    expect(t.done).toBe(false);
    expect(t.update(0.1, { ...idle, holdingGadget: true })).toBe('gadget');
    t.dismiss();
    t.update(0.1, idle);
    expect(t.done).toBe(true);
  });
});

describe('Settings (phase 7)', () => {
  it('migrates old saves with sane defaults and clamps volumes', () => {
    const d = migrate({ version: 5, runs: 3, settings: { muted: true, musicVolume: 7, sfxVolume: -1, quality: 'ultra' } });
    expect(d.settings.muted).toBe(true);
    expect(d.settings.musicVolume).toBe(1);
    expect(d.settings.sfxVolume).toBe(0);
    expect(d.settings.quality).toBe('auto');
    // Returning players skip the first-run tips.
    expect(d.settings.tutorialDone).toBe(true);
    expect(migrate(null).settings.tutorialDone).toBe(false);
  });
});

describe('Music data', () => {
  it('every loop has two bars of melody on the pentatonic scale and a full root progression', () => {
    for (const song of Object.values(MUSIC.tracks)) {
      expect(song.melody.length).toBe(32);
      expect(song.gong.length).toBe(16);
      expect(song.bass.length).toBe(16);
      expect(song.roots.length).toBe(song.bars);
      for (const n of song.melody) if (n !== null) expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});
