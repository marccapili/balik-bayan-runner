import type { Scene } from '@babylonjs/core/scene';
import { arms, buildSkeleton, hairCap, HEAD_R, Kit, legs, TORSO_H, type HeroRig } from '../characters/HeroModel';
import { faceMaterial } from '../characters/heroTextures';

const SKIN = '#d79e76';
const UNIFORM = '#2c3f78';
const UNIFORM_DARK = '#1c2546';

let guardCount = 0;

/** Chibi museum security guard (procedural, same rig as the heroes so HeroAnimator drives it). */
export function buildGuard(scene: Scene): HeroRig {
  const k = new Kit(scene, `guard${guardCount++}`);
  const face = faceMaterial(scene, 'guard', { skin: SKIN, brow: '#1a120d', iris: '#3b2414', lash: '#1b100b', mouth: 'flat', browTilt: 0.34 });
  const p = buildSkeleton(k, face, SKIN);

  legs(k, p, UNIFORM_DARK, 0.34, UNIFORM_DARK, 'boot', SKIN);

  // Uniform shirt with pockets, badge, belt, radio
  const chest = k.cyl(p.torso, UNIFORM, TORSO_H, 0.56, 0.62, 20);
  chest.position.y = TORSO_H / 2;
  chest.scaling.z = 0.84;
  const tuck = k.cyl(p.hips, UNIFORM, 0.1, 0.62, 0.62, 20);
  tuck.scaling.z = 0.84;
  tuck.position.y = 0.0;
  const belt = k.cyl(p.hips, '#111216', 0.08, 0.64, 0.64, 20);
  belt.scaling.z = 0.85;
  belt.position.y = 0.05;
  const buckle = k.box(p.hips, k.m('#c9c9cf', { spec: 0.8, glow: 0.3 }), 0.1, 0.07, 0.03);
  buckle.position.set(0, 0.05, 0.28);
  const radio = k.box(p.hips, '#1a1a1e', 0.09, 0.15, 0.06);
  radio.position.set(0.27, 0.04, 0.08);
  const antenna = k.cyl(p.hips, '#1a1a1e', 0.12, 0.015, 0.015, 6);
  antenna.position.set(0.29, 0.17, 0.08);
  for (const side of [-1, 1]) {
    const pocket = k.box(p.torso, '#24356a', 0.12, 0.1, 0.03);
    pocket.position.set(side * 0.13, 0.27, 0.26);
    const flap = k.box(p.torso, '#1f2e5e', 0.13, 0.03, 0.035);
    flap.position.set(side * 0.13, 0.32, 0.265);
    const ep = k.box(p.torso, UNIFORM_DARK, 0.14, 0.03, 0.18);
    ep.position.set(side * 0.27, TORSO_H - 0.02, 0);
  }
  const badge = k.cyl(p.torso, k.m('#e8b53e', { glow: 0.5, spec: 0.8 }), 0.03, 0.09, 0.09, 6);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(-0.13, 0.36, 0.28);
  const placket = k.box(p.torso, UNIFORM_DARK, 0.04, 0.34, 0.03);
  placket.position.set(0, 0.2, 0.265);
  // Collar
  for (const side of [-1, 1]) {
    const c = k.box(p.torso, '#34498a', 0.1, 0.05, 0.04);
    c.position.set(side * 0.06, TORSO_H - 0.02, 0.22);
    c.rotation.z = side * 0.5;
  }
  arms(k, p, UNIFORM, 0.55, SKIN, UNIFORM_DARK);

  // Short hair + peaked cap
  hairCap(k, p.head, '#18110d', 0.98);
  // Sideburns peek out under the cap (a fringe would poke through the visor).
  for (const side of [-1, 1]) {
    const sb = k.box(p.head, '#18110d', 0.06, 0.16, 0.1);
    sb.position.set(side * HEAD_R * 0.93, 0.02, 0.08);
  }
  const cap = k.node('cap', p.head, 0, HEAD_R * 0.62, 0.02);
  cap.rotation.x = -0.12;
  const crown = k.cyl(cap, UNIFORM_DARK, 0.26, 1.02, 0.92, 24);
  crown.position.y = 0.12;
  crown.scaling.z = 0.95;
  const band = k.cyl(cap, '#111216', 0.07, 0.94, 0.94, 24);
  band.position.y = 0.02;
  const visor = k.cyl(cap, k.m('#0c0c0f', { spec: 0.6 }), 0.03, 0.62, 0.62, 20, { arc: 0.5 });
  visor.position.set(0, 0.0, 0.32);
  visor.rotation.set(0.2, -Math.PI / 2, 0);
  const capBadge = k.cyl(cap, k.m('#e8b53e', { glow: 0.5, spec: 0.8 }), 0.03, 0.14, 0.14, 6);
  capBadge.rotation.x = Math.PI / 2 - 0.1;
  capBadge.position.set(0, 0.13, 0.47);

  return { id: 'guard', meshes: k.meshes, ...p };
}
