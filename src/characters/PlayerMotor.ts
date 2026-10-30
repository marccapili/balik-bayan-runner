import { PLAYER_CONFIG } from '../data/config';
import type { CollisionWorld } from '../physics/Collision';
import { clampUnit, dampAngle, length2, moveTowards, type Vec2 } from '../utils/math';

export interface MotorState {
  pos: Vec2;
  vel: Vec2;
  /** Facing yaw in radians; 0 faces +z (screen up). */
  yaw: number;
}

export type MotorConfig = typeof PLAYER_CONFIG;

/**
 * Engine-free movement simulation for the hero.
 * Input is a camera-relative stick vector (x = right, z = up) in [-1, 1].
 */
export class PlayerMotor {
  state: MotorState;
  /** Multiplier from abilities (e.g. Rizal's sprint) — 1 = normal. */
  speedMultiplier = 1;

  constructor(
    start: Vec2,
    private readonly world: CollisionWorld,
    private readonly cfg: MotorConfig = PLAYER_CONFIG,
  ) {
    this.state = { pos: { ...start }, vel: { x: 0, z: 0 }, yaw: Math.PI };
  }

  reset(start: Vec2, yaw = Math.PI): void {
    this.state = { pos: { ...start }, vel: { x: 0, z: 0 }, yaw };
  }

  get speed(): number {
    return length2(this.state.vel.x, this.state.vel.z);
  }

  get maxSpeed(): number {
    return this.cfg.maxSpeed * this.speedMultiplier;
  }

  update(rawInput: Vec2, dt: number): void {
    const s = this.state;
    const input = clampUnit(rawInput);
    const max = this.maxSpeed;
    const target = { x: input.x * max, z: input.z * max };
    const hasInput = length2(input.x, input.z) > 0.01;

    // Brake harder when the new direction opposes current velocity — no ice-skating.
    let rate: number = hasInput ? this.cfg.acceleration : this.cfg.deceleration;
    if (hasInput && s.vel.x * target.x + s.vel.z * target.z < 0) rate = this.cfg.turnBrake;
    s.vel = moveTowards(s.vel, target, rate * dt);

    const before = s.pos;
    const after = this.world.move(before, { x: s.vel.x * dt, z: s.vel.z * dt }, this.cfg.radius);
    // Remove the velocity component that the wall absorbed, so we don't "stick" against it.
    if (dt > 0) {
      const realVx = (after.x - before.x) / dt;
      const realVz = (after.z - before.z) / dt;
      if (Math.abs(realVx) < Math.abs(s.vel.x) - 1e-6) s.vel.x = realVx;
      if (Math.abs(realVz) < Math.abs(s.vel.z) - 1e-6) s.vel.z = realVz;
    }
    s.pos = after;

    if (hasInput) {
      const desiredYaw = Math.atan2(input.x, input.z);
      s.yaw = dampAngle(s.yaw, desiredYaw, this.cfg.turnSharpness, dt);
    }
  }
}
