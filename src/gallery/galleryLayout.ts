import { aabbFromCenter, type Aabb } from '../physics/Collision';
import type { Vec2 } from '../utils/math';

/**
 * Engine-free layout of the Future Heroes Gallery: where every pedestal stands, what the hero collides with
 * and which exhibit is in reach. The room is a hall whose long axis runs away from the camera (+z); works
 * line the left wall going in and the right wall coming back (alphabetical, like reading a hallway).
 */

export interface RoomSpec {
  width: number;
  firstZ: number;
  spacing: number;
  wallInset: number;
  spawn: Vec2;
  reach: number;
  pedestalHalf: number;
  tvReach: number;
  plaqueReach: number;
}

export type SpotKind = 'work' | 'tv' | 'game';

export interface Spot {
  kind: SpotKind;
  /** Work index for 'work' spots (-1 otherwise). */
  index: number;
  at: Vec2;
  /** Yaw the exhibit faces (radians, 0 = toward -z / the camera). */
  facing: number;
  reach: number;
}

export interface GalleryLayout {
  /** Inner floor rectangle. */
  bounds: Aabb;
  spots: Spot[];
  colliders: Aabb[];
  tv: Vec2;
  spawn: Vec2;
}

const WALL = 0.5;

export function galleryLayout(count: number, r: RoomSpec): GalleryLayout {
  const perSide = Math.max(1, Math.ceil(count / 2));
  const lastZ = r.firstZ + (perSide - 1) * r.spacing;
  const depth = lastZ + 3.4;
  const half = r.width / 2;
  const bounds: Aabb = { minX: -half, maxX: half, minZ: 0, maxZ: depth };
  const spots: Spot[] = [];
  for (let i = 0; i < count; i++) {
    const left = i < perSide;
    const k = left ? i : perSide - 1 - (i - perSide);
    const z = r.firstZ + k * r.spacing;
    const x = left ? -half + r.wallInset : half - r.wallInset;
    // Left-wall works face +x (yaw -90°), right-wall works face -x (yaw +90°).
    spots.push({ kind: 'work', index: i, at: { x, z }, facing: left ? -Math.PI / 2 : Math.PI / 2, reach: r.reach });
  }
  const tv = { x: 0, z: (r.firstZ + lastZ) / 2 + 0.6 };
  spots.push({ kind: 'tv', index: -1, at: tv, facing: 0, reach: r.tvReach });
  const game = { x: half - 2.6, z: 2.1 };
  spots.push({ kind: 'game', index: -1, at: game, facing: 0, reach: r.plaqueReach });

  const colliders: Aabb[] = [
    { minX: -half - WALL, maxX: half + WALL, minZ: depth, maxZ: depth + WALL },
    { minX: -half - WALL, maxX: half + WALL, minZ: -WALL, maxZ: 0 },
    { minX: -half - WALL, maxX: -half, minZ: 0, maxZ: depth },
    { minX: half, maxX: half + WALL, minZ: 0, maxZ: depth },
    aabbFromCenter(tv.x, tv.z, 2.2, 1.0),
    aabbFromCenter(game.x, game.z, 0.8, 0.5),
  ];
  for (const s of spots) if (s.kind === 'work') colliders.push(aabbFromCenter(s.at.x, s.at.z, r.pedestalHalf * 2, r.pedestalHalf * 2));
  return { bounds, spots, colliders, tv, spawn: { ...r.spawn } };
}

/** The spot the hero can use from `pos`: the closest one whose reach covers the hero. */
export function spotInReach(pos: Vec2, spots: readonly Spot[]): Spot | null {
  let best: Spot | null = null;
  let bestGap = 0;
  for (const s of spots) {
    const gap = Math.hypot(pos.x - s.at.x, pos.z - s.at.z) - s.reach;
    if (gap <= 0 && (!best || gap < bestGap)) {
      best = s;
      bestGap = gap;
    }
  }
  return best;
}

/** Which page(s) a book shows at spread `s`: two-page spreads put page 0 alone on the right (a cover). */
export function spreadPages(spread: number, pageCount: number, twoUp: boolean): { left: number; right: number } {
  if (!twoUp) return { left: -1, right: spread < pageCount ? spread : -1 };
  const left = spread * 2 - 1;
  const right = spread * 2;
  return { left: left >= 0 && left < pageCount ? left : -1, right: right < pageCount ? right : -1 };
}

/** Number of spreads (views) a book has. */
export function spreadCount(pageCount: number, twoUp: boolean): number {
  return twoUp ? Math.floor(pageCount / 2) + 1 : pageCount;
}
