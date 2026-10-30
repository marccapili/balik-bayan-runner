import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/instancedMesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { Pickup, PickupKind } from '../gameplay/PickupField';
import { applyRim } from './materials';

/**
 * Renders PickupField items with mesh instances (one draw call per pickup type).
 * Instances are keyed by pickup id and recycled, never created per frame once warmed up.
 */
export class PickupViews {
  private readonly sources: Record<PickupKind, Mesh>;
  private readonly live = new Map<number, InstancedMesh>();
  private readonly spare: Record<PickupKind, InstancedMesh[]> = { coin: [], rareCoin: [], heart: [] };
  private t = 0;

  constructor(private readonly scene: Scene) {
    this.sources = {
      coin: this.coinMesh('coin', '#f2c14e', '#b8862a', 0.62),
      rareCoin: this.coinMesh('rareCoin', '#c77dff', '#6a2fb0', 0.8),
      heart: this.heartMesh(),
    };
  }

  private coinMesh(name: string, face: string, edge: string, d: number): Mesh {
    const tex = new DynamicTexture(`${name}Tex`, { width: 128, height: 128 }, this.scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(64, 64, 16, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-6, -20);
      ctx.lineTo(0, -44);
      ctx.lineTo(6, -20);
      ctx.fill();
      ctx.restore();
    }
    tex.update(true);
    const m = new StandardMaterial(`${name}Mat`, this.scene);
    m.diffuseTexture = tex;
    m.emissiveColor = Color3.FromHexString(face).scale(0.45);
    m.specularColor = new Color3(0.8, 0.8, 0.7);
    m.specularPower = 32;
    applyRim(m, 0.5);
    const mesh = CreateCylinder(name, { height: 0.09, diameter: d, tessellation: 24 }, this.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.bakeCurrentTransformIntoVertices();
    mesh.material = m;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    return mesh;
  }

  private heartMesh(): Mesh {
    const m = new StandardMaterial('heartMat', this.scene);
    m.diffuseColor = Color3.FromHexString('#ff3b5c');
    m.emissiveColor = Color3.FromHexString('#ff3b5c').scale(0.5);
    m.specularColor = new Color3(0.6, 0.6, 0.6);
    applyRim(m, 0.5);
    const parts: Mesh[] = [];
    for (const side of [-1, 1]) {
      const s = CreateSphere('h', { diameter: 0.36, segments: 12 }, this.scene);
      s.position.set(side * 0.12, 0.1, 0);
      s.scaling.z = 0.6;
      parts.push(s);
    }
    const tip = CreateCylinder('h', { height: 0.36, diameterTop: 0.5, diameterBottom: 0, tessellation: 16 }, this.scene);
    tip.position.y = -0.08;
    tip.scaling.z = 0.4;
    parts.push(tip);
    const heart = Mesh.MergeMeshes(parts, true, true)!;
    heart.name = 'heartPickup';
    heart.material = m;
    heart.isPickable = false;
    heart.setEnabled(false);
    return heart;
  }

  /** Mirror the current pickup list onto instances and animate spin/bob. */
  sync(items: readonly Pickup[], dt: number): void {
    this.t += dt;
    const seen = new Set<number>();
    for (const it of items) {
      if (!it.active) continue;
      seen.add(it.id);
      let inst = this.live.get(it.id);
      if (inst && inst.metadata !== it.kind) {
        this.release(it.id);
        inst = undefined;
      }
      if (!inst) {
        inst = this.spare[it.kind].pop() ?? this.sources[it.kind].createInstance(`${it.kind}_i`);
        inst.metadata = it.kind;
        inst.isPickable = false;
        inst.setEnabled(true);
        this.live.set(it.id, inst);
      }
      const phase = it.id * 0.7;
      inst.position.set(it.pos.x, 0.62 + Math.sin(this.t * 3 + phase) * 0.08, it.pos.z);
      inst.rotation.y = this.t * (it.kind === 'heart' ? 1.6 : 3) + phase;
      if (it.kind === 'heart') inst.scaling.setAll(1 + Math.sin(this.t * 6) * 0.08);
    }
    for (const id of [...this.live.keys()]) if (!seen.has(id)) this.release(id);
  }

  private release(id: number): void {
    const inst = this.live.get(id);
    if (!inst) return;
    inst.setEnabled(false);
    this.spare[inst.metadata as PickupKind].push(inst);
    this.live.delete(id);
  }
}
