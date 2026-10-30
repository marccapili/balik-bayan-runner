/**
 * Tiny synthesised sound effects (Web Audio, no files, no licensing).
 * The AudioContext is created on the first user gesture to satisfy autoplay rules.
 */
export type SfxName = 'coin' | 'rare' | 'heart' | 'hit' | 'alert' | 'gameover' | 'bonus' | 'click' | 'portal' | 'drop' | 'land' | 'unlock';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  volume = 0.6;

  constructor() {
    const unlock = (): void => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
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
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
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
      case 'coin':
        this.tone(988, t, 0.07, 'square', 0.08);
        this.tone(1319, t + 0.06, 0.12, 'square', 0.08);
        break;
      case 'rare':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.06, 0.14, 'triangle', 0.12));
        break;
      case 'heart':
        [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.08, 0.18, 'sine', 0.16));
        break;
      case 'bonus':
        [659, 880].forEach((f, i) => this.tone(f, t + i * 0.09, 0.15, 'triangle', 0.1));
        break;
      case 'hit':
        this.noise(t, 0.25, 0.5, 900);
        this.tone(220, t, 0.25, 'sawtooth', 0.12, 80);
        break;
      case 'alert':
        this.tone(880, t, 0.09, 'square', 0.1);
        this.tone(1175, t + 0.11, 0.14, 'square', 0.1);
        break;
      case 'gameover':
        [523, 440, 349, 262].forEach((f, i) => this.tone(f, t + i * 0.18, 0.3, 'triangle', 0.14));
        break;
      case 'click':
        this.tone(660, t, 0.05, 'sine', 0.08);
        break;
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
    }
  }
}
