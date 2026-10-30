import type { HeroRig } from '../characters/HeroModel';
import { clamp, damp, lerp } from '../utils/math';

export type AnimState = 'idle' | 'locomotion' | 'fall' | 'land' | 'hurt' | 'ability' | 'stunned' | 'defeated';

/**
 * Procedural animation controller shared by every hero rig.
 * Locomotion phase advances with distance travelled (not time), so feet don't slide
 * at different speeds. Blends between idle → walk → run using a smoothed speed ratio.
 */
export class HeroAnimator {
  private state: AnimState = 'idle';
  private stateTime = 0;
  private phase = 0;
  private moveBlend = 0;
  private time = Math.random() * 10;
  /** Distance per full stride cycle (two steps). */
  private readonly stride = 1.35;

  constructor(private readonly rig: HeroRig) {}

  get current(): AnimState {
    return this.state;
  }

  /** Enters a state only if it differs, so callers can call this every frame safely. */
  setState(s: AnimState): void {
    if (s === this.state) return;
    this.state = s;
    this.stateTime = 0;
  }

  /**
   * @param speed current ground speed
   * @param maxSpeed speed considered "full run"
   */
  update(dt: number, speed: number, maxSpeed: number): void {
    this.time += dt;
    this.stateTime += dt;
    const r = this.rig;
    const ratio = clamp(speed / Math.max(maxSpeed, 0.001), 0, 1.4);
    this.moveBlend += (ratio - this.moveBlend) * damp(12, dt);
    const m = clamp(this.moveBlend, 0, 1.4);
    this.phase += (speed * dt * Math.PI * 2) / this.stride;

    if (this.state === 'idle' || this.state === 'locomotion') {
      const s = Math.sin(this.phase);
      const runAmt = clamp((m - 0.45) / 0.55, 0, 1);
      const legAmp = lerp(0.55, 0.95, runAmt) * clamp(m * 3, 0, 1);
      const armAmp = lerp(0.45, 1.05, runAmt) * clamp(m * 3, 0, 1);

      r.legL.rotation.x = s * legAmp;
      r.legR.rotation.x = -s * legAmp;
      r.armL.rotation.x = -s * armAmp;
      r.armR.rotation.x = s * armAmp;
      // Elbows-out run pose for that chibi hustle.
      r.armL.rotation.z = -lerp(0.16, 0.35, runAmt);
      r.armR.rotation.z = lerp(0.16, 0.35, runAmt);

      const idle = 1 - clamp(m * 4, 0, 1);
      const breathe = Math.sin(this.time * 2.4) * 0.012 * idle;
      r.torso.scaling.y = 1 + breathe;
      r.body.position.y = Math.abs(Math.sin(this.phase)) * lerp(0.03, 0.08, runAmt) * clamp(m * 3, 0, 1);
      r.torso.rotation.x = lerp(0, 0.22, runAmt) * clamp(m, 0, 1);
      r.torso.rotation.y = s * 0.08 * clamp(m * 2, 0, 1);
      r.head.rotation.x = -r.torso.rotation.x * 0.6 + Math.sin(this.time * 1.3) * 0.02 * idle;
      r.head.rotation.y = Math.sin(this.time * 0.7) * 0.08 * idle;
      r.armL.rotation.x += Math.sin(this.time * 2.4) * 0.03 * idle;
      r.armR.rotation.x -= Math.sin(this.time * 2.4) * 0.03 * idle;

      // Trailing cloth: lifts back with speed + small flap.
      for (const f of r.flutter) {
        f.rotation.x = -clamp(m, 0, 1.2) * 0.55 + Math.sin(this.phase * 2 + 1) * 0.08 * m - Math.sin(this.time * 2) * 0.03 * idle;
      }
    } else if (this.state === 'fall') {
      // Arms up, legs tucked — used by the intro drop in M3.
      const wob = Math.sin(this.time * 10) * 0.1;
      r.armL.rotation.set(-2.6 + wob, 0, -0.4);
      r.armR.rotation.set(-2.6 - wob, 0, 0.4);
      r.legL.rotation.x = -0.4;
      r.legR.rotation.x = 0.2;
      for (const f of r.flutter) f.rotation.x = 0.7;
    } else if (this.state === 'land') {
      const t = clamp(this.stateTime / 0.35, 0, 1);
      const squash = Math.sin(t * Math.PI) * 0.18;
      r.body.scaling.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      r.armL.rotation.set(0, 0, -0.9 * (1 - t));
      r.armR.rotation.set(0, 0, 0.9 * (1 - t));
      if (t >= 1) {
        r.body.scaling.set(1, 1, 1);
        this.setState('idle');
      }
    }
  }
}
