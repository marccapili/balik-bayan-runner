import type { HeroId } from './heroes';

/**
 * Sculpted 3D hero models (GLB in `public/models/`, made by the owner with an image-to-3D tool).
 * They arrive unrigged, so `characters/autoSkin.ts` skins them onto the same 8-joint chibi rig
 * the procedural heroes use, and `HeroAnimator` drives both the same way.
 *
 * Landmarks are fractions of the model's height (feet = 0, top = 1), measured from a front
 * silhouette (`tools/optimize_glb.py` shrinks textures; see docs/ASSETS.md for the workflow).
 * Heroes without an entry keep their procedural model. Skins other than classic also fall back
 * to the procedural model until a GLB exists for them.
 */
export interface HeroModelDef {
  /** Path under the site root. */
  url: string;
  /** Height in rig units (procedural heroes are ~1.6 to the top of the head). */
  height: number;
  /** Below this the legs are fully separate. */
  crotch: number;
  /** Leg pivot height (hip joint). */
  hip: number;
  /** Torso bends above this. */
  waist: number;
  /** Head turns above this. */
  neck: number;
  /** Arm pivot. */
  shoulder: { y: number; x: number };
  /** Inner edge of the arm at the shoulder and at the hand (|x| beyond this is arm). */
  armInner: { top: number; bottom: number };
  /** Lowest point of the hands. */
  handBottom: number;
  /** Extra brightness on top of the scene lights (the textures carry baked shading). */
  emissive: number;
  /** Max arm swing in radians before the sculpt visibly stretches (hands fused to a coat need less). */
  armLimit: number;
}

export const HERO_MODELS: Partial<Record<HeroId, HeroModelDef>> = {
  bonifacio: {
    url: 'models/bonifacio.glb',
    height: 1.62,
    crotch: 0.17,
    hip: 0.24,
    waist: 0.3,
    neck: 0.5,
    shoulder: { y: 0.44, x: 0.1 },
    armInner: { top: 0.095, bottom: 0.14 },
    handBottom: 0.16,
    emissive: 0.35,
    armLimit: 1.3,
  },
  rizal: {
    url: 'models/rizal.glb',
    height: 1.82,
    crotch: 0.13,
    hip: 0.22,
    waist: 0.28,
    neck: 0.48,
    shoulder: { y: 0.44, x: 0.12 },
    armInner: { top: 0.11, bottom: 0.185 },
    handBottom: 0.09,
    emissive: 0.35,
    armLimit: 0.85,
  },
};
