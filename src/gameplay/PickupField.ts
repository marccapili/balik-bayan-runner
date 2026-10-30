import { PICKUPS } from '../data/gameplay';
import type { Vec2 } from '../utils/math';

export type PickupKind = 'coin' | 'rareCoin' | 'heart';

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec2;
  active: boolean;
  /** Seconds until an inactive slot respawns, or a heart despawns. */
  timer: number;
}

/**
 * Keeps a fixed pool of coin slots alive on valid floor cells. A slot is marked collected
 * the instant it is picked up, so one pickup can never be counted twice.
 */
export class PickupField {
  readonly items: Pickup[] = [];
  private heartTimer: number = PICKUPS.heartCheckEvery;
  private nextId = 1;

  constructor(
    private readonly spots: readonly Vec2[],
    private readonly rng: () => number = Math.random,
    private readonly cfg = PICKUPS,
  ) {
    if (!spots.length) throw new Error('PickupField needs spawn spots');
  }

  /** Fills the board at run start (avoiding the player's surroundings). */
  reset(player: Vec2): void {
    this.items.length = 0;
    this.heartTimer = this.cfg.heartCheckEvery;
    for (let i = 0; i < this.cfg.activeCoins; i++) {
      this.items.push({ id: this.nextId++, kind: this.rollKind(), pos: this.pickSpot(player, 2.5), active: true, timer: 0 });
    }
  }

  private rollKind(): 'coin' | 'rareCoin' {
    return this.rng() < this.cfg.rareChance ? 'rareCoin' : 'coin';
  }

  private pickSpot(avoid: Vec2, minDist: number): Vec2 {
    for (let tries = 0; tries < 40; tries++) {
      const s = this.spots[Math.floor(this.rng() * this.spots.length)]!;
      if (Math.hypot(s.x - avoid.x, s.z - avoid.z) < minDist) continue;
      if (this.items.some((it) => it.active && Math.hypot(it.pos.x - s.x, it.pos.z - s.z) < 1.2)) continue;
      return { ...s };
    }
    return { ...this.spots[Math.floor(this.rng() * this.spots.length)]! };
  }

  /**
   * Advances timers and collects anything within reach of the player.
   * @returns the pickups collected this step (each at most once).
   */
  update(dt: number, player: Vec2, hurt: boolean): Pickup[] {
    const got: Pickup[] = [];
    const r2 = this.cfg.pickupRadius * this.cfg.pickupRadius;
    for (const it of this.items) {
      if (it.active) {
        const dx = it.pos.x - player.x;
        const dz = it.pos.z - player.z;
        if (dx * dx + dz * dz <= r2) {
          it.active = false;
          got.push({ ...it, pos: { ...it.pos } });
          it.timer = it.kind === 'heart' ? Infinity : this.respawnDelay();
          continue;
        }
        if (it.kind === 'heart') {
          it.timer -= dt;
          if (it.timer <= 0) {
            it.active = false;
            it.timer = Infinity;
          }
        }
      } else if (it.kind !== 'heart') {
        it.timer -= dt;
        if (it.timer <= 0) {
          it.kind = this.rollKind();
          it.pos = this.pickSpot(player, this.cfg.respawnMinDistance);
          it.active = true;
        }
      }
    }
    // Hearts are pruned once used/expired so the array never grows.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (it.kind === 'heart' && !it.active) this.items.splice(i, 1);
    }

    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = this.cfg.heartCheckEvery;
      const hasHeart = this.items.some((it) => it.kind === 'heart' && it.active);
      if (hurt && !hasHeart && this.rng() < this.cfg.heartChance) {
        this.items.push({ id: this.nextId++, kind: 'heart', pos: this.pickSpot(player, 8), active: true, timer: this.cfg.heartLifetime });
      }
    }
    return got;
  }

  private respawnDelay(): number {
    const [a, b] = this.cfg.respawnDelay;
    return a + this.rng() * (b - a);
  }
}
