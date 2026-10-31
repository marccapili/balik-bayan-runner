import type { NavGrid } from '../ai/NavGrid';
import { MULTO, type EnemyKind } from '../data/enemies';
import { MUSEUM_BOUNDS } from '../data/museumLayout';
import type { CollisionWorld } from '../physics/Collision';
import { clamp, dampAngle, type Vec2 } from '../utils/math';
import { GuardBrain } from './GuardBrain';

const CYCLE = MULTO.visibleSeconds + MULTO.fadeSeconds * 2 + MULTO.hiddenSeconds;

/**
 * Multo (ghost from Philippine folklore; its powers here are game inventions). Engine-free.
 * Drifts straight at the hero through walls, never gives up, but is slow. It fades out
 * on a fixed cycle; while faded it can't touch you (and drifts a little faster).
 */
export class MultoBrain extends GuardBrain {
  private phaseT = 0;

  constructor(start: Vec2, nav: NavGrid, sight: NavGrid, world: CollisionWorld, spots: readonly Vec2[], rng: () => number, repathOffset = 0) {
    super(start, nav, sight, world, spots, rng, repathOffset, MULTO.stats);
  }

  override get kind(): EnemyKind {
    return 'multo';
  }

  /** 1 = solid, 0 = gone. */
  get visibility(): number {
    const t = this.phaseT % CYCLE;
    const v = MULTO.visibleSeconds;
    const f = MULTO.fadeSeconds;
    if (t < v) return 1;
    if (t < v + f) return 1 - (t - v) / f;
    if (t < v + f + MULTO.hiddenSeconds) return 0;
    return (t - v - f - MULTO.hiddenSeconds) / f;
  }

  override get canHurt(): boolean {
    return this.visibility > 0.9;
  }

  override update(dt: number, player: Vec2): void {
    this.stateTime += dt;
    this.justAlerted = false;
    this.hunting = true; // a multo never loses interest
    if (this.state === 'stunned') {
      this.stunFor -= dt;
      this.vel = { x: 0, z: 0 };
      if (this.stunFor <= 0) this.enter('chase');
      return;
    }
    this.phaseT += dt;
    if (this.state === 'alert') {
      this.yaw = dampAngle(this.yaw, Math.atan2(player.x - this.pos.x, player.z - this.pos.z), 10, dt);
      if (this.stateTime >= this.stats.alertSeconds) this.enter('chase');
      return;
    }
    if (this.state !== 'chase') this.enter('chase');
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const speed = this.chaseSpeed * this.stats.chaseScale * (this.visibility < 0.5 ? MULTO.hiddenSpeedScale : 1);
    this.vel = { x: (dx / d) * speed, z: (dz / d) * speed };
    // Phasing: no wall collision at all, only kept inside the museum.
    const b = MUSEUM_BOUNDS;
    this.pos = {
      x: clamp(this.pos.x + this.vel.x * dt, b.minX + 1, b.maxX - 1),
      z: clamp(this.pos.z + this.vel.z * dt, b.minZ + 1, b.maxZ - 1),
    };
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 6, dt);
  }

  /** Ghosts drift through each other; only solid enemies need separating. */
  override separateFrom(): void {}
}
