import type { Vec2 } from '../utils/math';

/** Axis-aligned box on the ground plane (x/z). Height is only used for rendering & camera occlusion. */
export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const aabbFromCenter = (cx: number, cz: number, w: number, d: number): Aabb => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

/**
 * Pushes a circle out of a box. Returns the corrected centre, or null when not overlapping.
 */
export function resolveCircleAabb(p: Vec2, r: number, b: Aabb): Vec2 | null {
  const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return { x: p.x + (dx / d) * push, z: p.z + (dz / d) * push };
  }
  // Centre is inside the box: leave through the nearest face.
  const left = p.x - b.minX;
  const right = b.maxX - p.x;
  const down = p.z - b.minZ;
  const up = b.maxZ - p.z;
  const m = Math.min(left, right, down, up);
  if (m === left) return { x: b.minX - r, z: p.z };
  if (m === right) return { x: b.maxX + r, z: p.z };
  if (m === down) return { x: p.x, z: b.minZ - r };
  return { x: p.x, z: b.maxZ + r };
}

/** Simple uniform grid broadphase so collision cost does not grow with museum size. */
export class CollisionWorld {
  private readonly cells = new Map<string, Aabb[]>();
  /** Temporary blockers (training barriers). Few boxes, so they are checked every query. */
  private extra: readonly Aabb[] = [];

  constructor(
    readonly boxes: readonly Aabb[],
    private readonly cellSize = 4,
  ) {
    for (const b of boxes) {
      for (let gx = Math.floor(b.minX / cellSize); gx <= Math.floor(b.maxX / cellSize); gx++) {
        for (let gz = Math.floor(b.minZ / cellSize); gz <= Math.floor(b.maxZ / cellSize); gz++) {
          const k = `${gx},${gz}`;
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(b);
        }
      }
    }
  }

  setExtra(boxes: readonly Aabb[]): void {
    this.extra = boxes;
  }

  private nearby(p: Vec2, r: number): Set<Aabb> {
    const out = new Set<Aabb>(this.extra);
    const s = this.cellSize;
    for (let gx = Math.floor((p.x - r) / s); gx <= Math.floor((p.x + r) / s); gx++) {
      for (let gz = Math.floor((p.z - r) / s); gz <= Math.floor((p.z + r) / s); gz++) {
        const list = this.cells.get(`${gx},${gz}`);
        if (list) for (const b of list) out.add(b);
      }
    }
    return out;
  }

  /** True if a circle at p overlaps any box. */
  overlaps(p: Vec2, r: number): boolean {
    for (const b of this.nearby(p, r)) if (resolveCircleAabb(p, r, b)) return true;
    return false;
  }

  /**
   * Moves a circle from `from` by `delta`, sliding along walls.
   * Large moves are sub-stepped so fast dashes can never tunnel through thin walls.
   */
  move(from: Vec2, delta: Vec2, r: number): Vec2 {
    const dist = Math.hypot(delta.x, delta.z);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    let p = { x: from.x, z: from.z };
    for (let i = 0; i < steps; i++) {
      p = { x: p.x + delta.x / steps, z: p.z + delta.z / steps };
      // A few relaxation passes handle corners where two boxes meet.
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const b of this.nearby(p, r)) {
          const fixed = resolveCircleAabb(p, r, b);
          if (fixed) {
            p = fixed;
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
    return p;
  }
}
