import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { HeroId } from '../data/heroes';
import { mat, type MatOpts } from '../world/materials';

/**
 * Procedural chibi hero builder (interim art — see docs/ASSETS.md).
 * Matches the silhouettes and palettes of the supplied character sheets:
 * big head (~45% of height), short limbs, readable top-down silhouette.
 *
 * Rig layout (all TransformNodes so the animator can pose them):
 *   root (feet, yaw) → body (bob) → hips → legL/legR
 *                                    → torso → armL/armR, neck → head → (face, hair, headwear)
 */
export interface HeroRig {
  id: HeroId;
  root: TransformNode;
  body: TransformNode;
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  /** Things that trail behind when running (headband tails, long hair, coat tails). */
  flutter: TransformNode[];
  meshes: Mesh[];
}

const LEG_LEN = 0.36;
const TORSO_H = 0.46;
const HEAD_R = 0.44;
const SKIN = '#e9b48a';
const SKIN_DARK = '#c98d62';
const SKIN_TAN = '#c9875a';
const EYE = '#3a2416';

interface Builder {
  scene: Scene;
  meshes: Mesh[];
  id: string;
}

function part(b: Builder, mesh: Mesh, parent: TransformNode, hex: string, opts?: MatOpts): Mesh {
  mesh.parent = parent;
  mesh.material = mat(b.scene, hex, opts);
  mesh.isPickable = false;
  b.meshes.push(mesh);
  return mesh;
}

function sphere(b: Builder, parent: TransformNode, hex: string, d: number, seg = 12, opts?: MatOpts): Mesh {
  return part(b, CreateSphere(`${b.id}_s`, { diameter: d, segments: seg }, b.scene), parent, hex, opts);
}

function cyl(b: Builder, parent: TransformNode, hex: string, h: number, dTop: number, dBot: number, tess = 12, opts?: MatOpts): Mesh {
  return part(b, CreateCylinder(`${b.id}_c`, { height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: tess }, b.scene), parent, hex, opts);
}

function box(b: Builder, parent: TransformNode, hex: string, w: number, h: number, d: number, opts?: MatOpts): Mesh {
  return part(b, CreateBox(`${b.id}_b`, { width: w, height: h, depth: d }, b.scene), parent, hex, opts);
}

function node(b: Builder, name: string, parent: TransformNode | null, x = 0, y = 0, z = 0): TransformNode {
  const n = new TransformNode(`${b.id}_${name}`, b.scene);
  n.parent = parent;
  n.position.set(x, y, z);
  return n;
}

interface Look {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'messy' | 'long';
  top: string;
  topStyle: 'coat' | 'bare' | 'shirt' | 'blouse';
  sleeve: string;
  /** 0 = bare arm, 1 = full sleeve. */
  sleeveLen: number;
  legs: string;
  shoe: string;
  sandals: boolean;
}

const LOOKS: Record<HeroId, Look> = {
  rizal: { skin: SKIN, hair: '#1c1410', hairStyle: 'short', top: '#1d1b22', topStyle: 'coat', sleeve: '#1d1b22', sleeveLen: 1, legs: '#18161c', shoe: '#0e0d10', sandals: false },
  lapulapu: { skin: SKIN_TAN, hair: '#2a1a12', hairStyle: 'long', top: SKIN_TAN, topStyle: 'bare', sleeve: SKIN_TAN, sleeveLen: 0, legs: SKIN_TAN, shoe: '#5a3520', sandals: true },
  bonifacio: { skin: SKIN, hair: '#3a1712', hairStyle: 'messy', top: '#efe6d2', topStyle: 'shirt', sleeve: '#efe6d2', sleeveLen: 0.55, legs: '#b3202a', shoe: '#6b4026', sandals: true },
  gabriela: { skin: SKIN, hair: '#2b1a14', hairStyle: 'long', top: '#f4ede0', topStyle: 'blouse', sleeve: '#f4ede0', sleeveLen: 0.5, legs: SKIN, shoe: '#5e3a22', sandals: true },
};

export function buildHero(scene: Scene, id: HeroId): HeroRig {
  const b: Builder = { scene, meshes: [], id };
  const L = LOOKS[id];

  const root = node(b, 'root', null);
  const body = node(b, 'body', root);
  const hips = node(b, 'hips', body, 0, LEG_LEN, 0);
  const torso = node(b, 'torso', hips);
  const flutter: TransformNode[] = [];

  // ── Legs (pivot at hip, mesh hangs down) ──
  const mkLeg = (side: number): TransformNode => {
    const leg = node(b, side < 0 ? 'legL' : 'legR', hips, side * 0.12, 0, 0);
    cyl(b, leg, L.legs, LEG_LEN, 0.17, 0.15).position.y = -LEG_LEN / 2;
    if (L.sandals) {
      const foot = sphere(b, leg, L.skin, 0.2, 8);
      foot.scaling.set(0.85, 0.45, 1.3);
      foot.position.set(0, -LEG_LEN + 0.03, 0.04);
      const sole = box(b, leg, L.shoe, 0.18, 0.04, 0.3);
      sole.position.set(0, -LEG_LEN - 0.005, 0.04);
      const strap = box(b, leg, L.shoe, 0.19, 0.04, 0.05);
      strap.position.set(0, -LEG_LEN + 0.06, 0.08);
    } else {
      const shoe = sphere(b, leg, L.shoe, 0.24, 10, { spec: 0.5 });
      shoe.scaling.set(0.85, 0.55, 1.35);
      shoe.position.set(0, -LEG_LEN + 0.04, 0.05);
    }
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // ── Torso ──
  const chest = cyl(b, torso, L.top, TORSO_H, 0.5, 0.6, 12);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.82;

  // ── Arms (pivot at shoulder) ──
  const ARM = 0.34;
  const mkArm = (side: number): TransformNode => {
    const arm = node(b, side < 0 ? 'armL' : 'armR', torso, side * 0.31, TORSO_H - 0.07, 0);
    arm.rotation.z = side * 0.16;
    const sleeveH = ARM * Math.max(L.sleeveLen, 0.001);
    if (L.sleeveLen > 0) {
      const s = cyl(b, arm, L.sleeve, sleeveH, 0.17, 0.16);
      s.position.y = -sleeveH / 2;
    }
    if (L.sleeveLen < 1) {
      const bare = cyl(b, arm, L.skin, ARM - sleeveH * 0.9, 0.13, 0.12);
      bare.position.y = -sleeveH * 0.9 - (ARM - sleeveH * 0.9) / 2;
    }
    if (L.topStyle === 'coat') {
      const cuff = cyl(b, arm, '#f2efe8', 0.05, 0.15, 0.15);
      cuff.position.y = -ARM + 0.01;
    }
    const hand = sphere(b, arm, L.skin, 0.17, 10);
    hand.position.y = -ARM - 0.05;
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ── Head ──
  const head = node(b, 'head', torso, 0, TORSO_H + HEAD_R * 0.78, 0);
  const skull = sphere(b, head, L.skin, HEAD_R * 2, 16);
  skull.scaling.set(1.06, 0.96, 1);
  buildFace(b, head, L.skin);
  buildHair(b, head, L, flutter);

  // ── Per-hero costume details ──
  switch (id) {
    case 'rizal':
      dressRizal(b, torso, hips, head, flutter);
      break;
    case 'lapulapu':
      dressLapu(b, torso, hips, head, armR, armL, flutter);
      break;
    case 'bonifacio':
      dressBonifacio(b, torso, hips, flutter);
      break;
    case 'gabriela':
      dressGabriela(b, torso, hips, head, armL, armR, flutter);
      break;
  }

  return { id, root, body, hips, torso, head, legL, legR, armL, armR, flutter, meshes: b.meshes };
}

function buildFace(b: Builder, head: TransformNode, skin: string): void {
  const z = HEAD_R * 0.9;
  for (const side of [-1, 1]) {
    const white = sphere(b, head, '#ffffff', 0.17, 10, { glow: 0.5 });
    white.scaling.set(0.9, 1.15, 0.35);
    white.position.set(side * 0.16, -0.02, z - 0.02);
    const iris = sphere(b, head, EYE, 0.13, 10, { glow: 0.1, spec: 0.6 });
    iris.scaling.set(0.85, 1.12, 0.35);
    iris.position.set(side * 0.15, -0.035, z + 0.015);
    const shine = sphere(b, head, '#ffffff', 0.045, 6, { glow: 1 });
    shine.position.set(side * 0.15 + 0.025, 0.0, z + 0.04);
    // Determined brows: inner end lower.
    const brow = box(b, head, '#2a1a12', 0.17, 0.04, 0.04);
    brow.position.set(side * 0.16, 0.12, z + 0.0);
    brow.rotation.z = side * 0.28;
    const ear = sphere(b, head, skin, 0.16, 8);
    ear.scaling.set(0.55, 0.9, 0.7);
    ear.position.set(side * HEAD_R * 1.02, -0.04, 0.0);
  }
  const nose = sphere(b, head, SKIN_DARK, 0.06, 6);
  nose.position.set(0, -0.1, z + 0.035);
  const mouth = box(b, head, '#7a3b2b', 0.1, 0.025, 0.03);
  mouth.position.set(0, -0.22, z - 0.05);
  // Soft blush for the chibi look.
  for (const side of [-1, 1]) {
    const blush = sphere(b, head, '#e88f7a', 0.08, 6, { glow: 0.3, alpha: 0.55 });
    blush.scaling.set(1.2, 0.6, 0.3);
    blush.position.set(side * 0.26, -0.15, z - 0.06);
  }
}

function buildHair(b: Builder, head: TransformNode, L: Look, flutter: TransformNode[]): void {
  const cap = part(b, CreateSphere(`${b.id}_hair`, { diameter: HEAD_R * 2.18, segments: 12, slice: 0.55 }, b.scene), head, L.hair);
  cap.rotation.x = -0.62;
  cap.position.set(0, 0.07, -0.05);

  // Fringe tufts across the forehead.
  const tufts = L.hairStyle === 'messy' ? 5 : 4;
  for (let i = 0; i < tufts; i++) {
    const t = (i / (tufts - 1)) * 2 - 1;
    const tuft = cyl(b, head, L.hair, 0.22, 0.0, 0.16, 6);
    tuft.position.set(t * 0.28, 0.24 - Math.abs(t) * 0.06, HEAD_R * 0.72);
    tuft.rotation.set(2.3, 0, -t * 0.5);
  }
  if (L.hairStyle === 'messy') {
    // Bonifacio's swept, voluminous hair.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const spike = cyl(b, head, L.hair, 0.3, 0.0, 0.2, 6);
      spike.position.set(Math.cos(a) * 0.26, 0.34, Math.sin(a) * 0.22 - 0.05);
      spike.rotation.set(Math.sin(a) * -0.9 - 0.2, 0, Math.cos(a) * 0.9);
    }
  }
  if (L.hairStyle === 'long') {
    const back = node(b, 'hairBack', head, 0, 0.05, -HEAD_R * 0.65);
    const fall = cyl(b, back, L.hair, 0.95, 0.72, 0.58, 10);
    fall.scaling.z = 0.4;
    fall.position.set(0, -0.42, -0.05);
    for (const side of [-1, 1]) {
      const lock = cyl(b, head, L.hair, 0.55, 0.18, 0.1, 6);
      lock.position.set(side * 0.38, -0.25, 0.02);
      lock.rotation.z = side * 0.12;
    }
    flutter.push(back);
  } else {
    const nape = sphere(b, head, L.hair, HEAD_R * 1.7, 10);
    nape.scaling.set(1, 0.7, 0.75);
    nape.position.set(0, -0.08, -0.12);
  }
}

function dressRizal(b: Builder, torso: TransformNode, hips: TransformNode, head: TransformNode, flutter: TransformNode[]): void {
  // Long frock coat skirt that trails when running.
  const tails = node(b, 'coatTails', hips, 0, 0.02, 0);
  const skirt = cyl(b, tails, '#1d1b22', 0.3, 0.6, 0.72, 12);
  skirt.position.y = -0.13;
  skirt.scaling.z = 0.85;
  flutter.push(tails);
  // Vest + shirt + tie
  const vest = box(b, torso, '#34313b', 0.24, 0.3, 0.05);
  vest.position.set(0, 0.24, 0.24);
  const shirt = box(b, torso, '#f4f1ea', 0.12, 0.1, 0.05, { glow: 0.35 });
  shirt.position.set(0, 0.41, 0.235);
  const tie = box(b, torso, '#0a0a0c', 0.05, 0.22, 0.03);
  tie.position.set(0, 0.32, 0.27);
  for (let i = 0; i < 3; i++) {
    const btn = sphere(b, torso, '#d4a640', 0.035, 6, { glow: 0.5, spec: 0.8 });
    btn.position.set(0.07, 0.3 - i * 0.08, 0.275);
  }
  // Lapels
  for (const side of [-1, 1]) {
    const lapel = box(b, torso, '#26232c', 0.09, 0.3, 0.04);
    lapel.position.set(side * 0.15, 0.3, 0.24);
    lapel.rotation.z = side * -0.25;
  }
  // Top hat
  const hat = node(b, 'hat', head, 0, HEAD_R * 0.7, -0.02);
  hat.rotation.x = -0.12;
  cyl(b, hat, '#1b1922', 0.05, 1.08, 1.08, 20, { spec: 0.3 });
  const crown = cyl(b, hat, '#1f1d27', 0.52, 0.68, 0.64, 18, { spec: 0.35 });
  crown.position.y = 0.28;
  const band = cyl(b, hat, '#3b2e52', 0.09, 0.665, 0.665, 18, { spec: 0.4 });
  band.position.y = 0.09;
}

function dressLapu(b: Builder, torso: TransformNode, hips: TransformNode, head: TransformNode, armR: TransformNode, armL: TransformNode, flutter: TransformNode[]): void {
  // Tattoo bands across chest
  for (const side of [-1, 1]) {
    const tat = box(b, torso, '#4a2c1c', 0.16, 0.03, 0.02);
    tat.position.set(side * 0.12, 0.34, 0.255);
    tat.rotation.z = side * 0.35;
    const tat2 = box(b, torso, '#4a2c1c', 0.12, 0.03, 0.02);
    tat2.position.set(side * 0.13, 0.27, 0.262);
    tat2.rotation.z = side * 0.35;
  }
  // Bead necklace
  const beads = part(b, CreateTorus(`${b.id}_beads`, { diameter: 0.36, thickness: 0.04, tessellation: 14 }, b.scene), torso, '#b3262b', { glow: 0.35 });
  beads.position.set(0, 0.42, 0.04);
  beads.rotation.x = 0.35;
  // Belt + gold buckle + red bahag
  const belt = cyl(b, hips, '#5a3520', 0.1, 0.62, 0.62, 12);
  belt.scaling.z = 0.82;
  belt.position.y = 0.02;
  const buckle = cyl(b, hips, '#d4a640', 0.04, 0.14, 0.14, 10, { glow: 0.45, spec: 0.8 });
  buckle.rotation.x = Math.PI / 2;
  buckle.position.set(0, 0.02, 0.27);
  const shorts = cyl(b, hips, '#3a3438', 0.16, 0.6, 0.58, 10);
  shorts.scaling.z = 0.82;
  shorts.position.y = -0.08;
  const flapNode = node(b, 'bahag', hips, 0, -0.03, 0.25);
  const flap = box(b, flapNode, '#b01e24', 0.26, 0.3, 0.03);
  flap.position.y = -0.14;
  const trim = box(b, flapNode, '#d4a640', 0.26, 0.03, 0.035, { glow: 0.4 });
  trim.position.y = -0.27;
  flutter.push(flapNode);
  // Bracers
  for (const arm of [armL, armR]) {
    const br = cyl(b, arm, '#5a3520', 0.1, 0.16, 0.16, 10);
    br.position.y = -0.24;
  }
  // Gold earrings
  for (const side of [-1, 1]) {
    const ring = part(b, CreateTorus(`${b.id}_ear`, { diameter: 0.08, thickness: 0.025, tessellation: 10 }, b.scene), head, '#e0b040', { glow: 0.5, spec: 0.8 });
    ring.position.set(side * HEAD_R * 1.02, -0.17, 0.02);
    ring.rotation.z = Math.PI / 2;
  }
  // Red headband + trailing tails
  const band = part(b, CreateTorus(`${b.id}_band`, { diameter: HEAD_R * 2.08, thickness: 0.1, tessellation: 18 }, b.scene), head, '#c0222a', { glow: 0.3 });
  band.position.y = 0.17;
  band.rotation.x = -0.12;
  band.scaling.y = 1.4;
  const tails = node(b, 'bandTails', head, 0, 0.18, -HEAD_R * 0.95);
  for (const side of [-1, 1]) {
    const t = box(b, tails, '#c0222a', 0.08, 0.04, 0.42);
    t.position.set(side * 0.06, -0.02, -0.2);
    t.rotation.y = side * 0.35;
  }
  flutter.push(tails);
  // Kampilan-style sword in right hand
  const sword = node(b, 'sword', armR, 0, -0.38, 0.02);
  sword.rotation.x = 1.05;
  const grip = cyl(b, sword, '#6b3d1f', 0.18, 0.06, 0.06, 8);
  grip.position.y = 0;
  const guard = box(b, sword, '#d4a640', 0.16, 0.04, 0.06, { glow: 0.4, spec: 0.7 });
  guard.position.y = 0.1;
  const blade = box(b, sword, '#c9ccd2', 0.1, 0.62, 0.025, { spec: 0.9, glow: 0.25 });
  blade.position.y = 0.42;
  const tip = box(b, sword, '#c9ccd2', 0.16, 0.12, 0.025, { spec: 0.9, glow: 0.25 });
  tip.position.set(0.03, 0.72, 0);
}

function dressBonifacio(b: Builder, torso: TransformNode, hips: TransformNode, flutter: TransformNode[]): void {
  // Shirt hem over red trousers
  const hem = cyl(b, hips, '#efe6d2', 0.14, 0.6, 0.64, 12);
  hem.scaling.z = 0.84;
  hem.position.y = -0.02;
  const pants = cyl(b, hips, '#b3202a', 0.12, 0.6, 0.6, 12);
  pants.scaling.z = 0.82;
  pants.position.y = -0.12;
  // Shirt buttons placket
  const placket = box(b, torso, '#d9cfb8', 0.04, 0.3, 0.03);
  placket.position.set(0, 0.22, 0.25);
  // Red neckerchief: knot + triangle + flowing tail
  const knot = sphere(b, torso, '#c8202b', 0.12, 8, { glow: 0.3 });
  knot.position.set(0, 0.42, 0.22);
  const tri = cyl(b, torso, '#c8202b', 0.2, 0.2, 0.0, 3, { glow: 0.3 });
  tri.position.set(0, 0.32, 0.24);
  tri.rotation.set(0.15, Math.PI, 0);
  tri.scaling.z = 0.3;
  const collar = part(b, CreateTorus(`${b.id}_scarf`, { diameter: 0.38, thickness: 0.07, tessellation: 14 }, b.scene), torso, '#c8202b', { glow: 0.3 });
  collar.position.set(0, 0.45, 0.0);
  collar.rotation.x = 0.2;
  const tailNode = node(b, 'scarfTail', torso, 0.12, 0.44, 0.18);
  const tail = box(b, tailNode, '#c8202b', 0.08, 0.04, 0.32, { glow: 0.3 });
  tail.position.set(0.08, 0, -0.14);
  tail.rotation.y = -0.5;
  flutter.push(tailNode);
}

function dressGabriela(b: Builder, torso: TransformNode, hips: TransformNode, head: TransformNode, armL: TransformNode, armR: TransformNode, flutter: TransformNode[]): void {
  // Embroidered blouse trim
  const neckTrim = part(b, CreateTorus(`${b.id}_neck`, { diameter: 0.4, thickness: 0.03, tessellation: 14 }, b.scene), torso, '#b5482f', { glow: 0.3 });
  neckTrim.position.set(0, 0.45, 0.02);
  neckTrim.rotation.x = 0.25;
  for (const arm of [armL, armR]) {
    const cuff = part(b, CreateTorus(`${b.id}_cuff`, { diameter: 0.17, thickness: 0.03, tessellation: 10 }, b.scene), arm, '#b5482f', { glow: 0.3 });
    cuff.position.y = -0.17;
  }
  // Patterned red skirt (tapis) flaring to the ankles
  const skirtNode = node(b, 'skirt', hips, 0, 0.04, 0);
  const skirt = cyl(b, skirtNode, '#8f1d20', 0.4, 0.58, 0.9, 14);
  skirt.position.y = -0.2;
  skirt.scaling.z = 0.85;
  for (let i = 0; i < 3; i++) {
    const stripe = cyl(b, skirtNode, i === 1 ? '#d4a640' : '#b8452e', 0.025, 0.66 + i * 0.09, 0.67 + i * 0.09, 14, { glow: 0.35 });
    stripe.scaling.z = 0.85;
    stripe.position.y = -0.08 - i * 0.1;
  }
  flutter.push(skirtNode);
  // Waist sash with knot
  const sash = cyl(b, hips, '#a8262a', 0.1, 0.6, 0.6, 12, { glow: 0.25 });
  sash.scaling.z = 0.84;
  sash.position.y = 0.06;
  const sashKnot = sphere(b, hips, '#a8262a', 0.13, 8);
  sashKnot.position.set(0.17, 0.05, 0.2);
  // Patterned headband with tails
  const band = part(b, CreateTorus(`${b.id}_band`, { diameter: HEAD_R * 2.1, thickness: 0.1, tessellation: 18 }, b.scene), head, '#9e2a26', { glow: 0.3 });
  band.position.y = 0.18;
  band.rotation.x = -0.12;
  band.scaling.y = 1.5;
  const stripe = part(b, CreateTorus(`${b.id}_band2`, { diameter: HEAD_R * 2.12, thickness: 0.03, tessellation: 18 }, b.scene), head, '#d4a640', { glow: 0.4 });
  stripe.position.y = 0.18;
  stripe.rotation.x = -0.12;
  const tails = node(b, 'bandTails', head, 0, 0.2, -HEAD_R * 0.95);
  for (const side of [-1, 1]) {
    const t = box(b, tails, '#9e2a26', 0.09, 0.04, 0.38);
    t.position.set(side * 0.07, -0.02, -0.18);
    t.rotation.y = side * 0.4;
  }
  flutter.push(tails);
}

export function disposeHero(rig: HeroRig): void {
  rig.root.dispose(false, false);
}
