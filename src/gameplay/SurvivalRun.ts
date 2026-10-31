import type { NavGrid } from '../ai/NavGrid';
import { ABILITIES, type AbilityKind } from '../data/abilities';
import { PLAYER_CONFIG } from '../data/config';
import { GUARD, GUARD_SCHEDULE, MAX_GUARDS } from '../data/gameplay';
import { TRAINING } from '../data/training';
import { GuardBrain } from '../enemies/GuardBrain';
import type { CollisionWorld } from '../physics/Collision';
import { clamp, lerp, type Vec2 } from '../utils/math';
import { Ability } from './Ability';
import { Health } from './Health';
import { PickupField, type PickupKind } from './PickupField';
import { ScoreKeeper } from './ScoreKeeper';

export type RunEvent =
  | { type: 'pickup'; kind: PickupKind; pos: Vec2; points: number }
  | { type: 'hit'; pos: Vec2; dir: Vec2; hearts: number }
  | { type: 'alert'; guard: number }
  | { type: 'bonus'; points: number }
  | { type: 'guardJoined'; guard: number }
  | { type: 'ability'; kind: AbilityKind; pos: Vec2; dir: Vec2; affected: number }
  | { type: 'blocked'; pos: Vec2; guard: number }
  | { type: 'dead' };

/** Training practice dummy: never moves on its own or hurts the hero; abilities knock it around. */
export interface Dummy {
  pos: Vec2;
  home: Vec2;
  /** Seconds left knocked over. */
  stun: number;
}

/**
 * One survival run, engine-free: guards, hearts, pickups, score and time.
 * The scene feeds it the hero position each step and renders whatever it reports.
 */
export class SurvivalRun {
  health = new Health();
  score = new ScoreKeeper();
  ability = new Ability('sprint');
  readonly pickups: PickupField;
  readonly guards: GuardBrain[] = [];
  over = false;
  /** Test/debug switch: no guards, no damage (used by the movement smoke tests). */
  peaceful = false;
  /** Training mode: no guards, no coins, short cooldown, practice dummies. */
  training = false;
  dummies: Dummy[] = [];
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
  reset(player: Vec2, ability: AbilityKind = this.ability.kind, training = false): void {
    this.training = training;
    this.health = new Health();
    this.ability = new Ability(ability, training ? TRAINING.abilityCooldown : undefined);
    this.dummies = training ? TRAINING.dummies.map((d) => ({ pos: { ...d }, home: { ...d }, stun: 0 })) : [];
    this.score = new ScoreKeeper();
    this.score.onBonus = (points) => this.events.push({ type: 'bonus', points });
    this.pickups.reset(player);
    if (training) for (const it of this.pickups.items) it.active = false;
    this.guards.length = 0;
    this.over = false;
    this.events = [];
  }

  /**
   * Intro: puts the first guard on screen (up-screen of the hero, clear line of sight), back turned.
   * It stays idle until the intro calls `hunt` on it. Counts as the t=0 scheduled guard.
   */
  placeIntroGuard(player: Vec2, range: readonly [number, number]): GuardBrain | null {
    if (this.peaceful) return null;
    const [lo, hi] = range;
    const ok = (s: Vec2, strict: boolean): boolean => {
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d < lo || d > hi) return false;
      return !strict || (s.z > player.z + lo * 0.5 && this.sight.lineClear(s, player));
    };
    let pool = this.spots.filter((s) => ok(s, true));
    if (!pool.length) pool = this.spots.filter((s) => ok(s, false));
    if (!pool.length) pool = [this.spawnSpot(player)];
    const at = pool[Math.floor(this.rng() * pool.length)]!;
    const g = new GuardBrain({ ...at }, this.nav, this.sight, this.world, this.spots, this.rng, 0);
    g.yaw = Math.atan2(at.x - player.x, at.z - player.z); // facing away from the hero
    this.guards.push(g);
    return g;
  }

  /** Current chase speed: ramps with run time and is capped. */
  get chaseSpeed(): number {
    return lerp(GUARD.chaseSpeedStart, GUARD.chaseSpeedMax, clamp(this.score.time / GUARD.speedRampSeconds, 0, 1));
  }

  /** Hero top-speed multiplier from the current ability (Rizal's sprint). */
  get speedMultiplier(): number {
    return this.ability.kind === 'sprint' && this.ability.active ? ABILITIES.sprint.speedMultiplier : 1;
  }

  /** True while Lapu-Lapu's shield is up. */
  get shielded(): boolean {
    return this.ability.kind === 'shield' && this.ability.active;
  }

  /**
   * Fires the hero's ability if it is ready. `facing` is the hero's unit facing direction (dash direction).
   * Movement effects (sprint speed, dash burst) are applied by the scene from the 'ability' event / `speedMultiplier`.
   */
  useAbility(player: Vec2, facing: Vec2): boolean {
    if (this.over || !this.ability.trigger()) return false;
    let affected = 0;
    if (this.ability.kind === 'shockwave') {
      const w = ABILITIES.shockwave;
      for (const g of this.guards) {
        const dx = g.pos.x - player.x;
        const dz = g.pos.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d > w.radius) continue;
        const dir = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
        // Closer guards get shoved further; collision keeps them out of walls.
        const push = w.push * (1 - (d / w.radius) * 0.5);
        g.pos = this.world.move(g.pos, { x: dir.x * push, z: dir.z * push }, GUARD.radius);
        g.vel = { x: 0, z: 0 };
        g.stun(w.stun);
        affected++;
      }
      for (const dm of this.dummies) {
        const dx = dm.pos.x - player.x;
        const dz = dm.pos.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d > w.radius) continue;
        const dir = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
        const push = w.push * (1 - (d / w.radius) * 0.5);
        dm.pos = this.world.move(dm.pos, { x: dir.x * push, z: dir.z * push }, TRAINING.dummyRadius);
        dm.stun = TRAINING.dummyStun;
        affected++;
      }
    } else if (this.ability.kind === 'dash') {
      this.health.grantInvuln(ABILITIES.dash.invulnerable);
    }
    this.events.push({ type: 'ability', kind: this.ability.kind, pos: { ...player }, dir: { ...facing }, affected });
    return true;
  }

  /** Events raised outside `update` (ability use) are delivered with the next update. */
  update(dt: number, player: Vec2): RunEvent[] {
    const pending = this.events.filter((e) => e.type === 'ability');
    this.events = pending;
    if (this.over) return this.events;
    // Training never scores (no survival bonus to farm).
    if (!this.training) this.score.update(dt);
    this.health.update(dt);
    this.ability.update(dt);

    if (this.training) {
      this.updateDummies(dt, player);
      return this.events;
    }

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

  private updateDummies(dt: number, player: Vec2): void {
    const reach = PLAYER_CONFIG.radius + TRAINING.dummyRadius + GUARD.contactPadding;
    this.dummies.forEach((dm, i) => {
      if (dm.stun > 0) {
        dm.stun = Math.max(0, dm.stun - dt);
      } else {
        // Wobble back to its spot so the next practice shot has a target.
        const dx = dm.home.x - dm.pos.x;
        const dz = dm.home.z - dm.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.02) {
          const s = Math.min(d, TRAINING.dummyReturnSpeed * dt);
          dm.pos = this.world.move(dm.pos, { x: (dx / d) * s, z: (dz / d) * s }, TRAINING.dummyRadius);
        }
      }
      const px = player.x - dm.pos.x;
      const pz = player.z - dm.pos.z;
      const pd = Math.hypot(px, pz);
      if (pd > reach || !this.shielded) return;
      // Bumping a dummy with the shield up shows exactly what a real block does.
      const dir = pd > 1e-4 ? { x: px / pd, z: pz / pd } : { x: 0, z: 1 };
      this.ability.end();
      dm.pos = this.world.move(dm.pos, { x: -dir.x * 1.2, z: -dir.z * 1.2 }, TRAINING.dummyRadius);
      dm.stun = TRAINING.dummyStun;
      this.events.push({ type: 'blocked', pos: { ...player }, guard: -1 - i });
    });
  }

  private spawnDue(player: Vec2): void {
    const due = GUARD_SCHEDULE.filter((t) => this.score.time >= t).length;
    while (this.guards.length < Math.min(due, MAX_GUARDS)) {
      const i = this.guards.length;
      const g = new GuardBrain(this.spawnSpot(player), this.nav, this.sight, this.world, this.spots, this.rng, i * 0.1);
      g.hunt(player);
      this.guards.push(g);
      this.events.push({ type: 'guardJoined', guard: i });
    }
  }

  private spawnSpot(player: Vec2): Vec2 {
    // Prefer the spawn band; fall back to the spot closest to its middle.
    const mid = (GUARD.minSpawnDistance + GUARD.maxSpawnDistance) / 2;
    let best = this.spots[0]!;
    let bestErr = Infinity;
    for (let tries = 0; tries < 80; tries++) {
      const s = this.spots[Math.floor(this.rng() * this.spots.length)]!;
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d >= GUARD.minSpawnDistance && d <= GUARD.maxSpawnDistance) return { ...s };
      if (Math.abs(d - mid) < bestErr) {
        best = s;
        bestErr = Math.abs(d - mid);
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
      if (d > reach) continue;
      const dir = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
      if (this.shielded && !this.health.invulnerable) {
        // Kalasag: the hit bounces off, the guard staggers back, the shield is spent.
        this.ability.end();
        this.health.grantInvuln(0.5);
        g.pos = this.world.move(g.pos, { x: -dir.x * 1.2, z: -dir.z * 1.2 }, GUARD.radius);
        g.stun(ABILITIES.shield.blockStun);
        this.events.push({ type: 'blocked', pos: { ...player }, guard: this.guards.indexOf(g) });
        continue;
      }
      if (!this.health.damage()) continue;
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
