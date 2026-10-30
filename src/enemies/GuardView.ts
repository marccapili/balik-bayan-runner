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

/** Renders one GuardBrain: chibi rig + animator + "!" billboard. Built up-front and pooled. */
export class GuardView {
  private readonly rig: HeroRig;
  private readonly animator: HeroAnimator;
  private readonly sign: Mesh;
  private alertLeft = 0;
  private t = 0;

  constructor(scene: Scene, fx: Fx, private readonly shadow: Mesh) {
    this.rig = buildGuard(scene);
    this.rig.root.scaling.setAll(GUARD_SCALE);
    this.animator = new HeroAnimator(this.rig);
    this.sign = fx.makeAlertSign();
    this.hide();
  }

  hide(): void {
    this.rig.root.setEnabled(false);
    this.sign.setEnabled(false);
    this.shadow.setEnabled(false);
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

    this.alertLeft -= dt;
    const show = this.alertLeft > 0 || brain.state === 'alert';
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
  }
}
