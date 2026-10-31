import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { arms, HEAD_R, Kit, TORSO_H, type HeroRig } from '../characters/HeroModel';
import { mat } from '../world/materials';

let count = 0;

/** Four-legged rig the DogView poses: legs pivot at the shoulders/hips, tail at its base. */
export interface DogRig {
  root: TransformNode;
  body: TransformNode;
  head: TransformNode;
  /** Front-left, front-right, back-left, back-right. */
  legs: TransformNode[];
  tail: TransformNode;
  tongue: Mesh;
  meshes: Mesh[];
}

/** Museum guard dog: a tan aspin (asong Pinoy) in a navy security vest. Low-poly, chunky, chibi head. */
export function buildDog(scene: Scene): DogRig {
  const k = new Kit(scene, `dog${count++}`);
  const FUR = '#c48a4e';
  const LIGHT = '#ecc995';
  const DARK = '#3a2516';
  const root = k.node('root', null);
  const body = k.node('body', root, 0, 0.42, 0);

  const trunk = k.cyl(body, FUR, 0.72, 0.4, 0.44, 16);
  trunk.rotation.x = Math.PI / 2;
  trunk.scaling.set(1, 1, 0.95);
  const belly = k.cyl(body, LIGHT, 0.5, 0.3, 0.32, 14);
  belly.rotation.x = Math.PI / 2;
  belly.position.set(0, -0.08, 0.02);
  for (const z of [0.34, -0.34]) {
    const end = k.sphere(body, FUR, 0.44, 14);
    end.position.z = z;
    end.scaling.set(0.95, 0.95, 0.7);
  }
  // Security vest wrapped over the back with a reflective stripe + badge.
  const vest = k.cyl(body, '#22305e', 0.42, 0.47, 0.49, 18, { arc: 0.62 });
  vest.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI * 0.12);
  vest.position.y = 0.02;
  const stripe = k.cyl(body, k.m('#f2d24a', { glow: 0.55 }), 0.06, 0.5, 0.5, 18, { arc: 0.62 });
  stripe.rotation.copyFrom(vest.rotation);
  stripe.position.set(0, 0.02, 0.06);
  const badge = k.cyl(body, k.m('#e8b53e', { glow: 0.5, spec: 0.8 }), 0.03, 0.1, 0.1, 6);
  badge.rotation.z = Math.PI / 2;
  badge.position.set(0.24, 0.1, -0.08);

  // Big chibi head with snout, floppy-tip ears, collar.
  const head = k.node('head', body, 0, 0.22, 0.46);
  const skull = k.sphere(head, FUR, 0.5, 18);
  skull.scaling.set(1, 0.92, 0.95);
  const snout = k.cyl(head, LIGHT, 0.26, 0.2, 0.26, 14);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.07, 0.24);
  const nose = k.sphere(head, k.m('#141012', { spec: 0.7 }), 0.1, 10);
  nose.position.set(0, -0.03, 0.38);
  nose.scaling.set(1.2, 0.8, 0.8);
  const tongue = k.box(head, '#e05a6a', 0.08, 0.02, 0.12);
  tongue.position.set(0, -0.17, 0.3);
  for (const side of [-1, 1]) {
    const eye = k.sphere(head, k.m('#120c0a', { spec: 0.8 }), 0.085, 10);
    eye.position.set(side * 0.11, 0.05, 0.21);
    const shine = k.sphere(head, k.m('#ffffff', { glow: 1 }), 0.03, 6);
    shine.position.set(side * 0.11 + 0.015, 0.075, 0.25);
    const brow = k.box(head, DARK, 0.09, 0.02, 0.02);
    brow.position.set(side * 0.11, 0.13, 0.22);
    brow.rotation.z = side * -0.35;
    const ear = k.node('ear', head, side * 0.17, 0.2, -0.02);
    ear.rotation.set(-0.1, 0, side * -0.35);
    const flap = k.cyl(ear, DARK, 0.22, 0.03, 0.15, 3);
    flap.position.y = 0.09;
    flap.scaling.z = 0.4;
  }
  const collar = k.torus(head, '#c8202b', 0.36, 0.05, 18);
  collar.rotation.x = Math.PI / 2 - 0.5;
  collar.position.set(0, -0.2, -0.1);
  const tag = k.cyl(head, k.m('#e8b53e', { glow: 0.5, spec: 0.8 }), 0.02, 0.07, 0.07, 10);
  tag.rotation.x = Math.PI / 2;
  tag.position.set(0, -0.31, 0.03);

  const legs: TransformNode[] = [];
  for (const [x, z] of [[-0.14, 0.27], [0.14, 0.27], [-0.14, -0.27], [0.14, -0.27]] as const) {
    const pivot = k.node('leg', body, x, -0.05, z);
    const leg = k.cyl(pivot, FUR, 0.36, 0.11, 0.09, 10);
    leg.position.y = -0.18;
    const paw = k.sphere(pivot, LIGHT, 0.13, 10);
    paw.position.set(0, -0.36, 0.02);
    paw.scaling.set(1, 0.6, 1.25);
    legs.push(pivot);
  }
  const tail = k.node('tail', body, 0, 0.12, -0.42);
  tail.rotation.x = -0.7;
  const t = k.cyl(tail, FUR, 0.3, 0.05, 0.09, 8);
  t.position.y = 0.14;
  return { root, body, head, legs, tail, tongue, meshes: k.meshes };
}

/** Multo rig: a classic white-sheet ghost. Its materials are dynamic so the whole thing can fade. */
export interface MultoRig {
  root: TransformNode;
  body: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  hem: TransformNode;
  meshes: Mesh[];
}

export function buildMulto(scene: Scene): MultoRig {
  const k = new Kit(scene, `multo${count++}`);
  const sheet = mat(scene, '#eef1ff', { glow: 0.55, dynamic: true, rim: 0.5 });
  const shade = mat(scene, '#c9cff0', { glow: 0.45, dynamic: true, rim: 0.3 });
  const ink = mat(scene, '#1a1530', { glow: 0, dynamic: true });
  const blush = mat(scene, '#9aa4ff', { glow: 0.8, dynamic: true });
  const root = k.node('root', null);
  const body = k.node('body', root, 0, 0.35, 0);

  const dome = k.sphere(body, sheet, 1.05, 22);
  dome.position.y = 1.15;
  dome.scaling.set(1, 1.05, 0.96);
  const drape = k.cyl(body, sheet, 1.05, 1.02, 1.3, 22, { cap: 0 });
  drape.position.y = 0.6;
  const hem = k.node('hem', body, 0, 0.08, 0);
  // Wavy scalloped hem.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tip = k.sphere(hem, i % 2 ? shade : sheet, 0.34, 10);
    tip.position.set(Math.sin(a) * 0.56, i % 2 ? -0.02 : -0.08, Math.cos(a) * 0.56);
    tip.scaling.set(1, 0.7, 0.55);
    tip.rotation.y = a;
  }
  // Hollow eyes + small "o" mouth, faint blue cheeks.
  for (const side of [-1, 1]) {
    const eye = k.sphere(body, ink, 0.2, 12);
    eye.position.set(side * 0.19, 1.2, 0.46);
    eye.scaling.set(0.8, 1.2, 0.4);
    const cheek = k.sphere(body, blush, 0.12, 8);
    cheek.position.set(side * 0.3, 1.02, 0.43);
    cheek.scaling.set(1, 0.5, 0.3);
  }
  const mouth = k.torus(body, ink, 0.12, 0.035, 14);
  mouth.rotation.x = Math.PI / 2 - 0.25;
  mouth.position.set(0, 1.0, 0.53);
  const arm = (side: number): TransformNode => {
    const n = k.node('arm', body, side * 0.5, 0.95, 0.05);
    const nub = k.cyl(n, sheet, 0.42, 0.18, 0.06, 10);
    nub.position.y = -0.18;
    return n;
  };
  return { root, body, armL: arm(-1), armR: arm(1), hem, meshes: k.meshes };
}

/**
 * Tikbalang (Philippine folklore): a tall, lanky figure with a horse's head and hooves.
 * Same node layout as a hero rig so HeroAnimator drives its walk; the view adds the rear-up / charge poses.
 * `override` paints every mesh with one material (used for the purple see-through illusions).
 */
export function buildTikbalang(scene: Scene, override?: Material): HeroRig {
  const k = new Kit(scene, `tikbalang${count++}`);
  const HIDE = '#5a3a26';
  const DARKHIDE = '#3b2518';
  const MANE = '#15100e';
  const LEG = 0.62;
  const root = k.node('root', null);
  const body = k.node('body', root);
  const hips = k.node('hips', body, 0, LEG, 0);
  const torso = k.node('torso', hips);
  const head = k.node('head', torso, 0, TORSO_H + 0.2, 0.05);
  const legL = k.node('legL', hips, -0.13, 0, 0);
  const legR = k.node('legR', hips, 0.13, 0, 0);
  const armL = k.node('armL', torso, -0.3, TORSO_H - 0.04, 0);
  const armR = k.node('armR', torso, 0.3, TORSO_H - 0.04, 0);

  // Long legs, backward-bent hocks suggested by a knee bump, hooves.
  for (const leg of [legL, legR]) {
    const thigh = k.cyl(leg, HIDE, LEG * 0.55, 0.2, 0.15, 12);
    thigh.position.y = -LEG * 0.27;
    const knee = k.sphere(leg, DARKHIDE, 0.16, 10);
    knee.position.set(0, -LEG * 0.55, -0.02);
    const shin = k.cyl(leg, DARKHIDE, LEG * 0.45, 0.13, 0.1, 10);
    shin.position.y = -LEG * 0.78;
    const hoof = k.cyl(leg, k.m('#1a1414', { spec: 0.5 }), 0.1, 0.13, 0.17, 12);
    hoof.position.y = -LEG + 0.05;
  }
  // Ragged loincloth + bare, bony chest.
  const shorts = k.cyl(hips, '#6d5b3a', 0.2, 0.46, 0.5, 14);
  shorts.position.y = 0.02;
  const chest = k.cyl(torso, HIDE, TORSO_H + 0.05, 0.6, 0.44, 16);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.75;
  for (let i = 0; i < 3; i++) {
    const rib = k.box(torso, DARKHIDE, 0.34 - i * 0.04, 0.02, 0.02);
    rib.position.set(0, 0.16 + i * 0.07, 0.17);
  }
  const neck = k.cyl(torso, HIDE, 0.32, 0.2, 0.26, 12);
  neck.position.set(0, TORSO_H + 0.08, 0.02);
  neck.rotation.x = 0.35;
  arms(k, { hips, torso, head, legL, legR, armL, armR, flutter: [] }, null, 0, HIDE, undefined);
  // Extra-long arms: the classic lanky silhouette.
  for (const arm of [armL, armR]) arm.scaling.set(0.9, 1.55, 0.9);

  // Horse head: long muzzle forward, flared nostrils, glowing eyes, pointed ears, spiky mane.
  const skull = k.sphere(head, HIDE, HEAD_R * 1.15, 18);
  skull.scaling.set(0.85, 0.95, 1.05);
  // Long face angled down-forward (reads as a horse from the game camera and up close).
  const face = k.node('face', head, 0, -0.02, 0.18);
  face.rotation.x = -0.8;
  const muzzle = k.cyl(face, HIDE, 0.8, 0.26, 0.4, 16);
  muzzle.position.y = -0.38;
  muzzle.scaling.z = 0.85;
  const blaze = k.box(face, '#eadbc4', 0.08, 0.62, 0.04);
  blaze.position.set(0, -0.28, 0.17);
  blaze.rotation.x = -0.1;
  const lip = k.sphere(face, DARKHIDE, 0.32, 14);
  lip.position.set(0, -0.8, 0.0);
  lip.scaling.set(1.05, 0.7, 0.9);
  for (const side of [-1, 1]) {
    const nostril = k.sphere(face, '#1a0e0a', 0.07, 8);
    nostril.position.set(side * 0.08, -0.8, 0.13);
    const eye = k.sphere(head, k.m('#ff4a2a', { glow: 1 }), 0.1, 10);
    eye.position.set(side * 0.24, 0.06, 0.16);
    const ear = k.cyl(head, HIDE, 0.3, 0.02, 0.13, 6);
    ear.position.set(side * 0.16, 0.38, -0.04);
    ear.rotation.set(-0.15, 0, side * -0.25);
  }
  for (let i = 0; i < 6; i++) {
    const spike = k.cyl(head, MANE, 0.3 - i * 0.02, 0.02, 0.14, 5);
    spike.position.set(0, 0.32 - i * 0.12, -0.12 - i * 0.07);
    spike.rotation.x = -0.7 - i * 0.15;
  }
  const back = k.node('mane', torso, 0, TORSO_H, -0.2);
  for (let i = 0; i < 4; i++) {
    const lock = k.cyl(back, MANE, 0.34, 0.12, 0.02, 6);
    lock.position.set((i - 1.5) * 0.08, -0.15, 0);
    lock.rotation.x = -0.3;
  }
  if (override) for (const m of k.meshes) m.material = override;
  return { id: 'tikbalang', skin: 'tikbalang', root, body, hips, torso, head, legL, legR, armL, armR, flutter: [back], meshes: k.meshes };
}
