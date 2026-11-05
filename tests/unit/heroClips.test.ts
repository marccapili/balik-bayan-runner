import { describe, expect, it } from 'vitest';
import { HERO_CLIP, HERO_CLIPS, heroClipSources } from '../../src/data/heroClips';
import { HEROES, type HeroId } from '../../src/data/heroes';
import film from '../../cutscene/src/scenes/heroclips.js?raw';

describe('hero start clips', () => {
  const ids = Object.keys(HEROES) as HeroId[];

  it('every hero has a clip, with WebM first and an MP4 fallback', () => {
    for (const id of ids) {
      expect(HERO_CLIPS[id].line.length).toBeGreaterThan(0);
      const src = heroClipSources(id);
      expect(src.map((s) => s.type)).toEqual(['video/webm', 'video/mp4']);
      expect(src[0]!.src).toBe(`lore/start-${id}.webm`);
    }
  });

  it('the painted lines and name-card titles match the game data', () => {
    for (const id of ids) {
      const block = new RegExp(`${id}: \\{\\s*line: '([^']*)', title: '([^']*)'`).exec(film);
      expect(block, id).not.toBeNull();
      expect(block![1]).toBe(HERO_CLIPS[id].line);
      expect(block![2]).toBe(HEROES[id].title);
    }
  });

  it('stays short and gives up quickly on a slow network', () => {
    expect(HERO_CLIP.duration).toBeLessThanOrEqual(5);
    expect(HERO_CLIP.startTimeout).toBeLessThanOrEqual(2);
    expect(film).toContain(`LEN = ${HERO_CLIP.duration}`);
  });
});
