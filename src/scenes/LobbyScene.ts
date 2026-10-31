import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { HeroAnimator } from '../animations/HeroAnimator';
import { buildHero, disposeHero, type HeroRig } from '../characters/HeroModel';
import { PLAYER_CONFIG } from '../data/config';
import type { HeroId } from '../data/heroes';
import { LOBBY } from '../data/lobby';
import { damp } from '../utils/math';
import { mat } from '../world/materials';
import { blobShadow, capizTexture, floorTiles, sunMedallion } from '../world/textures';
import type { GameScene } from './GameScene';

const HERO_SCALE = 1.25;
const STAGE_TOP = 0.36;

/**
 * Home lobby stage: the selected hero idles on a sun-medallion platform in front of an
 * original bahay-na-bato-inspired facade with capiz windows, parol-like lanterns and banderitas.
 */
export class LobbyScene implements GameScene {
  readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly holder: TransformNode;
  private rig: HeroRig | null = null;
  private animator: HeroAnimator | null = null;
  private heroId: HeroId | null = null;
  private readonly lanterns: Mesh[] = [];
  private readonly flags: TransformNode[] = [];
  private t = 0;
  private spin = 0;
  private spinVel = 0;
  private dragging: number | null = null;
  private lastX = 0;
  private emoteIn = 3;
  /** Set false while the lobby is hidden so drag listeners do nothing. */
  active = false;

  constructor(
    engine: Engine,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.05, 0.07, 0.17, 1);
    scene.skipPointerMovePicking = true;
    scene.ambientColor = new Color3(0.3, 0.28, 0.35);

    const hemi = new HemisphericLight('lobbyHemi', new Vector3(0.1, 1, -0.4), scene);
    hemi.intensity = 0.78;
    hemi.diffuse = new Color3(1, 0.93, 0.84);
    hemi.groundColor = new Color3(0.32, 0.24, 0.4);
    hemi.specular = new Color3(0.15, 0.15, 0.15);
    const key = new DirectionalLight('lobbyKey', new Vector3(0.5, -0.8, 0.6), scene);
    key.intensity = 0.55;
    key.diffuse = new Color3(1, 0.86, 0.68);

    this.camera = new FreeCamera('lobbyCam', new Vector3(0, LOBBY.cameraHeight, -LOBBY.cameraDistance), scene);
    this.camera.inputs.clear();
    this.camera.fov = 0.72;
    this.camera.minZ = 0.3;
    this.camera.maxZ = 80;
    this.camera.setTarget(new Vector3(0, LOBBY.targetHeight, 0));
    scene.activeCamera = this.camera;

    this.buildStage();
    this.buildBackdrop();
    this.holder = new TransformNode('lobbyHero', scene);
    this.holder.position.y = STAGE_TOP;

    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private buildStage(): void {
    const s = this.scene;
    const floorMat = new StandardMaterial('lobbyFloor', s);
    const ft = floorTiles(s, '#a8743f', '#7c5128', 11, 'banig');
    ft.uScale = ft.vScale = 6;
    floorMat.diffuseTexture = ft;
    floorMat.specularColor = new Color3(0.05, 0.05, 0.05);
    floorMat.emissiveColor = new Color3(0.08, 0.05, 0.03);
    const floor = CreateGround('lobbyFloorMesh', { width: 40, height: 30 }, s);
    floor.position.z = 6;
    floor.material = floorMat;
    floorMat.freeze();

    const step = CreateCylinder('stageStep', { diameter: 4.2, height: 0.18, tessellation: 48 }, s);
    step.position.y = 0.09;
    step.material = mat(s, '#1f2d6b', { glow: 0.2, spec: 0.2 });
    const plat = CreateCylinder('stage', { diameter: 3.2, height: 0.18, tessellation: 48 }, s);
    plat.position.y = 0.27;
    plat.material = mat(s, '#f2c14e', { glow: 0.25, spec: 0.4 });
    const top = CreateDisc('stageTop', { radius: 1.5, tessellation: 48 }, s);
    top.rotation.x = Math.PI / 2;
    top.position.y = STAGE_TOP + 0.002;
    const topMat = new StandardMaterial('stageTopMat', s);
    topMat.diffuseTexture = sunMedallion(s);
    topMat.diffuseTexture.hasAlpha = true;
    topMat.useAlphaFromDiffuseTexture = true;
    topMat.emissiveColor = new Color3(0.25, 0.22, 0.2);
    topMat.specularColor = new Color3(0.2, 0.2, 0.2);
    top.material = topMat;
    const trim = CreateTorus('stageTrim', { diameter: 3.22, thickness: 0.07, tessellation: 64 }, s);
    trim.position.y = STAGE_TOP;
    trim.material = mat(s, '#fff1c4', { glow: 0.7, spec: 0.5 });

    const sh = CreateGround('lobbyShadow', { width: 1.5, height: 1.5 }, s);
    sh.position.y = STAGE_TOP + 0.01;
    const shm = new StandardMaterial('lobbyShadowMat', s);
    shm.diffuseTexture = blobShadow(s);
    shm.useAlphaFromDiffuseTexture = true;
    shm.disableLighting = true;
    shm.emissiveColor = Color3.Black();
    sh.material = shm;

    // Soft spotlight cone pool (fake light, cheap on phones).
    const pool = CreateDisc('stagePool', { radius: 2.6, tessellation: 48 }, s);
    pool.rotation.x = Math.PI / 2;
    pool.position.y = 0.012;
    const pm = new StandardMaterial('stagePoolMat', s);
    const pt = new DynamicTexture('poolTex', { width: 128, height: 128 }, s, false);
    const ctx = pt.getContext() as unknown as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,220,150,0.55)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    pt.hasAlpha = true;
    pt.update();
    pm.diffuseTexture = pt;
    pm.useAlphaFromDiffuseTexture = true;
    pm.disableLighting = true;
    pm.emissiveColor = Color3.White();
    pool.material = pm;
  }

  private buildBackdrop(): void {
    const s = this.scene;
    const Z = 7.5;
    // Night sky with stars above the facade.
    const sky = CreatePlane('sky', { width: 60, height: 24 }, s);
    sky.position.set(0, 10, Z + 6);
    const st = new DynamicTexture('skyTex', { width: 512, height: 256 }, s, false);
    const c = st.getContext() as unknown as CanvasRenderingContext2D;
    const grad = c.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0b1030');
    grad.addColorStop(0.7, '#24357a');
    grad.addColorStop(1, '#6a4a8a');
    c.fillStyle = grad;
    c.fillRect(0, 0, 512, 256);
    let seed = 7;
    const r = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 140; i++) {
      c.fillStyle = `rgba(255,${230 + r() * 25},${190 + r() * 60},${0.4 + r() * 0.6})`;
      const sz = r() < 0.1 ? 2.2 : 1.1;
      c.fillRect(r() * 512, r() * 170, sz, sz);
    }
    st.update();
    const skm = new StandardMaterial('skyMat', s);
    skm.diffuseTexture = st;
    skm.emissiveTexture = st;
    skm.disableLighting = true;
    sky.material = skm;

    const facade = new TransformNode('facade', s);
    facade.position.z = Z;
    const add = (m: Mesh): Mesh => {
      m.parent = facade;
      m.isPickable = false;
      return m;
    };
    // Stone (adobe) ground storey with arches.
    const stone = add(CreateBox('stone', { width: 22, height: 2.6, depth: 0.6 }, s));
    stone.position.y = 1.3;
    stone.material = mat(s, '#c99f74', { glow: 0.12 });
    for (const x of [-6.5, -3.2, 3.2, 6.5]) {
      const arch = add(CreateBox('archHole', { width: 1.7, height: 1.6, depth: 0.1 }, s));
      arch.position.set(x, 0.8, -0.31);
      arch.material = mat(s, '#3b2418', { glow: 0.05 });
      // Full disc whose lower half hides behind the opening box: reads as a round arch top.
      const top = add(CreateCylinder('archTop', { diameter: 1.7, height: 0.1, tessellation: 28 }, s));
      top.rotation.x = Math.PI / 2;
      top.position.set(x, 1.6, -0.31);
      top.material = arch.material;
      const glowIn = add(CreateBox('archGlow', { width: 1.3, height: 1.1, depth: 0.05 }, s));
      glowIn.position.set(x, 0.65, -0.34);
      glowIn.material = mat(s, '#ffb45c', { glow: 0.9 });
    }
    // Wooden upper storey with capiz window grid.
    const wood = add(CreateBox('woodStorey', { width: 23, height: 3, depth: 0.5 }, s));
    wood.position.set(0, 4.1, -0.05);
    wood.material = mat(s, '#6b3d1f', { glow: 0.12 });
    const ledge = add(CreateBox('ledge', { width: 23.4, height: 0.25, depth: 0.9 }, s));
    ledge.position.set(0, 2.65, -0.2);
    ledge.material = mat(s, '#4a2a14', { glow: 0.1 });
    const capiz = new StandardMaterial('capizMat', s);
    capiz.diffuseTexture = capizTexture(s);
    capiz.emissiveColor = new Color3(0.55, 0.45, 0.32);
    capiz.specularColor = new Color3(0.1, 0.1, 0.1);
    capiz.freeze();
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const w = add(CreatePlane('capizWin', { width: 1.9, height: 1.9 }, s));
      w.position.set(i * 2.45, 4.15, -0.31);
      w.material = capiz;
    }
    // Centre sign board (blank gold medallion over the stage).
    const med = add(CreateCylinder('medallion', { diameter: 2.2, height: 0.12, tessellation: 40 }, s));
    med.rotation.x = Math.PI / 2;
    med.position.set(0, 4.15, -0.35);
    const mm = new StandardMaterial('medMat', s);
    mm.diffuseTexture = sunMedallion(s);
    mm.emissiveColor = new Color3(0.35, 0.3, 0.25);
    med.material = mm;
    // Tiled roof overhang.
    const roof = add(CreateBox('roof', { width: 24.5, height: 0.35, depth: 2.2 }, s));
    roof.position.set(0, 5.8, -0.6);
    roof.rotation.x = -0.32;
    roof.material = mat(s, '#8e2f22', { glow: 0.12 });

    // Capiz lanterns on posts either side of the stage.
    for (const x of [-4.2, 4.2]) {
      const post = CreateCylinder('post', { diameter: 0.16, height: 3.2, tessellation: 10 }, s);
      post.position.set(x, 1.6, 2.2);
      post.material = mat(s, '#3b2418', { glow: 0.08 });
      const lamp = CreateSphere('lantern', { diameter: 0.7, segments: 12 }, s);
      lamp.position.set(x, 3.35, 2.2);
      lamp.scaling.y = 1.15;
      lamp.material = mat(s, '#ffd27a', { glow: 1, dynamic: true });
      this.lanterns.push(lamp);
      const cap = CreateCylinder('lanternCap', { diameterTop: 0.1, diameterBottom: 0.5, height: 0.25, tessellation: 10 }, s);
      cap.position.set(x, 3.8, 2.2);
      cap.material = mat(s, '#8e2f22', { glow: 0.15 });
    }

    // Banderitas: two sagging strings of little flag triangles in flag colours.
    const colors = ['#c8202b', '#f2c14e', '#1f3c9e', '#fff6df'];
    for (const [row, y0, z] of [
      [0, 5.0, 3.5],
      [1, 5.5, 5.5],
    ] as const) {
      const n = 22;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const x = -9 + u * 18;
        const y = y0 - Math.sin(u * Math.PI) * 1.1;
        const node = new TransformNode('flagN', s);
        node.position.set(x, y, z);
        const tri = CreateDisc('flag', { radius: 0.24, tessellation: 3 }, s);
        tri.parent = node;
        tri.rotation.z = -Math.PI / 2;
        tri.position.y = -0.18;
        tri.material = mat(s, colors[(i + row) % colors.length]!, { glow: 0.35 });
        tri.material.backFaceCulling = false;
        this.flags.push(node);
      }
    }
  }

  setHero(id: HeroId, skin?: string): void {
    if (id === this.heroId && (!skin || skin === this.rig?.skin)) return;
    if (this.rig) disposeHero(this.rig);
    this.heroId = id;
    this.rig = buildHero(this.scene, id, skin);
    this.rig.root.parent = this.holder;
    this.rig.root.scaling.setAll(HERO_SCALE);
    this.rig.root.rotation.y = Math.PI;
    this.animator = new HeroAnimator(this.rig);
    // A quick hello every time you pick someone new.
    this.animator.setState('wave');
    this.emoteIn = LOBBY.emoteEvery[0];
  }

  update(dt: number): void {
    this.t += dt;
    const a = this.animator;
    if (a) {
      this.emoteIn -= dt;
      if (this.emoteIn <= 0 && !a.busy) {
        a.setState('wave');
        const [lo, hi] = LOBBY.emoteEvery;
        this.emoteIn = lo + Math.random() * (hi - lo);
      }
      if (!a.busy) a.setState('idle');
      a.update(dt, 0, PLAYER_CONFIG.maxSpeed);
    }
    // Drag-to-spin with inertia, then ease back to face the camera.
    if (this.dragging === null) {
      this.spin += this.spinVel * dt;
      this.spinVel *= Math.max(0, 1 - dt * 4);
      if (Math.abs(this.spinVel) < 0.3) this.spin += (0 - this.spin) * damp(LOBBY.settleSharpness, dt);
    }
    this.holder.rotation.y = this.spin;
    // Gentle camera drift so the stage feels alive.
    const aspect = this.scene.getEngine().getAspectRatio(this.camera);
    const portraitMix = Math.min(1, Math.max(0, (1.3 - aspect) / 0.75));
    this.camera.position.set(
      Math.sin(this.t * 0.25) * 0.35,
      LOBBY.cameraHeight,
      -(LOBBY.cameraDistance + (LOBBY.cameraDistancePortrait - LOBBY.cameraDistance) * portraitMix),
    );
    this.camera.setTarget(new Vector3(0, LOBBY.targetHeight, 0));
    for (const [i, l] of this.lanterns.entries()) l.visibility = 0.85 + Math.sin(this.t * 2.3 + i) * 0.15;
    for (const [i, f] of this.flags.entries()) f.rotation.x = Math.sin(this.t * 1.7 + i * 0.6) * 0.18;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.active) return;
    this.dragging = e.pointerId;
    this.lastX = e.clientX;
    this.spinVel = 0;
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.dragging) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.spin += dx * LOBBY.dragSpin;
    this.spinVel = (dx * LOBBY.dragSpin) / (1 / 60);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.dragging) this.dragging = null;
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    if (this.rig) disposeHero(this.rig);
    this.scene.dispose();
  }
}
