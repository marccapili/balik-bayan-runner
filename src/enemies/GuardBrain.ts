import type { NavGrid } from '../ai/NavGrid';
import { GUARD } from '../data/gameplay';
import type { EnemyKind, EnemyStats } from '../data/enemies';
import type { CollisionWorld } from '../physics/Collision';
import { dampAngle, moveTowards, type Vec2 } from '../utils/math';

export type GuardState = 'patrol' | 'alert' | 'chase' | 'search' | 'stunned' | 'windup' | 'dash' | 'recover';

/** Guards use the GUARD numbers; other enemy kinds pass their own stats (data/enemies.ts). */
export const GUARD_STATS: EnemyStats = {
  radius: GUARD.radius,
  patrolSpeed: GUARD.patrolSpeed,
  chaseScale: 1,
  sightRange: GUARD.sightRange,
  loseRange: GUARD.loseRange,
  hearRange: GUARD.hearRange,
  alertSeconds: GUARD.alertSeconds,
  searchSeconds: GUARD.searchSeconds,
  searchSpeed: GUARD.searchSpeed,
};

/**
 * Security guard AI (engine-free).
 * patrol → (hero inside sightRange with line of sight, or within hearRange) alert → chase
 * → (hero farther than loseRange) search last seen spot → patrol.
 * loseRange > sightRange, so outrunning a guard takes real distance, and it re-spots you only when close.
 * stunned can interrupt anything (hit recovery, Bonifacio's shockwave, Lapu-Lapu's shield).
 * Base class for every enemy: dogs, multo and tikbalang extend it (windup/dash/recover are theirs).
 */
export class GuardBrain {
  state: GuardState = 'patrol';
  pos: Vec2;
  vel: Vec2 = { x: 0, z: 0 };
  yaw = 0;
  stateTime = 0;
  /** Chase speed set by the difficulty director (capped there). */
  chaseSpeed: number = GUARD.chaseSpeedStart;
  protected path: Vec2[] = [];
  protected repathIn = 0;
  protected lastSeen: Vec2 | null = null;
  protected stunFor = 0;
  protected patrolTarget: Vec2 | null = null;
  /** Set to true each time the guard newly spots the player (for the "!" + sound). */
  justAlerted = false;

  constructor(
    start: Vec2,
    protected readonly nav: NavGrid,
    /** Thin (barely inflated) grid used for line of sight, so wall-hugging heroes stay visible. */
    protected readonly sight: NavGrid,
    protected readonly world: CollisionWorld,
    protected readonly patrolPoints: readonly Vec2[],
    protected readonly rng: () => number = Math.random,
    /** Staggers path requests between guards. */
    repathOffset = 0,
    readonly stats: EnemyStats = GUARD_STATS,
  ) {
    this.pos = { ...start };
    this.repathIn = repathOffset;
  }

  get kind(): EnemyKind {
    return 'guard';
  }

  get radius(): number {
    return this.stats.radius;
  }

  /** False while the enemy can't touch the hero (e.g. a faded multo). */
  get canHurt(): boolean {
    return true;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  protected enter(s: GuardState): void {
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

  /**
   * Freshly spawned guards hunt the hero from any distance. The normal give-up rule only
   * applies once the guard has closed to within loseRange at least once.
   */
  hunting = false;

  /** Spawn entry: straight into pursuit, ignoring distance until it gets close. */
  hunt(player: Vec2): void {
    this.hunting = true;
    this.alertTo(player);
  }

  /** Forces the guard straight into pursuit. */
  alertTo(player: Vec2): void {
    this.lastSeen = { ...player };
    this.enter('alert');
    this.justAlerted = true;
  }

  protected dist(p: Vec2): number {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Can a non-chasing guard spot the hero right now? */
  canSee(player: Vec2): boolean {
    const d = this.dist(player);
    if (d <= this.stats.hearRange) return true;
    return d <= this.stats.sightRange && this.sight.lineClear(this.pos, player);
  }

  /** A chasing guard keeps tracking (A* around walls) until the hero escapes past loseRange. */
  stillTracking(player: Vec2): boolean {
    const inRange = this.dist(player) <= this.stats.loseRange;
    if (inRange) this.hunting = false;
    return inRange || this.hunting;
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
        speed = this.stats.patrolSpeed;
        break;
      }
      case 'alert':
        // Freeze and face the hero for a beat — the readable "!" moment.
        this.yaw = dampAngle(this.yaw, Math.atan2(player.x - this.pos.x, player.z - this.pos.z), 14, dt);
        if (this.stateTime >= this.stats.alertSeconds) this.enter('chase');
        break;
      case 'chase':
        if (this.stillTracking(player)) {
          this.lastSeen = { ...player };
          target = player;
          speed = this.chaseSpeed * this.stats.chaseScale;
        } else {
          this.enter('search');
        }
        break;
      default:
        // Kind-specific states (windup/dash/recover) are driven by the subclass.
        break;
      case 'search':
        // Lost the hero: jog to where they were last seen, look around, then give up.
        if (this.canSee(player)) {
          this.alertTo(player);
          break;
        }
        if (this.lastSeen && this.dist(this.lastSeen) > 0.8) {
          target = this.lastSeen;
          speed = this.stats.searchSpeed;
        } else {
          this.yaw += dt * 2.2; // looking around
        }
        if (this.stateTime > this.stats.searchSeconds) {
          this.patrolTarget = null;
          this.enter('patrol');
        }
        break;
    }

    const desired = target ? this.steer(target, speed, dt) : { x: 0, z: 0 };
    this.move(desired, GUARD.acceleration, dt);
    if (this.speed > 0.2 && this.state !== 'alert') this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
  }

  /** Accelerates toward `desired` velocity and slides along walls. Returns the fraction of the move achieved. */
  protected move(desired: Vec2, accel: number, dt: number): number {
    this.vel = accel === Infinity ? { ...desired } : moveTowards(this.vel, desired, accel * dt);
    const before = this.pos;
    const want = Math.hypot(this.vel.x, this.vel.z) * dt;
    this.pos = this.world.move(before, { x: this.vel.x * dt, z: this.vel.z * dt }, this.radius);
    const got = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (dt > 0) this.vel = { x: (this.pos.x - before.x) / dt, z: (this.pos.z - before.z) / dt };
    return want > 1e-6 ? got / want : 1;
  }

  /** Direct steering when the target is in plain sight, A* waypoints otherwise. */
  protected steer(target: Vec2, speed: number, dt: number): Vec2 {
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
    const min = (this.radius + other.radius) * 1.1;
    if (d > 0.001 && d < min) {
      const push = (min - d) * 0.5;
      this.pos = this.world.move(this.pos, { x: (dx / d) * push, z: (dz / d) * push }, this.radius);
    }
  }
}
