import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { FollowCamera } from '../camera/FollowCamera';
import { Player } from '../characters/Player';
import type { InputManager } from '../controls/InputManager';
import type { HeroId } from '../data/heroes';
import { buildColliders, roomAt, SPAWN_POINT, type Room } from '../data/museumLayout';
import { CollisionWorld } from '../physics/Collision';
import { buildMuseum, type MuseumBuild } from '../world/MuseumBuilder';
import type { GameScene } from './GameScene';

/** Free-roam museum (Milestone 1). Enemies, coins and the intro attach here in later milestones. */
export class MuseumScene implements GameScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly world: CollisionWorld;
  private readonly cam: FollowCamera;
  private readonly museum: MuseumBuild;
  private room: Room | undefined;
  onRoomChange: ((room: Room) => void) | null = null;

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
    this.world = new CollisionWorld(buildColliders());
    this.player = new Player(scene, this.world, SPAWN_POINT, heroId);
    this.cam = new FollowCamera(scene, SPAWN_POINT);
    for (const o of this.museum.occluders) this.cam.addOccluder(o);
    scene.activeCamera = this.cam.camera;
  }

  update(dt: number): void {
    this.player.update(this.input.move, dt);
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.cam.update(this.player.position, this.player.velocity, dt, aspect);
    for (const s of this.museum.spinners) s.rotation.z += dt * 0.6;

    const r = roomAt(this.player.position.x, this.player.position.z);
    if (r && r !== this.room) {
      this.room = r;
      this.onRoomChange?.(r);
    }
  }

  dispose(): void {
    this.player.dispose();
    this.museum.dispose();
    this.scene.dispose();
  }
}
