import type { Aabb } from '../physics/Collision';

/**
 * Training mode: try any hero (even locked ones) alone in the Hall of Heroes.
 * No guards, no coins, no score — just the hero, their ability and a few practice dummies.
 */
export const TRAINING = {
  spawn: { x: 20.5, z: 9 },
  /** Ability cooldown while training (seconds) so players can practise quickly. */
  abilityCooldown: 3,
  /** Practice dummies (don't move or hurt you; shockwave/shield react to them). */
  dummies: [
    { x: 14.5, z: 12.5 },
    { x: 26.5, z: 12.5 },
    { x: 20.5, z: 17 },
  ],
  /** Seconds a dummy stays knocked over, and how fast it slides back to its spot. */
  dummyStun: 2,
  dummyReturnSpeed: 2.5,
  dummyRadius: 0.45,
  /** Velvet-rope barriers closing the Hall of Heroes doorways while training. */
  barriers: [
    { minX: 9.5, maxX: 10.5, minZ: 10.3, maxZ: 15.7 },
    { minX: 17.3, maxX: 22.7, minZ: -0.5, maxZ: 0.5 },
  ] as Aabb[],
} as const;
