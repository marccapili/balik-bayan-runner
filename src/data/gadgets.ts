/**
 * Collectible gadgets lying around the museum (owner request, 2026-10-31).
 * The Coin Magnet fires the moment you grab it; the others go into the hero's single
 * gadget slot and fire when you press the gadget button (Q). Only one can be held.
 */

export type GadgetKind = 'smoke' | 'magnet' | 'bubble' | 'freeze';

export const GADGET_KINDS: readonly GadgetKind[] = ['smoke', 'magnet', 'bubble', 'freeze'];

export const GADGETS = {
  /** First gadget appears this many seconds into a run. */
  firstAfter: 15,
  /** Seconds between spawn checks (random in range). */
  spawnEvery: [18, 28] as readonly [number, number],
  /** At most this many gadgets lie on the floor at once. */
  maxOnMap: 2,
  /** An untouched gadget vanishes after this long. */
  lifetime: 40,
  /** Spawns at least this far from the hero (it's a small detour, not a gift). */
  minDistance: 7,
  pickupRadius: 0.95,
  /** Relative spawn chances. */
  weights: { smoke: 1, magnet: 1.2, bubble: 1, freeze: 0.9 } as Record<GadgetKind, number>,

  /** Smoke Bomb: every enemy loses the hero and can't spot them for this long. */
  smoke: { seconds: 5 },
  /** Coin Magnet (auto): coins within `radius` fly to the hero for `seconds`. */
  magnet: { seconds: 8, radius: 7, pullSpeed: 11 },
  /** Protective Bubble: absorbs the next enemy collision (no time limit), shoving + stunning that enemy. */
  bubble: { blockStun: 1.2, knockback: 1.4 },
  /** Time Freeze: enemies within `radius` move at `slow` × speed for `seconds`. */
  freeze: { seconds: 5, radius: 11, slow: 0.3 },
} as const;

/** HUD/lobby copy (Gen Z Taglish) + emoji fallback icon. */
export const GADGET_INFO: Record<GadgetKind, { name: string; icon: string; blurb: string; color: string }> = {
  smoke: { name: 'Smoke Bomb', icon: '💨', blurb: 'Usok! Di ka nila makikita for 5s', color: '#b48cff' },
  magnet: { name: 'Coin Magnet', icon: '🧲', blurb: 'Auto: hinihigop ang coins for 8s', color: '#ff5a5a' },
  bubble: { name: 'Protective Bubble', icon: '🛡️', blurb: 'Sasaluhin ang isang bangga', color: '#5fb8ff' },
  freeze: { name: 'Time Freeze', icon: '⏳', blurb: 'Bumabagal ang kalaban sa paligid for 5s', color: '#ffd23f' },
};
