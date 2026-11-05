import type { HeroRig } from '../characters/HeroModel';
import { clamp, damp, lerp } from '../utils/math';

export type AnimState =
  | 'idle'
  | 'locomotion'
  | 'float'
  | 'fall'
  | 'land'
  | 'hurt'
  | 'ability'
  | 'stunned'
  | 'defeated'
  | 'wave'
  // Lore cutscene clips (named poses + easing, see data/lore.ts):
  | 'write'
  | 'startle'
  | 'brace'
  | 'reach'
  | 'cling'
  | 'tumble'
  | 'ride'
  | 'sitWrite'
  | 'point'
  | 'sitUp';

/** Ease a clip in over its first `sec` seconds (slow in, per the cutscene animation rules). */
const easeIn = (t: number, sec: number): number => {
  const x = clamp(t / sec, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/**
 * Procedural animation controller shared by every hero rig.
 * Locomotion phase advances with distance travelled (not time), so feet don't slide
 * at different speeds. Blends between idle → walk → run using a smoothed speed ratio.
 */
const HURT_SECONDS = 0.35;
const WAVE_SECONDS = 1.6;

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
    return (
      this.state === 'land' ||
      this.state === 'defeated' ||
      (this.state === 'hurt' && this.stateTime < HURT_SECONDS) ||
      (this.state === 'wave' && this.stateTime < WAVE_SECONDS)
    );
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
    if (this.state !== 'startle' && this.state !== 'land' && r.body.scaling.y !== 1) r.body.scaling.set(1, 1, 1);
    if (this.state === 'hurt' && this.stateTime >= HURT_SECONDS) this.state = 'locomotion';
    if (this.state === 'wave' && this.stateTime >= WAVE_SECONDS) this.state = 'idle';

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
    } else if (this.state === 'float') {
      // Time-portal hover: arms drift open, legs dangle and paddle softly.
      const a = Math.sin(this.time * 1.8);
      r.armL.rotation.set(-0.25 + a * 0.12, 0, -0.75 - a * 0.1);
      r.armR.rotation.set(-0.25 - a * 0.12, 0, 0.75 + a * 0.1);
      r.legL.rotation.x = 0.25 + Math.sin(this.time * 2.2) * 0.18;
      r.legR.rotation.x = -0.1 - Math.sin(this.time * 2.2) * 0.18;
      r.torso.rotation.set(-0.06, 0, Math.sin(this.time * 1.1) * 0.05);
      r.head.rotation.set(-0.12, Math.sin(this.time * 0.8) * 0.25, 0);
      r.body.position.y = 0;
      for (const f of r.flutter) f.rotation.x = -0.25 + Math.sin(this.time * 2.5) * 0.12;
    } else if (this.state === 'wave') {
      // Lobby personality move: big friendly wave with a little bounce.
      const t = this.stateTime;
      const env = clamp(t / 0.25, 0, 1) * clamp((WAVE_SECONDS - t) / 0.3, 0, 1);
      r.armR.rotation.set(-0.2 * env, 0, 0.16 + 2.5 * env + Math.sin(t * 13) * 0.32 * env);
      r.armL.rotation.set(0, 0, -0.16 - 0.1 * env);
      r.legL.rotation.x = 0;
      r.legR.rotation.x = 0;
      r.torso.rotation.set(0, 0, -0.08 * env);
      r.head.rotation.set(0, 0, 0.12 * env + Math.sin(t * 6.5) * 0.04 * env);
      r.body.position.y = Math.abs(Math.sin(t * 6.5)) * 0.05 * env;
      for (const f of r.flutter) f.rotation.x = 0.05;
    } else if (this.state === 'fall') {
      // Arms up, legs tucked — used by the intro drop in M3.
      const wob = Math.sin(this.time * 10) * 0.1;
      r.armL.rotation.set(-2.6 + wob, 0, -0.4);
      r.armR.rotation.set(-2.6 - wob, 0, 0.4);
      r.legL.rotation.x = -0.4;
      r.legR.rotation.x = 0.2;
      r.torso.rotation.set(0.08, 0, 0);
      r.head.rotation.set(-0.3, 0, 0);
      r.body.position.y = 0;
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
    } else if (this.state === 'write' || this.state === 'sitWrite') {
      // Head down over the papers, writing hand scribbling, the other steadying the page.
      const e = easeIn(this.stateTime, 0.4);
      const sit = this.state === 'sitWrite';
      const scrib = Math.sin(this.time * 14) * 0.08;
      r.armR.rotation.set(-1.15 * e + scrib, 0, 0.25 + Math.sin(this.time * 9) * 0.06);
      r.armL.rotation.set(-0.95 * e, 0, -0.3);
      r.legL.rotation.x = sit ? -1.45 * e : 0;
      r.legR.rotation.x = sit ? -1.45 * e : 0;
      r.torso.rotation.set(0.28 * e, 0, 0);
      r.head.rotation.set(0.32 * e + Math.sin(this.time * 1.1) * 0.03, Math.sin(this.time * 0.6) * 0.06, 0);
      r.body.position.y = sit ? -0.12 * e : 0;
      for (const f of r.flutter) f.rotation.x = 0.04;
    } else if (this.state === 'startle') {
      // Jump back with arms up: quick squash, then a held big-eyed reaction pose.
      const t = this.stateTime;
      const pop = Math.sin(clamp(t / 0.32, 0, 1) * Math.PI);
      const e = easeIn(t, 0.18);
      r.armL.rotation.set(-2.2 * e, 0, -0.6 * e);
      r.armR.rotation.set(-2.0 * e, 0, 0.7 * e);
      r.legL.rotation.x = -0.25 * e;
      r.legR.rotation.x = 0.2 * e;
      r.torso.rotation.set(-0.22 * e, 0, 0.05 * e);
      r.head.rotation.set(-0.18 * e, 0, -0.08 * e);
      r.body.position.y = pop * 0.16;
      r.body.scaling.set(1 - pop * 0.08, 1 + pop * 0.14, 1 - pop * 0.08);
      for (const f of r.flutter) f.rotation.x = -0.2 * pop;
    } else if (this.state === 'brace' || this.state === 'reach' || this.state === 'cling') {
      // Fighting the pull: lean away from the portal (+z ahead), arms forward / gripping, cloth whipping toward it.
      const e = easeIn(this.stateTime, 0.35);
      const shake = Math.sin(this.time * 31) * 0.04;
      if (this.state === 'brace') {
        r.armL.rotation.set(-1.4 * e, 0, -0.5 * e);
        r.armR.rotation.set(-1.1 * e, 0, 0.55 * e);
        r.legL.rotation.x = 0.55 * e;
        r.legR.rotation.x = -0.45 * e;
        r.torso.rotation.set(-0.35 * e + shake, 0, 0);
      } else if (this.state === 'reach') {
        // Reaching after something flying into the portal.
        r.armR.rotation.set(-1.75 * e + shake, 0, 0.12);
        r.armL.rotation.set(-0.5 * e, 0, -0.5 * e);
        r.legL.rotation.x = -0.35 * e;
        r.legR.rotation.x = 0.35 * e;
        r.torso.rotation.set(0.3 * e, 0, 0);
      } else {
        // Arms back gripping a post behind, body stretched toward the portal.
        r.armL.rotation.set(1.6 * e + shake, 0, -0.25);
        r.armR.rotation.set(1.5 * e - shake, 0, 0.25);
        r.legL.rotation.x = -0.5 * e + Math.sin(this.time * 17) * 0.3 * e;
        r.legR.rotation.x = -0.3 * e - Math.sin(this.time * 17) * 0.3 * e;
        r.torso.rotation.set(0.2 * e, 0, 0);
      }
      r.head.rotation.set(-0.1 * e, Math.sin(this.time * 4) * 0.12, 0);
      r.body.position.y = 0;
      for (const f of r.flutter) f.rotation.x = -0.9 * e + Math.sin(this.time * 22) * 0.15;
    } else if (this.state === 'tumble') {
      // Starfish spin through the time tunnel (the scene spins the root; limbs flail out of phase).
      const a = this.time * 6;
      r.armL.rotation.set(-1.6 + Math.sin(a) * 0.6, 0, -1.0 + Math.cos(a * 0.8) * 0.3);
      r.armR.rotation.set(-1.2 + Math.sin(a + 2) * 0.6, 0, 1.1 + Math.cos(a * 0.7) * 0.3);
      r.legL.rotation.x = 0.5 + Math.sin(a * 1.3) * 0.5;
      r.legR.rotation.x = -0.4 + Math.sin(a * 1.3 + 1.5) * 0.5;
      r.torso.rotation.set(Math.sin(a * 0.5) * 0.2, 0, 0);
      r.head.rotation.set(-0.2, 0, Math.sin(a * 0.9) * 0.2);
      r.body.position.y = 0;
      for (const f of r.flutter) f.rotation.x = -0.6 + Math.sin(a * 2) * 0.3;
    } else if (this.state === 'ride') {
      // Seated on horseback: legs forward and apart, hands on the reins, a little trot bob.
      const bob = Math.abs(Math.sin(this.time * 7)) * 0.03;
      r.legL.rotation.set(-1.25, 0, -0.35);
      r.legR.rotation.set(-1.25, 0, 0.35);
      r.armL.rotation.set(-0.9, 0, -0.2);
      r.armR.rotation.set(-0.9, 0, 0.2);
      r.torso.rotation.set(0.05, 0, 0);
      r.head.rotation.set(0, Math.sin(this.time * 0.7) * 0.15, 0);
      r.body.position.y = bob;
      for (const f of r.flutter) f.rotation.x = 0.3 + Math.sin(this.time * 7) * 0.08;
    } else if (this.state === 'point') {
      // Guard: flashlight arm straight out, other hand up — "HOY!".
      const e = easeIn(this.stateTime, 0.25);
      r.armR.rotation.set(-1.5 * e, 0, 0.1);
      r.armL.rotation.set(-0.3 * e, 0, -1.9 * e + Math.sin(this.time * 12) * 0.12 * e);
      r.legL.rotation.x = 0.25 * e;
      r.legR.rotation.x = -0.15 * e;
      r.torso.rotation.set(-0.1 * e, 0, 0);
      r.head.rotation.set(-0.05, 0, 0.06 * Math.sin(this.time * 6));
      r.body.position.y = 0;
    } else if (this.state === 'sitUp') {
      // Dazed on the floor after the drop: legs out, propped on hands, head wobble.
      const e = easeIn(this.stateTime, 0.5);
      r.legL.rotation.set(-1.45, 0, -0.2);
      r.legR.rotation.set(-1.4, 0, 0.25);
      r.armL.rotation.set(0.6 * e, 0, -0.5);
      r.armR.rotation.set(0.6 * e, 0, 0.5);
      r.torso.rotation.set(-0.2 * e, 0, 0);
      r.head.rotation.set(-0.1, 0, Math.sin(this.time * 4) * 0.14);
      r.body.position.y = -0.28;
      for (const f of r.flutter) f.rotation.x = 0.1;
    } else if (this.state === 'land') {
      const t = clamp(this.stateTime / 0.35, 0, 1);
      const squash = Math.sin(t * Math.PI) * 0.18;
      r.body.scaling.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      r.armL.rotation.set(0, 0, -0.9 * (1 - t));
      r.armR.rotation.set(0, 0, 0.9 * (1 - t));
      r.legL.rotation.x = 0;
      r.legR.rotation.x = 0;
      r.torso.rotation.set(0.25 * (1 - t), 0, 0);
      r.head.rotation.set(0.1 * (1 - t), 0, 0);
      if (t >= 1) {
        r.body.scaling.set(1, 1, 1);
        this.setState('idle');
      }
    }
    const lim = r.armLimit;
    if (lim !== undefined) {
      // Skinned sculpts stretch at the shoulder on big poses (wave, fall, topple), so tone them down.
      for (const a of [r.armL, r.armR]) {
        a.rotation.x = clamp(a.rotation.x, -lim, lim);
        a.rotation.z = clamp(a.rotation.z, -lim, lim);
      }
    }
  }
}
