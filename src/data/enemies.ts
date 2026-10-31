/**
 * M5 enemies + difficulty director. Everything tunable lives here.
 * Multo and tikbalang are creatures from Philippine folklore (labelled as folklore in-game);
 * their gameplay powers are inventions for this game.
 */

export type EnemyKind = 'guard' | 'dog' | 'multo' | 'tikbalang';

/** Shared perception/movement stats per enemy kind (guards' numbers come from GUARD). */
export interface EnemyStats {
  radius: number;
  patrolSpeed: number;
  /** Chase speed = director chase speed × this. */
  chaseScale: number;
  sightRange: number;
  loseRange: number;
  hearRange: number;
  alertSeconds: number;
  searchSeconds: number;
  searchSpeed: number;
}

/** Guard dog: fast, and lunges in a straight line after a readable crouch + red lane. */
export const DOG = {
  stats: { radius: 0.4, patrolSpeed: 2.6, chaseScale: 0.92, sightRange: 6, loseRange: 9, hearRange: 3, alertSeconds: 0.5, searchSeconds: 3, searchSpeed: 3.2 } satisfies EnemyStats,
  /** Lunge only from this close (and with a clear line). */
  dashRange: 6,
  dashMinRange: 1.6,
  /** Crouch + growl telegraph before the lunge (the dodge window). */
  windupSeconds: 0.7,
  dashSpeed: 13,
  dashSeconds: 0.45,
  /** Panting after a lunge: slow, gives the hero a breather. */
  recoverSeconds: 1.1,
  recoverSpeed: 1.2,
  dashCooldown: 3.5,
} as const;

/** Multo (ghost): slow, floats straight through walls, fades out (harmless) and back in. */
export const MULTO = {
  stats: { radius: 0.42, patrolSpeed: 1.6, chaseScale: 0.58, sightRange: 99, loseRange: 99, hearRange: 99, alertSeconds: 0.9, searchSeconds: 2, searchSpeed: 2 } satisfies EnemyStats,
  visibleSeconds: 5,
  fadeSeconds: 0.6,
  hiddenSeconds: 2.4,
  /** Moves a bit faster while invisible, so where it reappears is a surprise. */
  hiddenSpeedScale: 1.3,
  floatHeight: 0.35,
} as const;

/** Tikbalang: big, slower walker; rears up then charges; bonks itself on walls; casts illusion copies. */
export const TIKBALANG = {
  stats: { radius: 0.55, patrolSpeed: 2.2, chaseScale: 0.8, sightRange: 7, loseRange: 10, hearRange: 3, alertSeconds: 0.9, searchSeconds: 3.5, searchSpeed: 2.8 } satisfies EnemyStats,
  chargeRange: 9,
  chargeMinRange: 2.5,
  windupSeconds: 0.9,
  chargeSpeed: 14,
  chargeSeconds: 1.0,
  /** Hitting a wall mid-charge stuns the tikbalang itself. */
  wallStun: 1.6,
  chargeCooldown: 5,
  /** Illusion: harmless see-through copies that run around the hero to confuse. */
  illusionEvery: 10,
  illusionCount: 2,
  illusionSeconds: 4,
  illusionSpeed: 4.2,
  /** Seconds after appearing before touching a copy pops it (they spawn on top of the tikbalang). */
  illusionGrace: 0.8,
} as const;

/**
 * Difficulty director entry: who joins the run and when. The intro guard counts as the first
 * entry. New arrivals hunt the hero from any distance.
 */
export interface SpawnEntry {
  /** Run seconds before this enemy may join. */
  at: number;
  kind: EnemyKind;
  /** Exhibits that must be cleared first (owner: folklore only after 10). Default 0. */
  exhibits?: number;
}

/**
 * Owner balance (2026-10-31): before 10 exhibits only guards and dogs, all slower than the hero
 * (6.2 m/s vs guard chase 4.5→5.3, dog ×0.92). Guards come more often than dogs (two guards
 * before the first dog) and build up to 7 guards + 3 dogs. The multo joins on the 10th exhibit,
 * the tikbalang on the 12th; Endless takes over after 15.
 */
export const SPAWN_SCHEDULE: readonly SpawnEntry[] = [
  { at: 0, kind: 'guard' },
  { at: 30, kind: 'guard' },
  { at: 60, kind: 'dog' },
  { at: 90, kind: 'guard' },
  { at: 125, kind: 'guard' },
  { at: 165, kind: 'dog' },
  { at: 205, kind: 'guard' },
  { at: 250, kind: 'guard' },
  { at: 300, kind: 'dog' },
  { at: 350, kind: 'guard' },
  { at: 0, kind: 'multo', exhibits: 10 },
  { at: 0, kind: 'tikbalang', exhibits: 12 },
];

/** Toast + sound when something new joins (Gen Z Taglish). */
export const ENEMY_INTRO: Record<EnemyKind, { title: string; subtitle: string }> = {
  guard: { title: '👮 May bagong guard!', subtitle: 'Dumami sila, bilisan mo pa' },
  dog: { title: '🐕 May aso na!', subtitle: 'Pag umupo at may pulang linya, iwas agad!' },
  multo: { title: '👻 Multo alert!', subtitle: 'Folklore: tumatagos sa pader. Mabagal pero di napapagod' },
  tikbalang: { title: '🐴 TIKBALANG!', subtitle: 'Folklore: pag tumayo, susugod! May mga illusion pa' },
};

/**
 * Endless Mode (after all 15 exhibits, owner spec): difficulty climbs fast until the hero is caught.
 * A new enemy every `spawnEvery` seconds (cycling `kinds`), and chase speed keeps rising past the
 * hero's own top speed (6.2), so every endless run ends.
 */
export const ENDLESS = {
  spawnEvery: 9,
  kinds: ['dog', 'guard', 'multo', 'tikbalang', 'dog', 'guard'] as readonly EnemyKind[],
  maxEnemies: 22,
  /** Chase speed grows by this per endless second, up to the cap. */
  speedGrowth: 0.03,
  speedCap: 7.4,
} as const;
