/**
 * Plays one short pre-rendered clip full screen (the hero start clips) above the portal wipe. A tap anywhere,
 * the Skip chip, Esc, Enter or Space skips it. `play()` resolves when it ends, is skipped, or can't start in
 * time, so a missing or slow video never holds up the run.
 */
export class ClipPlayer {
  readonly video: HTMLVideoElement;
  private readonly el: HTMLElement;
  private readonly caption: HTMLElement;
  private volume = 1;
  private loaded = '';
  private finish: (() => void) | null = null;

  constructor(host: HTMLElement) {
    const el = (this.el = document.createElement('div'));
    el.className = 'lore clip';
    el.innerHTML = `
      <video class="lore-video" playsinline preload="auto" disablepictureinpicture></video>
      <div class="lore-caption" aria-live="polite"></div>
      <button class="lore-skip" data-act="skip-clip" aria-label="Skip">Skip ⏭</button>`;
    host.appendChild(el);
    this.video = el.querySelector('video')!;
    this.caption = el.querySelector('.lore-caption')!;
    // Any tap skips (it's only a few seconds and you came here to play).
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.done();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.finish) return;
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.done();
      }
    });
    this.video.addEventListener('ended', () => this.done());
  }

  get visible(): boolean {
    return this.el.classList.contains('on');
  }

  /** Starts buffering a clip (call when the hero is chosen, so PLAY starts at once). */
  load(key: string, sources: readonly { src: string; type: string }[]): void {
    if (this.loaded === key) return;
    this.loaded = key;
    this.video.replaceChildren(
      ...sources.map((v) => {
        const s = document.createElement('source');
        s.src = v.src;
        s.type = v.type;
        return s;
      }),
    );
    this.video.load();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.video.volume = this.volume;
    this.video.muted = this.volume <= 0;
  }

  /** Shows and plays the loaded clip; resolves when it is over (ended, skipped, failed or too slow). */
  play(line: string, startTimeout: number): Promise<void> {
    this.done();
    return new Promise((resolve) => {
      let timer = 0;
      this.finish = () => {
        window.clearTimeout(timer);
        this.finish = null;
        resolve();
      };
      this.el.classList.add('on');
      this.caption.textContent = line;
      this.setVolume(this.volume);
      try {
        this.video.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      const fail = (): void => this.done();
      this.video.play().catch(() => {
        // Sound refused: try silently, else give up.
        this.video.muted = true;
        this.video.play().catch(fail);
      });
      timer = window.setTimeout(() => {
        if (this.video.currentTime < 0.05) fail();
      }, startTimeout * 1000);
    });
  }

  /** Ends the clip now (skip / end). The picture stays up until `hide()`, so nothing flashes underneath. */
  private done(): void {
    if (!this.finish) return;
    this.video.pause();
    this.finish();
  }

  hide(): void {
    this.el.classList.remove('on');
    this.caption.textContent = '';
  }
}
