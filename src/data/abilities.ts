/** Hero ability tuning (M4). Abilities are fictional gameplay interpretations, not historical claims. */

export type AbilityKind = 'sprint' | 'shield' | 'shockwave' | 'dash';

export const ABILITIES = {
  /** Rizal: Mabilis na Isip. Faster top speed for a few seconds. */
  sprint: { cooldown: 12, duration: 3.5, speedMultiplier: 1.55, icon: '⚡' },
  /** Lapu-Lapu: Kalasag ng Mactan. Blocks the next hit while it is up; the blocked guard is stunned. */
  shield: { cooldown: 15, duration: 8, blockStun: 1.8, icon: '🛡️' },
  /** Bonifacio: Sigaw ng Katipunan. Stuns and shoves every guard within the radius. */
  shockwave: { cooldown: 16, duration: 0.6, radius: 5, stun: 2.5, push: 3.5, icon: '📣' },
  /** Gabriela: Matapang na Hakbang. Short burst in the facing direction, untouchable while dashing. */
  dash: { cooldown: 6, duration: 0.24, speed: 21, invulnerable: 0.4, icon: '💨' },
} as const;
