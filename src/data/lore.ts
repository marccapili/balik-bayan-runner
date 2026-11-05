/**
 * Opening lore cutscene ("Balik Bayan"): four heroes from four eras get sipped by time portals
 * into a 2026 museum. Plays after loading every launch (skippable). Pure data: the engine-free
 * `gameplay/LoreTimeline.ts` plays it, `scenes/LoreScene.ts` renders it, `ui/LorePlayer.ts` draws
 * the comic overlay (letterbox, era cards, bubbles, wipes, logo).
 *
 * Coordinates are local to each set: the hero stands at the origin facing +z and the portal
 * opens ahead of them at `PORTAL_AT`. Camera keys are [x, y, z] in that same space.
 */
import type { HeroId } from './heroes';

export type V3 = readonly [number, number, number];
export type LoreSet = 'title' | 'mactan' | 'ilocos' | 'dapitan' | 'manila' | 'tunnel' | 'museum' | 'logo';
export type Ease = 'linear' | 'inOut' | 'out' | 'back';
export type Speaker = HeroId | 'guard' | 'all' | 'narrator';

/** One camera shot: eases from (pos0, tgt0) to (pos1, tgt1) until the next shot's `at`. */
export interface LoreCam {
  at: number;
  pos0: V3;
  tgt0: V3;
  pos1: V3;
  tgt1: V3;
  ease?: Ease;
  /** Field of view (radians). */
  fov?: number;
  /** Portrait pull-back for this shot (default LORE.portraitPull); lower it for shots near a wall. */
  pull?: number;
}

export interface LoreBubble {
  at: number;
  until: number;
  who: Speaker;
  text: string;
}

export interface LoreScene {
  id: string;
  set: LoreSet;
  start: number;
  dur: number;
  /** Era card ("Mactan, 1521"), typed on at the start of the scene. */
  era?: string;
  /** The hero this vignette is about (vignettes only). */
  hero?: HeroId;
  cams: readonly LoreCam[];
  bubbles: readonly LoreBubble[];
}

/** Sound cue at scene-local time `at`. */
export interface LoreCue {
  scene: string;
  at: number;
  sfx: LoreSfx;
}

export type LoreSfx = 'crack' | 'whoosh' | 'sip' | 'flash' | 'land' | 'coins' | 'alert' | 'bark' | 'whoo' | 'neigh' | 'page' | 'run' | 'logo';

/** Where the portal opens in every vignette (in front of the hero, above head height). */
export const PORTAL_AT: V3 = [0, 1.55, 3.1];

/**
 * Shared beat timing for the four hero vignettes (seconds into the scene). Calm → crack →
 * startle (bubble) → portal spins open → resist → anticipation lean → sipped → flash.
 */
export const VIGNETTE = {
  dur: 9,
  crack: 1.9,
  startle: 2.7,
  open: 4.3,
  resist: 4.9,
  /** Lean-back wind-up before the pull wins (anticipation). */
  windup: 6.7,
  sip: 7.2,
  sipDur: 0.65,
  flash: 7.85,
  close: 8.3,
} as const;

/** Vignette camera shots: wide establishing → face close-up on the startle → wide side as the portal opens → over-the-shoulder into the portal. */
const vignetteCams = (h = 0, side = 1): LoreCam[] => [
  { at: 0, pos0: [-3.2, 1.9 + h, -3.4], tgt0: [0, 1.1 + h, 1.2], pos1: [-2.5, 1.7 + h, -2.7], tgt1: [0, 1.15 + h, 1.4], ease: 'inOut' },
  { at: VIGNETTE.startle, pos0: [1.1, 1.5 + h, 3.0], tgt0: [0, 1.2 + h, 0], pos1: [0.9, 1.45 + h, 2.6], tgt1: [0, 1.2 + h, 0], ease: 'out', fov: 0.62 },
  { at: VIGNETTE.open, pos0: [-5.6 * side, 1.6 + h, 0.9 - (1 - side) * 1.6], tgt0: [0, 1.3 + h, 1.6], pos1: [-5.0 * side, 1.5 + h, 0.6 - (1 - side) * 1.6], tgt1: [0, 1.4 + h, 1.5], ease: 'inOut', fov: side < 1 ? 1.0 : undefined, pull: side < 1 ? 0.1 : undefined },
  { at: VIGNETTE.windup - 0.2, pos0: [1.8, 1.7 + h, -3.6], tgt0: [0, 1.4 + h, 2.6], pos1: [1.4, 1.75 + h, -2.9], tgt1: [0, 1.55 + h, 3.1], ease: 'inOut', fov: 0.85 },
];

const T0 = 3;
const V = VIGNETTE.dur;

export const LORE_SCENES: readonly LoreScene[] = [
  {
    id: 'title',
    set: 'title',
    start: 0,
    dur: T0,
    cams: [{ at: 0, pos0: [0, 0, -6], tgt0: [0, 0, 0], pos1: [0, 0, -5.5], tgt1: [0, 0, 0] }],
    bubbles: [{ at: 0.3, until: 2.9, who: 'narrator', text: 'May nawawalang mga bayani…' }],
  },
  {
    id: 'mactan',
    set: 'mactan',
    hero: 'lapulapu',
    era: 'Mactan, 1521',
    start: T0,
    dur: V,
    cams: vignetteCams(),
    bubbles: [{ at: VIGNETTE.startle + 0.1, until: VIGNETTE.open + 0.3, who: 'lapulapu', text: 'Ano ’tong ilaw sa dagat?!' }],
  },
  {
    id: 'ilocos',
    set: 'ilocos',
    hero: 'gabriela',
    era: 'Ilocos, 1763',
    start: T0 + V,
    dur: V,
    cams: vignetteCams(0.75),
    bubbles: [{ at: VIGNETTE.startle + 0.1, until: VIGNETTE.windup, who: 'gabriela', text: 'Hala, ako pala ’yung kinukuha!' }],
  },
  {
    id: 'dapitan',
    set: 'dapitan',
    hero: 'rizal',
    era: 'Dapitan, 1890s',
    start: T0 + 2 * V,
    dur: V,
    cams: vignetteCams(-0.35),
    bubbles: [{ at: VIGNETTE.open + 0.2, until: VIGNETTE.windup + 0.3, who: 'rizal', text: 'Teka, hindi pa tapos ’yung sulat ko!' }],
  },
  {
    id: 'manila',
    set: 'manila',
    hero: 'bonifacio',
    era: 'Maynila, 1896',
    start: T0 + 3 * V,
    dur: V,
    // Inside the hut: the side shot stays within the bamboo walls.
    cams: vignetteCams(0, 0.5),
    bubbles: [
      { at: VIGNETTE.startle + 0.1, until: VIGNETTE.open, who: 'bonifacio', text: 'Ha? Ano ’yon?!' },
      { at: VIGNETTE.resist + 0.4, until: VIGNETTE.sip + 0.4, who: 'bonifacio', text: 'WAIT LANG—!' },
    ],
  },
  {
    id: 'tunnel',
    set: 'tunnel',
    start: T0 + 4 * V,
    dur: 6,
    cams: [
      { at: 0, pos0: [0, 0, -7], tgt0: [0, 0, 6], pos1: [0.4, 0.2, -5], tgt1: [0, 0, 6], ease: 'inOut', fov: 0.95 },
      { at: 2.3, pos0: [3.4, 0.3, -3.9], tgt0: [0, -0.5, 0.6], pos1: [3.0, 0.2, -3.4], tgt1: [0, -0.5, 0.6], ease: 'out', fov: 0.75 },
      { at: 4.1, pos0: [0, 0.3, -4], tgt0: [0, 0, 10], pos1: [0, 0.2, -2], tgt1: [0, 0, 14], ease: 'inOut', fov: 1.0 },
    ],
    bubbles: [{ at: 2.5, until: 4.0, who: 'all', text: 'SINO KA?! …SINO KAYO?!' }],
  },
  {
    id: 'museum',
    set: 'museum',
    era: 'Pambansang Museo… 2026?!',
    start: T0 + 4 * V + 6,
    dur: 6,
    cams: [
      { at: 0, pos0: [0, 2.6, -8], tgt0: [0, 3.2, 0], pos1: [0, 2.2, -7], tgt1: [0, 2.4, 0], ease: 'inOut', fov: 0.85 },
      { at: 2.0, pos0: [2.6, 1.6, -4.2], tgt0: [0, 0.6, 0], pos1: [2.2, 1.4, -3.6], tgt1: [0, 0.6, 0], ease: 'out' },
      { at: 3.5, pos0: [1.0, 1.5, -4.0], tgt0: [0, 0.8, 0], pos1: [0.8, 1.45, -3.5], tgt1: [0, 0.85, 0], ease: 'inOut', fov: 0.7 },
    ],
    bubbles: [{ at: 3.6, until: 5.9, who: 'bonifacio', text: 'Bigla na lang… 2026?!' }],
  },
  {
    id: 'guard',
    set: 'museum',
    start: T0 + 4 * V + 12,
    dur: 5,
    cams: [
      { at: 0, pos0: [-2.2, 2.4, -3.2], tgt0: [0, 1.2, 7], pos1: [-1.9, 2.3, -2.8], tgt1: [0, 1.2, 7], ease: 'inOut', fov: 0.7 },
      { at: 1.7, pos0: [2.0, 2.5, 8.6], tgt0: [0, 0.6, 0], pos1: [1.8, 2.4, 8.2], tgt1: [0, 0.6, 0], ease: 'out', fov: 0.72, pull: 0.05 },
      { at: 3.3, pos0: [0, 1.7, -4.6], tgt0: [0, 0.9, 1.5], pos1: [0, 1.6, -7.2], tgt1: [0, 0.9, 0], ease: 'out', fov: 0.85 },
    ],
    bubbles: [
      { at: 0.4, until: 3.2, who: 'guard', text: 'HOY! Bawal ’yan dito!' },
      { at: 3.5, until: 5.0, who: 'all', text: 'TAKBO!!!' },
    ],
  },
  {
    id: 'logo',
    set: 'logo',
    start: T0 + 4 * V + 17,
    dur: 4,
    cams: [{ at: 0, pos0: [0, 1.1, -3.6], tgt0: [0, 0.95, 2], pos1: [0, 1.0, -6.6], tgt1: [0, 0.9, 2], ease: 'out', fov: 0.8 }],
    bubbles: [],
  },
];

export const LORE_CUES: readonly LoreCue[] = [
  ...(['mactan', 'ilocos', 'dapitan', 'manila'] as const).flatMap((scene) => [
    { scene, at: VIGNETTE.crack, sfx: 'crack' as const },
    { scene, at: VIGNETTE.open, sfx: 'whoosh' as const },
    { scene, at: VIGNETTE.sip, sfx: 'sip' as const },
    { scene, at: VIGNETTE.flash, sfx: 'flash' as const },
  ]),
  { scene: 'ilocos', at: VIGNETTE.open + 0.35, sfx: 'neigh' },
  { scene: 'dapitan', at: VIGNETTE.open + 0.1, sfx: 'page' },
  { scene: 'manila', at: VIGNETTE.crack + 0.5, sfx: 'page' },
  { scene: 'tunnel', at: 0.1, sfx: 'whoosh' },
  { scene: 'tunnel', at: 4.3, sfx: 'whoosh' },
  { scene: 'museum', at: 0.4, sfx: 'whoosh' },
  { scene: 'museum', at: 2.05, sfx: 'land' },
  { scene: 'museum', at: 2.15, sfx: 'coins' },
  { scene: 'guard', at: 0.3, sfx: 'alert' },
  { scene: 'guard', at: 2.4, sfx: 'bark' },
  { scene: 'guard', at: 2.9, sfx: 'whoo' },
  { scene: 'guard', at: 3.5, sfx: 'run' },
  { scene: 'logo', at: 1.2, sfx: 'logo' },
];

export const LORE = {
  duration: LORE_SCENES.reduce((s, x) => Math.max(s, x.start + x.dur), 0),
  /** Ink wipe at every scene change (seconds). */
  wipe: 0.45,
  /** Logo slams in this long into the logo scene; the heroes freeze-frame at the same time. */
  logoAt: 1.2,
  /** Skip chip fades after this long without input; a tap wakes it. */
  skipFade: 3,
  /** Portrait screens pull the camera back by up to this factor so the subject still fits. */
  portraitPull: 0.7,
  /** Music intensity per scene (lore track layers). */
  intensity: { title: 0, mactan: 0.1, ilocos: 0.2, dapitan: 0.3, manila: 0.45, tunnel: 0.9, museum: 0.6, guard: 1, logo: 1 } as Record<string, number>,
  /** Chibi babble pitch (Hz) per speaker — speech bubbles "talk" in blips, no voice acting. */
  voice: { lapulapu: 190, gabriela: 330, rizal: 240, bonifacio: 210, guard: 160, all: 260, narrator: 0 } as Record<Speaker, number>,
  /** Display names on speech bubbles. */
  names: { lapulapu: 'Lapu-Lapu', gabriela: 'Gabriela Silang', rizal: 'José Rizal', bonifacio: 'Andrés Bonifacio', guard: 'Guard', all: 'Lahat', narrator: '' } as Record<Speaker, string>,
  /** Sky / fog colours per set (the colour tells the era). */
  palette: {
    title: { sky: '#07060f', light: '#ffffff', ground: '#000000', amb: 0.2 },
    mactan: { sky: '#f3b46b', light: '#ffd9a0', ground: '#7a4a2a', amb: 0.85 },
    ilocos: { sky: '#e9c27a', light: '#fff0c4', ground: '#5d6b2a', amb: 0.85 },
    dapitan: { sky: '#d99a5a', light: '#ffe2b0', ground: '#6a4426', amb: 0.8 },
    manila: { sky: '#1a120c', light: '#ffc46b', ground: '#3a2414', amb: 0.55 },
    tunnel: { sky: '#2a0a3a', light: '#ffb0f0', ground: '#3a1050', amb: 0.9 },
    museum: { sky: '#061220', light: '#9fe3ff', ground: '#10243a', amb: 0.45 },
    logo: { sky: '#061220', light: '#9fe3ff', ground: '#10243a', amb: 0.5 },
  } as Record<LoreSet, { sky: string; light: string; ground: string; amb: number }>,
  /** Year counter in the tunnel (DOM), evenly spread over the tunnel scene. */
  tunnelYears: [1896, 1946, 1986, 2026] as const,
  /** Floating papers / sparkles (halved on Low quality / Reduced effects). */
  particles: 24,
} as const;

export const LORE_SCENE_BY_ID: Record<string, LoreScene> = Object.fromEntries(LORE_SCENES.map((s) => [s.id, s]));
