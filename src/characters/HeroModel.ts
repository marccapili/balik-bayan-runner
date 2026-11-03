import { buildGlbHero, hasHeroModel } from './HeroGlb';
import type { Material } from '@babylonjs/core/Materials/material';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { HeroId } from '../data/heroes';
import { SKIN_BY_ID } from '../data/skins';
import { mat, type MatOpts } from '../world/materials';
import { embroideryTrim, faceMaterial, patternCloth, tattooTorso, type FaceSpec } from './heroTextures';

/**
 * Procedural chibi hero builder (interim art — see docs/ASSETS.md).
 * Built to match the owner's character sheets: ~45% head, big anime eyes painted on the head,
 * clumped hair locks, and each hero's signature costume pieces.
 *
 * Rig layout (TransformNodes the animator poses):
 *   root (feet, yaw) → body (bob) → hips → legL/legR
 *                                    → torso → armL/armR, head → (hair, headwear)
 */
export interface HeroRig {
  id: string;
  skin: string;
  root: TransformNode;
  body: TransformNode;
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  /** Things that trail behind when running (headband tails, long hair, coat tails, skirts). */
  flutter: TransformNode[];
  meshes: Mesh[];
  /** Sculpted GLB skinned to this rig: max arm swing (radians) before the mesh stretches. */
  armLimit?: number;
}

export const LEG_LEN = 0.34;
export const TORSO_H = 0.4;
export const HEAD_R = 0.5;
export const ARM_LEN = 0.33;

const SKIN_LIGHT = '#eab48b';
const SKIN_TAN = '#c98a5e';
const RIM = 0.22;

interface Look {
  skin: string;
  hair: string;
  face: Omit<FaceSpec, 'skin'>;
}

const LOOKS: Record<HeroId, Look> = {
  rizal: { skin: SKIN_LIGHT, hair: '#1b1411', face: { brow: '#1b1411', iris: '#6b3e1f', lash: '#1b100b', mouth: 'flat', browTilt: 0.22 } },
  lapulapu: { skin: SKIN_TAN, hair: '#2a1a12', face: { brow: '#22140d', iris: '#5e3518', lash: '#1b100b', mouth: 'frown', browTilt: 0.3 } },
  bonifacio: { skin: SKIN_LIGHT, hair: '#3b1a14', face: { brow: '#2e140f', iris: '#5e3518', lash: '#1b100b', mouth: 'frown', browTilt: 0.3 } },
  gabriela: { skin: SKIN_LIGHT, hair: '#2d1a13', face: { brow: '#2d1a13', iris: '#6b3e1f', lash: '#1b100b', mouth: 'frown', browTilt: 0.26, feminine: true } },
};

export class Kit {
  readonly meshes: Mesh[] = [];
  constructor(
    readonly scene: Scene,
    readonly id: string,
    /** Skin colour swaps (lower-case hex → hex). */
    private readonly remap: Record<string, string> = {},
  ) {}

  /** Colour after the skin's remap. */
  c(hex: string): string {
    return this.remap[hex.toLowerCase()] ?? hex;
  }

  /** Patterned cloth with skin colours applied (cached per colourway). */
  cloth(key: string, base: string, accent: string, dark: string, style: 'tapis' | 'bahag' | 'band'): Material {
    const [b, a, d] = [this.c(base), this.c(accent), this.c(dark)];
    return patternCloth(this.scene, `${key}_${b}${a}${d}`, b, a, d, style);
  }

  private put(m: Mesh, parent: TransformNode, material: Material): Mesh {
    m.parent = parent;
    m.material = material;
    m.isPickable = false;
    this.meshes.push(m);
    return m;
  }

  m(hex: string, opts: MatOpts = {}): Material {
    return mat(this.scene, this.c(hex), { rim: RIM, ...opts });
  }

  node(name: string, parent: TransformNode | null, x = 0, y = 0, z = 0): TransformNode {
    const n = new TransformNode(`${this.id}_${name}`, this.scene);
    n.parent = parent;
    n.position.set(x, y, z);
    return n;
  }

  sphere(parent: TransformNode, material: Material | string, d: number, seg = 14): Mesh {
    return this.put(CreateSphere(`${this.id}_s`, { diameter: d, segments: seg }, this.scene), parent, typeof material === 'string' ? this.m(material) : material);
  }

  cyl(parent: TransformNode, material: Material | string, h: number, dTop: number, dBot: number, tess = 16, extra: { arc?: number; cap?: number } = {}): Mesh {
    const mesh = CreateCylinder(`${this.id}_c`, { height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: tess, arc: extra.arc ?? 1, cap: extra.cap ?? Mesh.CAP_ALL, sideOrientation: extra.arc && extra.arc < 1 ? Mesh.DOUBLESIDE : Mesh.DEFAULTSIDE }, this.scene);
    return this.put(mesh, parent, typeof material === 'string' ? this.m(material) : material);
  }

  box(parent: TransformNode, material: Material | string, w: number, h: number, d: number): Mesh {
    return this.put(CreateBox(`${this.id}_b`, { width: w, height: h, depth: d }, this.scene), parent, typeof material === 'string' ? this.m(material) : material);
  }

  torus(parent: TransformNode, material: Material | string, d: number, t: number, tess = 20): Mesh {
    return this.put(CreateTorus(`${this.id}_t`, { diameter: d, thickness: t, tessellation: tess }, this.scene), parent, typeof material === 'string' ? this.m(material) : material);
  }

  /** A tapered, slightly flattened hair clump. Points along local -y from its root. */
  lock(parent: TransformNode, color: string, x: number, y: number, z: number, len: number, w: number, rx: number, rz: number, ry = 0): Mesh {
    const pivot = this.node('lock', parent, x, y, z);
    pivot.rotation.set(rx, ry, rz);
    const c = this.cyl(pivot, color, len, w, 0.02, 9);
    c.position.y = -len / 2;
    c.scaling.z = 0.62;
    return c;
  }
}

export function buildHero(scene: Scene, id: HeroId, skin?: string): HeroRig {
  const def = skin ? SKIN_BY_ID[skin] : undefined;
  // Sculpted GLB model for the classic look when one is loaded (see data/heroModels.ts).
  if ((!def || def.hero !== id || def.id === `${id}.classic`) && hasHeroModel(id)) return buildGlbHero(scene, id);
  const k = new Kit(scene, id, def && def.hero === id ? def.remap : {});
  const L = LOOKS[id];
  const p = buildSkeleton(k, faceMaterial(scene, id, { skin: L.skin, ...L.face }), L.skin);

  switch (id) {
    case 'rizal':
      buildRizal(k, L, p);
      break;
    case 'lapulapu':
      buildLapu(k, L, p);
      break;
    case 'bonifacio':
      buildBonifacio(k, L, p);
      break;
    case 'gabriela':
      buildGabriela(k, L, p);
      break;
  }
  return { id, skin: def && def.hero === id ? def.id : `${id}.classic`, meshes: k.meshes, ...p };
}

/** Shared chibi skeleton: rig nodes, painted-face head, ears and neck. Costume goes on top. */
export function buildSkeleton(k: Kit, face: Material, skin: string): Parts & { root: TransformNode; body: TransformNode } {
  const root = k.node('root', null);
  const body = k.node('body', root);
  const hips = k.node('hips', body, 0, LEG_LEN, 0);
  const torso = k.node('torso', hips);
  const head = k.node('head', torso, 0, TORSO_H + HEAD_R * 0.74, 0);
  const legL = k.node('legL', hips, -0.12, 0, 0);
  const legR = k.node('legR', hips, 0.12, 0, 0);
  const armL = k.node('armL', torso, -0.3, TORSO_H - 0.06, 0);
  const armR = k.node('armR', torso, 0.3, TORSO_H - 0.06, 0);
  armL.rotation.z = -0.16;
  armR.rotation.z = 0.16;

  const skull = k.sphere(head, face, HEAD_R * 2, 32);
  skull.scaling.set(1.05, 0.97, 1);
  for (const side of [-1, 1]) {
    const ear = k.sphere(head, skin, 0.17, 10);
    ear.scaling.set(0.5, 0.9, 0.7);
    ear.position.set(side * HEAD_R * 1.02, -0.06, -0.02);
  }
  const neck = k.cyl(torso, skin, 0.12, 0.17, 0.19, 12);
  neck.position.y = TORSO_H + 0.02;
  return { root, body, hips, torso, head, legL, legR, armL, armR, flutter: [] };
}

export interface Parts {
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  flutter: TransformNode[];
}

// ───────────────────────── shared pieces ─────────────────────────

export function legs(k: Kit, p: Parts, upper: string, upperLen: number, lowerColor: string, foot: 'boot' | 'sandal', skin: string, cuff?: string): void {
  for (const leg of [p.legL, p.legR]) {
    const u = k.cyl(leg, upper, upperLen, 0.2, 0.18, 14);
    u.position.y = -upperLen / 2;
    if (upperLen < LEG_LEN) {
      const low = k.cyl(leg, lowerColor, LEG_LEN - upperLen + 0.02, 0.14, 0.13, 12);
      low.position.y = -upperLen - (LEG_LEN - upperLen) / 2;
    }
    if (cuff) {
      const c = k.torus(leg, cuff, 0.2, 0.05, 14);
      c.position.y = -upperLen + 0.01;
    }
    if (foot === 'boot') {
      const shoe = k.sphere(leg, k.m('#0d0c10', { spec: 0.55 }), 0.26, 14);
      shoe.scaling.set(0.85, 0.55, 1.4);
      shoe.position.set(0, -LEG_LEN + 0.045, 0.05);
      const sole = k.box(leg, '#060608', 0.2, 0.03, 0.34);
      sole.position.set(0, -LEG_LEN + 0.005, 0.05);
    } else {
      const f = k.sphere(leg, skin, 0.22, 12);
      f.scaling.set(0.8, 0.45, 1.35);
      f.position.set(0, -LEG_LEN + 0.04, 0.05);
      const sole = k.box(leg, '#4a2c18', 0.2, 0.035, 0.34);
      sole.position.set(0, -LEG_LEN + 0.005, 0.05);
      for (const z of [0.0, 0.12]) {
        const strap = k.box(leg, '#6b3f22', 0.2, 0.035, 0.05);
        strap.position.set(0, -LEG_LEN + 0.06, z);
      }
    }
  }
}

export function arms(k: Kit, p: Parts, sleeve: Material | string | null, sleeveFrac: number, skin: string, cuff?: string, puff = false): void {
  for (const arm of [p.armL, p.armR]) {
    const sl = ARM_LEN * sleeveFrac;
    if (sleeve && sleeveFrac > 0) {
      const s = k.cyl(arm, sleeve, sl, puff ? 0.24 : 0.19, puff ? 0.22 : 0.18, 14);
      s.position.y = -sl / 2;
      if (puff) {
        const pf = k.sphere(arm, sleeve, 0.25, 12);
        pf.scaling.y = 0.8;
        pf.position.y = -0.03;
      }
    }
    if (sleeveFrac < 1) {
      const bare = k.cyl(arm, skin, ARM_LEN - sl + 0.02, 0.15, 0.14, 12);
      bare.position.y = -sl - (ARM_LEN - sl) / 2;
    }
    if (cuff) {
      const c = k.torus(arm, cuff, sleeveFrac < 1 ? 0.19 : 0.17, 0.05, 14);
      c.position.y = sleeveFrac < 1 ? -sl : -ARM_LEN + 0.02;
    }
    // Shoulder ball keeps the joint round when the arm swings.
    const sh = k.sphere(arm, sleeve && sleeveFrac > 0 ? sleeve : skin, 0.2, 12);
    sh.position.y = 0.0;
    const fist = k.sphere(arm, skin, 0.19, 12);
    fist.scaling.set(1, 1.05, 1.05);
    fist.position.y = -ARM_LEN - 0.05;
  }
}

/** Hair cap that covers top/back of the head and leaves the face clear. */
export function hairCap(k: Kit, head: TransformNode, color: string, scale = 1.0): void {
  const cap = k.sphere(head, color, HEAD_R * 2.14 * scale, 18);
  cap.scaling.set(1.06, 1, 1.04);
  cap.position.set(0, 0.06, -0.07);
  // Clip the face side by tilting a second, back-weighted shell.
  const back = k.sphere(head, color, HEAD_R * 2.05 * scale, 16);
  back.scaling.set(1.04, 0.92, 0.9);
  back.position.set(0, -0.06, -0.12);
  // Push the cap's front up so the forehead and eyes stay visible.
  cap.scaling.y = 0.92;
  cap.position.z = -0.12;
  cap.position.y = 0.1;
}

/** Downward fringe locks over the forehead. `sweep` tilts them to one side. */
export function fringe(k: Kit, head: TransformNode, color: string, count: number, sweep: number, len = 0.24): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const y = HEAD_R * 0.6 - Math.abs(t) * 0.04;
    const z = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - y * y)) * (1 - Math.abs(t) * 0.25) + 0.02;
    k.lock(head, color, t * 0.32, y, z, len - Math.abs(t) * 0.04, 0.21, -0.22, t * 0.3 + sweep);
  }
}

function headband(k: Kit, p: Parts, material: Material | string, tailColor: Material | string, tilt = -0.18): void {
  const band = k.cyl(p.head, material, 0.13, HEAD_R * 2.16, HEAD_R * 2.2, 28, { cap: Mesh.NO_CAP });
  band.position.set(0, 0.2, -0.02);
  band.rotation.x = tilt;
  const knot = k.sphere(p.head, tailColor, 0.13, 10);
  knot.position.set(0, 0.24, -HEAD_R * 1.04);
  const tails = k.node('bandTails', p.head, 0, 0.24, -HEAD_R * 1.06);
  for (const side of [-1, 1]) {
    const t = k.box(tails, tailColor, 0.1, 0.03, 0.5);
    t.position.set(side * 0.06, -0.2, -0.16);
    t.rotation.set(-0.95, side * 0.18, side * 0.1);
  }
  p.flutter.push(tails);
}

// ───────────────────────── Jose Rizal ─────────────────────────

function buildRizal(k: Kit, L: Look, p: Parts): void {
  const COAT = k.m('#1c1a21', { rim: 0.1 });
  const COAT_DARK = k.m('#121116', { rim: 0.1 });
  legs(k, p, '#16151a', LEG_LEN, '#16151a', 'boot', L.skin);

  // Frock coat body + open coat skirt (gap at the front)
  const chest = k.cyl(p.torso, COAT, TORSO_H, 0.52, 0.62, 20);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.84;
  const tails = k.node('coatTails', p.hips, 0, 0.04, 0);
  const skirt = k.cyl(tails, COAT, 0.34, 0.62, 0.8, 20, { arc: 0.8 });
  skirt.position.y = -0.15;
  skirt.scaling.z = 0.86;
  skirt.rotation.y = Math.PI / 2 + Math.PI * 0.2; // gap faces +z
  p.flutter.push(tails);
  // Back vent buttons
  for (const side of [-1, 1]) {
    const b = k.sphere(p.torso, k.m('#2b2830', { spec: 0.4 }), 0.04, 6);
    b.position.set(side * 0.06, 0.04, -0.26);
  }

  // Waistcoat (double-breasted) with gold buttons
  const vest = k.box(p.torso, '#2e2b33', 0.26, 0.32, 0.06);
  vest.position.set(0, 0.2, 0.245);
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const btn = k.sphere(p.torso, k.m('#d9a63e', { glow: 0.4, spec: 0.8 }), 0.035, 6);
      btn.position.set(side * 0.06, 0.29 - i * 0.08, 0.285);
    }
  }
  // Shirt, collar points, tie
  const shirt = k.box(p.torso, k.m('#f5f2ec', { glow: 0.3 }), 0.14, 0.12, 0.05);
  shirt.position.set(0, 0.4, 0.25);
  for (const side of [-1, 1]) {
    const pt = k.box(p.torso, k.m('#ffffff', { glow: 0.35 }), 0.08, 0.05, 0.03);
    pt.position.set(side * 0.05, 0.43, 0.27);
    pt.rotation.z = side * 0.5;
  }
  const tie = k.box(p.torso, '#0a0a0c', 0.05, 0.2, 0.03);
  tie.position.set(0, 0.32, 0.285);
  const knot = k.box(p.torso, '#0a0a0c', 0.07, 0.05, 0.04);
  knot.position.set(0, 0.42, 0.285);
  // Wide lapels
  for (const side of [-1, 1]) {
    const lapel = k.box(p.torso, COAT_DARK, 0.11, 0.34, 0.045);
    lapel.position.set(side * 0.16, 0.27, 0.25);
    lapel.rotation.set(0.05, side * -0.25, side * -0.3);
  }
  arms(k, p, COAT, 1, L.skin, '#f2efe8');

  // Hair (short, side-swept) peeking under the hat
  hairCap(k, p.head, L.hair);
  fringe(k, p.head, L.hair, 5, 0.35, 0.22);
  for (const side of [-1, 1]) k.lock(p.head, L.hair, side * HEAD_R * 0.86, 0.02, 0.05, 0.22, 0.14, 0, side * 0.15);

  // Top hat: wide curled brim, tall crown, satin band
  const hat = k.node('hat', p.head, 0, HEAD_R * 0.72, -0.03);
  hat.rotation.x = -0.1;
  const hatMat = k.m('#18161e', { spec: 0.35, rim: 0.08 });
  k.cyl(hat, hatMat, 0.04, 1.14, 1.14, 32);
  const lip = k.torus(hat, hatMat, 1.12, 0.06, 32);
  lip.position.y = 0.02;
  lip.scaling.set(1, 1, 0.96);
  const crown = k.cyl(hat, hatMat, 0.58, 0.72, 0.66, 28);
  crown.position.y = 0.31;
  const top = k.cyl(hat, k.m('#1f1c26', { spec: 0.4, rim: 0.08 }), 0.02, 0.72, 0.72, 28);
  top.position.y = 0.6;
  const band = k.cyl(hat, k.m('#3d3158', { spec: 0.45 }), 0.11, 0.675, 0.675, 28);
  band.position.y = 0.1;
}

// ───────────────────────── Lapu-Lapu ─────────────────────────

function buildLapu(k: Kit, L: Look, p: Parts): void {
  legs(k, p, '#3b3436', 0.12, L.skin, 'sandal', L.skin);
  // Leather leg wraps over the shins (sheet shows tall brown wraps)
  for (const leg of [p.legL, p.legR]) {
    const wrap = k.cyl(leg, '#5a3520', 0.18, 0.16, 0.155, 12);
    wrap.position.y = -LEG_LEN + 0.14;
    for (let i = 0; i < 3; i++) {
      const strap = k.torus(leg, '#3b2214', 0.16, 0.025, 12);
      strap.position.y = -LEG_LEN + 0.08 + i * 0.06;
    }
  }

  // Bare tattooed torso + chest/shoulder volume
  const chest = k.cyl(p.torso, tattooTorso(k.scene, L.skin), TORSO_H, 0.6, 0.56, 24);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.84;
  // Red & white bead necklace with a pendant
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (0.15 + (i / 12) * 0.7);
    const bead = k.sphere(p.torso, k.m(i % 3 === 1 ? '#f2ead8' : '#b3262b', { glow: 0.3 }), 0.055, 6);
    bead.position.set(Math.cos(a) * 0.2, 0.43 - Math.sin(a) * 0.12, 0.08 + Math.sin(a) * 0.17);
  }
  const pendant = k.sphere(p.torso, k.m('#d9a63e', { glow: 0.4, spec: 0.8 }), 0.06, 8);
  pendant.position.set(0, 0.3, 0.26);

  // Belt with round bronze buckle, bahag front & back flaps, dark short underlayer
  const belt = k.cyl(p.hips, '#5a3520', 0.11, 0.6, 0.6, 20);
  belt.scaling.z = 0.84;
  belt.position.y = 0.02;
  const buckle = k.cyl(p.hips, k.m('#b88a3e', { glow: 0.35, spec: 0.8 }), 0.04, 0.17, 0.17, 18);
  buckle.rotation.x = Math.PI / 2;
  buckle.position.set(0, 0.02, 0.27);
  const ring = k.torus(p.hips, k.m('#8a6428', { spec: 0.7 }), 0.12, 0.025, 16);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.02, 0.29);
  const shorts = k.cyl(p.hips, '#3b3436', 0.14, 0.58, 0.56, 18);
  shorts.scaling.z = 0.84;
  shorts.position.y = -0.07;
  const bahag = k.cloth('bahag', '#b01e24', '#e0b04a', '#2a1410', 'bahag');
  const front = k.node('bahag', p.hips, 0, -0.03, 0.25);
  const flap = k.box(front, bahag, 0.24, 0.3, 0.025);
  flap.position.y = -0.14;
  p.flutter.push(front);
  const back = k.box(p.hips, bahag, 0.26, 0.24, 0.025);
  back.position.set(0, -0.12, -0.25);

  // Arms: bare with leather wristbands and upper-arm bands
  arms(k, p, null, 0, L.skin);
  for (const arm of [p.armL, p.armR]) {
    const br = k.cyl(arm, '#5a3520', 0.12, 0.17, 0.17, 12);
    br.position.y = -ARM_LEN + 0.06;
    const band = k.torus(arm, '#3b2214', 0.17, 0.03, 12);
    band.position.y = -0.1;
    const deltoid = k.sphere(arm, L.skin, 0.22, 12);
    deltoid.position.y = -0.02;
  }

  // Long wavy hair under a red headband
  hairCap(k, p.head, L.hair, 1.02);
  fringe(k, p.head, L.hair, 5, 0, 0.2);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      k.lock(p.head, L.hair, side * (HEAD_R * 0.85 + i * 0.03), 0.02 - i * 0.02, 0.05 - i * 0.14, 0.5 + i * 0.06, 0.26, 0.12 - i * 0.1, side * (0.16 + i * 0.1));
    }
  }
  const back2 = k.node('hairBack', p.head, 0, 0.1, -HEAD_R * 0.7);
  const mass2 = k.sphere(back2, L.hair, 1, 18);
  mass2.scaling.set(0.95, 0.95, 0.38);
  mass2.position.set(0, -0.32, -0.02);
  for (let i = 0; i < 6; i++) {
    const t = (i / 5) * 2 - 1;
    k.lock(back2, L.hair, t * 0.3, 0, -Math.abs(t) * 0.02, 0.75 + (1 - Math.abs(t)) * 0.15, 0.3, 0.12, t * 0.2);
  }
  p.flutter.push(back2);
  headband(k, p, k.m('#c3212a', { glow: 0.28 }), k.m('#c3212a', { glow: 0.28 }));

  // Gold hoop earrings
  for (const side of [-1, 1]) {
    const hoop = k.torus(p.head, k.m('#e2b23e', { glow: 0.45, spec: 0.9 }), 0.09, 0.025, 14);
    hoop.position.set(side * HEAD_R * 1.03, -0.2, 0.0);
    hoop.rotation.z = Math.PI / 2;
  }
}

// ───────────────────────── Andres Bonifacio ─────────────────────────

function buildBonifacio(k: Kit, L: Look, p: Parts): void {
  const SHIRT = '#efe6d2';
  const RED = '#b3202a';
  legs(k, p, RED, 0.22, L.skin, 'sandal', L.skin, '#9c1a22');

  // Camisa: chest + untucked hem, button placket
  const chest = k.cyl(p.torso, SHIRT, TORSO_H, 0.54, 0.6, 20);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.84;
  const hem = k.cyl(p.hips, SHIRT, 0.14, 0.62, 0.66, 20);
  hem.scaling.z = 0.84;
  hem.position.y = -0.02;
  const placket = k.box(p.torso, '#ddd2b9', 0.045, 0.32, 0.03);
  placket.position.set(0, 0.17, 0.255);
  for (let i = 0; i < 3; i++) {
    const b = k.sphere(p.torso, '#c9bea6', 0.03, 6);
    b.position.set(0, 0.26 - i * 0.08, 0.275);
  }
  // Open V collar showing skin
  const v = k.cyl(p.torso, L.skin, 0.12, 0.0, 0.14, 3);
  v.position.set(0, 0.4, 0.235);
  v.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
  v.scaling.set(1, 1, 0.3);
  // Rolled sleeves above the elbow
  arms(k, p, SHIRT, 0.5, L.skin, '#e2d7bf');

  // Red neckerchief: collar ring, big knot, drape and tails
  const ker = k.m('#cc1f2c', { glow: 0.28 });
  const collar = k.torus(p.torso, ker, 0.4, 0.07, 18);
  collar.position.set(0, 0.45, 0.0);
  collar.rotation.x = 0.22;
  const knotN = k.sphere(p.torso, ker, 0.13, 10);
  knotN.position.set(0, 0.4, 0.25);
  const drape = k.cyl(p.torso, ker, 0.2, 0.22, 0.0, 3);
  drape.position.set(0, 0.29, 0.255);
  drape.rotation.y = Math.PI;
  drape.scaling.z = 0.25;
  const tailNode = k.node('scarfTail', p.torso, 0.06, 0.4, 0.25);
  for (const side of [-1, 1]) {
    const t = k.box(tailNode, ker, 0.07, 0.2, 0.025);
    t.position.set(side * 0.05, -0.1, 0.01);
    t.rotation.z = side * 0.35;
  }
  p.flutter.push(tailNode);

  // Big swept, voluminous hair
  hairCap(k, p.head, L.hair, 1.06);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.lock(p.head, L.hair, Math.cos(a) * 0.2, HEAD_R * 0.75, Math.sin(a) * 0.18 - 0.08, 0.34, 0.24, Math.PI - 0.6 + Math.sin(a) * -0.7, Math.cos(a) * 0.7);
  }
  // Swept fringe falling across the brow
  fringe(k, p.head, L.hair, 5, -0.45, 0.27);
  for (const side of [-1, 1]) {
    k.lock(p.head, L.hair, side * HEAD_R * 0.88, 0.08, 0.02, 0.26, 0.17, 0.1, side * 0.2);
    k.lock(p.head, L.hair, side * HEAD_R * 0.6, 0.0, -HEAD_R * 0.7, 0.3, 0.2, 0.4, side * 0.3);
  }
}

// ───────────────────────── Gabriela Silang ─────────────────────────

function buildGabriela(k: Kit, L: Look, p: Parts): void {
  const BLOUSE = '#f6efe2';
  legs(k, p, L.skin, 0.2, L.skin, 'sandal', L.skin);

  // Blouse with embroidered trim at the neckline
  const chest = k.cyl(p.torso, BLOUSE, TORSO_H, 0.5, 0.56, 20);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.84;
  const trim = embroideryTrim(k.scene);
  const neckline = k.cyl(p.torso, trim, 0.06, 0.38, 0.42, 22, { cap: Mesh.NO_CAP });
  neckline.position.y = TORSO_H - 0.03;
  neckline.scaling.z = 0.86;
  const vneck = k.cyl(p.torso, L.skin, 0.1, 0.0, 0.11, 3);
  vneck.position.set(0, 0.4, 0.225);
  vneck.rotation.set(-Math.PI / 2 + 0.2, 0, 0);
  vneck.scaling.set(1, 1, 0.3);
  arms(k, p, BLOUSE, 0.42, L.skin, '#b8402c', true);

  // Woven tapis skirt flaring to the ankles + sash with knot and hanging ends
  const tapis = k.cloth('tapis', '#9a1f22', '#e0a94a', '#4a0f12', 'tapis');
  const skirtNode = k.node('skirt', p.hips, 0, 0.06, 0);
  const skirt = k.cyl(skirtNode, tapis, 0.42, 0.56, 0.94, 22);
  skirt.position.y = -0.2;
  skirt.scaling.z = 0.86;
  const hemRing = k.torus(skirtNode, '#4a0f12', 0.92, 0.035, 26);
  hemRing.position.y = -0.4;
  hemRing.scaling.z = 0.86;
  p.flutter.push(skirtNode);
  const sash = k.cyl(p.hips, '#a8262a', 0.11, 0.58, 0.6, 20);
  sash.scaling.z = 0.86;
  sash.position.y = 0.08;
  const sashKnot = k.sphere(p.hips, '#a8262a', 0.14, 10);
  sashKnot.position.set(0.2, 0.07, 0.17);
  const ends = k.node('sashEnds', p.hips, 0.22, 0.05, 0.17);
  for (const dz of [-0.02, 0.03]) {
    const e = k.box(ends, '#a8262a', 0.07, 0.24, 0.025);
    e.position.set(0, -0.12, dz);
    e.rotation.z = 0.12;
  }
  p.flutter.push(ends);

  // Long, waist-length hair with face-framing locks
  hairCap(k, p.head, L.hair, 1.02);
  fringe(k, p.head, L.hair, 6, 0.1, 0.22);
  for (const side of [-1, 1]) {
    k.lock(p.head, L.hair, side * HEAD_R * 0.84, 0.05, 0.12, 0.62, 0.24, -0.05, side * 0.08);
    k.lock(p.head, L.hair, side * HEAD_R * 0.9, 0.04, -0.08, 0.7, 0.28, 0.1, side * 0.14);
  }
  const back = k.node('hairBack', p.head, 0, 0.12, -HEAD_R * 0.72);
  const mass = k.sphere(back, L.hair, 1, 18);
  mass.scaling.set(0.95, 1.35, 0.36);
  mass.position.set(0, -0.5, -0.02);
  for (let i = 0; i < 7; i++) {
    const t = (i / 6) * 2 - 1;
    k.lock(back, L.hair, t * 0.32, 0, -Math.abs(t) * 0.02, 1.05 - Math.abs(t) * 0.15, 0.32, 0.1, t * 0.12);
  }
  p.flutter.push(back);
  const band = k.cloth('band', '#9e2a26', '#e0b04a', '#4a0f12', 'band');
  headband(k, p, band, k.m('#9e2a26', { glow: 0.28 }), -0.16);
}

export function disposeHero(rig: HeroRig): void {
  rig.root.dispose(false, false);
}
