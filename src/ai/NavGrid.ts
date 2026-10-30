import type { Aabb } from '../physics/Collision';
import type { Vec2 } from '../utils/math';

/**
 * Walkability grid rasterised from the museum colliders (inflated by the agent radius),
 * with 8-connected A* and line-of-sight path smoothing. Engine-free and unit-tested.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(
    readonly bounds: Aabb,
    boxes: readonly Aabb[],
    readonly cell = 0.5,
    inflate = 0.45,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (const b of boxes) {
      const c0 = Math.max(0, Math.floor((b.minX - inflate - bounds.minX) / cell));
      const c1 = Math.min(this.cols - 1, Math.floor((b.maxX + inflate - bounds.minX) / cell));
      const r0 = Math.max(0, Math.floor((b.minZ - inflate - bounds.minZ) / cell));
      const r1 = Math.min(this.rows - 1, Math.floor((b.maxZ + inflate - bounds.minZ) / cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.blocked[r * this.cols + c] = 1;
    }
  }

  colOf(x: number): number {
    return Math.floor((x - this.bounds.minX) / this.cell);
  }
  rowOf(z: number): number {
    return Math.floor((z - this.bounds.minZ) / this.cell);
  }
  centerOf(c: number, r: number): Vec2 {
    return { x: this.bounds.minX + (c + 0.5) * this.cell, z: this.bounds.minZ + (r + 0.5) * this.cell };
  }

  isBlockedCell(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  isWalkable(p: Vec2): boolean {
    return !this.isBlockedCell(this.colOf(p.x), this.rowOf(p.z));
  }

  /** All walkable cell centres (used for spawn points). */
  walkableCells(): Vec2[] {
    const out: Vec2[] = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (!this.blocked[r * this.cols + c]) out.push(this.centerOf(c, r));
    return out;
  }

  /** Nearest walkable cell to p (spiral search), or null. */
  nearestWalkable(p: Vec2, maxRing = 8): { c: number; r: number } | null {
    const c0 = this.colOf(p.x);
    const r0 = this.rowOf(p.z);
    if (!this.isBlockedCell(c0, r0)) return { c: c0, r: r0 };
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (!this.isBlockedCell(c0 + dc, r0 + dr)) return { c: c0 + dc, r: r0 + dr };
        }
      }
    }
    return null;
  }

  /** True when a straight walk from a to b stays on walkable cells. */
  lineClear(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable({ x: a.x + dx * t, z: a.z + dz * t })) return false;
    }
    return true;
  }

  /** A* from a to b. Returns smoothed world waypoints (excluding the start), or null if unreachable. */
  findPath(a: Vec2, b: Vec2): Vec2[] | null {
    const s = this.nearestWalkable(a);
    const g = this.nearestWalkable(b);
    if (!s || !g) return null;
    const cols = this.cols;
    const start = s.r * cols + s.c;
    const goal = g.r * cols + g.c;
    if (start === goal) return [b];

    const n = this.cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (i: number): number => {
      const dx = Math.abs((i % cols) - g.c);
      const dz = Math.abs(Math.floor(i / cols) - g.r);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    gScore[start] = 0;
    heap.push(start, h(start));

    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % cols;
      const cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (this.isBlockedCell(nc, nr)) continue;
          // No corner cutting through blocked diagonals.
          if (dc && dr && (this.isBlockedCell(cc + dc, cr) || this.isBlockedCell(cc, cr + dr))) continue;
          const ni = nr * cols + nc;
          if (closed[ni]) continue;
          const ng = gScore[cur]! + (dc && dr ? Math.SQRT2 : 1);
          if (ng < gScore[ni]!) {
            gScore[ni] = ng;
            came[ni] = cur;
            heap.push(ni, ng + h(ni));
          }
        }
      }
    }
    if (came[goal] === -1) return null;

    const cells: Vec2[] = [];
    for (let i = goal; i !== start && i !== -1; i = came[i]!) cells.push(this.centerOf(i % cols, Math.floor(i / cols)));
    cells.reverse();
    cells[cells.length - 1] = this.isWalkable(b) ? { ...b } : cells[cells.length - 1]!;

    // String-pull: skip waypoints we can see past.
    const out: Vec2[] = [];
    let anchor = a;
    let i = 0;
    while (i < cells.length) {
      let far = i;
      for (let j = cells.length - 1; j > i; j--) {
        if (this.lineClear(anchor, cells[j]!)) {
          far = j;
          break;
        }
      }
      out.push(cells[far]!);
      anchor = cells[far]!;
      i = far + 1;
    }
    return out;
  }
}

/** Minimal binary heap of (index, priority). */
class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, p: number): void {
    this.ids.push(id);
    this.pri.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent]! <= this.pri[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastP = this.pri.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pri[l]! < this.pri[m]!) m = l;
        if (r < this.ids.length && this.pri[r]! < this.pri[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
  }
}
