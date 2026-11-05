import { LORE, LORE_SCENES, type LoreBubble, type LoreScene } from '../data/lore';

export type LoreEvent =
  | { type: 'scene'; scene: LoreScene }
  | { type: 'bubble'; bubble: LoreBubble | null }
  | { type: 'end'; skipped: boolean };

/**
 * Engine-free player for the lore cutscene overlay (unit-tested). The game drives it from the
 * video's clock (`syncTo(video.currentTime)`); it reports scene changes and bubbles as events (the
 * sound is baked into the video). `seek` jumps there; `skip` ends it at once.
 */
export class LoreTimeline {
  time = 0;
  done = false;
  private sceneIdx = -1;
  private bubble: LoreBubble | null = null;

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

  private sceneAt(t: number): number {
    let idx = 0;
    for (let i = 0; i < this.scenes.length; i++) if (t >= this.scenes[i]!.start) idx = i;
    return idx;
  }

  private bubbleAt(s: LoreScene, local: number): LoreBubble | null {
    return s.bubbles.find((b) => local >= b.at && local < b.until) ?? null;
  }

  update(dt: number): LoreEvent[] {
    return this.syncTo(this.time + Math.max(0, dt));
  }

  /** Moves forward to `t` (the video clock), firing what it passes. Never goes backwards. */
  syncTo(t: number): LoreEvent[] {
    const out: LoreEvent[] = [];
    if (this.done) return out;
    if (this.sceneIdx < 0) this.sync(out);
    this.time = Math.max(this.time, t);
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.done = true;
      out.push({ type: 'end', skipped: false });
      return out;
    }
    this.sync(out);
    return out;
  }

  /** Recomputes scene / bubble for `time`. */
  private sync(out: LoreEvent[]): void {
    const si = this.sceneAt(this.time);
    if (si !== this.sceneIdx) {
      this.sceneIdx = si;
      out.push({ type: 'scene', scene: this.scene });
    }
    const b = this.bubbleAt(this.scene, this.local);
    if (b !== this.bubble) {
      this.bubble = b;
      out.push({ type: 'bubble', bubble: b });
    }
  }

  /** Jump to `t` seconds. */
  seek(t: number): LoreEvent[] {
    const out: LoreEvent[] = [];
    this.time = Math.min(Math.max(0, t), this.duration - 0.001);
    this.done = false;
    this.sync(out);
    return out;
  }

  skip(): LoreEvent[] {
    if (this.done) return [];
    this.done = true;
    return [{ type: 'end', skipped: true }];
  }
}
