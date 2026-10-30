import type { NavGrid } from '../ai/NavGrid';
import { GUARD } from '../data/gameplay';
import type { CollisionWorld } from '../physics/Collision';
import { dampAngle, moveTowards, type Vec2 } from '../utils/math';

export type GuardState = 'patrol' | 'alert' | 'chase' | 'search' | 'stunned';

/**
 * Security guard AI (engine-free).
 * patrol → (hero inside sightRange with line of sight, or within hearRange) alert → chase
 * → (hero farther than loseRange) search last seen spot → patrol.
 * loseRange > sightRange, so outrunning a guard takes real distance, and it re-spots you only when close.
 * stunned can interrupt anything (hit recovery now; Bonifacio's shockwave in M4).
 */
export class GuardBrain {
  state: GuardState = 'patrol';
  pos: Vec2;
  vel: Vec2 = { x: 0, z: 0 };
  yaw = 0;
  stateTime = 0;
  /** Chase speed set by the difficulty director (capped there). */
  chaseSpeed: number = GUARD.chaseSpeedStart;
  private path: Vec2[] = [];
  private repathIn = 0;
  private lastSeen: Vec2 | null = null;
  private stunFor = 0;
  private patrolTarget: Vec2 | null = null;
  /** Set to true each time the guard newly spots the player (for the "!" + sound). */
  justAlerted = false;

  constructor(
    start: Vec2,
    private readonly nav: NavGrid,
    /** Thin (barely inflated) grid used for line of sight, so wall-hugging heroes stay visible. */
    private readonly sight: NavGrid,
    private readonly world: CollisionWorld,
    private readonly patrolPoints: readonly Vec2[],
    private readonly rng: () => number = Math.random,
    /** Staggers path requests between guards. */
    repathOffset = 0,
  ) {
    this.pos = { ...start };
    this.repathIn = repathOffset;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  private enter(s: GuardState): void {
    if (s === this.state) return;
    this.state = s;
    this.stateTime = 0;
    this.path = [];
    this.repathIn = 0;
  }

  stun(seconds: number): void {
    this.stunFor = Math.max(this.stunFor, seconds);
    this.enter('stunned');
  }

  /** Forces the guard straight into pursuit (used at run start). */
  alertTo(player: Vec2): void {
    this.lastSeen = { ...player };
    this.enter('alert');
    this.justAlerted = true;
  }

  private dist(p: Vec2): number {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Can a non-chasing guard spot the hero right now? */
  canSee(player: Vec2): boolean {
    const d = this.dist(player);
    if (d <= GUARD.hearRange) return true;
    return d <= GUARD.sightRange && this.sight.lineClear(this.pos, player);
  }

  /** A chasing guard keeps tracking (A* around walls) until the hero escapes past loseRange. */
  stillTracking(player: Vec2): boolean {
    return this.dist(player) <= GUARD.loseRange;
  }

  update(dt: number, player: Vec2): void {
    this.stateTime += dt;
    this.justAlerted = false;
    let target: Vec2 | null = null;
    let speed = 0;

    switch (this.state) {
      case 'stunned':
        this.stunFor -= dt;
        if (this.stunFor <= 0) this.enter(this.stillTracking(player) ? 'chase' : 'search');
        break;
      case 'patrol': {
        if (this.canSee(player)) {
          this.alertTo(player);
          break;
        }
        if (!this.patrolTarget || this.dist(this.patrolTarget) < 0.6) {
          this.patrolTarget = this.patrolPoints[Math.floor(this.rng() * this.patrolPoints.length)] ?? null;
          this.path = [];
          this.repathIn = 0;
        }
        target = this.patrolTarget;
        speed = GUARD.patrolSpeed;
        break;
      }
      case 'alert':
        // Freeze and face the hero for a beat — the readable "!" moment.
        this.yaw = dampAngle(this.yaw, Math.atan2(player.x - this.pos.x, player.z - this.pos.z), 14, dt);
        if (this.stateTime >= GUARD.alertSeconds) this.enter('chase');
        break;
      case 'chase':
        if (this.stillTracking(player)) {
          this.lastSeen = { ...player };
          target = player;
          speed = this.chaseSpeed;
        } else {
          this.enter('search');
        }
        break;
      case 'search':
        // Lost the hero: jog to where they were last seen, look around, then give up.
        if (this.canSee(player)) {
          this.alertTo(player);
          break;
        }
        if (this.lastSeen && this.dist(this.lastSeen) > 0.8) {
          target = this.lastSeen;
          speed = GUARD.searchSpeed;
        } else {
          this.yaw += dt * 2.2; // looking around
        }
        if (this.stateTime > GUARD.searchSeconds) {
          this.patrolTarget = null;
          this.enter('patrol');
        }
        break;
    }

    const desired = target ? this.steer(target, speed, dt) : { x: 0, z: 0 };
    this.vel = moveTowards(this.vel, desired, GUARD.acceleration * dt);
    const before = this.pos;
    this.pos = this.world.move(before, { x: this.vel.x * dt, z: this.vel.z * dt }, GUARD.radius);
    if (dt > 0) {
      this.vel = { x: (this.pos.x - before.x) / dt, z: (this.pos.z - before.z) / dt };
    }
    if (this.speed > 0.2 && this.state !== 'alert') this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
  }

  /** Direct steering when the target is in plain sight, A* waypoints otherwise. */
  private steer(target: Vec2, speed: number, dt: number): Vec2 {
    let aim = target;
    if (!this.nav.lineClear(this.pos, target)) {
      this.repathIn -= dt;
      if (this.repathIn <= 0 || !this.path.length) {
        this.repathIn = GUARD.repathSeconds;
        this.path = this.nav.findPath(this.pos, target) ?? [];
      }
      while (this.path.length > 1 && Math.hypot(this.path[0]!.x - this.pos.x, this.path[0]!.z - this.pos.z) < 0.45) this.path.shift();
      if (this.path.length) aim = this.path[0]!;
    } else {
      this.path = [];
    }
    const dx = aim.x - this.pos.x;
    const dz = aim.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return { x: 0, z: 0 };
    return { x: (dx / d) * speed, z: (dz / d) * speed };
  }

  /** Pushes this guard away from another so groups don't stack into one blob. */
  separateFrom(other: GuardBrain): void {
    const dx = this.pos.x - other.pos.x;
    const dz = this.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const min = GUARD.radius * 2.2;
    if (d > 0.001 && d < min) {
      const push = (min - d) * 0.5;
      this.pos = this.world.move(this.pos, { x: (dx / d) * push, z: (dz / d) * push }, GUARD.radius);
    }
  }
}
