import type { Aabb } from '../physics/Collision';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Offset from the focus point to the camera for a fixed pitch looking toward +z. */
export function cameraOffset(pitchDeg: number, distance: number): V3 {
  const p = (pitchDeg * Math.PI) / 180;
  return { x: 0, y: Math.sin(p) * distance, z: -Math.cos(p) * distance };
}

/** Vertical FOV that guarantees at least `minHFovDeg` horizontally at this aspect ratio. */
export function fovForAspect(vFovDeg: number, minHFovDeg: number, aspect: number): number {
  const v = (vFovDeg * Math.PI) / 180;
  const minH = (minHFovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  if (h >= minH) return v;
  return 2 * Math.atan(Math.tan(minH / 2) / aspect);
}

/** Slab test: does the segment a→b pass through the box (with given height)? */
export function segmentHitsBox(a: V3, b: V3, box: Aabb, height: number): boolean {
  let tmin = 0;
  let tmax = 1;
  const axes: Array<[number, number, number, number]> = [
    [a.x, b.x, box.minX, box.maxX],
    [a.y, b.y, 0, height],
    [a.z, b.z, box.minZ, box.maxZ],
  ];
  for (const [p0, p1, lo, hi] of axes) {
    const d = p1 - p0;
    if (Math.abs(d) < 1e-9) {
      if (p0 < lo || p0 > hi) return false;
      continue;
    }
    let t1 = (lo - p0) / d;
    let t2 = (hi - p0) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
