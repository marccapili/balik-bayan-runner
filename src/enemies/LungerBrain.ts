import type { NavGrid } from '../ai/NavGrid';
import { DOG, TIKBALANG, type EnemyKind } from '../data/enemies';
import { GUARD } from '../data/gameplay';
import type { CollisionWorld } from '../physics/Collision';
import { dampAngle, type Vec2 } from '../utils/math';
import { GuardBrain } from './GuardBrain';

interface LungeConfig {
  range: number;
  minRange: number;
  windupSeconds: number;
  speed: number;
  seconds: number;
  cooldown: number;
  /** Seconds of panting after a lunge (0 = straight back to chasing). */
  recoverSeconds: number;
  recoverSpeed: number;
  /** >0: slamming into a wall mid-lunge stuns the attacker itself for this long. */
  wallStun: number;
}

/**
 * Chaser with a telegraphed straight-line lunge (engine-free):
 * chase → (hero in range, clear line) windup (aim locked, red lane shown) → dash → recover → chase.
 * The aim is locked when the windup starts, so stepping sideways during the telegraph dodges it.
 */
export abstract class LungerBrain extends GuardBrain {
  /** Unit direction of the current/last lunge. */
  aim: Vec2 = { x: 0, z: 1 };
  /** True on the frame a windup starts (growl/neigh sound, lane appears). */
  justWoundUp = false;
  /** True on the frame the attacker slammed into a wall. */
  justBonked = false;
  protected lungeCd = 1;

  constructor(
    start: Vec2,
    nav: NavGrid,
    sight: NavGrid,
    world: CollisionWorld,
    patrolPoints: readonly Vec2[],
    rng: () => number,
    repathOffset: number,
    stats: GuardBrain['stats'],
    protected readonly lunge: LungeConfig,
  ) {
    super(start, nav, sight, world, patrolPoints, rng, repathOffset, stats);
  }

  /** 0..1 progress of the telegraph (for the lane / crouch). */
  get windupFrac(): number {
    return this.state === 'windup' ? Math.min(1, this.stateTime / this.lunge.windupSeconds) : 0;
  }

  get lungeDistance(): number {
    return this.lunge.speed * this.lunge.seconds;
  }

  override update(dt: number, player: Vec2): void {
    this.justWoundUp = false;
    this.justBonked = false;
    this.lungeCd -= dt;
    const L = this.lunge;
    switch (this.state) {
      case 'windup':
        this.stateTime += dt;
        this.justAlerted = false;
        this.yaw = dampAngle(this.yaw, Math.atan2(this.aim.x, this.aim.z), 16, dt);
        this.move({ x: 0, z: 0 }, GUARD.acceleration * 2, dt);
        if (this.stateTime >= L.windupSeconds) this.enter('dash');
        return;
      case 'dash': {
        this.stateTime += dt;
        this.justAlerted = false;
        const frac = this.move({ x: this.aim.x * L.speed, z: this.aim.z * L.speed }, Infinity, dt);
        const hitWall = frac < 0.5;
        if (hitWall || this.stateTime >= L.seconds) {
          this.lungeCd = L.cooldown;
          this.vel = { x: 0, z: 0 };
          if (hitWall && L.wallStun > 0) {
            this.justBonked = true;
            this.stun(L.wallStun);
          } else {
            this.enter(L.recoverSeconds > 0 ? 'recover' : 'chase');
          }
        }
        return;
      }
      case 'recover': {
        this.stateTime += dt;
        this.justAlerted = false;
        this.move(this.steer(player, L.recoverSpeed, dt), GUARD.acceleration, dt);
        if (this.speed > 0.2) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 8, dt);
        if (this.stateTime >= L.recoverSeconds) this.enter('chase');
        return;
      }
      default:
        break;
    }
    super.update(dt, player);
    if (this.state !== 'chase' || this.lungeCd > 0) return;
    const d = this.dist(player);
    if (d > L.range || d < L.minRange || !this.sight.lineClear(this.pos, player)) return;
    this.aim = { x: (player.x - this.pos.x) / d, z: (player.z - this.pos.z) / d };
    this.enter('windup');
    this.justWoundUp = true;
  }
}

/** Guard dog: quick lunge, pants afterwards. */
export class DogBrain extends LungerBrain {
  constructor(start: Vec2, nav: NavGrid, sight: NavGrid, world: CollisionWorld, spots: readonly Vec2[], rng: () => number, repathOffset = 0) {
    super(start, nav, sight, world, spots, rng, repathOffset, DOG.stats, {
      range: DOG.dashRange,
      minRange: DOG.dashMinRange,
      windupSeconds: DOG.windupSeconds,
      speed: DOG.dashSpeed,
      seconds: DOG.dashSeconds,
      cooldown: DOG.dashCooldown,
      recoverSeconds: DOG.recoverSeconds,
      recoverSpeed: DOG.recoverSpeed,
      wallStun: 0,
    });
  }

  override get kind(): EnemyKind {
    return 'dog';
  }
}

/** Tikbalang: rears up, charges far, bonks on walls; periodically casts illusion copies. */
export class TikbalangBrain extends LungerBrain {
  /** True on the frame it casts its illusion (the run spawns the copies). */
  wantsIllusion = false;
  private illusionCd = TIKBALANG.illusionEvery * 0.5;

  constructor(start: Vec2, nav: NavGrid, sight: NavGrid, world: CollisionWorld, spots: readonly Vec2[], rng: () => number, repathOffset = 0) {
    super(start, nav, sight, world, spots, rng, repathOffset, TIKBALANG.stats, {
      range: TIKBALANG.chargeRange,
      minRange: TIKBALANG.chargeMinRange,
      windupSeconds: TIKBALANG.windupSeconds,
      speed: TIKBALANG.chargeSpeed,
      seconds: TIKBALANG.chargeSeconds,
      cooldown: TIKBALANG.chargeCooldown,
      recoverSeconds: 0.35,
      recoverSpeed: 1,
      wallStun: TIKBALANG.wallStun,
    });
  }

  override get kind(): EnemyKind {
    return 'tikbalang';
  }

  override update(dt: number, player: Vec2): void {
    this.wantsIllusion = false;
    super.update(dt, player);
    if (this.state === 'chase' || this.state === 'recover') {
      this.illusionCd -= dt;
      if (this.illusionCd <= 0) {
        this.illusionCd = TIKBALANG.illusionEvery;
        this.wantsIllusion = true;
      }
    }
  }
}
