import { LORE, type LoreBubble } from '../data/lore';
import type { LoreEvent, LoreTimeline } from '../gameplay/LoreTimeline';
import { esc } from './exhibitHtml';

/**
 * Comic-panel overlay for the lore cutscene: letterbox bars, era cards, speech bubbles that
 * type on, ink wipes between scenes, a white flash on portal hits, the tunnel year counter,
 * the logo slam, and the Skip chip (always available; fades when idle, a tap wakes it).
 */
export class LorePlayer {
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
    private readonly onSkip: () => void,
  ) {
    const el = (this.el = document.createElement('div'));
    el.className = 'lore';
    el.innerHTML = `
      <div class="lore-bar top"></div><div class="lore-bar bottom"></div>
      <div class="lore-title" aria-hidden="true">
        <div class="lore-cracks">${[1521, 1763, '1890s', 1896].map((y, i) => `<span class="lc lc${i}"><i></i><b>${y}</b></span>`).join('')}</div>
      </div>
      <div class="lore-era" aria-live="polite"></div>
      <div class="lore-bubble" aria-live="polite"><span class="lb-name"></span><span class="lb-text"></span></div>
      <div class="lore-years" aria-hidden="true"></div>
      <div class="lore-logo" aria-hidden="true"><div class="ll-sun">☀</div><h1>Balik Bayan <span>Runner</span></h1><p>Takbo, bayani. Ang kasaysayan ay naghihintay!</p></div>
      <div class="lore-flash"></div>
      <div class="lore-wipe"></div>
      <button class="lore-skip" data-act="skip-lore" aria-label="Skip intro">Skip ⏭</button>
      <div class="lore-progress"><i></i></div>`;
    host.appendChild(el);
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

  show(): void {
    this.el.className = 'lore on';
    this.current = null;
    this.eraText = '';
    this.era.textContent = '';
    this.bubble.classList.remove('on');
    this.wake();
  }

  hide(): void {
    this.el.className = 'lore';
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
      if (s.start > 0) this.retrigger('wiping');
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
    } else if (e.type === 'sfx' && e.sfx === 'flash') {
      this.retrigger('flashing');
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
    if (s.set === 'tunnel') {
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
    this.el.remove();
  }
}
