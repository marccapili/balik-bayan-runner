import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import { ABILITIES } from '../data/abilities';
import type { Vec2 } from '../utils/math';

const glowMat = (scene: Scene, name: string, hex: string, alpha: number): StandardMaterial => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.FromHexString(hex);
  m.disableLighting = true;
  m.alpha = alpha;
  m.backFaceCulling = false;
  return m;
};

/**
 * Ability visuals: Lapu-Lapu's shield bubble, Bonifacio's shockwave ring,
 * a spark trail for Rizal's sprint and Gabriela's dash. Purely cosmetic.
 */
export class AbilityViews {
  private readonly bubble: Mesh;
  private readonly bubbleMat: StandardMaterial;
  private readonly ring: Mesh;
  private readonly ringMat: StandardMaterial;
  private readonly trail: ParticleSystem;
  private ringT = -1;
  private popT = -1;
  private t = 0;
  reduced = false;

  constructor(scene: Scene, spark: DynamicTexture) {
    this.bubbleMat = glowMat(scene, 'shieldMat', '#7fd8ff', 0.28);
    this.bubble = CreateSphere('shieldBubble', { diameter: 2.1, segments: 20 }, scene);
    this.bubble.material = this.bubbleMat;
    this.bubble.isPickable = false;
    this.bubble.setEnabled(false);

    this.ringMat = glowMat(scene, 'shockMat', '#ffd36b', 0.9);
    this.ring = CreateTorus('shockRing', { diameter: 2, thickness: 0.12, tessellation: 48 }, scene);
    this.ring.material = this.ringMat;
    this.ring.isPickable = false;
    this.ring.setEnabled(false);

    const ps = (this.trail = new ParticleSystem('abilityTrail', 160, scene));
    ps.particleTexture = spark;
    ps.emitter = new Vector3();
    ps.minEmitBox = new Vector3(-0.25, 0.1, -0.25);
    ps.maxEmitBox = new Vector3(0.25, 1.2, 0.25);
    ps.minSize = 0.08;
    ps.maxSize = 0.2;
    ps.minLifeTime = 0.25;
    ps.maxLifeTime = 0.5;
    ps.minEmitPower = 0.1;
    ps.maxEmitPower = 0.4;
    ps.gravity = new Vector3(0, 0.6, 0);
    ps.color1 = new Color4(1, 0.9, 0.45, 1);
    ps.color2 = new Color4(1, 0.7, 0.3, 1);
    ps.colorDead = new Color4(1, 0.5, 0.2, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitRate = 0;
    ps.start();
  }

  /** Shockwave ring expanding from `at` out to the ability radius. */
  shockwave(at: Vec2): void {
    this.ring.position.set(at.x, 0.25, at.z);
    this.ringT = 0;
    this.ring.setEnabled(true);
  }

  /** Shield took a hit: quick flash-and-grow before it disappears. */
  pop(): void {
    this.popT = 0;
  }

  /**
   * Per frame. `shield` = bubble up, `trail` = sprint/dash sparks on.
   * The trail colour switches between Rizal gold and Gabriela crimson.
   */
  update(dt: number, at: Vec2, shield: boolean, trail: 'sprint' | 'dash' | null): void {
    this.t += dt;
    // Shield bubble (gentle pulse; brief flash when it breaks).
    if (this.popT >= 0) {
      this.popT += dt;
      const k = this.popT / 0.25;
      this.bubble.setEnabled(k < 1);
      this.bubble.scaling.setAll(1 + k * 0.6);
      this.bubbleMat.alpha = 0.5 * (1 - k);
      if (k >= 1) this.popT = -1;
    } else {
      this.bubble.setEnabled(shield);
      if (shield) {
        this.bubble.scaling.setAll(1 + Math.sin(this.t * 5) * 0.03);
        this.bubbleMat.alpha = 0.24 + Math.sin(this.t * 3) * 0.06;
      }
    }
    this.bubble.position.set(at.x, 1.05, at.z);

    // Shockwave ring.
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = Math.min(1, this.ringT / ABILITIES.shockwave.duration);
      const r = 0.5 + (ABILITIES.shockwave.radius - 0.5) * (1 - (1 - k) ** 2);
      this.ring.scaling.set(r, 1, r);
      this.ringMat.alpha = 0.9 * (1 - k);
      if (k >= 1) {
        this.ringT = -1;
        this.ring.setEnabled(false);
      }
    }

    // Spark trail.
    (this.trail.emitter as Vector3).set(at.x, 0, at.z);
    const rate = trail === 'dash' ? 260 : trail === 'sprint' ? 70 : 0;
    this.trail.emitRate = this.reduced ? rate / 3 : rate;
    if (trail === 'dash') {
      this.trail.color1 = new Color4(1, 0.45, 0.45, 1);
      this.trail.color2 = new Color4(1, 0.8, 0.6, 1);
    } else if (trail === 'sprint') {
      this.trail.color1 = new Color4(1, 0.9, 0.45, 1);
      this.trail.color2 = new Color4(0.6, 0.85, 1, 1);
    }
  }

  hide(): void {
    this.ringT = -1;
    this.popT = -1;
    this.ring.setEnabled(false);
    this.bubble.setEnabled(false);
    this.trail.emitRate = 0;
  }

  dispose(): void {
    this.trail.dispose();
    this.ring.dispose();
    this.bubble.dispose();
  }
}
