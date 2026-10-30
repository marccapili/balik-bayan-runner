import { HEROES, type HeroId } from '../data/heroes';

export interface HudCallbacks {
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onNextHero(): void;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`HUD element missing: ${sel}`);
  return el;
};

/** HTML overlay for the in-run HUD and pause menu. Every button here does something. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly roomToast: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly heroChip: HTMLElement;
  private readonly pauseMenu: HTMLElement;
  private toastTimer = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(host: HTMLElement, cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <button class="chip hero-chip" data-act="hero" aria-label="Switch hero preview">
          <span class="hero-dot"></span><span class="hero-name"></span><span class="chip-sub">tap to switch</span>
        </button>
        <div class="hud-right">
          <span class="fps" hidden></span>
          <button class="icon-btn" data-act="pause" aria-label="Pause">❚❚</button>
        </div>
      </div>
      <div class="room-toast" aria-live="polite"></div>
      <div class="hint">
        <span class="hint-desktop"><b>WASD</b> / <b>Arrow keys</b> para gumalaw · <b>1–4</b> switch hero · <b>Esc</b> pause</span>
        <span class="hint-touch">Drag sa left side para gumalaw, bes 👈</span>
      </div>
      <div class="pause-menu" hidden>
        <div class="panel">
          <h2>Paused muna ☕</h2>
          <p>Chill lang, hindi ka hahabulin habang naka-pause.</p>
          <button class="btn primary" data-act="resume">Tuloy na! ▶</button>
          <button class="btn" data-act="restart">Ulitin (back to spawn)</button>
        </div>
      </div>`;
    host.appendChild(this.root);
    this.roomToast = $(this.root, '.room-toast');
    this.fps = $(this.root, '.fps');
    this.heroChip = $(this.root, '.hero-chip');
    this.pauseMenu = $(this.root, '.pause-menu');

    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'pause') cb.onPause();
      else if (act === 'resume') cb.onResume();
      else if (act === 'restart') cb.onRestart();
      else if (act === 'hero') cb.onNextHero();
    });
    if (new URLSearchParams(location.search).has('debug')) this.fps.hidden = false;
  }

  toggleFps(): void {
    this.fps.hidden = !this.fps.hidden;
  }

  setHero(id: HeroId): void {
    const h = HEROES[id];
    $(this.heroChip, '.hero-name').textContent = h.name;
    $(this.heroChip, '.hero-dot').dataset.hero = id;
    this.heroChip.title = `${h.title} · ${h.heroClass}`;
  }

  setPaused(p: boolean): void {
    this.pauseMenu.hidden = !p;
    if (p) $(this.pauseMenu, '[data-act="resume"]').focus();
  }

  showRoom(title: string, subtitle: string): void {
    this.roomToast.innerHTML = `<b>📍 ${title}</b><span>${subtitle}</span>`;
    this.roomToast.classList.remove('show');
    void this.roomToast.offsetWidth; // restart CSS animation
    this.roomToast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.roomToast.classList.remove('show'), 2200);
  }

  tickFps(dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps`;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
