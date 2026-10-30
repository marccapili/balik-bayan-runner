import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { HeroAnimator, type AnimState } from '../animations/HeroAnimator';
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
  /** Height above the floor (only non-zero during the intro hover/fall). */
  private airY = 0;

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
    return this.rig.id as HeroId;
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
    if (!this.animator.busy) this.animator.setState(speed > PLAYER_CONFIG.idleThreshold ? 'locomotion' : 'idle');
    this.animator.update(dt, speed, PLAYER_CONFIG.maxSpeed);
    this.syncVisual();
  }

  /** Plays the recoil clip and shoves the hero away from the hit. */
  hurt(dir: Vec2, impulse: number): void {
    this.animator.setState('hurt');
    this.motor.state.vel = { x: dir.x * impulse, z: dir.z * impulse };
  }

  /** Game-over beat: topple over while the world slows down (no input). */
  updateDefeated(dt: number): void {
    this.animator.setState('defeated');
    this.motor.update({ x: 0, z: 0 }, dt);
    this.animator.update(dt, 0, PLAYER_CONFIG.maxSpeed);
    this.setVisible(true);
    this.syncVisual();
  }

  /** Intro posing: hover/fall/land at height `y` with no input. `spin` turns the hero slowly while floating. */
  updateIntro(dt: number, y: number, anim: AnimState, spin = 0): void {
    if (!this.animator.busy) this.animator.setState(anim);
    this.airY = y;
    this.motor.state.yaw += spin * dt;
    this.animator.update(dt, 0, PLAYER_CONFIG.maxSpeed);
    this.syncVisual();
  }

  /** Back to a clean standing pose at `start` (replay). */
  respawn(start: Vec2): void {
    this.airY = 0;
    this.motor.reset(start);
    this.animator.setState('idle');
    this.setVisible(true);
    this.syncVisual();
  }

  /** Used for the invulnerability blink. */
  setVisible(v: boolean): void {
    if (this.rig.root.isEnabled() !== v) this.rig.root.setEnabled(v);
  }

  private syncVisual(): void {
    const s = this.motor.state;
    this.rig.root.scaling.setAll(HERO_SCALE);
    this.rig.root.position.set(s.pos.x, this.airY, s.pos.z);
    // Shadow shrinks while airborne so the drop reads clearly.
    this.shadow.scaling.setAll(Math.max(0.45, 1 - this.airY * 0.16));
    this.rig.root.rotation.y = s.yaw;
    this.shadow.position.x = s.pos.x;
    this.shadow.position.z = s.pos.z;
  }

  dispose(): void {
    disposeHero(this.rig);
    this.shadow.dispose(false, true);
  }
}
