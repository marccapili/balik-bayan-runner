import { LORE, type LoreBubble } from '../data/lore';
import type { LoreEvent, LoreTimeline } from '../gameplay/LoreTimeline';
import { esc } from './exhibitHtml';

/**
 * The lore cutscene on screen: the hand-painted intro video, and over it the era cards, speech
 * bubbles that type on, the tunnel year counter, the logo slam, and the Skip chip (always
 * available; fades when idle, a tap wakes it). The video is muted (sound is the game's own SFX
 * and music, cued by the timeline), so it may always autoplay.
 */
export class LorePlayer {
  readonly video: HTMLVideoElement;
  private readonly el: HTMLElement;
  private readonly era: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly bubbleName: HTMLElement;
  private readonly bubbleText: HTMLElement;
  private readonly years: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private current: LoreBubble | null = null;
  private eraText = '';
  private eraShown = 0;
  private bubbleShown = 0;
  private idle = 0;
  private now = 0;

  constructor(
    host: HTMLElement,
    sources: readonly { src: string; type: string }[],
    private readonly onSkip: () => void,
  ) {
    const el = (this.el = document.createElement('div'));
    el.className = 'lore';
    el.innerHTML = `
      <video class="lore-video" muted playsinline preload="auto" disablepictureinpicture aria-label="Intro: apat na bayani, hinigop ng portal papunta sa 2026"></video>
      <div class="lore-era" aria-live="polite"></div>
      <div class="lore-bubble" aria-live="polite"><span class="lb-name"></span><span class="lb-text"></span></div>
      <div class="lore-years" aria-hidden="true"></div>
      <div class="lore-logo" aria-hidden="true"><div class="ll-sun">☀</div><h1>Balik Bayan <span>Runner</span></h1><p>Takbo, bayani. Ang kasaysayan ay naghihintay!</p></div>
      <button class="lore-skip" data-act="skip-lore" aria-label="Skip intro">Skip ⏭</button>
      <div class="lore-progress"><i></i></div>`;
    host.appendChild(el);
    this.video = el.querySelector('video')!;
    this.video.muted = true;
    for (const v of sources) {
      const el = document.createElement('source');
      el.src = v.src;
      el.type = v.type;
      this.video.appendChild(el);
    }
    this.era = el.querySelector('.lore-era')!;
    this.bubble = el.querySelector('.lore-bubble')!;
    this.bubbleName = el.querySelector('.lb-name')!;
    this.bubbleText = el.querySelector('.lb-text')!;
    this.years = el.querySelector('.lore-years')!;
    this.skipBtn = el.querySelector('.lore-skip')!;
    this.bar = el.querySelector('.lore-progress i')!;
    this.skipBtn.addEventListener('click', (e) => {
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

  /** Shows the overlay and starts the video from `from` seconds. Resolves false if it can't play. */
  async show(from = 0): Promise<boolean> {
    this.el.className = 'lore on';
    this.current = null;
    this.eraText = '';
    this.era.textContent = '';
    this.bubble.classList.remove('on');
    this.wake();
    this.seek(from);
    try {
      await this.video.play();
      return true;
    } catch {
      return false;
    }
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

  private retrigger(cls: string): void {
    this.el.classList.remove(cls);
    void this.el.offsetWidth;
    this.el.classList.add(cls);
  }

  onEvent(e: LoreEvent): void {
    if (e.type === 'scene') {
      const s = e.scene;
      this.el.dataset.scene = s.id;
      this.eraText = s.era ?? '';
      this.eraShown = this.now;
      this.era.textContent = '';
      this.era.classList.toggle('on', !!s.era);
    } else if (e.type === 'bubble') {
      this.current = e.bubble;
      this.bubbleShown = this.now;
      const b = e.bubble;
      this.bubble.classList.toggle('on', !!b);
      if (b) {
        this.bubble.dataset.who = b.who;
        this.bubbleName.textContent = LORE.names[b.who];
        this.bubbleText.textContent = '';
      }
    }
  }

  /** Per-frame: typewriter text, tunnel years, logo, Skip chip fade, progress bar. */
  update(dt: number, tl: LoreTimeline): void {
    this.now += dt;
    this.idle += dt;
    if (this.idle > LORE.skipFade) this.el.classList.add('idle');
    const type = (text: string, since: number, cps: number): string => text.slice(0, Math.max(0, Math.floor((this.now - since) * cps)));
    if (this.eraText) {
      const t = type(this.eraText, this.eraShown + 0.25, 26);
      if (this.era.textContent !== t) this.era.textContent = t;
    }
    if (this.current) {
      const t = type(this.current.text, this.bubbleShown, 34);
      if (this.bubbleText.textContent !== t) this.bubbleText.innerHTML = esc(t);
    }
    const s = tl.scene;
    if (s.id === 'tunnel') {
      const ys = LORE.tunnelYears;
      const i = Math.min(ys.length - 1, Math.floor((tl.local / s.dur) * ys.length));
      const y = String(ys[i]);
      if (this.years.textContent !== y) {
        this.years.textContent = y;
        this.retrigger('year-tick');
      }
    }
    this.el.classList.toggle('logo-on', s.id === 'logo' && tl.local >= LORE.logoAt);
    this.bar.style.width = `${(tl.progress * 100).toFixed(1)}%`;
  }

  dispose(): void {
    this.video.pause();
    this.video.replaceChildren();
    this.video.load();
    this.el.remove();
  }
}
