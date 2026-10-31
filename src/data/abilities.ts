/**
 * Hero ability tuning (M4). Abilities are fictional gameplay interpretations, not historical claims.
 * Cooldowns (owner request 2026-10-31): Rizal 1:30, Lapu-Lapu 1:00; Bonifacio and Gabriela balanced around them —
 * the shockwave hits every nearby guard so it sits between, the dash is the smallest escape so it recharges fastest.
 */

export type AbilityKind = 'sprint' | 'shield' | 'shockwave' | 'dash';

export const ABILITIES = {
  /** Rizal: Mabilis na Isip. Faster top speed for a few seconds. */
  sprint: { cooldown: 90, duration: 3.5, speedMultiplier: 1.55, icon: '⚡' },
  /** Lapu-Lapu: Kalasag ng Mactan. Blocks the next hit while it is up; the blocked guard is stunned. */
  shield: { cooldown: 60, duration: 8, blockStun: 1.8, icon: '🛡️' },
  /** Bonifacio: Sigaw ng Katipunan. Stuns and shoves every guard within the radius. */
  shockwave: { cooldown: 75, duration: 0.6, radius: 5, stun: 2.5, push: 3.5, icon: '📣' },
  /** Gabriela: Matapang na Hakbang. Short burst in the facing direction, untouchable while dashing. */
  dash: { cooldown: 45, duration: 0.24, speed: 21, invulnerable: 0.4, icon: '💨' },
} as const;
