import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { HeroAnimator } from '../animations/HeroAnimator';
import type { HeroRig } from '../characters/HeroModel';
import { MULTO, TIKBALANG, type EnemyKind } from '../data/enemies';
import { GUARD } from '../data/gameplay';
import type { Decoy } from '../gameplay/SurvivalRun';
import { clamp } from '../utils/math';
import type { Fx } from '../world/Fx';
import { blobShadow } from '../world/textures';
import { buildDog, buildMulto, buildTikbalang, type DogRig, type MultoRig } from './EnemyModels';
import type { GuardBrain } from './GuardBrain';
import { buildGuard } from './GuardModel';
import { LungerBrain } from './LungerBrain';
import { MultoBrain } from './MultoBrain';

const ALERT_SHOW_SECONDS = 1.1;

const flatMat = (scene: Scene, name: string, hex: string, alpha: number): StandardMaterial => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.FromHexString(hex);
  m.disableLighting = true;
  m.alpha = alpha;
  m.backFaceCulling = false;
  return m;
};

/** Materials every enemy view shares (one set per scene). */
export class EnemyMaterials {
  readonly shadow: StandardMaterial;
  readonly ring: StandardMaterial;
  /** Red danger lane for dog / tikbalang telegraphs. Alpha per lane comes from mesh.visibility. */
  readonly lane: StandardMaterial;
  /** See-through purple for tikbalang illusions. */
  readonly decoy: StandardMaterial;

  constructor(scene: Scene) {
    const s = (this.shadow = new StandardMaterial('enemyShadowMat', scene));
    s.diffuseTexture = blobShadow(scene);
    s.useAlphaFromDiffuseTexture = true;
    s.disableLighting = true;
    s.emissiveColor = Color3.Black();
    this.ring = flatMat(scene, 'guardSightMat', '#ffd23f', 0.55);
    this.lane = flatMat(scene, 'dangerLaneMat', '#ff2a3a', 0.5);
    this.decoy = flatMat(scene, 'illusionMat', '#b78bff', 0.4);
    this.decoy.disableLighting = false;
    this.decoy.diffuseColor = Color3.FromHexString('#6a3cc0');
    this.decoy.emissiveColor = Color3.FromHexString('#7b4cd8');
  }
}

/**
 * Shared enemy view: blob shadow, "!"/"?" sign, sight ring (while calm) and the red lunge lane.
 * Subclasses own the model and pose it. Views are pooled per kind and bound to a brain while it lives.
 */
export abstract class EnemyView {
  protected abstract readonly root: TransformNode;
  private readonly sign: Mesh;
  private readonly shadow: Mesh;
  private readonly ring: Mesh | null;
  private readonly lane: Mesh;
  private readonly laneNode: TransformNode;
  private ringVis = 0;
  private alertLeft = 0;
  protected t = 0;
  /** Accessibility: steadier visuals (no flicker). */
  reduced = false;

  constructor(
    scene: Scene,
    protected readonly fx: Fx,
    mats: EnemyMaterials,
    readonly kind: EnemyKind,
    /** Height of the "!" sign above the floor. */
    private readonly signY: number,
    shadowSize: number,
    /** Floor ring radius shown while calm (null = this enemy has no sight cone to sneak past). */
    sightRange: number | null,
  ) {
    this.sign = fx.makeAlertSign();
    this.shadow = CreateGround(`${kind}Shadow`, { width: shadowSize, height: shadowSize }, scene);
    this.shadow.material = mats.shadow;
    this.shadow.isPickable = false;
    this.ring = null;
    if (sightRange) {
      const r = (this.ring = CreateTorus(`${kind}Sight`, { diameter: sightRange * 2, thickness: 0.09, tessellation: 72 }, scene));
      r.scaling.y = 0.15;
      r.material = mats.ring;
      r.isPickable = false;
    }
    this.laneNode = new TransformNode(`${kind}LaneNode`, scene);
    this.lane = CreateGround(`${kind}Lane`, { width: 1, height: 1 }, scene);
    this.lane.parent = this.laneNode;
    this.lane.position.z = 0.5;
    this.lane.material = mats.lane;
    this.lane.isPickable = false;
  }

  hide(): void {
    this.root.setEnabled(false);
    this.sign.setEnabled(false);
    this.shadow.setEnabled(false);
    this.ring?.setEnabled(false);
    this.laneNode.setEnabled(false);
    this.ringVis = 0;
    this.alertLeft = 0;
  }

  flashAlert(): void {
    this.alertLeft = ALERT_SHOW_SECONDS;
  }

  /** Model pose for this frame (root is already placed and turned). */
  protected abstract pose(brain: GuardBrain, dt: number): void;

  sync(brain: GuardBrain, dt: number): void {
    this.t += dt;
    if (!this.root.isEnabled()) {
      this.root.setEnabled(true);
      this.shadow.setEnabled(true);
    }
    this.root.position.set(brain.pos.x, 0, brain.pos.z);
    this.root.rotation.y = brain.yaw;
    this.pose(brain, dt);
    this.shadow.position.set(brain.pos.x, 0.021, brain.pos.z);

    if (this.ring) {
      const calm = brain.state === 'patrol' || brain.state === 'search';
      this.ringVis += ((calm ? 1 : 0) - this.ringVis) * Math.min(1, dt * 5);
      this.ring.setEnabled(this.ringVis > 0.02);
      this.ring.position.set(brain.pos.x, 0.04, brain.pos.z);
      this.ring.visibility = this.ringVis;
    }

    // Telegraph: the lane grows out along the locked aim during the windup, so the dodge is readable.
    const lunging = brain instanceof LungerBrain && brain.state === 'windup';
    this.laneNode.setEnabled(lunging);
    if (lunging) {
      const k = brain.windupFrac;
      this.laneNode.position.set(brain.pos.x, 0.035, brain.pos.z);
      this.laneNode.rotation.y = Math.atan2(brain.aim.x, brain.aim.z);
      this.laneNode.scaling.set(brain.radius * 2.2, 1, brain.lungeDistance * Math.min(1, 0.25 + k * 1.5));
      this.lane.visibility = this.reduced ? 0.75 : 0.45 + 0.4 * Math.abs(Math.sin(this.t * 14));
    }

    this.alertLeft -= dt;
    const lost = brain.state === 'search';
    const show = this.alertLeft > 0 || brain.state === 'alert' || lost;
    this.sign.material = lost && this.alertLeft <= 0 ? this.fx.lostMat : this.fx.alertMat;
    this.sign.setEnabled(show);
    if (show) {
      const pop = Math.min(1, (ALERT_SHOW_SECONDS - this.alertLeft) * 8);
      this.sign.position.set(brain.pos.x, this.signY + Math.sin(this.t * 10) * 0.05, brain.pos.z);
      this.sign.scaling.setAll(Math.max(0.2, pop));
    }
  }

  dispose(): void {
    this.root.dispose(false, false);
    this.sign.dispose();
    this.shadow.dispose();
    this.ring?.dispose();
    this.laneNode.dispose();
  }
}

/** Humanoid enemies (guard, tikbalang): hero-style rig driven by HeroAnimator. */
class RigView extends EnemyView {
  protected readonly root: TransformNode;
  protected readonly animator: HeroAnimator;

  constructor(scene: Scene, fx: Fx, mats: EnemyMaterials, kind: EnemyKind, protected readonly rig: HeroRig, scale: number, signY: number, sightRange: number) {
    super(scene, fx, mats, kind, signY, 1.2 * scale, sightRange);
    this.root = rig.root;
    rig.root.scaling.setAll(scale);
    this.animator = new HeroAnimator(rig);
    this.hide();
  }

  protected pose(brain: GuardBrain, dt: number): void {
    const moving = brain.speed > 0.3 && brain.state !== 'windup';
    this.animator.setState(brain.state === 'stunned' ? 'stunned' : moving ? 'locomotion' : 'idle');
    this.animator.update(dt, brain.state === 'dash' ? 0 : brain.speed, GUARD.chaseSpeedMax);
  }
}

export class GuardView extends RigView {
  constructor(scene: Scene, fx: Fx, mats: EnemyMaterials) {
    super(scene, fx, mats, 'guard', buildGuard(scene), 1.2, 2.55, GUARD.sightRange);
  }
}

/** Tikbalang: walks like a person, rears up (arms high) to telegraph, then leans into the charge. */
export class TikbalangView extends RigView {
  constructor(scene: Scene, fx: Fx, mats: EnemyMaterials) {
    super(scene, fx, mats, 'tikbalang', buildTikbalang(scene), 1.5, 3.9, TIKBALANG.stats.sightRange);
  }

  protected override pose(brain: GuardBrain, dt: number): void {
    super.pose(brain, dt);
    const r = this.rig;
    if (!(brain instanceof LungerBrain)) return;
    if (brain.state === 'windup') {
      const k = Math.min(1, brain.windupFrac * 2.5);
      r.body.rotation.x = -0.35 * k;
      r.armL.rotation.set(-2.7 * k, 0, -0.5 * k);
      r.armR.rotation.set(-2.7 * k, 0, 0.5 * k);
      r.head.rotation.x = -0.3 * k + Math.sin(this.t * 30) * 0.06 * k;
      r.legL.rotation.x = 0.3 * k;
      r.legR.rotation.x = -0.15 * k;
    } else if (brain.state === 'dash') {
      const s = Math.sin(this.t * 26);
      r.body.rotation.x = 0.45;
      r.torso.rotation.x = 0.2;
      r.head.rotation.x = 0.25;
      r.legL.rotation.x = s * 1.1;
      r.legR.rotation.x = -s * 1.1;
      r.armL.rotation.set(1.2, 0, -0.5);
      r.armR.rotation.set(1.2, 0, 0.5);
      r.body.position.y = Math.abs(s) * 0.12;
    }
  }
}

/** Guard dog: trot/gallop cycle, crouch + growl during the telegraph, stretched lunge, panting after. */
export class DogView extends EnemyView {
  protected readonly root: TransformNode;
  private readonly dog: DogRig;
  private phase = 0;

  constructor(scene: Scene, fx: Fx, mats: EnemyMaterials) {
    super(scene, fx, mats, 'dog', 1.6, 1.1, null);
    this.dog = buildDog(scene);
    this.root = this.dog.root;
    this.root.scaling.setAll(1.1);
    this.hide();
  }

  protected pose(brain: GuardBrain, dt: number): void {
    const d = this.dog;
    const sp = brain.state === 'dash' ? 14 : brain.speed;
    this.phase += sp * dt * 3.2;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const amp = clamp(sp / 4, 0, 1);
    let bodyY = 0.42 + Math.abs(s) * 0.05 * amp;
    let pitch = 0;
    let headPitch = Math.sin(this.t * 2) * 0.04;
    let legAmp = 0.7 * amp;
    let tailWag = Math.sin(this.t * (amp > 0.2 ? 18 : 8)) * 0.5;
    d.tongue.setEnabled(false);
    switch (brain.state) {
      case 'windup': {
        // Crouch low, head down, shaking with a growl.
        const k = brain instanceof LungerBrain ? Math.min(1, brain.windupFrac * 3) : 1;
        bodyY = 0.42 - 0.13 * k;
        pitch = 0.12 * k;
        headPitch = 0.25 * k + Math.sin(this.t * 40) * 0.03;
        legAmp = 0;
        tailWag = 0;
        d.legs.forEach((l, i) => (l.rotation.x = (i < 2 ? -0.5 : 0.6) * k));
        break;
      }
      case 'dash':
        // Full stretch, legs splayed front/back.
        bodyY = 0.5;
        pitch = -0.08;
        headPitch = -0.15;
        legAmp = 0;
        d.legs.forEach((l, i) => (l.rotation.x = i < 2 ? -1.1 : 1.0));
        break;
      case 'recover':
        d.tongue.setEnabled(true);
        bodyY += Math.sin(this.t * 16) * 0.015;
        break;
      case 'stunned':
        legAmp = 0;
        tailWag = 0;
        headPitch = 0.2;
        bodyY = 0.36;
        d.legs.forEach((l) => (l.rotation.x = 0));
        d.body.rotation.z = Math.sin(this.t * 7) * 0.12;
        break;
      default:
        break;
    }
    if (brain.state !== 'stunned') d.body.rotation.z = 0;
    if (legAmp > 0 || brain.state === 'chase' || brain.state === 'patrol' || brain.state === 'search' || brain.state === 'alert' || brain.state === 'recover') {
      // Gallop: front pair and back pair offset by a quarter cycle.
      d.legs[0]!.rotation.x = s * legAmp;
      d.legs[1]!.rotation.x = s * legAmp * 0.8;
      d.legs[2]!.rotation.x = c * legAmp;
      d.legs[3]!.rotation.x = c * legAmp * 0.8;
    }
    d.body.position.y = bodyY;
    d.body.rotation.x = pitch;
    d.head.rotation.x = headPitch;
    d.tail.rotation.z = tailWag;
  }
}

/** Multo: bobbing sheet ghost; fades with the brain's visibility (harmless while faded). */
export class MultoView extends EnemyView {
  protected readonly root: TransformNode;
  private readonly ghost: MultoRig;
  private lastVis = -1;

  constructor(scene: Scene, fx: Fx, mats: EnemyMaterials) {
    super(scene, fx, mats, 'multo', 2.65, 1.2, null);
    this.ghost = buildMulto(scene);
    this.root = this.ghost.root;
    this.hide();
  }

  protected pose(brain: GuardBrain, dt: number): void {
    const g = this.ghost;
    void dt;
    const vis = brain instanceof MultoBrain ? brain.visibility : 1;
    g.body.position.y = MULTO.floatHeight + Math.sin(this.t * 2.2) * 0.1;
    g.body.rotation.x = clamp(brain.speed / 6, 0, 0.25);
    g.body.rotation.z = Math.sin(this.t * 1.6) * 0.06;
    g.hem.rotation.y = this.t * 0.8;
    const reach = brain.state === 'chase' ? -1.1 : -0.3;
    g.armL.rotation.set(reach + Math.sin(this.t * 3) * 0.15, 0, -0.5);
    g.armR.rotation.set(reach - Math.sin(this.t * 3) * 0.15, 0, 0.5);
    if (brain.state === 'stunned') g.body.rotation.z = Math.sin(this.t * 9) * 0.25;
    // Never fully invisible: a faint shimmer keeps it fair to track.
    const shown = vis >= 1 ? 1 : 0.12 + 0.83 * vis;
    if (Math.abs(shown - this.lastVis) > 0.005) {
      this.lastVis = shown;
      for (const m of g.meshes) m.visibility = shown;
    }
  }
}

/** Purple see-through tikbalang copy for the illusion trick. */
export class DecoyView {
  private readonly rig: HeroRig;
  private readonly animator: HeroAnimator;
  private t = Math.random() * 5;
  reduced = false;

  constructor(scene: Scene, mats: EnemyMaterials) {
    this.rig = buildTikbalang(scene, mats.decoy);
    this.rig.root.scaling.setAll(1.5);
    this.animator = new HeroAnimator(this.rig);
    this.animator.setState('locomotion');
    this.hide();
  }

  hide(): void {
    this.rig.root.setEnabled(false);
  }

  sync(d: Decoy, dt: number): void {
    this.t += dt;
    const r = this.rig.root;
    r.setEnabled(true);
    r.position.set(d.pos.x, 0, d.pos.z);
    r.rotation.y = d.yaw;
    this.animator.update(dt, TIKBALANG.illusionSpeed, GUARD.chaseSpeedMax);
    // Flicker gives the illusion away to sharp eyes; reduced effects keep it steady.
    const fadeIn = Math.min(1, (TIKBALANG.illusionSeconds - d.ttl) * 3) * Math.min(1, d.ttl * 3);
    const flick = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(this.t * 23);
    const v = fadeIn * flick;
    for (const m of this.rig.meshes) m.visibility = v;
  }

  dispose(): void {
    this.rig.root.dispose(false, false);
  }
}

/** Builds a pooled view for `kind`. */
export function makeEnemyView(kind: EnemyKind, scene: Scene, fx: Fx, mats: EnemyMaterials): EnemyView {
  switch (kind) {
    case 'dog':
      return new DogView(scene, fx, mats);
    case 'multo':
      return new MultoView(scene, fx, mats);
    case 'tikbalang':
      return new TikbalangView(scene, fx, mats);
    default:
      return new GuardView(scene, fx, mats);
  }
}
