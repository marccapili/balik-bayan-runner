import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../utils/math';

export type BurstKind = 'coin' | 'rare' | 'heart' | 'hit';

const BURST_COLORS: Record<BurstKind, [string, string]> = {
  coin: ['#ffe28a', '#f2a93b'],
  rare: ['#f0c8ff', '#9b4dff'],
  heart: ['#ffd0da', '#ff3b5c'],
  hit: ['#ffffff', '#ff5a3c'],
};

/** Pooled particle bursts + the guard "!" billboard. */
export class Fx {
  private readonly systems: ParticleSystem[] = [];
  private next = 0;
  private readonly emitter = new Vector3();
  readonly alertMat: StandardMaterial;
  /** "?" shown while a guard searches for a hero it lost. */
  readonly lostMat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    const dot = new DynamicTexture('sparkTex', { width: 64, height: 64 }, scene, false);
    const ctx = dot.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    dot.hasAlpha = true;
    dot.update();
    for (let i = 0; i < 4; i++) {
      const ps = new ParticleSystem(`burst${i}`, 40, scene);
      ps.particleTexture = dot;
      ps.emitter = this.emitter.clone();
      ps.minSize = 0.08;
      ps.maxSize = 0.2;
      ps.minLifeTime = 0.25;
      ps.maxLifeTime = 0.55;
      ps.minEmitPower = 2;
      ps.maxEmitPower = 4.5;
      ps.gravity = new Vector3(0, -6, 0);
      ps.direction1 = new Vector3(-1, 1.6, -1);
      ps.direction2 = new Vector3(1, 2.4, 1);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.updateSpeed = 1 / 60;
      ps.start();
      this.systems.push(ps);
    }

    this.alertMat = signMaterial(scene, 'alert', '!', '#ffd23f');
    this.lostMat = signMaterial(scene, 'lost', '?', '#9fd8ff');
  }

  burst(kind: BurstKind, at: Vec2, y = 0.7, count = 16): void {
    const ps = this.systems[this.next]!;
    this.next = (this.next + 1) % this.systems.length;
    const [a, b] = BURST_COLORS[kind];
    ps.color1 = Color4.FromHexString(`${a}ff`);
    ps.color2 = Color4.FromHexString(`${b}ff`);
    ps.colorDead = Color4.FromHexString(`${b}00`);
    (ps.emitter as Vector3).set(at.x, y, at.z);
    ps.manualEmitCount = count;
  }

  /** A billboard sign that follows a guard's head (material swapped between "!" and "?"). */
  makeAlertSign(): Mesh {
    const p = CreatePlane('alertSign', { size: 0.8 }, this.scene);
    p.material = this.alertMat;
    p.billboardMode = Mesh.BILLBOARDMODE_ALL;
    p.isPickable = false;
    p.setEnabled(false);
    return p;
  }

  dispose(): void {
    for (const s of this.systems) s.dispose();
  }
}

function signMaterial(scene: Scene, name: string, glyph: string, fill: string): StandardMaterial {
  const tex = new DynamicTexture(`${name}Tex`, { width: 128, height: 128 }, scene, true);
  const c2 = tex.getContext() as unknown as CanvasRenderingContext2D;
  c2.fillStyle = fill;
  c2.strokeStyle = '#3a2208';
  c2.lineWidth = 10;
  c2.beginPath();
  c2.moveTo(64, 6);
  c2.lineTo(122, 116);
  c2.lineTo(6, 116);
  c2.closePath();
  c2.fill();
  c2.stroke();
  c2.fillStyle = '#3a2208';
  c2.font = '900 76px system-ui, sans-serif';
  c2.textAlign = 'center';
  c2.fillText(glyph, 64, 104);
  tex.hasAlpha = true;
  tex.update();
  const m = new StandardMaterial(`${name}Mat`, scene);
  m.diffuseTexture = tex;
  m.useAlphaFromDiffuseTexture = true;
  m.emissiveColor = Color3.White();
  m.disableLighting = true;
  m.backFaceCulling = false;
  return m;
}
