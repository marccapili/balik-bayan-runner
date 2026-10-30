import { HEALTH } from '../data/gameplay';

export interface HudCallbacks {
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onReplay(): void;
  onLobby(): void;
  onDrop(): void;
  onToggleMute(): void;
}

export interface RunStats {
  hearts: number;
  score: number;
  coins: number;
  time: number;
  multiplier: number;
}

export interface RunResult {
  score: number;
  time: number;
  coins: number;
  bestScore: number;
  newBest: boolean;
  wallet: number;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`HUD element missing: ${sel}`);
  return el;
};

export const formatTime = (s: number): string => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** HTML overlay for the in-run HUD, pause menu and results. Every button here does something. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly roomToast: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly dropPrompt: HTMLElement;
  private readonly pauseMenu: HTMLElement;
  private readonly results: HTMLElement;
  private readonly hearts: HTMLElement;
  private readonly score: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly mult: HTMLElement;
  private readonly floats: HTMLElement;
  private readonly hurtFlash: HTMLElement;
  private last: RunStats = { hearts: -1, score: -1, coins: -1, time: -1, multiplier: -1 };
  private toastTimer = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(host: HTMLElement, cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    const heartIcons = Array.from({ length: HEALTH.maxHearts }, () => '<span class="heart"></span>').join('');
    this.root.innerHTML = `
      <div class="hurt-flash"></div>
      <div class="floats"></div>
      <div class="hud-top">
        <div class="hud-left">
          <div class="hearts" aria-label="Hearts">${heartIcons}</div>
          <div class="score-line"><span class="score">0</span><span class="mult" hidden>x2</span></div>
        </div>
        <div class="timer" aria-label="Survival time">0:00</div>
        <div class="hud-right">
          <span class="fps" hidden></span>
          <span class="coin-chip" aria-label="Coins this run"><span class="coin-icon"></span><b class="coins">0</b></span>
          <button class="icon-btn" data-act="pause" aria-label="Pause">❚❚</button>
        </div>
      </div>
      <button class="drop-prompt" data-act="drop" hidden>
        <span class="dp-big">TAP TO DROP</span>
        <span class="dp-small"><span class="hint-desktop">Click / Space / WASD</span><span class="hint-touch">Tap kahit saan</span> para bumaba ⬇</span>
      </button>
      <div class="room-toast" aria-live="polite"></div>
      <div class="hint">
        <span class="hint-desktop"><b>WASD</b> / <b>Arrows</b> para tumakbo · kunin ang coins · iwasan ang guard 👮 · <b>Esc</b> pause</span>
        <span class="hint-touch">Drag sa left side para tumakbo, iwas sa guard 👮</span>
      </div>
      <div class="pause-menu overlay" hidden>
        <div class="panel">
          <h2>Paused muna ☕</h2>
          <p>Chill lang, hindi ka hahabulin habang naka-pause.</p>
          <button class="btn primary" data-act="resume">Tuloy na! ▶</button>
          <button class="btn" data-act="restart">Ulitin ang run 🔁</button>
          <button class="btn" data-act="mute"><span class="mute-label">Tunog: ON 🔊</span></button>
          <button class="btn" data-act="lobby">Balik sa lobby 🏠</button>
        </div>
      </div>
      <div class="results overlay" hidden>
        <div class="panel">
          <h2>Huli ka, bes! 😵</h2>
          <p class="res-sub">Na-escort ka palabas ng museo. Babawi tayo!</p>
          <div class="new-best" hidden>🏆 NEW BEST! Sheesh!</div>
          <dl class="stats">
            <div><dt>Score</dt><dd class="r-score">0</dd></div>
            <div><dt>Oras</dt><dd class="r-time">0:00</dd></div>
            <div><dt>Coins</dt><dd class="r-coins">0</dd></div>
            <div><dt>Best</dt><dd class="r-best">0</dd></div>
          </dl>
          <p class="wallet">Wallet mo: <b class="r-wallet">0</b> coins</p>
          <button class="btn primary" data-act="replay">Laro ulit! 🔁</button>
          <button class="btn" data-act="lobby">Lobby 🏠</button>
        </div>
      </div>`;
    host.appendChild(this.root);
    this.roomToast = $(this.root, '.room-toast');
    this.fps = $(this.root, '.fps');
    this.dropPrompt = $(this.root, '.drop-prompt');
    this.pauseMenu = $(this.root, '.pause-menu');
    this.results = $(this.root, '.results');
    this.hearts = $(this.root, '.hearts');
    this.score = $(this.root, '.score');
    this.coins = $(this.root, '.coins');
    this.timer = $(this.root, '.timer');
    this.mult = $(this.root, '.mult');
    this.floats = $(this.root, '.floats');
    this.hurtFlash = $(this.root, '.hurt-flash');

    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'pause') cb.onPause();
      else if (act === 'resume') cb.onResume();
      else if (act === 'restart') cb.onRestart();
      else if (act === 'replay') cb.onReplay();
      else if (act === 'lobby') cb.onLobby();
      else if (act === 'drop') cb.onDrop();
      else if (act === 'mute') cb.onToggleMute();
    });
    if (new URLSearchParams(location.search).has('debug')) this.fps.hidden = false;
  }

  toggleFps(): void {
    this.fps.hidden = !this.fps.hidden;
  }

  /** 'off' = lobby, 'intro' = cinematic (stats hidden), 'play' = full HUD. */
  setMode(mode: 'off' | 'intro' | 'play'): void {
    this.root.dataset.mode = mode;
    if (mode !== 'intro') this.showDrop(false);
  }

  showDrop(v: boolean): void {
    this.dropPrompt.hidden = !v;
  }

  get dropVisible(): boolean {
    return !this.dropPrompt.hidden;
  }

  setPaused(p: boolean): void {
    this.pauseMenu.hidden = !p;
    if (p) $(this.pauseMenu, '[data-act="resume"]').focus();
  }

  setMuted(m: boolean): void {
    $(this.pauseMenu, '.mute-label').textContent = m ? 'Tunog: OFF 🔇' : 'Tunog: ON 🔊';
  }

  /** Cheap per-frame update: DOM is only touched when a value changes. */
  setStats(s: RunStats): void {
    const l = this.last;
    if (s.hearts !== l.hearts) {
      this.hearts.querySelectorAll('.heart').forEach((el, i) => {
        const wasFull = el.classList.contains('full');
        const full = i < s.hearts;
        el.classList.toggle('full', full);
        if (wasFull && !full) {
          el.classList.remove('lost');
          void (el as HTMLElement).offsetWidth;
          el.classList.add('lost');
        }
      });
    }
    if (s.score !== l.score) this.score.textContent = s.score.toLocaleString('en-US');
    if (s.coins !== l.coins) this.coins.textContent = String(s.coins);
    const sec = Math.floor(s.time);
    if (sec !== Math.floor(l.time)) this.timer.textContent = formatTime(s.time);
    if (s.multiplier !== l.multiplier) {
      this.mult.hidden = s.multiplier <= 1;
      this.mult.textContent = `x${s.multiplier} combo`;
    }
    this.last = { ...s };
  }

  flashHurt(): void {
    this.hurtFlash.classList.remove('on');
    void this.hurtFlash.offsetWidth;
    this.hurtFlash.classList.add('on');
  }

  /** "+10" style text rising from a screen point. */
  floatText(x: number, y: number, text: string, kind: 'coin' | 'rare' | 'heart' | 'bonus'): void {
    const el = document.createElement('span');
    el.className = `float ${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.floats.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    while (this.floats.childElementCount > 14) this.floats.firstElementChild?.remove();
  }

  showResults(r: RunResult): void {
    $(this.results, '.r-score').textContent = r.score.toLocaleString('en-US');
    $(this.results, '.r-time').textContent = formatTime(r.time);
    $(this.results, '.r-coins').textContent = String(r.coins);
    $(this.results, '.r-best').textContent = r.bestScore.toLocaleString('en-US');
    $(this.results, '.r-wallet').textContent = r.wallet.toLocaleString('en-US');
    $(this.results, '.new-best').hidden = !r.newBest;
    this.results.hidden = false;
    $(this.results, '[data-act="replay"]').focus();
  }

  hideResults(): void {
    this.results.hidden = true;
  }

  get resultsVisible(): boolean {
    return !this.results.hidden;
  }

  showRoom(title: string, subtitle: string): void {
    this.roomToast.innerHTML = `<b>${title}</b><span>${subtitle}</span>`;
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
