import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { HeroAnimator } from '../animations/HeroAnimator';
import { PLAYER_CONFIG } from '../data/config';
import type { HeroId } from '../data/heroes';
import type { CollisionWorld } from '../physics/Collision';
import type { Vec2 } from '../utils/math';
import { blobShadow } from '../world/textures';
import { buildHero, disposeHero, type HeroRig } from './HeroModel';
import { PlayerMotor } from './PlayerMotor';

/** Visual scale so the chibi reads clearly from the elevated camera (collision radius is separate). */
const HERO_SCALE = 1.2;

/** The controllable hero: movement simulation + procedural model + animation + blob shadow. */
export class Player {
  readonly motor: PlayerMotor;
  private rig: HeroRig;
  private animator: HeroAnimator;
  private readonly shadow: Mesh;

  constructor(
    private readonly scene: Scene,
    world: CollisionWorld,
    start: Vec2,
    heroId: HeroId,
  ) {
    this.motor = new PlayerMotor(start, world);
    this.rig = buildHero(scene, heroId);
    this.animator = new HeroAnimator(this.rig);

    this.shadow = CreateGround('heroShadow', { width: 1.2, height: 1.2 }, scene);
    const sm = new StandardMaterial('heroShadowMat', scene);
    sm.diffuseTexture = blobShadow(scene);
    sm.useAlphaFromDiffuseTexture = true;
    sm.disableLighting = true;
    sm.emissiveColor = Color3.Black();
    this.shadow.material = sm;
    this.shadow.position.y = 0.02;
    this.shadow.isPickable = false;
    this.syncVisual();
  }

  get heroId(): HeroId {
    return this.rig.id;
  }

  get position(): Vec2 {
    return this.motor.state.pos;
  }

  get velocity(): Vec2 {
    return this.motor.state.vel;
  }

  /** Swap the visual model (motor state is kept). */
  setHero(id: HeroId): void {
    if (id === this.rig.id) return;
    disposeHero(this.rig);
    this.rig = buildHero(this.scene, id);
    this.animator = new HeroAnimator(this.rig);
    this.syncVisual();
  }

  update(input: Vec2, dt: number): void {
    this.motor.update(input, dt);
    const speed = this.motor.speed;
    this.animator.setState(speed > PLAYER_CONFIG.idleThreshold ? 'locomotion' : 'idle');
    this.animator.update(dt, speed, PLAYER_CONFIG.maxSpeed);
    this.syncVisual();
  }

  private syncVisual(): void {
    const s = this.motor.state;
    this.rig.root.scaling.setAll(HERO_SCALE);
    this.rig.root.position.set(s.pos.x, 0, s.pos.z);
    this.rig.root.rotation.y = s.yaw;
    this.shadow.position.x = s.pos.x;
    this.shadow.position.z = s.pos.z;
  }

  dispose(): void {
    disposeHero(this.rig);
    this.shadow.dispose(false, true);
  }
}
