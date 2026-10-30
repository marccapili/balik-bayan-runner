import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { HeroAnimator } from '../animations/HeroAnimator';
import { disposeHero, type HeroRig } from '../characters/HeroModel';
import { GUARD } from '../data/gameplay';
import type { Fx } from '../world/Fx';
import type { GuardBrain } from './GuardBrain';
import { buildGuard } from './GuardModel';

const GUARD_SCALE = 1.2;
const ALERT_SHOW_SECONDS = 1.1;

/** Shared translucent material for the sight-range floor rings. */
export function sightRingMaterial(scene: Scene): StandardMaterial {
  const m = new StandardMaterial('guardSightMat', scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.FromHexString('#ffd23f');
  m.disableLighting = true;
  m.alpha = 0.55;
  return m;
}

/** Renders one GuardBrain: chibi rig + animator + "!" billboard. Built up-front and pooled. */
export class GuardView {
  private readonly rig: HeroRig;
  private readonly animator: HeroAnimator;
  private readonly sign: Mesh;
  private readonly ring: Mesh;
  private ringVis = 0;
  private alertLeft = 0;
  private t = 0;

  constructor(scene: Scene, private readonly fx: Fx, private readonly shadow: Mesh, ringMat: StandardMaterial) {
    this.rig = buildGuard(scene);
    this.rig.root.scaling.setAll(GUARD_SCALE);
    this.animator = new HeroAnimator(this.rig);
    this.sign = fx.makeAlertSign();
    // Floor ring = sight range, shown while the guard is NOT chasing so players can sneak past.
    this.ring = CreateTorus('guardSight', { diameter: GUARD.sightRange * 2, thickness: 0.09, tessellation: 72 }, scene);
    this.ring.scaling.y = 0.15;
    this.ring.material = ringMat;
    this.ring.isPickable = false;
    this.hide();
  }

  hide(): void {
    this.rig.root.setEnabled(false);
    this.sign.setEnabled(false);
    this.shadow.setEnabled(false);
    this.ring.setEnabled(false);
    this.ringVis = 0;
    this.alertLeft = 0;
  }

  flashAlert(): void {
    this.alertLeft = ALERT_SHOW_SECONDS;
  }

  sync(brain: GuardBrain, dt: number): void {
    this.t += dt;
    if (!this.rig.root.isEnabled()) {
      this.rig.root.setEnabled(true);
      this.shadow.setEnabled(true);
    }
    this.animator.setState(brain.state === 'stunned' ? 'stunned' : brain.speed > 0.3 ? 'locomotion' : 'idle');
    this.animator.update(dt, brain.speed, GUARD.chaseSpeedMax);
    this.rig.root.position.set(brain.pos.x, 0, brain.pos.z);
    this.rig.root.rotation.y = brain.yaw;
    this.shadow.position.set(brain.pos.x, 0.021, brain.pos.z);

    const calm = brain.state === 'patrol' || brain.state === 'search';
    this.ringVis += ((calm ? 1 : 0) - this.ringVis) * Math.min(1, dt * 5);
    this.ring.setEnabled(this.ringVis > 0.02);
    this.ring.position.set(brain.pos.x, 0.04, brain.pos.z);
    this.ring.visibility = this.ringVis;

    this.alertLeft -= dt;
    const lost = brain.state === 'search';
    const show = this.alertLeft > 0 || brain.state === 'alert' || lost;
    this.sign.material = lost && this.alertLeft <= 0 ? this.fx.lostMat : this.fx.alertMat;
    this.sign.setEnabled(show);
    if (show) {
      const pop = Math.min(1, (ALERT_SHOW_SECONDS - this.alertLeft) * 8);
      this.sign.position.set(brain.pos.x, 2.55 + Math.sin(this.t * 10) * 0.05, brain.pos.z);
      this.sign.scaling.setAll(Math.max(0.2, pop));
    }
  }

  dispose(): void {
    disposeHero(this.rig);
    this.sign.dispose();
    this.shadow.dispose();
    this.ring.dispose();
  }
}
