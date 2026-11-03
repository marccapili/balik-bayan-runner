import type { HeroModelDef } from '../data/heroModels';
import { clamp } from '../utils/math';

/** Bone order shared by the skinning data and `HeroGlb` (matches the HeroRig nodes). */
export const SKIN_BONES = ['body', 'hips', 'torso', 'head', 'legL', 'legR', 'armL', 'armR'] as const;
export type SkinBone = (typeof SKIN_BONES)[number];
const B = Object.fromEntries(SKIN_BONES.map((b, i) => [b, i])) as Record<SkinBone, number>;

/** Soft-label pass count: each pass blends a vertex halfway toward its neighbours. */
const SMOOTH_PASSES = 4;

/**
 * Automatic skin weights for an unrigged chibi model (positions normalised by `parseGlb`).
 * 1. Each vertex gets one body part from the model's landmarks: head above the neck, arms
 *    outside the arm line, legs below the hips (split left/right), torso above the waist,
 *    hips for the rest.
 * 2. Weights are then blended along the mesh's own edges (welding UV-seam duplicates first),
 *    so joints bend smoothly only where parts are actually connected and nothing far away
 *    gets dragged along (no stretched slivers between a hand and a coat tail).
 * Up to 4 influences per vertex.
 */
export function autoSkin(positions: Float32Array, triangles: Uint32Array, d: HeroModelDef): { indices: Float32Array; weights: Float32Array } {
  const n = positions.length / 3;
  const nb = SKIN_BONES.length;

  // Weld duplicates (same position) so seams move together.
  const weldOf = new Int32Array(n);
  const keys = new Map<string, number>();
  let welded = 0;
  for (let v = 0; v < n; v++) {
    const k = `${Math.round(positions[v * 3]! * 1e4)},${Math.round(positions[v * 3 + 1]! * 1e4)},${Math.round(positions[v * 3 + 2]! * 1e4)}`;
    let id = keys.get(k);
    if (id === undefined) keys.set(k, (id = welded++));
    weldOf[v] = id;
  }

  // Hard labels.
  let w = new Float32Array(welded * nb);
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const t = clamp((y - d.handBottom) / (d.shoulder.y - d.handBottom), 0, 1);
    const inner = d.armInner.bottom + (d.armInner.top - d.armInner.bottom) * t;
    let bone: SkinBone;
    if (y >= d.neck) bone = 'head';
    else if (y >= d.handBottom && y <= d.shoulder.y + 0.015 && Math.abs(x) > inner) bone = x < 0 ? 'armL' : 'armR';
    else if (y < (d.crotch + d.hip) / 2) bone = x < 0 ? 'legL' : 'legR';
    else if (y >= d.waist) bone = 'torso';
    else bone = 'hips';
    w[weldOf[v]! * nb + B[bone]] = 1;
  }

  // Neighbour lists on the welded mesh.
  const nbrs: Set<number>[] = Array.from({ length: welded }, () => new Set<number>());
  for (let i = 0; i < triangles.length; i += 3) {
    const a = weldOf[triangles[i]!]!;
    const b = weldOf[triangles[i + 1]!]!;
    const c = weldOf[triangles[i + 2]!]!;
    nbrs[a]!.add(b).add(c);
    nbrs[b]!.add(a).add(c);
    nbrs[c]!.add(a).add(b);
  }
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next = new Float32Array(w.length);
    for (let v = 0; v < welded; v++) {
      const ns = nbrs[v]!;
      for (let k = 0; k < nb; k++) {
        let sum = 0;
        for (const u of ns) sum += w[u * nb + k]!;
        next[v * nb + k] = ns.size ? 0.5 * w[v * nb + k]! + (0.5 * sum) / ns.size : w[v * nb + k]!;
      }
    }
    w = next;
  }

  // Keep the 4 strongest influences, renormalised.
  const indices = new Float32Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const o = weldOf[v]! * nb;
    const order = Array.from({ length: nb }, (_, k) => k)
      .sort((a, b) => w[o + b]! - w[o + a]!)
      .slice(0, 4);
    let sum = 0;
    for (const k of order) sum += w[o + k]!;
    order.forEach((bone, k) => {
      indices[v * 4 + k] = bone;
      weights[v * 4 + k] = sum > 0 ? w[o + bone]! / sum : k === 0 ? 1 : 0;
    });
  }
  return { indices, weights };
}
