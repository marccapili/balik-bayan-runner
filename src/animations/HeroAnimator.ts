import type { HeroRig } from '../characters/HeroModel';
import { clamp, damp, lerp } from '../utils/math';

export type AnimState = 'idle' | 'locomotion' | 'fall' | 'land' | 'hurt' | 'ability' | 'stunned' | 'defeated';

/**
 * Procedural animation controller shared by every hero rig.
 * Locomotion phase advances with distance travelled (not time), so feet don't slide
 * at different speeds. Blends between idle → walk → run using a smoothed speed ratio.
 */
const HURT_SECONDS = 0.35;

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

  /** True while a one-shot clip (land/hurt/defeated) should not be overridden by locomotion. */
  get busy(): boolean {
    return this.state === 'land' || this.state === 'defeated' || (this.state === 'hurt' && this.stateTime < HURT_SECONDS);
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

    if (this.state !== 'defeated' && r.body.rotation.x !== 0) {
      r.body.rotation.x = 0;
    }
    if (this.state === 'hurt' && this.stateTime >= HURT_SECONDS) this.state = 'locomotion';

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
        f.rotation.x = clamp(m, 0, 1.2) * 0.5 + Math.sin(this.phase * 2 + 1) * 0.08 * m + Math.sin(this.time * 2) * 0.03 * idle;
      }
    } else if (this.state === 'fall') {
      // Arms up, legs tucked — used by the intro drop in M3.
      const wob = Math.sin(this.time * 10) * 0.1;
      r.armL.rotation.set(-2.6 + wob, 0, -0.4);
      r.armR.rotation.set(-2.6 - wob, 0, 0.4);
      r.legL.rotation.x = -0.4;
      r.legR.rotation.x = 0.2;
      for (const f of r.flutter) f.rotation.x = -0.6;
    } else if (this.state === 'hurt') {
      // Quick recoil: snap back, arms fling out, then ease into locomotion.
      const k = Math.sin(clamp(this.stateTime / HURT_SECONDS, 0, 1) * Math.PI);
      r.torso.rotation.x = -0.45 * k;
      r.head.rotation.x = -0.3 * k;
      r.armL.rotation.set(-0.8 * k, 0, -0.16 - 0.9 * k);
      r.armR.rotation.set(-0.8 * k, 0, 0.16 + 0.9 * k);
      r.body.position.y = 0.06 * k;
    } else if (this.state === 'stunned') {
      // Dizzy wobble (guards recovering after landing a hit).
      const w = Math.sin(this.time * 7);
      r.head.rotation.set(0.12, 0, w * 0.22);
      r.torso.rotation.set(0.1, 0, w * 0.06);
      r.armL.rotation.set(0.1, 0, -0.35);
      r.armR.rotation.set(0.1, 0, 0.35);
      r.legL.rotation.x = 0;
      r.legR.rotation.x = 0;
      r.body.position.y = 0;
    } else if (this.state === 'defeated') {
      // Topple backwards and stay down (drives the game-over beat).
      const t = clamp(this.stateTime / 0.55, 0, 1);
      const e = 1 - (1 - t) * (1 - t);
      const bounce = t >= 1 ? 0 : Math.sin(t * Math.PI) * 0.15;
      r.body.rotation.x = -1.42 * e;
      r.body.position.y = 0.22 * e + bounce;
      r.torso.rotation.set(0, 0, 0);
      r.head.rotation.set(-0.2 * e, 0.3 * e, 0);
      r.armL.rotation.set(-2.2 * e, 0, -0.5 * e);
      r.armR.rotation.set(-2.2 * e, 0, 0.5 * e);
      r.legL.rotation.x = 0.35 * e;
      r.legR.rotation.x = -0.1 * e;
      for (const f of r.flutter) f.rotation.x = -0.3 * e;
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
