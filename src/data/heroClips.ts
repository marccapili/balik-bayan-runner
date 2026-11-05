/**
 * Hero start clips: a ~4 s hand-painted 2D clip of the chosen hero (burst in, signature pose and line, name
 * card, dash off) that plays when you press PLAY, between the portal wipe and the museum. Pre-rendered like the
 * lore intro (`cutscene/src/scenes/heroclips.js`, sound `cutscene/sound/clips.py`), with picture and sound in
 * `public/lore/start-<hero>.webm` / `.mp4`. The lines and titles are painted in; a unit test keeps this copy
 * (used for screen readers) equal to heroclips.js. Tap anywhere, Skip, Esc, Enter or Space skips one.
 */
import type { HeroId } from './heroes';

export interface HeroClip {
  line: string;
}

export const HERO_CLIPS: Record<HeroId, HeroClip> = {
  lapulapu: { line: 'Tara! Laban lang!' },
  gabriela: { line: 'Walang aatras!' },
  rizal: { line: 'Pag-aralan natin ’to!' },
  bonifacio: { line: 'Sugod, mga kapatid!' },
};

export const HERO_CLIP = {
  /** Clip length (s). */
  duration: 4,
  /** If the clip hasn't started this long after PLAY (slow network), go straight to the museum. */
  startTimeout: 1.5,
} as const;

/** Video sources for a hero's clip under `public/` (VP9 WebM first, H.264 MP4 for Safari). */
export const heroClipSources = (id: HeroId): { src: string; type: string }[] => [
  { src: `lore/start-${id}.webm`, type: 'video/webm' },
  { src: `lore/start-${id}.mp4`, type: 'video/mp4' },
];
