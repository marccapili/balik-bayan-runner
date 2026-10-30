/** Lobby, leaderboard and intro tuning. */

export const LEADERBOARD = {
  size: 10,
  nameMin: 2,
  nameMax: 14,
} as const;

/** Cinematic run start (PLAY → portal → float → TAP TO DROP → fall → land → guard notices). */
export const INTRO = {
  /** Camera swoop from a wide reveal into the normal follow framing. */
  revealSeconds: 1.6,
  revealZoom: 1.65,
  /** Hero hover height (world units, feet) and bob. */
  floatHeight: 3.1,
  floatBob: 0.18,
  floatBobHz: 0.9,
  /** Fall: starts with a tiny hop up, then accelerates under gravity. */
  dropHop: 2.2,
  gravity: 26,
  /** Landing recovery before the guard reacts. */
  landSeconds: 0.55,
  landShake: 0.25,
  /** Guard: back turned → turn to hero → surprised "!" → chase. */
  guardTurnSeconds: 0.45,
  guardSurpriseSeconds: 0.75,
  /** Where the intro guard stands relative to the spawn point (visible on screen). */
  guardDistance: [7, 8.5] as const,
} as const;

/** Lobby stage camera + idle "personality" animation timing. */
export const LOBBY = {
  /** Camera distance in landscape; portrait screens pull back further so the stage still fits. */
  cameraDistance: 8.2,
  cameraDistancePortrait: 14,
  cameraHeight: 2.6,
  targetHeight: 1.7,
  /** Seconds between the hero's personality moves (wave). */
  emoteEvery: [5, 9] as const,
  emoteSeconds: 1.6,
  /** Drag-to-spin sensitivity (radians per pixel) and settle sharpness. */
  dragSpin: 0.012,
  settleSharpness: 2.5,
  /** Portal transition timing (seconds). */
  portalIn: 0.7,
  portalOut: 0.6,
} as const;
