import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

export interface MatOpts {
  /** 0..1 – how much the surface glows on its own (keeps shadows from going muddy). */
  glow?: number;
  /** Specular strength (0 = matte, ~0.6 = glossy shoes / glass). */
  spec?: number;
  alpha?: number;
  /** Skip freeze() for materials whose mesh visibility animates (fading walls). */
  dynamic?: boolean;
  /** Soft rim light (0..1) that gives characters the rounded 'rendered' look of the sheets. */
  rim?: number;
}

const caches = new WeakMap<Scene, Map<string, StandardMaterial>>();

/**
 * Shared, cached flat-colour materials. Reusing one material per colour keeps draw-call
 * batching and shader compiles low on phones.
 */
export function mat(scene: Scene, hex: string, opts: MatOpts = {}): StandardMaterial {
  let cache = caches.get(scene);
  if (!cache) caches.set(scene, (cache = new Map()));
  const key = `${hex}|${opts.glow ?? 0.14}|${opts.spec ?? 0.05}|${opts.alpha ?? 1}|${opts.dynamic ? 'd' : ''}|${opts.rim ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const m = new StandardMaterial(`m_${key}`, scene);
  const c = Color3.FromHexString(hex);
  m.diffuseColor = c;
  const g = opts.glow ?? 0.14;
  m.emissiveColor = c.scale(g);
  const s = opts.spec ?? 0.05;
  m.specularColor = new Color3(s, s, s);
  m.specularPower = 48;
  if (opts.alpha !== undefined && opts.alpha < 1) {
    m.alpha = opts.alpha;
    m.backFaceCulling = false;
  }
  if (opts.rim) applyRim(m, opts.rim);
  if (!opts.dynamic) m.freeze();
  cache.set(key, m);
  return m;
}

/**
 * Adds a soft rim light. Babylon multiplies emissive by the fresnel colour, so emissive is set to
 * white and the fresnel colours carry the real values: base glow at the centre, glow + rim at edges.
 */
export function applyRim(m: StandardMaterial, strength: number): void {
  const base = m.emissiveColor.clone();
  const f = new FresnelParameters();
  f.bias = 0;
  f.power = 2.6;
  f.leftColor = base;
  f.rightColor = base.add(new Color3(1, 0.9, 0.78).scale(strength));
  m.emissiveColor = Color3.White();
  m.emissiveFresnelParameters = f;
}
