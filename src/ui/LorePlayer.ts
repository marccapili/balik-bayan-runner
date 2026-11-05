import { LORE } from '../data/lore';
import type { LoreEvent, LoreTimeline } from '../gameplay/LoreTimeline';

/**
 * The lore cutscene on screen: the hand-painted intro video (speech bubbles, era cards, the
 * tunnel years and the title are painted into it, and its score, SFX and babble are baked into its
 * soundtrack), the Skip chip (always available; fades when idle, a tap wakes it) and a progress
 * bar. Each line is also put in a hidden live region for screen readers. It starts after the
 * "Tap to start" gesture so it may play with sound; if the browser still refuses, it plays muted.
 */
export class LorePlayer {
  readonly video: HTMLVideoElement;
  private readonly el: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly bar: HTMLElement;
  private idle = 0;
  private volume = 1;

  constructor(
    host: HTMLElement,
    sources: readonly { src: string; type: string }[],
    private readonly onSkip: () => void,
  ) {
    const el = (this.el = document.createElement('div'));
    el.className = 'lore';
    el.innerHTML = `
      <video class="lore-video" playsinline preload="auto" disablepictureinpicture aria-label="Intro: apat na bayani, hinigop ng portal papunta sa 2026"></video>
      <div class="lore-caption" aria-live="polite"></div>
      <button class="lore-skip" data-act="skip-lore" aria-label="Skip intro">Skip ⏭</button>
      <div class="lore-progress"><i></i></div>`;
    host.appendChild(el);
    this.video = el.querySelector('video')!;
    for (const v of sources) {
      const s = document.createElement('source');
      s.src = v.src;
      s.type = v.type;
      this.video.appendChild(s);
    }
    this.caption = el.querySelector('.lore-caption')!;
    this.bar = el.querySelector('.lore-progress i')!;
    el.querySelector('.lore-skip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkip();
    });
    // A tap anywhere only wakes the Skip chip (never skips by accident).
    el.addEventListener('pointerdown', () => this.wake());
  }

  get visible(): boolean {
    return this.el.classList.contains('on');
  }

  get skipVisible(): boolean {
    return this.visible && !this.el.classList.contains('idle');
  }

  /** Shows the player and starts the video from `from` seconds. Resolves false if it can't play. */
  async show(from = 0): Promise<boolean> {
    this.el.className = 'lore on';
    this.caption.textContent = '';
    this.wake();
    this.seek(from);
    this.applyVolume();
    try {
      await this.video.play();
      return true;
    } catch {
      // Sound not allowed here (no user gesture): the picture still plays, silently.
      if (this.video.muted) return false;
      this.video.muted = true;
      try {
        await this.video.play();
        return true;
      } catch {
        return false;
      }
    }
  }

  /** 0 mutes (the game's mute toggle); otherwise the louder of the music / SFX sliders. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume(): void {
    this.video.volume = this.volume;
    this.video.muted = this.volume <= 0;
  }

  /** Video clock (seconds). */
  get time(): number {
    return this.video.currentTime;
  }

  /** True once the video has real frames at its current time (not stalled / loading). */
  get playing(): boolean {
    return !this.video.paused && this.video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  seek(t: number): void {
    try {
      this.video.currentTime = t;
    } catch {
      /* not seekable yet: it starts from 0 */
    }
  }

  hide(): void {
    this.el.className = 'lore';
    this.video.pause();
  }

  wake(): void {
    this.idle = 0;
    this.el.classList.remove('idle');
  }

  onEvent(e: LoreEvent): void {
    if (e.type === 'scene') this.el.dataset.scene = e.scene.id;
    else if (e.type === 'bubble' && e.bubble) {
      const name = LORE.names[e.bubble.who];
      this.caption.textContent = name ? `${name}: ${e.bubble.text}` : e.bubble.text;
    }
  }

  /** Per-frame: Skip chip fade, progress bar. */
  update(dt: number, tl: LoreTimeline): void {
    this.idle += dt;
    if (this.idle > LORE.skipFade) this.el.classList.add('idle');
    this.bar.style.width = `${(tl.progress * 100).toFixed(1)}%`;
  }

  dispose(): void {
    this.video.pause();
    this.video.replaceChildren();
    this.video.load();
    this.el.remove();
  }
}
