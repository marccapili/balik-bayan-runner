import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { CAMERA_CONFIG } from '../data/config';
import type { Aabb } from '../physics/Collision';
import { damp, type Vec2 } from '../utils/math';
import { cameraOffset, fovForAspect, segmentHitsBox, type V3 } from './cameraMath';

export interface Occluder {
  box: Aabb;
  height: number;
  meshes: AbstractMesh[];
  /** Current visibility (smoothed). */
  vis: number;
}

/**
 * Fixed-orientation elevated follow camera (no player rotation control).
 * Smooths toward the hero with a velocity look-ahead and fades walls that hide the hero.
 */
export class FollowCamera {
  readonly camera: FreeCamera;
  private focus = new Vector3();
  private lead = { x: 0, z: 0 };
  private shakeTime = 0;
  private shakeStrength = 0;
  private readonly offset: V3;
  private readonly occluders: Occluder[] = [];

  constructor(scene: Scene, start: Vec2) {
    this.offset = cameraOffset(CAMERA_CONFIG.pitchDeg, CAMERA_CONFIG.distance);
    this.camera = new FreeCamera('followCam', new Vector3(), scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 120;
    this.camera.inputs.clear();
    this.snapTo(start);
  }

  addOccluder(o: Omit<Occluder, 'vis'>): void {
    this.occluders.push({ ...o, vis: 1 });
  }

  /** Instantly frames a point (used on spawn / replay so the camera never swoops in from 0,0). */
  snapTo(p: Vec2): void {
    this.lead = { x: 0, z: 0 };
    this.focus.set(p.x, 0, p.z);
    this.apply();
  }

  shake(strength: number, duration: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  update(target: Vec2, velocity: Vec2, dt: number, aspect: number): void {
    const c = CAMERA_CONFIG;
    const la = damp(c.lookAheadSharpness, dt);
    this.lead.x += (velocity.x * c.lookAhead - this.lead.x) * la;
    this.lead.z += (velocity.z * c.lookAhead - this.lead.z) * la;

    const f = damp(c.followSharpness, dt);
    this.focus.x += (target.x + this.lead.x - this.focus.x) * f;
    this.focus.z += (target.z + this.lead.z - this.focus.z) * f;

    this.camera.fov = fovForAspect(c.fovDeg, c.minHorizontalFovDeg, aspect);
    this.apply();

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeStrength * Math.max(0, this.shakeTime) * 4;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      if (this.shakeTime <= 0) this.shakeStrength = 0;
    }

    this.updateOcclusion(target, dt);
  }

  private apply(): void {
    const o = this.offset;
    this.camera.position.set(this.focus.x + o.x, o.y, this.focus.z + o.z);
    this.camera.setTarget(new Vector3(this.focus.x, 0.6, this.focus.z));
  }

  private updateOcclusion(hero: Vec2, dt: number): void {
    const cam = this.camera.position;
    const from: V3 = { x: cam.x, y: cam.y, z: cam.z };
    // Test head and feet so the hero is never fully hidden.
    const head: V3 = { x: hero.x, y: 1.4, z: hero.z };
    const feet: V3 = { x: hero.x, y: 0.2, z: hero.z };
    const k = damp(CAMERA_CONFIG.occlusionFadeSharpness, dt);
    for (const o of this.occluders) {
      const hit = segmentHitsBox(from, head, o.box, o.height) || segmentHitsBox(from, feet, o.box, o.height);
      const want = hit ? CAMERA_CONFIG.occludedVisibility : 1;
      if (Math.abs(o.vis - want) < 0.002) continue;
      o.vis += (want - o.vis) * k;
      for (const m of o.meshes) m.visibility = o.vis;
    }
  }
}
