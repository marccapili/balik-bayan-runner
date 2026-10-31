import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { TRAINING } from '../data/training';
import type { Dummy } from '../gameplay/SurvivalRun';
import { mat } from './materials';

/**
 * Training-only set dressing: straw practice dummies (bamboo pole, sack body, target) and
 * velvet-rope barriers across the Hall of Heroes doorways. Hidden during normal runs.
 */
export class TrainingProps {
  private readonly root: TransformNode;
  private readonly dummyNodes: TransformNode[] = [];
  private t = 0;

  constructor(scene: Scene) {
    this.root = new TransformNode('training', scene);
    const add = (m: Mesh, parent: TransformNode): Mesh => {
      m.parent = parent;
      m.isPickable = false;
      return m;
    };
    const pole = mat(scene, '#8a6a3a');
    const sack = mat(scene, '#d8b880', { glow: 0.18 });
    const rope = mat(scene, '#7a4a22');
    const red = mat(scene, '#c8202b', { glow: 0.25 });
    const cream = mat(scene, '#fff6df', { glow: 0.3 });

    for (let i = 0; i < TRAINING.dummies.length; i++) {
      const n = new TransformNode(`dummy${i}`, scene);
      n.parent = this.root;
      const base = add(CreateCylinder('dBase', { height: 0.12, diameter: 0.9, tessellation: 18 }, scene), n);
      base.position.y = 0.06;
      base.material = pole;
      const p = add(CreateCylinder('dPole', { height: 1.7, diameter: 0.12, tessellation: 8 }, scene), n);
      p.position.y = 0.85;
      p.material = pole;
      const body = add(CreateCylinder('dBody', { height: 0.8, diameterTop: 0.62, diameterBottom: 0.72, tessellation: 16 }, scene), n);
      body.position.y = 1.15;
      body.material = sack;
      const head = add(CreateSphere('dHead', { diameter: 0.55, segments: 12 }, scene), n);
      head.position.y = 1.78;
      head.material = sack;
      const arm = add(CreateCylinder('dArm', { height: 1.3, diameter: 0.1, tessellation: 8 }, scene), n);
      arm.rotation.z = Math.PI / 2;
      arm.position.y = 1.4;
      arm.material = pole;
      for (const [r, m] of [[0.42, red], [0.27, cream], [0.12, red]] as const) {
        const ring = add(CreateCylinder('dTarget', { height: 0.02, diameter: r, tessellation: 20 }, scene), n);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 1.18, -0.34 - (0.42 - r) * 0.02);
        ring.material = m;
      }
      for (const y of [0.85, 1.45]) {
        const band = add(CreateTorus('dRope', { diameter: 0.68, thickness: 0.04, tessellation: 16 }, scene), n);
        band.position.y = y;
        band.material = rope;
      }
      this.dummyNodes.push(n);
    }

    // Velvet ropes: two brass posts per doorway with a sagging red rope between them.
    const brass = mat(scene, '#d9a63e', { glow: 0.3, spec: 0.6 });
    const velvet = mat(scene, '#8e1420', { glow: 0.2 });
    for (const b of TRAINING.barriers) {
      const alongZ = b.maxZ - b.minZ > b.maxX - b.minX;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const len = alongZ ? b.maxZ - b.minZ : b.maxX - b.minX;
      const g = new TransformNode('barrier', scene);
      g.parent = this.root;
      g.position.set(cx, 0, cz);
      if (alongZ) g.rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) {
        const post = add(CreateCylinder('bPost', { height: 1.0, diameter: 0.12, tessellation: 10 }, scene), g);
        post.position.set((s * len) / 2 - s * 0.15, 0.5, 0);
        post.material = brass;
        const foot = add(CreateCylinder('bFoot', { height: 0.06, diameter: 0.4, tessellation: 14 }, scene), g);
        foot.position.set((s * len) / 2 - s * 0.15, 0.03, 0);
        foot.material = brass;
        const top = add(CreateSphere('bTop', { diameter: 0.18, segments: 8 }, scene), g);
        top.position.set((s * len) / 2 - s * 0.15, 1.02, 0);
        top.material = brass;
      }
      const r = add(CreateBox('bRope', { width: len - 0.3, height: 0.07, depth: 0.07 }, scene), g);
      r.position.y = 0.82;
      r.material = velvet;
    }
    this.root.setEnabled(false);
  }

  setEnabled(on: boolean): void {
    this.root.setEnabled(on);
  }

  /** Follows the run's dummies; knocked-over dummies tip back and wobble upright. */
  sync(dummies: readonly Dummy[], dt: number): void {
    this.t += dt;
    dummies.forEach((d, i) => {
      const n = this.dummyNodes[i];
      if (!n) return;
      n.position.set(d.pos.x, 0, d.pos.z);
      const k = d.stun / TRAINING.dummyStun;
      n.rotation.x = d.stun > 0 ? -0.9 * Math.min(1, k * 2) + Math.sin(this.t * 14) * 0.08 * k : 0;
    });
  }

  dispose(): void {
    this.root.dispose();
  }
}
