/**
 * Opening lore cutscene ("Balik Bayan"): four heroes from four eras get sipped by time portals
 * into a 2026 museum. Plays after loading every launch (skippable).
 *
 * The picture is a pre-rendered, hand-painted 2D video (`public/lore/intro.webm` + `.mp4`, made with the
 * ClaudeAnimationBase kit in `cutscene/`; storyboard in `cutscene/STORYBOARD.md`). The Taglish
 * speech bubbles, era cards and title are painted into the video; this file times what the game
 * adds on the same clock: sound cues, chibi babble for each line, music intensity, and a
 * screen-reader copy of each line. The engine-free `gameplay/LoreTimeline.ts` plays it;
 * `ui/LorePlayer.ts` shows it.
 *
 * The film reads the same scenes, lines and eras from `cutscene/src/scenes/lines.js` (a unit test
 * keeps the two equal). Keep scene times in step with `shots([...])` in
 * `cutscene/src/scenes/lore.js` and line times with its `talk(...)` lip flaps.
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

/** Sound cue at scene-local time `at`. */
export interface LoreCue {
  scene: string;
  at: number;
  sfx: LoreSfx;
}

export type LoreSfx = 'crack' | 'whoosh' | 'sip' | 'flash' | 'land' | 'coins' | 'alert' | 'bark' | 'whoo' | 'neigh' | 'page' | 'run' | 'logo';

/** The video under `public/` (served from the site base): VP9 WebM first, H.264 MP4 for Safari. */
export const LORE_VIDEO: readonly { src: string; type: string }[] = [
  { src: 'lore/intro.webm', type: 'video/webm' },
  { src: 'lore/intro.mp4', type: 'video/mp4' },
];

/** Each hero vignette: portal opens → reaction + line → sipped → a beat after. */
const V = 8;

export const LORE_SCENES: readonly LoreScene[] = [
  { id: 'title', start: 0, dur: 4, bubbles: [{ at: 0.5, until: 2.9, who: 'narrator', text: 'May nawawalang mga bayani…' }] },
  {
    id: 'mactan',
    hero: 'lapulapu',
    era: 'Mactan, 1521',
    start: 4,
    dur: V,
    bubbles: [{ at: 2.1, until: 4.2, who: 'lapulapu', text: 'Ano ’tong ilaw sa dagat?!' }],
  },
  {
    id: 'ilocos',
    hero: 'gabriela',
    era: 'Ilocos, 1763',
    start: 12,
    dur: V,
    bubbles: [{ at: 3.75, until: 5.6, who: 'gabriela', text: 'Ano ito?' }],
  },
  {
    id: 'dapitan',
    hero: 'rizal',
    era: 'Dapitan, 1890s',
    start: 20,
    dur: V,
    bubbles: [{ at: 2.55, until: 4.6, who: 'rizal', text: 'Teka, hindi pa tapos ’yung sulat ko!' }],
  },
  {
    id: 'manila',
    hero: 'bonifacio',
    era: 'Maynila, 1896',
    start: 28,
    dur: V,
    bubbles: [
      { at: 0.25, until: 1.75, who: 'bonifacio', text: 'Para sa Inang Bayan!' },
      { at: 2.05, until: 3.3, who: 'bonifacio', text: 'Ha? Ano ’yon?!' },
      { at: 3.35, until: 5.2, who: 'bonifacio', text: 'Hindi ako takot sa ’yo!' },
    ],
  },
  { id: 'tunnel', start: 36, dur: 5, bubbles: [{ at: 2.0, until: 3.8, who: 'bonifacio', text: 'SINO KA?! …SINO KAYO?!' }] },
  { id: 'museum', era: 'Museo, 2026', start: 41, dur: 6, bubbles: [{ at: 3.3, until: 5.5, who: 'gabriela', text: 'Nasaan tayo? Kailangan natin malaman!' }] },
  {
    id: 'guard',
    start: 47,
    dur: 5.5,
    bubbles: [
      { at: 0.65, until: 2.45, who: 'guard', text: 'HOY! Bawal ’yan dito!' },
      { at: 2.55, until: 3.7, who: 'bonifacio', text: 'TAKBO!!!' },
    ],
  },
  { id: 'logo', start: 52.5, dur: 4, bubbles: [] },
];

export const LORE_CUES: readonly LoreCue[] = [
  { scene: 'title', at: 2.1, sfx: 'crack' },
  { scene: 'title', at: 3.2, sfx: 'flash' },
  { scene: 'mactan', at: 1.5, sfx: 'whoosh' },
  { scene: 'mactan', at: 5.6, sfx: 'sip' },
  { scene: 'mactan', at: 6.4, sfx: 'flash' },
  { scene: 'ilocos', at: 1.9, sfx: 'whoosh' },
  { scene: 'ilocos', at: 2.1, sfx: 'neigh' },
  { scene: 'ilocos', at: 3.15, sfx: 'land' },
  { scene: 'ilocos', at: 5.5, sfx: 'sip' },
  { scene: 'ilocos', at: 6.3, sfx: 'flash' },
  { scene: 'dapitan', at: 1.8, sfx: 'whoosh' },
  { scene: 'dapitan', at: 4.5, sfx: 'page' },
  { scene: 'dapitan', at: 5.6, sfx: 'sip' },
  { scene: 'dapitan', at: 7.0, sfx: 'sip' },
  { scene: 'dapitan', at: 7.35, sfx: 'flash' },
  { scene: 'manila', at: 1.8, sfx: 'whoosh' },
  { scene: 'manila', at: 5.3, sfx: 'run' },
  { scene: 'manila', at: 5.85, sfx: 'sip' },
  { scene: 'manila', at: 6.3, sfx: 'flash' },
  { scene: 'tunnel', at: 0.1, sfx: 'whoosh' },
  { scene: 'tunnel', at: 1.9, sfx: 'land' },
  { scene: 'tunnel', at: 3.8, sfx: 'whoosh' },
  { scene: 'museum', at: 0.1, sfx: 'flash' },
  { scene: 'museum', at: 0.45, sfx: 'land' },
  { scene: 'museum', at: 0.95, sfx: 'land' },
  { scene: 'museum', at: 3.15, sfx: 'coins' },
  { scene: 'museum', at: 5.2, sfx: 'alert' },
  { scene: 'guard', at: 0.9, sfx: 'bark' },
  { scene: 'guard', at: 3.1, sfx: 'run' },
  { scene: 'guard', at: 4.3, sfx: 'run' },
  { scene: 'logo', at: 0.3, sfx: 'logo' },
];

export const LORE = {
  duration: LORE_SCENES.reduce((s, x) => Math.max(s, x.start + x.dur), 0),
  /** Skip chip fades after this long without input; a tap wakes it. */
  skipFade: 3,
  /** If the video has not started this long after Play (slow network, blocked media), skip the intro. */
  loadTimeout: 8,
  /** Music intensity per scene (lore track layers). */
  intensity: { title: 0, mactan: 0.1, ilocos: 0.2, dapitan: 0.3, manila: 0.45, tunnel: 0.9, museum: 0.6, guard: 1, logo: 1 } as Record<string, number>,
  /** Chibi babble pitch (Hz) per speaker — speech bubbles "talk" in blips, no voice acting. */
  voice: { lapulapu: 190, gabriela: 330, rizal: 240, bonifacio: 210, guard: 160, all: 260, narrator: 0 } as Record<Speaker, number>,
  /** Display names on speech bubbles. */
  names: { lapulapu: 'Lapu-Lapu', gabriela: 'Gabriela Silang', rizal: 'José Rizal', bonifacio: 'Andrés Bonifacio', guard: 'Guard', all: 'Lahat', narrator: '' } as Record<Speaker, string>,
} as const;
