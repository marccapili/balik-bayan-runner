import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../utils/math';
import { mat } from './materials';

/**
 * Exhibit Mode helpers: a floor arrow around the hero pointing at the next target,
 * and the Curator ID card (a glowing badge floating where it lies until picked up).
 */
export class GuideViews {
  private readonly arrow: Mesh;
  private readonly card: TransformNode;
  private readonly cardGlow: Mesh;
  private t = 0;

  constructor(scene: Scene) {
    // Chevron arrow, flat on the floor.
    const arrow = new Mesh('guideArrow', scene);
    const vd = new VertexData();
    vd.positions = [0, 0, 0.55, -0.42, 0, -0.2, 0, 0, 0.05, 0.42, 0, -0.2];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    vd.applyToMesh(arrow);
    arrow.material = mat(scene, '#ffd34d', { glow: 1, alpha: 0.9 });
    arrow.isPickable = false;
    arrow.setEnabled(false);
    this.arrow = arrow;

    this.card = new TransformNode('idCard', scene);
    const tex = new DynamicTexture('idCardTex', { width: 128, height: 84 }, scene, true);
    const c = tex.getContext() as CanvasRenderingContext2D;
    c.fillStyle = '#f6f1e4';
    c.fillRect(0, 0, 128, 84);
    c.fillStyle = '#1f2d6b';
    c.fillRect(0, 0, 128, 22);
    c.fillStyle = '#ffd34d';
    c.font = 'bold 15px sans-serif';
    c.fillText('CURATOR ID', 18, 16);
    c.fillStyle = '#c9a36a';
    c.fillRect(10, 30, 34, 44);
    c.fillStyle = '#1f2d6b';
    for (let i = 0; i < 4; i++) c.fillRect(54, 34 + i * 10, 62 - i * 10, 5);
    tex.update();
    const m = new StandardMaterial('idCardMat', scene);
    m.diffuseTexture = tex;
    m.emissiveColor = new Color3(0.55, 0.55, 0.55);
    m.specularColor = new Color3(0.2, 0.2, 0.2);
    const body = CreateBox('idCardBody', { width: 0.62, height: 0.4, depth: 0.04 }, scene);
    body.material = m;
    body.parent = this.card;
    body.isPickable = false;
    const glow = CreateDisc('idCardGlow', { radius: 0.75, tessellation: 32 }, scene);
    glow.rotation.x = Math.PI / 2;
    glow.material = mat(scene, '#7fd3ff', { glow: 1, alpha: 0.45 });
    glow.isPickable = false;
    this.cardGlow = glow;
    this.card.setEnabled(false);
    glow.setEnabled(false);
  }

  /** `target` null hides the arrow; `card` null / taken hides the badge. */
  update(dt: number, hero: Vec2, target: Vec2 | null, card: { pos: Vec2; taken: boolean } | null): void {
    this.t += dt;
    const show = !!target && Math.hypot(target.x - hero.x, target.z - hero.z) > 3.2;
    this.arrow.setEnabled(show);
    if (show && target) {
      const yaw = Math.atan2(target.x - hero.x, target.z - hero.z);
      const r = 1.25 + Math.sin(this.t * 5) * 0.08;
      this.arrow.position.set(hero.x + Math.sin(yaw) * r, 0.06, hero.z + Math.cos(yaw) * r);
      this.arrow.rotation.y = yaw;
    }
    const cardOn = !!card && !card.taken;
    this.card.setEnabled(cardOn);
    this.cardGlow.setEnabled(cardOn);
    if (cardOn && card) {
      this.card.position.set(card.pos.x, 0.9 + Math.sin(this.t * 2.4) * 0.12, card.pos.z);
      this.card.rotation.y = this.t * 1.6;
      this.cardGlow.position.set(card.pos.x, 0.04, card.pos.z);
      this.cardGlow.scaling.setAll(1 + Math.sin(this.t * 4) * 0.08);
    }
  }

  hide(): void {
    this.arrow.setEnabled(false);
    this.card.setEnabled(false);
    this.cardGlow.setEnabled(false);
  }

  dispose(): void {
    this.arrow.dispose();
    this.card.dispose();
    this.cardGlow.dispose();
  }
}
