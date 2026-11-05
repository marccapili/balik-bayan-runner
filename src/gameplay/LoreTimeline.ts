import { LORE, LORE_CUES, LORE_SCENES, type Ease, type LoreBubble, type LoreCam, type LoreScene, type LoreSfx, type V3 } from '../data/lore';

export type LoreEvent =
  | { type: 'scene'; scene: LoreScene }
  | { type: 'cut'; scene: LoreScene; cam: number }
  | { type: 'bubble'; bubble: LoreBubble | null }
  | { type: 'sfx'; sfx: LoreSfx }
  | { type: 'end'; skipped: boolean };

export function ease(kind: Ease | undefined, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind ?? 'inOut') {
    case 'linear':
      return x;
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'back': {
      // Small overshoot then settle (smash-cut push).
      const c = 1.4;
      return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
    }
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

const mix = (a: V3, b: V3, t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Engine-free player for the lore cutscene (unit-tested). Advances by `dt`, reports scene
 * changes, camera cuts, bubbles and sound cues as events, and exposes the eased camera pose.
 * `seek` jumps without firing passed cues (tests, replay); `skip` ends it at once.
 */
export class LoreTimeline {
  time = 0;
  done = false;
  private sceneIdx = -1;
  private camIdx = -1;
  private bubble: LoreBubble | null = null;
  private readonly fired = new Set<number>();

  constructor(
    private readonly scenes: readonly LoreScene[] = LORE_SCENES,
    private readonly duration: number = LORE.duration,
  ) {}

  get scene(): LoreScene {
    return this.scenes[Math.max(0, this.sceneIdx)]!;
  }

  /** Seconds into the current scene. */
  get local(): number {
    return this.time - this.scene.start;
  }

  get progress(): number {
    return Math.min(1, this.time / this.duration);
  }

  get currentBubble(): LoreBubble | null {
    return this.bubble;
  }

  /** Current camera shot and its eased 0→1 progress. */
  get cam(): { shot: LoreCam; t: number; index: number } {
    const s = this.scene;
    const i = Math.max(0, this.camIdx);
    const shot = s.cams[i]!;
    const end = s.cams[i + 1]?.at ?? s.dur;
    return { shot, t: (this.local - shot.at) / Math.max(0.001, end - shot.at), index: i };
  }

  /** Eased camera position + target for this frame. */
  camPose(): { pos: [number, number, number]; tgt: [number, number, number]; fov: number; pull: number } {
    const { shot, t } = this.cam;
    const k = ease(shot.ease, t);
    return { pos: mix(shot.pos0, shot.pos1, k), tgt: mix(shot.tgt0, shot.tgt1, k), fov: shot.fov ?? 0.8, pull: shot.pull ?? LORE.portraitPull };
  }

  private sceneAt(t: number): number {
    let idx = 0;
    for (let i = 0; i < this.scenes.length; i++) if (t >= this.scenes[i]!.start) idx = i;
    return idx;
  }

  private camAt(s: LoreScene, local: number): number {
    let idx = 0;
    for (let i = 0; i < s.cams.length; i++) if (local >= s.cams[i]!.at) idx = i;
    return idx;
  }

  private bubbleAt(s: LoreScene, local: number): LoreBubble | null {
    return s.bubbles.find((b) => local >= b.at && local < b.until) ?? null;
  }

  update(dt: number): LoreEvent[] {
    const out: LoreEvent[] = [];
    if (this.done) return out;
    if (this.sceneIdx < 0) this.sync(out, true);
    this.time += Math.max(0, dt);
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.done = true;
      out.push({ type: 'end', skipped: false });
      return out;
    }
    this.sync(out, true);
    return out;
  }

  /** Recomputes scene / cam / bubble for `time`; fires cues only when `cues` is set. */
  private sync(out: LoreEvent[], cues: boolean): void {
    const si = this.sceneAt(this.time);
    if (si !== this.sceneIdx) {
      this.sceneIdx = si;
      this.camIdx = -1;
      out.push({ type: 'scene', scene: this.scene });
    }
    const s = this.scene;
    const ci = this.camAt(s, this.local);
    if (ci !== this.camIdx) {
      if (this.camIdx >= 0 || ci > 0) out.push({ type: 'cut', scene: s, cam: ci });
      this.camIdx = ci;
    }
    const b = this.bubbleAt(s, this.local);
    if (b !== this.bubble) {
      this.bubble = b;
      out.push({ type: 'bubble', bubble: b });
    }
    for (let i = 0; i < LORE_CUES.length; i++) {
      const c = LORE_CUES[i]!;
      if (this.fired.has(i)) continue;
      const sc = this.scenes.find((x) => x.id === c.scene);
      if (!sc || this.time < sc.start + c.at) continue;
      this.fired.add(i);
      if (cues) out.push({ type: 'sfx', sfx: c.sfx });
    }
  }

  /** Jump to `t` seconds (passed cues are marked fired but not played). */
  seek(t: number): LoreEvent[] {
    const out: LoreEvent[] = [];
    this.time = Math.min(Math.max(0, t), this.duration - 0.001);
    this.done = false;
    this.fired.clear();
    this.sync(out, false);
    return out;
  }

  skip(): LoreEvent[] {
    if (this.done) return [];
    this.done = true;
    return [{ type: 'end', skipped: true }];
  }
}
