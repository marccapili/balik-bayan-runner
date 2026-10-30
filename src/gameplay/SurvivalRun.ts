import type { NavGrid } from '../ai/NavGrid';
import { PLAYER_CONFIG } from '../data/config';
import { GUARD, GUARD_SCHEDULE, MAX_GUARDS } from '../data/gameplay';
import { GuardBrain } from '../enemies/GuardBrain';
import type { CollisionWorld } from '../physics/Collision';
import { clamp, lerp, type Vec2 } from '../utils/math';
import { Health } from './Health';
import { PickupField, type PickupKind } from './PickupField';
import { ScoreKeeper } from './ScoreKeeper';

export type RunEvent =
  | { type: 'pickup'; kind: PickupKind; pos: Vec2; points: number }
  | { type: 'hit'; pos: Vec2; dir: Vec2; hearts: number }
  | { type: 'alert'; guard: number }
  | { type: 'bonus'; points: number }
  | { type: 'guardJoined'; guard: number }
  | { type: 'dead' };

/**
 * One survival run, engine-free: guards, hearts, pickups, score and time.
 * The scene feeds it the hero position each step and renders whatever it reports.
 */
export class SurvivalRun {
  health = new Health();
  score = new ScoreKeeper();
  readonly pickups: PickupField;
  readonly guards: GuardBrain[] = [];
  over = false;
  /** Test/debug switch: no guards, no damage (used by the movement smoke tests). */
  peaceful = false;
  private events: RunEvent[] = [];

  constructor(
    private readonly nav: NavGrid,
    private readonly sight: NavGrid,
    private readonly world: CollisionWorld,
    private readonly spots: readonly Vec2[],
    private readonly rng: () => number = Math.random,
  ) {
    this.pickups = new PickupField(spots, rng);
  }

  /** Clean state for a new run (replay never inherits anything from the last one). */
  reset(player: Vec2): void {
    this.health = new Health();
    this.score = new ScoreKeeper();
    this.score.onBonus = (points) => this.events.push({ type: 'bonus', points });
    this.pickups.reset(player);
    this.guards.length = 0;
    this.over = false;
    this.events = [];
  }

  /** Current chase speed: ramps with run time and is capped. */
  get chaseSpeed(): number {
    return lerp(GUARD.chaseSpeedStart, GUARD.chaseSpeedMax, clamp(this.score.time / GUARD.speedRampSeconds, 0, 1));
  }

  update(dt: number, player: Vec2): RunEvent[] {
    this.events = [];
    if (this.over) return this.events;
    this.score.update(dt);
    this.health.update(dt);

    for (const got of this.pickups.update(dt, player, this.health.hearts < this.health.max)) {
      if (got.kind === 'heart') {
        this.health.heal();
        this.events.push({ type: 'pickup', kind: 'heart', pos: got.pos, points: 0 });
      } else {
        this.events.push({ type: 'pickup', kind: got.kind, pos: got.pos, points: this.score.collect(got.kind) });
      }
    }

    if (!this.peaceful) {
      this.spawnDue(player);
      this.updateGuards(dt, player);
    }
    return this.events;
  }

  private spawnDue(player: Vec2): void {
    const due = GUARD_SCHEDULE.filter((t) => this.score.time >= t).length;
    while (this.guards.length < Math.min(due, MAX_GUARDS)) {
      const i = this.guards.length;
      const g = new GuardBrain(this.spawnSpot(player), this.nav, this.sight, this.world, this.spots, this.rng, i * 0.1);
      g.alertTo(player);
      this.guards.push(g);
      this.events.push({ type: 'guardJoined', guard: i });
    }
  }

  private spawnSpot(player: Vec2): Vec2 {
    let best = this.spots[0]!;
    let bestD = -1;
    for (let tries = 0; tries < 60; tries++) {
      const s = this.spots[Math.floor(this.rng() * this.spots.length)]!;
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d >= GUARD.minSpawnDistance) return { ...s };
      if (d > bestD) {
        best = s;
        bestD = d;
      }
    }
    return { ...best };
  }

  private updateGuards(dt: number, player: Vec2): void {
    const reach = PLAYER_CONFIG.radius + GUARD.radius + GUARD.contactPadding;
    this.guards.forEach((g, i) => {
      g.chaseSpeed = this.chaseSpeed;
      g.update(dt, player);
      if (g.justAlerted) this.events.push({ type: 'alert', guard: i });
    });
    for (let i = 0; i < this.guards.length; i++) for (let j = i + 1; j < this.guards.length; j++) this.guards[i]!.separateFrom(this.guards[j]!);

    for (const g of this.guards) {
      if (g.state === 'stunned') continue;
      const dx = player.x - g.pos.x;
      const dz = player.z - g.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || !this.health.damage()) continue;
      const dir = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
      g.stun(GUARD.hitRecoverSeconds);
      this.score.breakCombo();
      this.events.push({ type: 'hit', pos: { ...player }, dir, hearts: this.health.hearts });
      if (this.health.dead) {
        this.over = true;
        this.events.push({ type: 'dead' });
        return;
      }
    }
  }
}
