import { GADGETS, GADGET_KINDS, type GadgetKind } from '../data/gadgets';
import type { Vec2 } from '../utils/math';

export interface GadgetPickup {
  id: number;
  kind: GadgetKind;
  pos: Vec2;
  /** Seconds left before it vanishes. */
  ttl: number;
}

/** Weighted pick (`r` in [0,1)). */
export function rollGadget(r: number, weights: Record<GadgetKind, number> = GADGETS.weights): GadgetKind {
  const total = GADGET_KINDS.reduce((s, k) => s + weights[k], 0);
  let x = r * total;
  for (const k of GADGET_KINDS) {
    x -= weights[k];
    if (x < 0) return k;
  }
  return GADGET_KINDS[GADGET_KINDS.length - 1]!;
}

/**
 * Gadgets on the museum floor: spawns a few over time, expires untouched ones, and hands out
 * the ones the hero walks over. `canHold` = the hero's slot is free (the magnet never needs it).
 */
export class GadgetField {
  readonly items: GadgetPickup[] = [];
  private timer: number = GADGETS.firstAfter;
  private nextId = 1;

  constructor(
    private readonly spots: readonly Vec2[],
    private readonly rng: () => number = Math.random,
    private readonly cfg = GADGETS,
  ) {}

  reset(): void {
    this.items.length = 0;
    this.timer = this.cfg.firstAfter;
  }

  /** Drops a gadget now (debug/tests), near `at` if given. */
  spawn(player: Vec2, kind?: GadgetKind, at?: Vec2): GadgetPickup {
    const g: GadgetPickup = {
      id: this.nextId++,
      kind: kind ?? rollGadget(this.rng(), this.cfg.weights),
      pos: at ? { ...at } : this.pickSpot(player),
      ttl: this.cfg.lifetime,
    };
    this.items.push(g);
    return g;
  }

  private pickSpot(player: Vec2): Vec2 {
    for (let tries = 0; tries < 60; tries++) {
      const s = this.spots[Math.floor(this.rng() * this.spots.length)]!;
      if (Math.hypot(s.x - player.x, s.z - player.z) < this.cfg.minDistance) continue;
      if (this.items.some((it) => Math.hypot(it.pos.x - s.x, it.pos.z - s.z) < 4)) continue;
      return { ...s };
    }
    return { ...this.spots[Math.floor(this.rng() * this.spots.length)]! };
  }

  /** Advances spawn/expiry and returns what the hero picked up this step (each at most once). */
  update(dt: number, player: Vec2, canHold: boolean): GadgetPickup[] {
    const got: GadgetPickup[] = [];
    const r = this.cfg.pickupRadius;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.ttl -= dt;
      const near = Math.hypot(it.pos.x - player.x, it.pos.z - player.z) <= r;
      if (near && (it.kind === 'magnet' || canHold)) {
        got.push(it);
        this.items.splice(i, 1);
        // Only one gadget per slot: a second holdable one in the same step stays on the floor.
        if (it.kind !== 'magnet') canHold = false;
      } else if (it.ttl <= 0) {
        this.items.splice(i, 1);
      }
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      const [a, b] = this.cfg.spawnEvery;
      this.timer = a + this.rng() * (b - a);
      if (this.items.length < this.cfg.maxOnMap) this.spawn(player);
    }
    return got;
  }
}
