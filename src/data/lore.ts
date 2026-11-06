/**
 * Opening lore cutscene ("Balik Bayan"): four heroes from four eras get sipped by time portals
 * into a 2026 museum. Plays after loading every launch (skippable).
 *
 * The cutscene is a pre-rendered, hand-painted 2D video (`public/lore/intro.webm` + `.mp4`, made with the
 * ClaudeAnimationBase kit in `cutscene/`; storyboard in `cutscene/STORYBOARD.md`). The Taglish
 * speech bubbles, era cards and title are painted into the picture, and its soundtrack (score, SFX,
 * chibi babble: `cutscene/sound/score.py`) is baked into the files. This file keeps the scenes and
 * lines on the same clock for the progress bar and a screen-reader copy of each line. The engine-free `gameplay/LoreTimeline.ts` plays it;
 * `ui/LorePlayer.ts` shows it.
 *
 * The film reads the same scenes, lines and eras from `cutscene/src/scenes/lines.js` (a unit test
 * keeps the two equal). Keep scene times in step with `shots([...])` in
 * `cutscene/src/scenes/lore.js`, line times with its `talk(...)` lip flaps, and
 * sound times with `cutscene/sound/score.py`.
 */
import type { HeroId } from './heroes';

export type Speaker = HeroId | 'guard' | 'all' | 'narrator';

export interface LoreBubble {
  at: number;
  until: number;
  who: Speaker;
  text: string;
}

export interface LoreScene {
  id: string;
  start: number;
  dur: number;
  /** Era card ("Mactan, 1521"), typed on at the start of the scene. */
  era?: string;
  /** The hero this vignette is about (vignettes only). */
  hero?: HeroId;
  bubbles: readonly LoreBubble[];
}

/** The video under `public/` (served from the site base): VP9 WebM first, H.264 MP4 for Safari. */
export const LORE_VIDEO: readonly { src: string; type: string }[] = [
  { src: 'lore/intro.webm', type: 'video/webm' },
  { src: 'lore/intro.mp4', type: 'video/mp4' },
];

/** Each hero vignette: portal opens → reaction + line → sipped → a beat after. */
const V = 8;

export const LORE_SCENES: readonly LoreScene[] = [
  /** Credits card: who made the game (painted, no lines). */
  { id: 'credits', start: 0, dur: 3, bubbles: [] },
  { id: 'title', start: 3, dur: 4, bubbles: [{ at: 0.5, until: 2.9, who: 'narrator', text: 'May nawawalang mga bayani…' }] },
  {
    id: 'mactan',
    hero: 'lapulapu',
    era: 'Mactan, 1521',
    start: 7,
    dur: V,
    bubbles: [{ at: 2.1, until: 4.2, who: 'lapulapu', text: 'Ano ’tong ilaw sa dagat?!' }],
  },
  {
    id: 'ilocos',
    hero: 'gabriela',
    era: 'Ilocos, 1763',
    start: 15,
    dur: V,
    bubbles: [{ at: 3.75, until: 5.6, who: 'gabriela', text: 'Ano ito?' }],
  },
  {
    id: 'dapitan',
    hero: 'rizal',
    era: 'Dapitan, 1890s',
    start: 23,
    dur: V,
    bubbles: [{ at: 2.55, until: 4.6, who: 'rizal', text: 'Teka, hindi pa tapos ’yung sulat ko!' }],
  },
  {
    id: 'manila',
    hero: 'bonifacio',
    era: 'Maynila, 1896',
    start: 31,
    dur: V,
    bubbles: [
      { at: 0.25, until: 1.75, who: 'bonifacio', text: 'Para sa Inang Bayan!' },
      { at: 2.05, until: 3.3, who: 'bonifacio', text: 'Ha? Ano ’yon?!' },
      { at: 3.35, until: 5.2, who: 'bonifacio', text: 'Hindi ako takot sa ’yo!' },
    ],
  },
  { id: 'tunnel', start: 39, dur: 5, bubbles: [{ at: 2.0, until: 3.8, who: 'bonifacio', text: 'SINO KA?! …SINO KAYO?!' }] },
  { id: 'museum', era: 'Museo, 2026', start: 44, dur: 6, bubbles: [{ at: 3.3, until: 5.5, who: 'gabriela', text: 'Nasaan tayo? Kailangan natin malaman!' }] },
  {
    id: 'guard',
    start: 50,
    dur: 5.5,
    bubbles: [
      { at: 0.65, until: 2.45, who: 'guard', text: 'HOY! Bawal ’yan dito!' },
      { at: 2.55, until: 3.7, who: 'bonifacio', text: 'TAKBO!!!' },
    ],
  },
  { id: 'logo', start: 55.5, dur: 4, bubbles: [] },
];

export const LORE = {
  duration: LORE_SCENES.reduce((s, x) => Math.max(s, x.start + x.dur), 0),
  /** Skip chip fades after this long without input; a tap wakes it. */
  skipFade: 3,
  /** If the video has not started this long after Play (slow network, blocked media), skip the intro. */
  loadTimeout: 8,
  /** Display names on speech bubbles. */
  names: { lapulapu: 'Lapu-Lapu', gabriela: 'Gabriela Silang', rizal: 'José Rizal', bonifacio: 'Andrés Bonifacio', guard: 'Guard', all: 'Lahat', narrator: '' } as Record<Speaker, string>,
} as const;
