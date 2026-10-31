import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Scene } from '@babylonjs/core/scene';
import { GADGETS, GADGET_INFO, GADGET_KINDS, type GadgetKind } from '../data/gadgets';
import type { GuardBrain } from '../enemies/GuardBrain';
import type { GadgetPickup } from '../gameplay/Gadgets';
import { gadgetCanvas } from '../ui/gadgetArt';
import type { Vec2 } from '../utils/math';

const glow = (scene: Scene, name: string, hex: string, alpha: number): StandardMaterial => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.FromHexString(hex);
  m.disableLighting = true;
  m.alpha = alpha;
  m.backFaceCulling = false;
  return m;
};

interface PickupMesh {
  icon: Mesh;
  disc: Mesh;
  kind: GadgetKind;
}

/**
 * Gadget visuals (cosmetic only): floating pixel-art pickups, the smoke cloud, the bubble
 * around the hero, the magnet ring, and little hourglasses over enemies caught in a Time Freeze.
 */
export class GadgetViews {
  private readonly iconMats = {} as Record<GadgetKind, StandardMaterial>;
  private readonly discMats = {} as Record<GadgetKind, StandardMaterial>;
  private readonly live = new Map<number, PickupMesh>();
  private readonly spare: PickupMesh[] = [];
  private readonly bubble: Mesh;
  private readonly bubbleMat: StandardMaterial;
  private readonly magnetRing: Mesh;
  private readonly freezeRing: Mesh;
  private readonly freezeMat: StandardMaterial;
  private readonly smoke: ParticleSystem;
  private readonly slowIcons: Mesh[] = [];
  private t = 0;
  private popT = -1;
  private freezeT = -1;
  reduced = false;

  constructor(
    private readonly scene: Scene,
    spark: DynamicTexture,
  ) {
    for (const k of GADGET_KINDS) {
      const src = gadgetCanvas(k, 4);
      const tex = new DynamicTexture(`gadget_${k}`, { width: src.width, height: src.height }, scene, false, Texture.NEAREST_SAMPLINGMODE);
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, src.width, src.height);
      ctx.drawImage(src, 0, 0);
      tex.hasAlpha = true;
      tex.update(false);
      const m = new StandardMaterial(`gadgetMat_${k}`, scene);
      m.diffuseTexture = tex;
      m.emissiveColor = new Color3(0.85, 0.85, 0.85);
      m.specularColor = Color3.Black();
      m.disableLighting = true;
      m.useAlphaFromDiffuseTexture = true;
      m.backFaceCulling = false;
      this.iconMats[k] = m;
      this.discMats[k] = glow(scene, `gadgetDisc_${k}`, GADGET_INFO[k].color, 0.35);
    }

    this.bubbleMat = glow(scene, 'gadgetBubbleMat', '#5fb8ff', 0.22);
    this.bubble = CreateSphere('gadgetBubble', { diameter: 2.3, segments: 18 }, scene);
    this.bubble.material = this.bubbleMat;
    this.bubble.isPickable = false;
    this.bubble.setEnabled(false);

    this.magnetRing = CreateTorus('magnetRing', { diameter: 1.6, thickness: 0.08, tessellation: 40 }, scene);
    this.magnetRing.material = glow(scene, 'magnetRingMat', '#ff5a5a', 0.75);
    this.magnetRing.isPickable = false;
    this.magnetRing.setEnabled(false);

    this.freezeMat = glow(scene, 'freezeRingMat', '#8fd8ff', 0.8);
    this.freezeRing = CreateTorus('freezeRing', { diameter: 2, thickness: 0.1, tessellation: 56 }, scene);
    this.freezeRing.material = this.freezeMat;
    this.freezeRing.isPickable = false;
    this.freezeRing.setEnabled(false);

    const ps = (this.smoke = new ParticleSystem('smokeBomb', 220, scene));
    ps.particleTexture = spark;
    ps.emitter = new Vector3();
    ps.minEmitBox = new Vector3(-1.4, 0, -1.4);
    ps.maxEmitBox = new Vector3(1.4, 1.2, 1.4);
    ps.minSize = 0.9;
    ps.maxSize = 1.9;
    ps.minLifeTime = 0.9;
    ps.maxLifeTime = 1.6;
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.7;
    ps.gravity = new Vector3(0, 0.25, 0);
    ps.color1 = new Color4(0.78, 0.66, 1, 0.55);
    ps.color2 = new Color4(0.62, 0.5, 0.86, 0.45);
    ps.colorDead = new Color4(0.5, 0.45, 0.7, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    ps.start();
  }

  private take(kind: GadgetKind): PickupMesh {
    const i = this.spare.findIndex((p) => p.kind === kind);
    if (i >= 0) {
      const p = this.spare.splice(i, 1)[0]!;
      p.icon.setEnabled(true);
      p.disc.setEnabled(true);
      return p;
    }
    const icon = CreatePlane(`gadgetIcon_${kind}`, { size: 1.45 }, this.scene);
    icon.material = this.iconMats[kind];
    icon.billboardMode = Mesh.BILLBOARDMODE_ALL;
    icon.isPickable = false;
    const disc = CreateDisc(`gadgetGlow_${kind}`, { radius: 0.7, tessellation: 28 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    disc.material = this.discMats[kind];
    disc.isPickable = false;
    return { icon, disc, kind };
  }

  private slowIcon(i: number): Mesh {
    let m = this.slowIcons[i];
    if (!m) {
      m = CreatePlane(`slowIcon${i}`, { size: 0.55 }, this.scene);
      m.material = this.iconMats.freeze;
      m.billboardMode = Mesh.BILLBOARDMODE_ALL;
      m.isPickable = false;
      this.slowIcons.push(m);
    }
    return m;
  }

  /** Bubble burst when it soaks a hit. */
  pop(): void {
    this.popT = 0;
  }

  /** Time Freeze cast: a cold ring sweeps out to the freeze radius. */
  freezeWave(at: Vec2): void {
    this.freezeRing.position.set(at.x, 0.2, at.z);
    this.freezeT = 0;
    this.freezeRing.setEnabled(true);
  }

  update(
    dt: number,
    items: readonly GadgetPickup[],
    hero: Vec2,
    fx: { bubble: boolean; magnet: boolean; smoke: boolean; smokeAt: Vec2 },
    guards: readonly GuardBrain[],
  ): void {
    this.t += dt;
    // Floor pickups.
    const seen = new Set<number>();
    for (const it of items) {
      seen.add(it.id);
      let p = this.live.get(it.id);
      if (!p) this.live.set(it.id, (p = this.take(it.kind)));
      const blink = it.ttl < 5 && Math.floor(this.t * 6) % 2 === 0;
      p.icon.setEnabled(!blink);
      p.icon.position.set(it.pos.x, 1.15 + Math.sin(this.t * 2.6 + it.id) * 0.12, it.pos.z);
      p.disc.position.set(it.pos.x, 0.04, it.pos.z);
      p.disc.scaling.setAll(1 + Math.sin(this.t * 4 + it.id) * 0.08);
    }
    for (const [id, p] of this.live) {
      if (seen.has(id)) continue;
      p.icon.setEnabled(false);
      p.disc.setEnabled(false);
      this.spare.push(p);
      this.live.delete(id);
    }

    // Bubble around the hero (with a pop flash).
    if (this.popT >= 0) {
      this.popT += dt;
      const k = this.popT / 0.3;
      this.bubble.setEnabled(k < 1);
      this.bubble.scaling.setAll(1 + k * 0.7);
      this.bubbleMat.alpha = 0.5 * (1 - k);
      if (k >= 1) this.popT = -1;
    } else {
      this.bubble.setEnabled(fx.bubble);
      if (fx.bubble) {
        this.bubble.scaling.setAll(1 + Math.sin(this.t * 4) * 0.04);
        this.bubbleMat.alpha = 0.2 + Math.sin(this.t * 2.5) * 0.05;
      }
    }
    this.bubble.position.set(hero.x, 1.1, hero.z);

    // Magnet ring pulsing out from the hero's feet.
    this.magnetRing.setEnabled(fx.magnet);
    if (fx.magnet) {
      const k = (this.t * 1.5) % 1;
      const r = 1 + k * (GADGETS.magnet.radius - 1) * 0.5;
      this.magnetRing.position.set(hero.x, 0.15, hero.z);
      this.magnetRing.scaling.set(r, 1, r);
      (this.magnetRing.material as StandardMaterial).alpha = 0.8 * (1 - k);
    }

    // Smoke cloud where the bomb went off.
    (this.smoke.emitter as Vector3).set(fx.smokeAt.x, 0.2, fx.smokeAt.z);
    this.smoke.emitRate = fx.smoke ? (this.reduced ? 40 : 120) : 0;

    // Freeze wave + hourglasses over slowed enemies.
    if (this.freezeT >= 0) {
      this.freezeT += dt;
      const k = Math.min(1, this.freezeT / 0.6);
      const r = 0.5 + (GADGETS.freeze.radius - 0.5) * (1 - (1 - k) ** 2);
      this.freezeRing.scaling.set(r, 1, r);
      this.freezeMat.alpha = 0.85 * (1 - k);
      if (k >= 1) {
        this.freezeT = -1;
        this.freezeRing.setEnabled(false);
      }
    }
    let n = 0;
    for (const g of guards) {
      if (g.slowLeft <= 0) continue;
      const m = this.slowIcon(n++);
      m.setEnabled(true);
      m.position.set(g.pos.x, 2.6 + Math.sin(this.t * 3 + n) * 0.08, g.pos.z);
    }
    for (let i = n; i < this.slowIcons.length; i++) this.slowIcons[i]!.setEnabled(false);
  }

  hide(): void {
    for (const p of this.live.values()) {
      p.icon.setEnabled(false);
      p.disc.setEnabled(false);
      this.spare.push(p);
    }
    this.live.clear();
    this.bubble.setEnabled(false);
    this.magnetRing.setEnabled(false);
    this.freezeRing.setEnabled(false);
    this.smoke.emitRate = 0;
    this.popT = this.freezeT = -1;
    for (const m of this.slowIcons) m.setEnabled(false);
  }
}
