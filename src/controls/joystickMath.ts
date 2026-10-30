import type { Vec2 } from '../utils/math';

/**
 * Converts a thumb offset in screen pixels (y down) into a movement vector (z up).
 * Applies a radial deadzone and rescales so movement starts smoothly from 0.
 */
export function joystickVector(dxPx: number, dyPx: number, radiusPx: number, deadzone: number): Vec2 {
  const len = Math.hypot(dxPx, dyPx);
  if (len === 0 || radiusPx <= 0) return { x: 0, z: 0 };
  const norm = Math.min(len / radiusPx, 1);
  if (norm <= deadzone) return { x: 0, z: 0 };
  const mag = (norm - deadzone) / (1 - deadzone);
  return { x: (dxPx / len) * mag, z: (-dyPx / len) * mag };
}

/** Keyboard axes → vector. Opposite keys cancel; diagonals are normalised later by the motor. */
export function keysVector(up: boolean, down: boolean, left: boolean, right: boolean): Vec2 {
  return { x: (right ? 1 : 0) - (left ? 1 : 0), z: (up ? 1 : 0) - (down ? 1 : 0) };
}
