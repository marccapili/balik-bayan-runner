import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { Scene } from '@babylonjs/core/scene';
import { NavGrid } from '../ai/NavGrid';
import { FollowCamera } from '../camera/FollowCamera';
import { Player } from '../characters/Player';
import type { InputManager } from '../controls/InputManager';
import { FEEDBACK, HEALTH, MAX_GUARDS, PICKUPS } from '../data/gameplay';
import type { HeroId } from '../data/heroes';
import { buildColliders, MUSEUM_BOUNDS, roomAt, SPAWN_POINT, type Room } from '../data/museumLayout';
import { GuardView, sightRingMaterial } from '../enemies/GuardView';
import { SurvivalRun, type RunEvent } from '../gameplay/SurvivalRun';
import { CollisionWorld } from '../physics/Collision';
import type { Vec2 } from '../utils/math';
import { Fx } from '../world/Fx';
import { buildMuseum, type MuseumBuild } from '../world/MuseumBuilder';
import { PickupViews } from '../world/PickupViews';
import { blobShadow } from '../world/textures';
import type { GameScene } from './GameScene';

/** The museum run: hero, guards, pickups and camera. Gameplay rules live in SurvivalRun. */
export class MuseumScene implements GameScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly world: CollisionWorld;
  readonly run: SurvivalRun;
  private readonly cam: FollowCamera;
  private readonly museum: MuseumBuild;
  private readonly fx: Fx;
  private readonly pickupViews: PickupViews;
  private readonly guardViews: GuardView[] = [];
  private room: Room | undefined;
  private blinkT = 0;
  onRoomChange: ((room: Room) => void) | null = null;
  /** Gameplay events after the scene has reacted (HUD + sound hook in here). */
  onEvent: ((e: RunEvent) => void) | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly input: InputManager,
    heroId: HeroId,
  ) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.06, 0.08, 0.18, 1);
    scene.ambientColor = new Color3(0.3, 0.28, 0.32);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.72;
    hemi.diffuse = new Color3(1, 0.95, 0.86);
    hemi.groundColor = new Color3(0.36, 0.3, 0.38);
    hemi.specular = new Color3(0.2, 0.2, 0.2);
    const sun = new DirectionalLight('key', new Vector3(-0.45, -1, 0.35), scene);
    sun.intensity = 0.42;
    sun.diffuse = new Color3(1, 0.9, 0.75);

    this.museum = buildMuseum(scene);
    const boxes = buildColliders();
    this.world = new CollisionWorld(boxes);
    this.player = new Player(scene, this.world, SPAWN_POINT, heroId);
    this.cam = new FollowCamera(scene, SPAWN_POINT);
    for (const o of this.museum.occluders) this.cam.addOccluder(o);
    scene.activeCamera = this.cam.camera;

    const nav = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.45);
    const sight = new NavGrid(MUSEUM_BOUNDS, boxes, 0.5, 0.05);
    const spots = new NavGrid(MUSEUM_BOUNDS, boxes, 1, PICKUPS.wallClearance).walkableCells();
    this.run = new SurvivalRun(nav, sight, this.world, spots);

    this.fx = new Fx(scene);
    this.pickupViews = new PickupViews(scene);
    const shadowMat = new StandardMaterial('guardShadowMat', scene);
    shadowMat.diffuseTexture = blobShadow(scene);
    shadowMat.useAlphaFromDiffuseTexture = true;
    shadowMat.disableLighting = true;
    shadowMat.emissiveColor = Color3.Black();
    const ringMat = sightRingMaterial(scene);
    for (let i = 0; i < MAX_GUARDS; i++) {
      const sh = CreateGround(`guardShadow${i}`, { width: 1.2, height: 1.2 }, scene);
      sh.material = shadowMat;
      sh.isPickable = false;
      this.guardViews.push(new GuardView(scene, this.fx, sh, ringMat));
    }
    this.resetRun();
  }

  /** Fresh run: hero at spawn, new board, no guards. */
  resetRun(): void {
    this.player.respawn(SPAWN_POINT);
    this.run.reset(SPAWN_POINT);
    this.cam.snapTo(SPAWN_POINT);
    for (const v of this.guardViews) v.hide();
    this.pickupViews.sync(this.run.pickups.items, 0);
  }

  update(dt: number): void {
    this.player.update(this.input.move, dt);
    for (const e of this.run.update(dt, this.player.position)) this.react(e);

    // Blink while invulnerable (but not during the opening grace — that would read as damage).
    const h = this.run.health;
    if (h.invulnerable && h.hearts < HEALTH.maxHearts && !this.run.over) {
      this.blinkT += dt;
      this.player.setVisible(Math.floor(this.blinkT * FEEDBACK.blinkHz * 2) % 2 === 0);
    } else {
      this.blinkT = 0;
      this.player.setVisible(true);
    }
    this.syncWorld(dt);

    const r = roomAt(this.player.position.x, this.player.position.z);
    if (r && r !== this.room) {
      this.room = r;
      this.onRoomChange?.(r);
    }
  }

  /** Slowed-down knockout beat after the last heart (no input, guards idle). */
  updateDefeated(dt: number): void {
    this.player.updateDefeated(dt);
    this.syncWorld(dt);
  }

  private syncWorld(dt: number): void {
    this.run.guards.forEach((g, i) => this.guardViews[i]?.sync(g, dt));
    this.pickupViews.sync(this.run.pickups.items, dt);
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.cam.update(this.player.position, this.player.velocity, dt, aspect);
    for (const s of this.museum.spinners) s.rotation.z += dt * 0.6;
  }

  private react(e: RunEvent): void {
    switch (e.type) {
      case 'pickup':
        this.fx.burst(e.kind === 'heart' ? 'heart' : e.kind === 'rareCoin' ? 'rare' : 'coin', e.pos, 0.7, e.kind === 'coin' ? 12 : 24);
        break;
      case 'hit':
        this.player.hurt(e.dir, HEALTH.knockback);
        this.fx.burst('hit', e.pos, 1.1, 26);
        this.cam.shake(FEEDBACK.hitShake, FEEDBACK.hitShakeSeconds);
        break;
      case 'alert':
      case 'guardJoined':
        this.guardViews[e.guard]?.flashAlert();
        break;
      default:
        break;
    }
    this.onEvent?.(e);
  }

  /** Projects a world point to CSS pixels on the canvas (for floating score text). */
  toScreen(p: Vec2, y: number): { x: number; y: number } {
    const canvas = this.engine.getRenderingCanvas()!;
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    const v = Vector3.Project(new Vector3(p.x, y, p.z), Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), this.cam.camera.viewport.toGlobal(w, hgt));
    return { x: v.x, y: v.y };
  }

  dispose(): void {
    this.player.dispose();
    for (const v of this.guardViews) v.dispose();
    this.fx.dispose();
    this.museum.dispose();
    this.scene.dispose();
  }
}
