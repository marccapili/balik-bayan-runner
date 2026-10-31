/**
 * M7 progression (owner spec, 2026-10-31): hero levels 1–10, player levels 1–300, diamonds (Hiyas)
 * only from levelling up and exhibit milestones, daily coin tasks. Change numbers here only.
 */

export type HeroPerk = 'badge' | 'ability' | 'cooldown' | 'boost' | 'master';

export interface HeroLevelReward {
  level: number;
  diamonds?: number;
  perk?: HeroPerk;
  /** Short label for the level track (Taglish). */
  label: string;
}

export const HERO_LEVEL = {
  cap: 10,
  /** Total hero XP needed to *be* level i (index = level; index 0 unused). */
  xpToReach: [0, 0, 120, 300, 550, 850, 1250, 1750, 2400, 3200, 4200] as readonly number[],
  /** Hero XP per run = seconds survived + per exhibit cleared + per coin picked. */
  xp: { perSecond: 1, perExhibit: 20, perCoin: 1 },
  /** The ability works from this hero level (training lets you try it any time). */
  abilityLevel: 5,
  /** Level 7: cooldown cut. Level 9: ability lasts / reaches this much further. */
  cooldownCut: 0.1,
  boost: 0.2,
  rewards: [
    { level: 3, diamonds: 10, label: '+10 💎' },
    { level: 4, perk: 'badge', label: 'Hero badge sa card' },
    { level: 5, perk: 'ability', label: 'Skill unlocked!' },
    { level: 7, perk: 'cooldown', label: 'Ability upgrade I: −10% cooldown' },
    { level: 8, diamonds: 10, label: '+10 💎' },
    { level: 9, perk: 'boost', label: 'Ability upgrade II: +20% tagal / layo' },
    { level: 10, diamonds: 20, perk: 'master', label: '+20 💎 · "Master" frame' },
  ] as readonly HeroLevelReward[],
} as const;

export const PLAYER_LEVEL = {
  cap: 300,
  /** XP to go from level n to n+1 = base + step × (n − 1). */
  base: 100,
  step: 15,
  /** Player XP per run = score / divisor + per exhibit cleared (+ mission XP when claimed). */
  scoreDivisor: 10,
  perExhibit: 25,
  diamondsPerLevel: 10,
  /** A new profile frame every N levels. */
  frameEvery: 5,
} as const;

/** Exhibit Mode rewards: every cleared exhibit + diamond milestones (per run). */
export const EXHIBIT_REWARDS = {
  coins: 20,
  milestones: [
    { at: 5, diamonds: 20 },
    { at: 10, diamonds: 20 },
    { at: 15, diamonds: 30 },
  ] as readonly { at: number; diamonds: number }[],
} as const;

/** Profile frames: frame k (1…60) unlocks at player level 5k. Frame 0 is the starter. */
const TIERS: readonly [string, string, string][] = [
  ['Kahoy', '#8a5a2b', '#c48a4a'],
  ['Tanso', '#a0522d', '#e39a5c'],
  ['Pilak', '#8f9bb0', '#e6ecf5'],
  ['Ginto', '#c8901a', '#ffe08a'],
  ['Perlas', '#c9bfd6', '#fffaf0'],
  ['Jade', '#1d7a5a', '#7be0b4'],
  ['Rubi', '#9e1730', '#ff6b81'],
  ['Sapiro', '#1f3f9e', '#7aa8ff'],
  ['Esmeralda', '#0d6b3d', '#3fe08a'],
  ['Amatista', '#5b2a9e', '#c79bff'],
  ['Diyamante', '#3aa7c9', '#e8fbff'],
  ['Bayani', '#b3202a', '#ffd34d'],
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
export type FrameStyle = 'solid' | 'double' | 'dashed' | 'glow' | 'gem';
const STYLES: FrameStyle[] = ['solid', 'double', 'dashed', 'glow', 'gem'];

export interface ProfileFrame {
  id: number;
  name: string;
  level: number;
  a: string;
  b: string;
  style: FrameStyle;
}

export const PROFILE_FRAMES: readonly ProfileFrame[] = [
  { id: 0, name: 'Simple', level: 1, a: '#3d4a7a', b: '#8fa2e0', style: 'solid' },
  ...Array.from({ length: PLAYER_LEVEL.cap / PLAYER_LEVEL.frameEvery }, (_, i): ProfileFrame => {
    const [name, a, b] = TIERS[Math.floor(i / 5)]!;
    return { id: i + 1, name: `${name} ${ROMAN[i % 5]}`, level: (i + 1) * PLAYER_LEVEL.frameEvery, a, b, style: STYLES[i % 5]! };
  }),
];

/** Daily tasks: 3 a day, coins only, reset at local midnight. */
export type DailyKind = 'exhibits' | 'coins' | 'runs' | 'survive' | 'minigames' | 'ability' | 'score';

export const DAILY = {
  count: 3,
  pool: [
    { kind: 'exhibits', target: 5, coins: 120 },
    { kind: 'coins', target: 50, coins: 100 },
    { kind: 'runs', target: 2, coins: 80 },
    { kind: 'survive', target: 120, coins: 100 },
    { kind: 'minigames', target: 4, coins: 100 },
    { kind: 'ability', target: 3, coins: 80 },
    { kind: 'score', target: 2000, coins: 120 },
  ] as readonly { kind: DailyKind; target: number; coins: number }[],
} as const;
