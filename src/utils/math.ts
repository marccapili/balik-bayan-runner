/** Small, engine-free math helpers so gameplay logic stays unit-testable. */

export interface Vec2 {
  x: number;
  z: number;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Frame-rate independent exponential smoothing factor.
 * `sharpness` is roughly "how many times per second the gap closes by ~63%".
 */
export const damp = (sharpness: number, dt: number): number => 1 - Math.exp(-sharpness * dt);

export const length2 = (x: number, z: number): number => Math.hypot(x, z);

/** Clamps a 2D vector to unit length (keeps diagonals from being faster). */
export function clampUnit(v: Vec2): Vec2 {
  const len = length2(v.x, v.z);
  if (len <= 1) return { x: v.x, z: v.z };
  return { x: v.x / len, z: v.z / len };
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function moveTowards(current: Vec2, target: Vec2, maxDelta: number): Vec2 {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const dist = length2(dx, dz);
  if (dist <= maxDelta || dist === 0) return { x: target.x, z: target.z };
  return { x: current.x + (dx / dist) * maxDelta, z: current.z + (dz / dist) * maxDelta };
}

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/** Smoothly rotates angle `current` toward `target` along the shortest arc. */
export function dampAngle(current: number, target: number, sharpness: number, dt: number): number {
  return current + wrapAngle(target - current) * damp(sharpness, dt);
}
