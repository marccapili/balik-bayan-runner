/** Survival-mode tuning: scoring, health, pickups, guards, difficulty. Change numbers here. */

export const SCORING = {
  coin: 10,
  rareCoin: 100,
  survivalInterval: 30,
  survivalBonus: 100,
  artifactDiscovery: 250,
  museumChallenge: 300,
  eliteDodge: 50,
  /** Coins collected within this many seconds of each other keep the combo alive. */
  comboWindow: 2.8,
  /** Every N coins in a combo raises the multiplier by 1… */
  coinsPerStep: 5,
  /** …up to this cap. */
  maxMultiplier: 4,
} as const;

/** Run coins → wallet coins. Rare coins are worth more spendable currency too. */
export const COIN_VALUES = { coin: 1, rareCoin: 5 } as const;

export const HEALTH = {
  maxHearts: 3,
  invulnerableSeconds: 1.1,
  /** No damage at all for the first seconds of a run. */
  startGrace: 2.0,
  knockback: 9,
} as const;

export const PICKUPS = {
  activeCoins: 28,
  pickupRadius: 0.85,
  respawnDelay: [2.5, 5] as readonly [number, number],
  rareChance: 0.07,
  /** Min distance from the player for a respawned coin, so coins don't pop up under them. */
  respawnMinDistance: 6,
  /** Heart pickup: only spawns when hurt, at most one on the map, rare. */
  heartCheckEvery: 12,
  heartChance: 0.35,
  heartLifetime: 18,
  /** Distance kept from walls/props so coins never look stuck inside geometry. */
  wallClearance: 0.7,
} as const;

export const GUARD = {
  radius: 0.45,
  patrolSpeed: 2.2,
  chaseSpeedStart: 4.5,
  chaseSpeedMax: 5.3,
  /** Seconds of run time to go from start to max chase speed (speed is capped, never unbounded). */
  speedRampSeconds: 240,
  acceleration: 22,
  sightRange: 15,
  /** Close range where guards "hear" the player even without line of sight. */
  hearRange: 4.5,
  alertSeconds: 0.7,
  searchSeconds: 5,
  repathSeconds: 0.4,
  /** After landing a hit the guard staggers so it can't chain hits. */
  hitRecoverSeconds: 1.2,
  contactPadding: 0.05,
  minSpawnDistance: 14,
} as const;

/** Data-driven difficulty: when each extra guard joins (seconds). Dogs/folklore arrive in M5. */
export const GUARD_SCHEDULE: readonly number[] = [0, 45, 90, 150];
export const MAX_GUARDS = 4;

/** Game-feel numbers (screen shake, blink, game-over beat). */
export const FEEDBACK = {
  hitShake: 0.35,
  hitShakeSeconds: 0.3,
  /** Invulnerability blink frequency (on/off cycles per second). */
  blinkHz: 9,
  /** World time scale during the game-over beat. */
  gameOverTimeScale: 0.35,
  /** Real seconds of the knocked-down beat before the results panel. */
  gameOverDelay: 1.3,
} as const;
