import { MIX, MUSIC } from '../data/audio';

/**
 * Synthesised sound effects (Web Audio, no files, no licensing).
 * The AudioContext is created on the first user gesture to satisfy autoplay rules.
 * Everything runs through one mix bus: a short "museum hall" reverb (generated impulse)
 * and a limiter, so sounds sit in the same room and never clip when they stack.
 */
export type SfxName = 'coin' | 'rare' | 'heart' | 'hit' | 'alert' | 'gameover' | 'bonus' | 'click' | 'portal' | 'drop' | 'land' | 'unlock' | 'sprint' | 'shield' | 'shockwave' | 'dash' | 'block' | 'denied' | 'claim' | 'bark' | 'growl' | 'whoo' | 'neigh' | 'thump' | 'poof' | 'page' | 'step';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private out: DynamicsCompressorNode | null = null;
  private hall: ConvolverNode | null = null;
  private _muted = false;
  private coinStreak = 0;
  private lastCoinAt = -10;
  private lastStepAt = -10;
  private stepFlip = false;
  volume = 0.6;

  constructor() {
    const unlock = (): void => {
      this.ensure();
      void this.ctx?.resume().then(() => this.onUnlock?.());
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  /** Called once audio can play (after the first tap/key). */
  onUnlock: (() => void) | null = null;

  /** The shared AudioContext (null until the first gesture). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this._muted ? 0 : this.volume;
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = (this.ctx = new AC());
    // Limiter on the way out.
    const out = (this.out = ctx.createDynamicsCompressor());
    out.threshold.value = MIX.limiter.threshold;
    out.knee.value = MIX.limiter.knee;
    out.ratio.value = MIX.limiter.ratio;
    out.attack.value = MIX.limiter.attack;
    out.release.value = MIX.limiter.release;
    out.connect(ctx.destination);
    // Hall reverb: decaying noise is a cheap, convincing room.
    const hall = (this.hall = ctx.createConvolver());
    hall.buffer = hallImpulse(ctx, MIX.reverbSeconds, MIX.reverbDecay);
    hall.connect(out);
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this.volume;
    this.master.connect(out);
    const send = ctx.createGain();
    send.gain.value = MIX.sfxReverb;
    this.master.connect(send).connect(hall);
    return ctx;
  }

  /** Where the music plugs in: the limiter (dry) and the hall (wet). Null before the first tap. */
  get mixBus(): { dry: AudioNode; wet: AudioNode } | null {
    return this.out && this.hall ? { dry: this.out, wet: this.hall } : null;
  }

  /** A struck-metal voice: sine partials with a fast shimmer on top (coins, chimes, UI). */
  private bell(freq: number, start: number, dur: number, gain: number, bright = 0.3): void {
    this.tone(freq, start, dur, 'sine', gain);
    this.tone(freq * 2.0, start, dur * 0.6, 'sine', gain * 0.35);
    this.tone(freq * 3.01, start, dur * 0.35, 'triangle', gain * bright);
  }

  /** Band-limited noise burst (cloth, feet, impacts). */
  private burst(start: number, dur: number, gain: number, freq: number, q = 1): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master!);
    src.start(start);
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, gain: number, lowpass: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master!);
    src.start(start);
  }

  play(name: SfxName): void {
    if (this._muted) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'coin': {
        // Quick pickups climb the pentatonic scale of the music, so a coin trail plays a little run.
        this.coinStreak = t - this.lastCoinAt < MIX.coinStreakWindow ? Math.min(this.coinStreak + 1, MIX.coinStreakSteps) : 0;
        this.lastCoinAt = t;
        const scale = MUSIC.scale;
        const semis = scale[this.coinStreak % scale.length]! + 12 * Math.floor(this.coinStreak / scale.length);
        const f = 1046.5 * 2 ** (semis / 12);
        this.bell(f, t, 0.16, 0.085);
        this.bell(f * 1.5, t + 0.055, 0.22, 0.07, 0.2);
        break;
      }
      case 'rare':
        [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, t + i * 0.06, 0.24, 0.1, 0.4));
        break;
      case 'heart':
        [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.08, 0.18, 'sine', 0.16));
        break;
      case 'bonus':
        [659, 880].forEach((f, i) => this.bell(f, t + i * 0.09, 0.2, 0.09));
        break;
      case 'hit':
        // Body thump + a short crack, so getting caught lands with weight.
        this.noise(t, 0.25, 0.5, 900);
        this.tone(220, t, 0.25, 'sawtooth', 0.12, 80);
        this.tone(150, t, 0.22, 'sine', 0.3, 45);
        this.burst(t, 0.04, 0.35, 1800, 0.8);
        break;
      case 'alert':
        // Two-note whistle-like sting (triangle instead of a harsh square).
        this.tone(880, t, 0.1, 'triangle', 0.16, 932);
        this.tone(1175, t + 0.11, 0.18, 'triangle', 0.16, 1245);
        this.burst(t, 0.05, 0.12, 3200, 2);
        break;
      case 'gameover':
        [523, 440, 349, 262].forEach((f, i) => this.tone(f, t + i * 0.18, 0.3, 'triangle', 0.14));
        break;
      case 'click':
        // Soft wooden tick with a hint of pitch.
        this.burst(t, 0.03, 0.2, 2600, 1.5);
        this.tone(740, t, 0.06, 'sine', 0.06, 520);
        break;
      case 'step': {
        if (t - this.lastStepAt < MIX.stepMinGap) break;
        this.lastStepAt = t;
        this.stepFlip = !this.stepFlip;
        // Sandal on a hard floor: a dull tap, left and right feet slightly apart in pitch.
        const f = (this.stepFlip ? 520 : 440) * (0.94 + Math.random() * 0.12);
        this.burst(t, 0.06, MIX.stepGain * 2.4, f, 1.2);
        this.tone(this.stepFlip ? 150 : 132, t, 0.05, 'sine', MIX.stepGain, 80);
        break;
      }
      case 'portal':
        // Rising shimmer: the time-travel whoosh.
        this.tone(220, t, 0.9, 'sawtooth', 0.05, 880);
        this.tone(330, t + 0.05, 0.9, 'triangle', 0.08, 1320);
        this.noise(t, 0.8, 0.12, 2400);
        [988, 1319, 1568].forEach((f, i) => this.tone(f, t + 0.55 + i * 0.07, 0.25, 'sine', 0.06));
        break;
      case 'drop':
        this.tone(900, t, 0.35, 'sine', 0.08, 260);
        break;
      case 'land':
        this.noise(t, 0.3, 0.45, 500);
        this.tone(120, t, 0.25, 'sine', 0.2, 55);
        break;
      case 'unlock':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, 'triangle', 0.12));
        break;
      case 'sprint':
        this.tone(440, t, 0.25, 'square', 0.05, 1200);
        this.tone(660, t + 0.08, 0.2, 'triangle', 0.08, 1500);
        break;
      case 'shield':
        this.tone(392, t, 0.4, 'triangle', 0.1, 523);
        this.tone(784, t + 0.05, 0.4, 'sine', 0.06, 1046);
        break;
      case 'shockwave':
        this.noise(t, 0.45, 0.5, 900);
        this.tone(160, t, 0.45, 'sawtooth', 0.12, 50);
        break;
      case 'dash':
        this.noise(t, 0.18, 0.3, 3200);
        this.tone(700, t, 0.15, 'sine', 0.06, 1400);
        break;
      case 'block':
        this.tone(1200, t, 0.12, 'square', 0.07, 900);
        this.tone(600, t + 0.03, 0.25, 'triangle', 0.1, 300);
        break;
      case 'denied':
        this.tone(196, t, 0.09, 'triangle', 0.12, 165);
        this.tone(165, t + 0.1, 0.12, 'triangle', 0.12, 139);
        break;
      case 'bark':
        // Two short ruff-ruffs.
        for (const d of [0, 0.16]) {
          this.noise(t + d, 0.09, 0.35, 1400);
          this.tone(420, t + d, 0.09, 'sawtooth', 0.09, 220);
        }
        break;
      case 'growl':
        this.tone(95, t, 0.6, 'sawtooth', 0.09, 80);
        this.noise(t, 0.6, 0.18, 300);
        break;
      case 'whoo':
        // Ghostly wobble: slow pitch bend up and down.
        this.tone(330, t, 0.6, 'sine', 0.1, 520);
        this.tone(520, t + 0.55, 0.7, 'sine', 0.08, 300);
        break;
      case 'neigh':
        [880, 1046, 932, 1175, 988].forEach((f, i) => this.tone(f, t + i * 0.07, 0.1, 'sawtooth', 0.05, f * 0.8));
        this.noise(t + 0.3, 0.3, 0.12, 2000);
        break;
      case 'thump':
        this.noise(t, 0.25, 0.6, 400);
        this.tone(90, t, 0.3, 'sine', 0.25, 40);
        break;
      case 'poof':
        this.noise(t, 0.3, 0.25, 4000);
        this.tone(1200, t, 0.25, 'sine', 0.05, 2400);
        break;
      case 'page':
        // Paper rustle + a soft "discovery" chime.
        this.noise(t, 0.18, 0.18, 5000);
        [659, 988].forEach((f, i) => this.tone(f, t + 0.08 + i * 0.09, 0.25, 'sine', 0.07));
        break;
      case 'claim':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.06, 0.2, 'sine', 0.1));
        break;
    }
  }
}

/** Stereo impulse response: noise that decays exponentially and gets darker as it fades. */
function hallImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const white = Math.random() * 2 - 1;
      // One-pole low-pass that closes over time: late echoes lose their highs, like a real room.
      const a = 0.55 - 0.45 * k;
      low += a * (white - low);
      d[i] = low * (1 - k) ** decay;
    }
  }
  return buf;
}
