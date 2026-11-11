import { MIX, MUSIC, type MusicTrack } from '../data/audio';

/**
 * Original procedural background music (Web Audio, no files, no licensing).
 * Two loops inspired by kulintang-style gong melodies on a pentatonic scale:
 * a calm one for the lobby and a driving chase loop for the museum, whose layers
 * (shaker, bass, lead) fade in with `intensity`. A look-ahead scheduler queues
 * notes ~0.2 s ahead on the audio clock, so timing never depends on frame rate.
 */
export class Music {
  private out: GainNode | null = null;
  private track: MusicTrack | null = null;
  private wanted: MusicTrack | null = null;
  private step = 0;
  private nextAt = 0;
  private timer = 0;
  private intensity = 0;
  private tempoScale = 1;
  private duck = 1;
  private volume: number = MUSIC.defaultVolume;
  private muted = false;

  /**
   * `busOf` = the game's shared mix (limiter + hall reverb, owned by Sfx). Without it the music
   * goes straight to the speakers.
   */
  constructor(
    private readonly ctxOf: () => AudioContext | null,
    private readonly busOf: () => { dry: AudioNode; wet: AudioNode } | null = () => null,
  ) {}

  private bus(ctx: AudioContext): GainNode {
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      const mix = this.busOf();
      this.out.connect(mix ? mix.dry : ctx.destination);
      if (mix) {
        const send = ctx.createGain();
        send.gain.value = MIX.musicReverb;
        this.out.connect(send).connect(mix.wet);
      }
    }
    return this.out;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  private applyGain(fade = 0.4): void {
    const ctx = this.ctxOf();
    if (!ctx || !this.out) return;
    const target = this.muted || !this.track ? 0 : this.volume * this.duck * MUSIC.master;
    this.out.gain.cancelScheduledValues(ctx.currentTime);
    this.out.gain.setTargetAtTime(target, ctx.currentTime, fade / 3);
  }

  /**
   * Called every frame with what should be playing. Cheap: only acts when something changes.
   * `duck` < 1 lowers the music (pause, reading, mini-games).
   */
  set(track: MusicTrack | null, intensity = 0, duck = 1, tempoScale = 1): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.tempoScale = tempoScale;
    if (duck !== this.duck) {
      this.duck = duck;
      this.applyGain();
    }
    if (track === this.wanted) return;
    this.wanted = track;
    const ctx = this.ctxOf();
    if (!ctx) return;
    this.bus(ctx);
    this.track = track;
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.1;
    this.applyGain(track ? 1.2 : 0.6);
    if (track && !this.timer) this.timer = window.setInterval(() => this.schedule(), 50);
  }

  /** Re-tries starting once the AudioContext exists (first tap). */
  poke(): void {
    if (this.wanted && !this.track) {
      const w = this.wanted;
      this.wanted = null;
      this.set(w, this.intensity, this.duck, this.tempoScale);
    }
  }

  private schedule(): void {
    const ctx = this.ctxOf();
    if (!ctx || !this.out || ctx.state !== 'running') return;
    if (!this.track) {
      window.clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    // Skip ahead after a stall (tab in background) instead of firing a burst of notes.
    if (this.nextAt < ctx.currentTime - 0.3) this.nextAt = ctx.currentTime + 0.05;
    const song = MUSIC.tracks[this.track];
    const stepDur = 60 / (song.bpm * this.tempoScale) / 4;
    while (this.nextAt < ctx.currentTime + 0.2) {
      this.playStep(ctx, song, this.step, this.nextAt, stepDur);
      this.nextAt += stepDur;
      this.step = (this.step + 1) % (song.bars * 16);
    }
  }

  private playStep(ctx: AudioContext, song: (typeof MUSIC.tracks)[MusicTrack], step: number, t: number, sd: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = song.roots[bar % song.roots.length]!;
    const scale = MUSIC.scale;
    const note = (deg: number, oct: number): number => {
      const i = ((deg % scale.length) + scale.length) % scale.length;
      const o = oct + Math.floor(deg / scale.length);
      return 261.63 * 2 ** ((root + scale[i]! + 12 * o) / 12);
    };
    const lvl = this.intensity;

    // Agung (low gong) on the downbeats.
    if (song.gong[s]) this.gong(ctx, note(0, -2), t, sd * 6, 0.22);
    // Kulintang melody (always on, the identity of the loop).
    const m = song.melody[(bar % 2) * 16 + s];
    if (m !== null && m !== undefined) this.bell(ctx, note(m, 0), t, sd * 3, 0.08);
    // Bass pulse fades in with the chase.
    if (song.bass[s] && lvl > song.layers.bass) this.pluck(ctx, note(song.bass[s]! - 1, -1), t, sd * 1.6, 0.11 * Math.min(1, (lvl - song.layers.bass) * 3 + 0.4));
    // Shaker 8ths/16ths.
    if (lvl > song.layers.shaker && (s % 2 === 0 || lvl > 0.7)) this.shaker(ctx, t, s % 4 === 0 ? 0.05 : 0.03);
    // High counter-melody when things get wild (Endless).
    if (lvl > song.layers.lead && s % 4 === 2) this.bell(ctx, note(song.melody[(bar * 5 + s) % 32] ?? 2, 1), t, sd * 1.5, 0.035);
  }

  private env(ctx: AudioContext, t: number, dur: number, peak: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out!);
    return g;
  }

  private gong(ctx: AudioContext, f: number, t: number, dur: number, peak: number): void {
    const g = this.env(ctx, t, dur, peak);
    for (const [mult, type] of [
      [1, 'sine'],
      [2.76, 'sine'],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * mult, t);
      o.frequency.exponentialRampToValueAtTime(f * mult * 0.985, t + dur);
      const og = ctx.createGain();
      og.gain.value = mult === 1 ? 1 : 0.25;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private bell(ctx: AudioContext, f: number, t: number, dur: number, peak: number): void {
    const g = this.env(ctx, t, dur, peak);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 4.2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o.connect(g);
    o2.connect(g2).connect(g);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private pluck(ctx: AudioContext, f: number, t: number, dur: number, peak: number): void {
    const g = this.env(ctx, t, dur, peak);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    o.connect(lp).connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBuf: AudioBuffer | null = null;

  private shaker(ctx: AudioContext, t: number, peak: number): void {
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.08);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = this.env(ctx, t, 0.07, peak);
    src.connect(hp).connect(g);
    src.start(t);
  }
}
