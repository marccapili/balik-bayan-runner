import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../utils/math';

/**
 * Time-portal the hero hovers under during the intro: a spinning gold sun ring with a swirling
 * violet core, rising sparkles and a glowing light pool on the floor (no real light: museum materials are frozen). Fades in/out via `strength`.
 */
export class Portal {
  private readonly root: TransformNode;
  private readonly ring: Mesh;
  private readonly ring2: Mesh;
  private readonly core: Mesh;
  private readonly glow: Mesh;
  private readonly mats: StandardMaterial[] = [];
  private readonly sparks: ParticleSystem;
  private strength = 0;
  private target = 0;
  private t = 0;

  constructor(scene: Scene, spark: DynamicTexture) {
    this.root = new TransformNode('portal', scene);
    const mk = (name: string, hex: string, alpha: number): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.emissiveColor = Color3.FromHexString(hex);
      m.disableLighting = true;
      m.alpha = alpha;
      m.backFaceCulling = false;
      this.mats.push(m);
      return m;
    };
    this.ring = CreateTorus('portalRing', { diameter: 2.3, thickness: 0.12, tessellation: 48 }, scene);
    this.ring.material = mk('portalRingMat', '#ffd36b', 1);
    this.ring2 = CreateTorus('portalRing2', { diameter: 1.7, thickness: 0.05, tessellation: 40 }, scene);
    this.ring2.material = mk('portalRing2Mat', '#ffe9b0', 0.9);

    const swirl = new DynamicTexture('portalSwirl', { width: 256, height: 256 }, scene, true);
    const ctx = swirl.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(0.25, 'rgba(190,120,255,0.95)');
    g.addColorStop(0.7, 'rgba(70,40,170,0.75)');
    g.addColorStop(1, 'rgba(30,20,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255,230,160,0.55)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      for (let a = 0; a < 3.4; a += 0.08) {
        const r = 10 + a * 32;
        const ang = a + (i * Math.PI) / 3;
        const x = 128 + Math.cos(ang) * r;
        const y = 128 + Math.sin(ang) * r;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    swirl.hasAlpha = true;
    swirl.update();
    const coreMat = mk('portalCoreMat', '#ffffff', 0.85);
    coreMat.diffuseTexture = swirl;
    coreMat.emissiveTexture = swirl;
    coreMat.useAlphaFromDiffuseTexture = true;
    this.core = CreateDisc('portalCore', { radius: 1.08, tessellation: 40 }, scene);
    this.core.material = coreMat;
    // Floor glow under the hero (reads as the portal's light pool).
    const glowMat = mk('portalGlowMat', '#ffffff', 0.6);
    glowMat.diffuseTexture = swirl;
    glowMat.emissiveTexture = swirl;
    glowMat.useAlphaFromDiffuseTexture = true;
    this.glow = CreateDisc('portalGlow', { radius: 1.5, tessellation: 32 }, scene);
    this.glow.material = glowMat;
    this.glow.rotation.x = Math.PI / 2;
    this.glow.position.y = 0.03;

    for (const m of [this.ring, this.ring2, this.core]) {
      m.parent = this.root;
      m.isPickable = false;
    }
    // Upright rift standing just behind the hover point, tilted toward the elevated camera.
    this.ring.rotation.x = Math.PI / 2;
    this.ring2.rotation.x = Math.PI / 2;
    this.root.rotation.x = -0.55;
    this.glow.isPickable = false;

    const ps = (this.sparks = new ParticleSystem('portalSparks', 120, scene));
    ps.particleTexture = spark;
    ps.emitter = new Vector3();
    ps.createCylinderEmitter(1.0, 0.1, 0.4, 0.2);
    ps.minSize = 0.06;
    ps.maxSize = 0.16;
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.6;
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.6;
    ps.gravity = new Vector3(0, -1.2, 0);
    ps.color1 = new Color4(1, 0.86, 0.45, 1);
    ps.color2 = new Color4(0.78, 0.55, 1, 1);
    ps.colorDead = new Color4(0.5, 0.3, 1, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitRate = 0;
    ps.updateSpeed = 1 / 60;
    ps.start();

    this.setEnabled(false);
  }

  private setEnabled(on: boolean): void {
    this.root.setEnabled(on);
    this.glow.setEnabled(on);
  }

  /** Show behind the hover point `pos`, centred at `height`. */
  open(pos: Vec2, height: number, reduced: boolean): void {
    this.root.position.set(pos.x, height, pos.z + 0.8);
    this.glow.position.x = pos.x;
    this.glow.position.z = pos.z;
    (this.sparks.emitter as Vector3).set(pos.x, height + 0.4, pos.z + 0.4);
    this.sparks.emitRate = reduced ? 15 : 45;
    this.target = 1;
    this.setEnabled(true);
  }

  close(): void {
    this.target = 0;
    this.sparks.emitRate = 0;
  }

  /** Burst the portal shut instantly (replay / leaving). */
  hide(): void {
    this.target = 0;
    this.strength = 0;
    this.sparks.emitRate = 0;
    this.setEnabled(false);
  }

  update(dt: number): void {
    if (this.strength === 0 && this.target === 0) return;
    this.t += dt;
    const k = this.target > this.strength ? 3 : 5;
    this.strength += (this.target - this.strength) * Math.min(1, dt * k);
    if (this.target === 0 && this.strength < 0.01) {
      this.strength = 0;
      this.setEnabled(false);
      return;
    }
    const s = this.strength;
    const pulse = 1 + Math.sin(this.t * 3) * 0.04;
    this.root.scaling.setAll(Math.max(0.01, s * pulse));
    this.ring2.rotation.y = Math.sin(this.t * 1.7) * 0.25;
    this.core.rotation.z = this.t * 1.6;
    this.glow.rotation.y = -this.t * 0.6;
    this.glow.scaling.setAll(Math.max(0.01, s));
    this.mats[0]!.alpha = s;
    this.mats[1]!.alpha = 0.9 * s;
    this.mats[2]!.alpha = 0.85 * s;
    this.mats[3]!.alpha = 0.55 * s;
  }

  dispose(): void {
    this.sparks.dispose();
    this.glow.dispose();
    this.root.dispose();
  }
}
