import type { NavGrid } from '../ai/NavGrid';
import { ABILITIES, type AbilityKind } from '../data/abilities';
import { PLAYER_CONFIG } from '../data/config';
import { ENDLESS, SPAWN_SCHEDULE, TIKBALANG, type EnemyKind } from '../data/enemies';
import { EXHIBITS } from '../data/exhibits';
import { GUARD, PICKUPS } from '../data/gameplay';
import { EXHIBIT_REWARDS } from '../data/progression';
import { TRAINING } from '../data/training';
import { GuardBrain } from '../enemies/GuardBrain';
import { DogBrain, LungerBrain, TikbalangBrain } from '../enemies/LungerBrain';
import { MultoBrain } from '../enemies/MultoBrain';
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
  | { type: 'guardJoined'; guard: number; kind: EnemyKind }
  | { type: 'windup'; guard: number; kind: EnemyKind }
  | { type: 'bonk'; pos: Vec2; guard: number }
  | { type: 'illusion'; pos: Vec2 }
  | { type: 'decoyPop'; pos: Vec2 }
  | { type: 'discovered'; id: string; points: number; coins: number; diamonds: number; cleared: number }
  | { type: 'endless' }
  | { type: 'idCard'; pos: Vec2 }
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

/** Tikbalang illusion: a harmless copy that circles the hero, then vanishes (or pops when touched). */
export interface Decoy {
  pos: Vec2;
  yaw: number;
  /** Seconds left. */
  ttl: number;
  /** Orbit angle around the hero. */
  angle: number;
  /** Orbit direction (+1 / -1). */
  spin: number;
}

/** Hero-level effects on the ability (see gameplay/Progression#heroPerks). */
export interface AbilityPerks {
  abilityUnlocked: boolean;
  cooldownMult: number;
  boost: number;
}

const FULL_PERKS: AbilityPerks = { abilityUnlocked: true, cooldownMult: 1, boost: 1 };

/** What clearing one exhibit paid. */
export interface ExhibitPayout {
  points: number;
  coins: number;
  diamonds: number;
}

/** Curator ID card for the Card Swipe exhibits: lies somewhere in the museum until picked up. */
export interface IdCard {
  pos: Vec2;
  taken: boolean;
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
  /** Tikbalang illusion copies currently in play. */
  decoys: Decoy[] = [];
  /** Exhibits cleared this run (mini-game won; each pays once). */
  readonly read = new Set<string>();
  /** All exhibits cleared: difficulty now climbs fast until the hero is caught. */
  endless = false;
  endlessTime = 0;
  private endlessSpawned = 0;
  idCard: IdCard | null = null;
  /** Mini-games won this run (daily tasks). */
  gamesWon = 0;
  readonly exhibitTotal = EXHIBITS.length;
  /** How many SPAWN_SCHEDULE entries have joined (the intro guard is entry 0). */
  private spawned = 0;
  private events: RunEvent[] = [];
  /** Events raised between updates (ability use); handed out once by the next `update`. */
  private queued: RunEvent[] = [];

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
  reset(player: Vec2, ability: AbilityKind = this.ability.kind, training = false, perks: AbilityPerks = FULL_PERKS): void {
    this.training = training;
    this.health = new Health();
    // Training always lets you try the ability (owner: try any hero), at its base strength.
    this.ability = training
      ? new Ability(ability, TRAINING.abilityCooldown)
      : new Ability(ability, ABILITIES[ability].cooldown * perks.cooldownMult, perks.boost, !perks.abilityUnlocked);
    this.dummies = training ? TRAINING.dummies.map((d) => ({ pos: { ...d }, home: { ...d }, stun: 0 })) : [];
    this.score = new ScoreKeeper();
    this.score.onBonus = (points) => this.events.push({ type: 'bonus', points });
    this.pickups.reset(player);
    if (training) for (const it of this.pickups.items) it.active = false;
    this.guards.length = 0;
    this.decoys = [];
    this.read.clear();
    this.endless = false;
    this.endlessTime = 0;
    this.endlessSpawned = 0;
    this.gamesWon = 0;
    this.idCard = training ? null : { pos: this.idCardSpot(player), taken: false };
    this.spawned = 0;
    this.over = false;
    this.events = [];
    this.queued = [];
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
    const g = this.makeEnemy(SPAWN_SCHEDULE[0]?.kind ?? 'guard', { ...at }, 0);
    g.yaw = Math.atan2(at.x - player.x, at.z - player.z); // facing away from the hero
    this.guards.push(g);
    this.spawned = 1;
    return g;
  }

  /** Enemy factory: every kind shares the GuardBrain interface (state, pos, stun, hunt...). */
  makeEnemy(kind: EnemyKind, at: Vec2, repathOffset: number): GuardBrain {
    const args = [at, this.nav, this.sight, this.world, this.spots, this.rng, repathOffset] as const;
    switch (kind) {
      case 'dog':
        return new DogBrain(...args);
      case 'multo':
        return new MultoBrain(...args);
      case 'tikbalang':
        return new TikbalangBrain(...args);
      default:
        return new GuardBrain(...args);
    }
  }

  /** Debug/test: drops an enemy of `kind` into the run right now, hunting. */
  spawnEnemy(kind: EnemyKind, player: Vec2, at?: Vec2): GuardBrain {
    const i = this.guards.length;
    const g = this.makeEnemy(kind, at ? { ...at } : this.spawnSpot(player), i * 0.1);
    g.hunt(player);
    this.guards.push(g);
    // Queued so it also reaches the scene when called between updates (debug spawns).
    this.queued.push({ type: 'guardJoined', guard: i, kind });
    return g;
  }

  /** Current chase speed: ramps with run time and is capped. */
  get chaseSpeed(): number {
    if (this.endless) return Math.min(ENDLESS.speedCap, GUARD.chaseSpeedMax + ENDLESS.speedGrowth * this.endlessTime);
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
      const w = { ...ABILITIES.shockwave, radius: ABILITIES.shockwave.radius * this.ability.boost };
      for (const g of this.guards) {
        const dx = g.pos.x - player.x;
        const dz = g.pos.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d > w.radius) continue;
        const dir = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
        // Closer guards get shoved further; collision keeps them out of walls.
        const push = w.push * (1 - (d / w.radius) * 0.5);
        g.pos = this.world.move(g.pos, { x: dir.x * push, z: dir.z * push }, g.radius);
        g.vel = { x: 0, z: 0 };
        g.stun(w.stun);
        affected++;
      }
      // Illusions burst in the shockwave too.
      this.decoys = this.decoys.filter((dc) => {
        if (Math.hypot(dc.pos.x - player.x, dc.pos.z - player.z) > w.radius) return true;
        this.queued.push({ type: 'decoyPop', pos: { ...dc.pos } });
        return false;
      });
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
    this.queued.push({ type: 'ability', kind: this.ability.kind, pos: { ...player }, dir: { ...facing }, affected });
    return true;
  }

  get hasIdCard(): boolean {
    return !!this.idCard?.taken;
  }

  get cleared(): number {
    return this.read.size;
  }

  /** A mini-game was won (counts for daily tasks even when re-clearing in training). */
  wonGame(): void {
    if (!this.training) this.gamesWon++;
  }

  /**
   * Exhibit `id` was cleared (its mini-game won). Pays score + coins once per run, the diamond
   * milestones at 5 / 10 / 15, and switches to Endless Mode after the last one. Training pays nothing.
   */
  discover(id: string): ExhibitPayout {
    const none = { points: 0, coins: 0, diamonds: 0 };
    if (this.over || this.read.has(id)) return none;
    this.read.add(id);
    const cleared = this.read.size;
    if (this.training) {
      this.queued.push({ type: 'discovered', id, ...none, cleared });
      return none;
    }
    const pay = {
      points: this.score.discover(EXHIBIT_REWARDS.coins),
      coins: EXHIBIT_REWARDS.coins,
      diamonds: EXHIBIT_REWARDS.milestones.find((m) => m.at === cleared)?.diamonds ?? 0,
    };
    this.queued.push({ type: 'discovered', id, ...pay, cleared });
    if (cleared >= this.exhibitTotal && !this.endless) {
      this.endless = true;
      this.queued.push({ type: 'endless' });
    }
    return pay;
  }

  /** A walkable spot far from the hero (it's a hunt, not a gift). */
  private idCardSpot(player: Vec2): Vec2 {
    const far = this.spots.filter((s) => Math.hypot(s.x - player.x, s.z - player.z) >= 14);
    const pool = far.length ? far : this.spots;
    return { ...pool[Math.floor(this.rng() * pool.length)]! };
  }

  /** Events raised outside `update` (ability use) are delivered with the next update. */
  update(dt: number, player: Vec2): RunEvent[] {
    // Delivered exactly once: the queue is emptied as it is handed over.
    this.events = this.queued;
    this.queued = [];
    if (this.over) return this.events;
    // Training never scores (no survival bonus to farm).
    if (!this.training) this.score.update(dt);
    if (this.endless && !this.training) this.endlessTime += dt;
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

    const card = this.idCard;
    if (card && !card.taken && Math.hypot(card.pos.x - player.x, card.pos.z - player.z) <= PICKUPS.pickupRadius + 0.2) {
      card.taken = true;
      this.events.push({ type: 'idCard', pos: { ...card.pos } });
    }

    if (!this.peaceful) {
      this.spawnDue(player);
      this.updateGuards(dt, player);
      this.updateDecoys(dt, player);
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

  /** Difficulty director: brings in each SPAWN_SCHEDULE entry once its time comes. */
  private spawnDue(player: Vec2): void {
    while (this.spawned < SPAWN_SCHEDULE.length && this.score.time >= SPAWN_SCHEDULE[this.spawned]!.at) {
      this.spawnEnemy(SPAWN_SCHEDULE[this.spawned]!.kind, player);
      this.spawned++;
    }
    // Endless: a new arrival every few seconds until the museum is packed.
    while (this.endless && this.guards.length < ENDLESS.maxEnemies && this.endlessTime >= (this.endlessSpawned + 1) * ENDLESS.spawnEvery) {
      this.spawnEnemy(ENDLESS.kinds[this.endlessSpawned % ENDLESS.kinds.length]!, player);
      this.endlessSpawned++;
    }
  }

  private castIllusion(from: GuardBrain, player: Vec2): void {
    const T = TIKBALANG;
    const base = Math.atan2(from.pos.x - player.x, from.pos.z - player.z);
    for (let k = 0; k < T.illusionCount; k++) {
      const spin = k % 2 === 0 ? 1 : -1;
      this.decoys.push({ pos: { ...from.pos }, yaw: from.yaw, ttl: T.illusionSeconds, angle: base + spin * 0.6, spin });
    }
    this.events.push({ type: 'illusion', pos: { ...from.pos } });
  }

  private updateDecoys(dt: number, player: Vec2): void {
    const T = TIKBALANG;
    const reach = PLAYER_CONFIG.radius + T.stats.radius;
    this.decoys = this.decoys.filter((dc) => {
      dc.ttl -= dt;
      // Circle the hero at a menacing distance, like the real one sizing you up.
      dc.angle += dc.spin * (T.illusionSpeed / 3.5) * dt;
      const tx = player.x + Math.sin(dc.angle) * 3.5 - dc.pos.x;
      const tz = player.z + Math.cos(dc.angle) * 3.5 - dc.pos.z;
      const d = Math.hypot(tx, tz);
      if (d > 0.05) {
        const s = Math.min(d, T.illusionSpeed * dt);
        dc.pos = this.world.move(dc.pos, { x: (tx / d) * s, z: (tz / d) * s }, T.stats.radius * 0.8);
        dc.yaw = Math.atan2(tx, tz);
      }
      // Copies appear on the tikbalang (often right next to the hero): give them a moment to spread out first.
      const settled = dc.ttl < T.illusionSeconds - T.illusionGrace;
      const touched = settled && Math.hypot(player.x - dc.pos.x, player.z - dc.pos.z) < reach;
      if (dc.ttl > 0 && !touched) return true;
      this.events.push({ type: 'decoyPop', pos: { ...dc.pos } });
      return false;
    });
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
    this.guards.forEach((g, i) => {
      g.chaseSpeed = this.chaseSpeed;
      g.update(dt, player);
      if (g.justAlerted) this.events.push({ type: 'alert', guard: i });
      if (g instanceof LungerBrain) {
        if (g.justWoundUp) this.events.push({ type: 'windup', guard: i, kind: g.kind });
        if (g.justBonked) this.events.push({ type: 'bonk', pos: { ...g.pos }, guard: i });
      }
      if (g instanceof TikbalangBrain && g.wantsIllusion) this.castIllusion(g, player);
    });
    for (let i = 0; i < this.guards.length; i++) for (let j = i + 1; j < this.guards.length; j++) this.guards[i]!.separateFrom(this.guards[j]!);

    for (const g of this.guards) {
      if (g.state === 'stunned' || !g.canHurt) continue;
      const reach = PLAYER_CONFIG.radius + g.radius + GUARD.contactPadding;
      const dx = player.x - g.pos.x;
      const dz = player.z - g.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const dir = d > 1e-4 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 };
      if (this.shielded && !this.health.invulnerable) {
        // Kalasag: the hit bounces off, the guard staggers back, the shield is spent.
        this.ability.end();
        this.health.grantInvuln(0.5);
        g.pos = this.world.move(g.pos, { x: -dir.x * 1.2, z: -dir.z * 1.2 }, g.radius);
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
