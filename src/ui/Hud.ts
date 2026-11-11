import { icon } from './icons';
import { BAYBAYIN_CHART } from '../data/baybayinChart';
import { GADGET_INFO, type GadgetKind } from '../data/gadgets';
import { gadgetIconUrl } from './gadgetArt';
import type { Exhibit } from '../data/exhibits';
import { HEALTH } from '../data/gameplay';
import { esc, exhibitHtml } from './exhibitHtml';
import { formatTime } from '../utils/format';

export interface HudCallbacks {
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onReplay(): void;
  onLobby(): void;
  onDrop(): void;
  onAbility(): void;
  onGadget(): void;
  onTipOk(): void;
  /** The objective card was closed (button or a tap anywhere on it). */
  onObjectiveOk(): void;
  onToggleMute(): void;
  /** Exhibit prompt tapped (same as E). */
  onInteract(): void;
  onCloseExhibit(): void;
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
  /** Mission descriptions completed by this run. */
  missions: string[];
  /** Daily task descriptions completed by this run. */
  daily: string[];
  cleared: number;
  total: number;
  /** Seconds survived in Endless Mode (0 = never reached it). */
  endlessTime: number;
  heroName: string;
  hero: { from: number; to: number; xp: number; diamonds: number };
  player: { from: number; to: number; xp: number; diamonds: number };
}

/** What clearing an exhibit paid (shown on the reading panel). */
export interface ExhibitReward {
  points: number;
  coins: number;
  diamonds: number;
}

export type PromptMode = 'new' | 'cleared' | 'needId' | 'practice';

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`HUD element missing: ${sel}`);
  return el;
};

export { formatTime };

/** HTML overlay for the in-run HUD, pause menu and results. Every button here does something. */
/** In-run buttons that must work while another finger holds the joystick (multi-touch). */
const TOUCH_DOWN_ACTS = new Set(['ability', 'gadget', 'interact', 'drop', 'pause']);

/** Restarts the little "pop" on a HUD number when it goes up. */
function bump(el: HTMLElement): void {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

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
  private readonly abilityBtn: HTMLElement;
  private readonly exPrompt: HTMLElement;
  private readonly exPanel: HTMLElement;
  private exPromptId: string | null = null;
  private progressKey = '';
  private abilityKey = '';
  private gadgetKey = '';
  private last: RunStats = { hearts: -1, score: -1, coins: -1, time: -1, multiplier: -1 };
  private toastTimer = 0;
  /** A big banner owns the toast until then (ms); small toasts wait their turn. */
  private bannerUntil = 0;
  private pendingToast: [string, string] | null = null;
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
          <div class="ex-progress"><span class="exp-chip" aria-label="Exhibits cleared">🏛 <b class="exp-n">0</b>/<span class="exp-t">15</span></span><span class="id-chip" hidden title="Curator ID">🪪</span></div>
        </div>
        <div class="timer" aria-label="Survival time">0:00</div>
        <div class="hud-right">
          <span class="fps" hidden></span>
          <span class="coin-chip" aria-label="Coins this run"><span class="coin-icon"></span><b class="coins">0</b></span>
          <button class="icon-btn" data-act="pause" aria-label="Pause">❚❚</button>
        </div>
      </div>
      <div class="train-tag" hidden>🎯 TRAINING <span class="tt-hero"></span>
        <small>Walang guards o coins. Practice lang!</small>
        <button class="btn" data-act="lobby">Exit ✕</button></div>
      <button class="drop-prompt" data-act="drop" hidden>
        <span class="dp-big">TAP TO DROP</span>
        <span class="dp-small"><span class="hint-desktop">Click / Space / WASD</span><span class="hint-touch">Tap kahit saan</span> para bumaba ⬇</span>
      </button>
      <button class="gadget-btn empty" data-act="gadget" aria-label="Gadget slot (empty)">
        <img class="gd-icon" alt="" hidden /><span class="gd-empty">🎒</span><span class="gd-key">Q</span>
      </button>
      <div class="gadget-fx" aria-live="polite"></div>
      <button class="ability-btn" data-act="ability" aria-label="Use ability">
        <span class="ab-icon"></span><span class="ab-lock">${icon('lock')}</span><span class="ab-name"></span><span class="ab-key">Space</span>
      </button>
      <button class="exhibit-prompt" data-act="interact" hidden>
        <span class="ep-icon">📖</span>
        <span class="ep-text"><span class="ep-action"></span>
        <small class="ep-title"></small></span>
      </button>
      <div class="room-toast" aria-live="polite"></div>
      <div class="tip-card" role="status" hidden><span class="tip-icon"></span><span class="tip-text"><b class="tip-title"></b><span class="tip-body"></span></span><button class="tip-ok" data-act="tipOk">Gets! ✓</button></div>
      <div class="objective" role="dialog" aria-modal="true" aria-labelledby="obj-title" hidden>
        <div class="obj-card">
          <div class="obj-kicker"></div>
          <h2 class="obj-title" id="obj-title"></h2>
          <p class="obj-body"></p>
          <div class="obj-count">🏛 <b class="obj-n">0</b>/<span class="obj-t">15</span> exhibits</div>
          <button class="btn primary obj-go" data-act="objectiveOk"></button>
        </div>
      </div>
      <div class="slowmo-tint" aria-hidden="true"></div>
      <div class="hint">
        <span class="hint-desktop"><b>WASD</b> para tumakbo · <b>Space</b> ability · <b>Q</b> gadget · iwasan ang guard 👮 · <b>Esc</b> pause</span>
        <span class="hint-touch">Drag sa left para tumakbo · tap ang ability ⚡ o gadget 🎒</span>
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
      <div class="exhibit-panel overlay" hidden>
        <div class="panel ex-panel" role="dialog" aria-modal="true" aria-label="History exhibit">
          <div class="ex-status"></div>
          <div class="ex-body"></div>
          <button class="btn primary" data-act="closeExhibit">Balik sa takbo ▶ <small class="hint-desktop">(E / Esc)</small></button>
          <p class="ex-paused">⏸ Naka-pause ang habulan habang nagbabasa ka.</p>
        </div>
      </div>
      <div class="results overlay" hidden>
        <div class="panel">
          <h2>Huli ka, bes! 😵</h2>
          <p class="res-sub">Na-escort ka palabas ng museo. Babawi tayo!</p>
          <div class="new-best" hidden>🏆 NEW BEST! Sheesh!</div>
          <div class="res-cols">
            <div class="res-main">
              <dl class="stats">
                <div><dt>Score</dt><dd class="r-score">0</dd></div>
                <div><dt>Oras</dt><dd class="r-time">0:00</dd></div>
                <div><dt>Coins</dt><dd class="r-coins">0</dd></div>
                <div><dt>Exhibits</dt><dd class="r-exhibits">0/15</dd></div>
              </dl>
              <p class="r-best-line">Best: <b class="r-best">0</b></p>
              <p class="wallet">Wallet mo: <b class="r-wallet">0</b> coins</p>
            </div>
            <div class="res-side">
              <ul class="r-levels"></ul>
              <ul class="r-missions" hidden></ul>
              <button class="btn primary" data-act="replay">Laro ulit! 🔁</button>
              <button class="btn" data-act="lobby">Lobby 🏠</button>
            </div>
          </div>
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
    this.abilityBtn = $(this.root, '.ability-btn');
    this.exPrompt = $(this.root, '.exhibit-prompt');
    this.exPanel = $(this.root, '.exhibit-panel');

    // Touch: in-run buttons fire on pointerdown. Phones send no `click` for a second finger while
    // the joystick thumb is down, so waiting for click made skill / gadget / interact dead mid-run.
    let touchFired = '';
    let touchFiredAt = 0;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!act || !TOUCH_DOWN_ACTS.has(act)) return;
      e.preventDefault();
      touchFired = act;
      touchFiredAt = performance.now();
      run(act);
    });
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      // The click that trails a touch already handled on pointerdown.
      if (act && act === touchFired && performance.now() - touchFiredAt < 800) {
        touchFired = '';
        return;
      }
      if (act) run(act);
    });
    const run = (act: string): void => {
      if (act === 'pause') cb.onPause();
      else if (act === 'resume') cb.onResume();
      else if (act === 'restart') cb.onRestart();
      else if (act === 'replay') cb.onReplay();
      else if (act === 'lobby') cb.onLobby();
      else if (act === 'drop') cb.onDrop();
      else if (act === 'ability') cb.onAbility();
      else if (act === 'gadget') cb.onGadget();
      else if (act === 'tipOk') cb.onTipOk();
      else if (act === 'objectiveOk') cb.onObjectiveOk();
      else if (act === 'mute') cb.onToggleMute();
      else if (act === 'interact') cb.onInteract();
      else if (act === 'closeExhibit') cb.onCloseExhibit();
    };
    // A tap anywhere on the objective card closes it (not only the button).
    $(this.root, '.objective').addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('[data-act]')) cb.onObjectiveOk();
    });
    if (new URLSearchParams(location.search).has('debug')) this.fps.hidden = false;
  }

  /** The run's objective card (null hides it); the exhibit chip pulses as it closes. */
  showObjective(o: { kicker: string; title: string; body: string; button: string; cleared: number; total: number } | null): void {
    const el = $(this.root, '.objective');
    if (!o) {
      if (!el.hidden) {
        const chip = $(this.root, '.exp-chip');
        chip.classList.remove('pulse');
        void chip.offsetWidth;
        chip.classList.add('pulse');
      }
      el.hidden = true;
      return;
    }
    $(el, '.obj-kicker').textContent = o.kicker;
    $(el, '.obj-title').textContent = o.title;
    $(el, '.obj-body').textContent = o.body;
    $(el, '.obj-n').textContent = String(o.cleared);
    $(el, '.obj-t').textContent = String(o.total);
    $(el, '.obj-go').textContent = o.button;
    el.hidden = false;
    $<HTMLButtonElement>(el, '.obj-go').focus({ preventScroll: true });
  }

  get objectiveOpen(): boolean {
    return !$(this.root, '.objective').hidden;
  }

  private tipKey = '';

  /** First-run coach card (null hides it). */
  showTip(tip: { id: string; icon: string; title: string; body: string } | null): void {
    const key = tip?.id ?? '';
    if (key === this.tipKey) return;
    this.tipKey = key;
    const card = $(this.root, '.tip-card');
    card.hidden = !tip;
    if (!tip) return;
    $(card, '.tip-icon').textContent = tip.icon;
    $(card, '.tip-title').textContent = tip.title;
    $(card, '.tip-body').textContent = tip.body;
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  }

  setFpsVisible(on: boolean): void {
    this.fps.hidden = !on && !new URLSearchParams(location.search).has('debug');
  }

  toggleFps(): void {
    this.fps.hidden = !this.fps.hidden;
  }

  /** 'off' = lobby, 'intro' = cinematic (stats hidden), 'play' = full HUD, 'training' = practice HUD. */
  setMode(mode: 'off' | 'intro' | 'play' | 'training', trainingHero = ''): void {
    this.root.dataset.mode = mode;
    const tag = $(this.root, '.train-tag');
    tag.hidden = mode !== 'training';
    $(tag, '.tt-hero').textContent = trainingHero ? `· ${trainingHero}` : '';
    if (mode !== 'intro') this.showDrop(false);
    if (mode === 'off' || mode === 'intro') {
      this.setExhibitPrompt(null);
      this.hideExhibit();
    }
  }

  /** Context prompt near an exhibit (null hides it). DOM only changes when the exhibit changes. */
  setExhibitPrompt(e: Exhibit | null, mode: PromptMode = 'new'): void {
    const id = e ? `${e.id}|${mode}` : null;
    if (id === this.exPromptId) return;
    this.exPromptId = id;
    this.exPrompt.hidden = !e;
    if (!e) return;
    this.exPrompt.dataset.kind = e.kind;
    this.exPrompt.dataset.mode = mode;
    $(this.exPrompt, '.ep-icon').textContent = mode === 'needId' ? '🪪' : e.icon;
    const key = '<span class="hint-desktop"><b>E</b> · </span>';
    $(this.exPrompt, '.ep-action').innerHTML =
      mode === 'needId'
        ? 'Kailangan ng Curator ID! Hanapin muna 🪪'
        : mode === 'cleared'
          ? `${key}Basahin ulit 📖`
          : mode === 'practice'
            ? `${key}Practice mini-game 🎮`
            : `${key}Mini-game para ma-unlock! 🎮`;
    $(this.exPrompt, '.ep-title').innerHTML = `${esc(e.title)}${mode === 'cleared' ? ' · ✓ cleared' : ''}`;
  }

  /** Prompt at the Library's baybayin chart (reuses the exhibit prompt chip). */
  setChartPrompt(): void {
    if (this.exPromptId === 'chart') return;
    this.exPromptId = 'chart';
    this.exPrompt.hidden = false;
    this.exPrompt.dataset.kind = 'artifact';
    this.exPrompt.dataset.mode = 'chart';
    $(this.exPrompt, '.ep-icon').textContent = BAYBAYIN_CHART.icon;
    $(this.exPrompt, '.ep-action').innerHTML = '<span class="hint-desktop"><b>E</b> · </span>Pag-aralan ang chart 📜';
    $(this.exPrompt, '.ep-title').textContent = `${BAYBAYIN_CHART.title} · para sa Baybayin exhibit`;
  }

  /** Exhibit Mode counter (or the Endless badge) + Curator ID chip. */
  setExhibitProgress(cleared: number, total: number, endless: boolean, hasId: boolean): void {
    const key = `${cleared}|${total}|${endless}|${hasId}`;
    if (key === this.progressKey) return;
    this.progressKey = key;
    const chip = $(this.root, '.exp-chip');
    chip.classList.toggle('endless', endless);
    chip.innerHTML = endless ? '♾️ <b>ENDLESS</b>' : `🏛 <b class="exp-n">${cleared}</b>/${total}`;
    $(this.root, '.id-chip').hidden = !hasId || endless;
  }

  /** Big centre banner (Museum Cleared!, level ups). */
  banner(title: string, subtitle: string, seconds = 3.2): void {
    this.roomToast.innerHTML = `<b>${title}</b><span>${subtitle}</span>`;
    this.roomToast.classList.remove('show');
    this.roomToast.classList.add('big');
    void this.roomToast.offsetWidth;
    this.roomToast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.bannerUntil = performance.now() + seconds * 1000;
    this.toastTimer = window.setTimeout(() => {
      this.roomToast.classList.remove('show', 'big');
      this.bannerUntil = 0;
      const next = this.pendingToast;
      this.pendingToast = null;
      if (next) window.setTimeout(() => this.showRoom(...next), 250);
    }, seconds * 1000);
  }

  get exhibitPromptVisible(): boolean {
    return !this.exPrompt.hidden;
  }

  /** Reading panel. `points` > 0 = first read this run; `isNew` = just added to the Archive. */
  showExhibit(e: Exhibit, reward: ExhibitReward | null, isNew: boolean): void {
    const status = [
      reward && reward.points > 0 ? `<span class="ex-chip gold">+${reward.points} score</span>` : '',
      reward && reward.coins > 0 ? `<span class="ex-chip gold">+${reward.coins} 🪙</span>` : '',
      reward && reward.diamonds > 0 ? `<span class="ex-chip gem">+${reward.diamonds} 💎 milestone!</span>` : '',
      isNew ? '<span class="ex-chip">📜 Bago sa Archive!</span>' : '',
    ].join('');
    $(this.exPanel, '.ex-status').innerHTML = status;
    $(this.exPanel, '.ex-body').innerHTML = exhibitHtml(e);
    this.exPanel.hidden = false;
    $(this.exPanel, '.ex-body').scrollTop = 0;
    $(this.exPanel, '[data-act="closeExhibit"]').focus();
  }

  /** The baybayin study chart in the exhibit panel (the run is frozen in `reading`). */
  showChart(): void {
    const c = BAYBAYIN_CHART;
    const cell = (g: { glyph: string; sound: string }): string => `<div class="bc-cell"><span class="bc-glyph">${g.glyph}</span><b>${esc(g.sound)}</b></div>`;
    $(this.exPanel, '.ex-status').innerHTML = '<span class="ex-chip">⏸ Naka-freeze ang laro habang nag-aaral</span>';
    $(this.exPanel, '.ex-body').innerHTML = `<article class="exhibit bchart" data-kind="artifact">
      <header class="ex-head"><div class="ex-icon bc-icon" aria-hidden="true">${c.icon}</div>
        <div><span class="ex-kind">📜 Study chart</span><h2>${esc(c.title)}</h2><p class="ex-era">Kabisaduhin bago ang Baybayin Match!</p></div></header>
      <div class="bc-grid">${c.glyphs.map(cell).join('')}</div>
      <p class="ex-p">${esc(c.note)}</p>
      <div class="bc-grid bc-kudlit">${c.kudlit.map(cell).join('')}</div>
    </article>`;
    this.exPanel.hidden = false;
    $(this.exPanel, '.ex-body').scrollTop = 0;
    $(this.exPanel, '[data-act="closeExhibit"]').focus();
  }

  hideExhibit(): void {
    this.exPanel.hidden = true;
  }

  get exhibitVisible(): boolean {
    return !this.exPanel.hidden;
  }

  showDrop(v: boolean): void {
    this.dropPrompt.hidden = !v;
  }

  get dropVisible(): boolean {
    return !this.dropPrompt.hidden;
  }

  setPaused(p: boolean): void {
    this.pauseMenu.hidden = !p;
    // The prompt sits above the HUD layer; never let it cover the pause menu.
    if (p) this.setExhibitPrompt(null);
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
    if (s.score !== l.score) {
      this.score.textContent = s.score.toLocaleString('en-US');
      if (s.score > l.score) bump(this.score);
    }
    if (s.coins !== l.coins) {
      this.coins.textContent = String(s.coins);
      if (s.coins > l.coins) bump(this.coins.parentElement ?? this.coins);
    }
    const sec = Math.floor(s.time);
    if (sec !== Math.floor(l.time)) this.timer.textContent = formatTime(s.time);
    if (s.multiplier !== l.multiplier) {
      this.mult.hidden = s.multiplier <= 1;
      this.mult.textContent = `x${s.multiplier} combo`;
    }
    this.last = { ...s };
  }

  /** Which ability the button shows (icon + short name). */
  setAbility(icon: string, name: string): void {
    $(this.abilityBtn, '.ab-icon').textContent = icon;
    $(this.abilityBtn, '.ab-name').textContent = name;
    this.abilityBtn.setAttribute('aria-label', `Use ability: ${name}`);
  }

  /** Cooldown ring (`frac` 1 = ready) and active glow. DOM only changes when the rounded state does. */
  setAbilityState(frac: number, active: boolean, secondsLeft: number, lockedUntil = 0): void {
    const key = `${Math.round(frac * 100)}|${active}|${Math.ceil(secondsLeft)}|${lockedUntil}`;
    if (key === this.abilityKey) return;
    this.abilityKey = key;
    const b = this.abilityBtn;
    b.classList.toggle('locked', lockedUntil > 0);
    if (lockedUntil > 0) {
      b.style.setProperty('--cd', '0');
      b.classList.remove('ready', 'active', 'long');
      b.dataset.left = `Lv ${lockedUntil}`;
      return;
    }
    b.style.setProperty('--cd', String(frac));
    b.classList.toggle('ready', frac >= 1);
    b.classList.toggle('active', active);
    const s = Math.ceil(secondsLeft);
    b.dataset.left = frac >= 1 ? '' : s >= 60 ? formatTime(s) : String(s);
    b.classList.toggle('long', frac < 1 && s >= 60);
  }

  /** Gadget slot (held gadget or empty) + chips for the gadget effects running right now. */
  setGadget(held: GadgetKind | null, active: { kind: GadgetKind; left: number }[]): void {
    const key = `${held}|${active.map((a) => `${a.kind}${Math.ceil(a.left)}`).join(',')}`;
    if (key === this.gadgetKey) return;
    this.gadgetKey = key;
    const b = $(this.root, '.gadget-btn');
    const img = $(b, '.gd-icon') as HTMLImageElement;
    b.classList.toggle('empty', !held);
    b.dataset.kind = held ?? '';
    img.hidden = !held;
    if (held) img.src = gadgetIconUrl(held);
    b.setAttribute('aria-label', held ? `Use gadget: ${GADGET_INFO[held].name}` : 'Gadget slot (empty)');
    $(this.root, '.gadget-fx').innerHTML = active
      .map((a) => `<span class="gfx-chip" data-kind="${a.kind}"><img src="${gadgetIconUrl(a.kind)}" alt="" />${a.left > 0 ? `${Math.ceil(a.left)}s` : '✓'}</span>`)
      .join('');
  }

  /** Shake the gadget slot (pressed while empty). */
  gadgetDenied(): void {
    const b = $(this.root, '.gadget-btn');
    b.classList.remove('denied');
    void b.offsetWidth;
    b.classList.add('denied');
  }

  /** Little shake when the button is pressed on cooldown. */
  abilityDenied(): void {
    this.abilityBtn.classList.remove('denied');
    void this.abilityBtn.offsetWidth;
    this.abilityBtn.classList.add('denied');
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

  /** Score reveal: quick ease-out count-up (instant with reduced effects). */
  private countUp(el: HTMLElement, to: number): void {
    el.dataset.value = String(to);
    const fmtN = (n: number): string => n.toLocaleString('en-US');
    if (document.body.classList.contains('reduced-fx') || to <= 0) {
      el.textContent = fmtN(to);
      return;
    }
    const t0 = performance.now();
    const dur = 900;
    const tick = (): void => {
      if (el.dataset.value !== String(to)) return; // a newer result took over
      const k = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = fmtN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  }

  showResults(r: RunResult): void {
    this.countUp($(this.results, '.r-score'), r.score);
    $(this.results, '.r-time').textContent = formatTime(r.time);
    $(this.results, '.r-coins').textContent = String(r.coins);
    $(this.results, '.r-best').textContent = r.bestScore.toLocaleString('en-US');
    $(this.results, '.r-exhibits').textContent = `${r.cleared}/${r.total}`;
    const lv: string[] = [];
    if (r.endlessTime > 0) lv.push(`<li class="endless">♾️ Museum cleared! Endless: ${formatTime(r.endlessTime)}</li>`);
    const up = (who: string, l: RunResult['hero']): string =>
      l.to > l.from ? `<li class="up">⬆️ ${who} <b>Lv ${l.to}</b>! <small>+${l.xp} XP${l.diamonds ? ` · +${l.diamonds} 💎` : ''}</small></li>` : `<li>${who} Lv ${l.to} <small>+${l.xp} XP</small></li>`;
    lv.push(up(esc(r.heroName), r.hero), up('Player', r.player));
    $(this.results, '.r-levels').innerHTML = lv.join('');
    $(this.results, '.r-wallet').textContent = r.wallet.toLocaleString('en-US');
    $(this.results, '.new-best').hidden = !r.newBest;
    const ms = $(this.results, '.r-missions');
    ms.hidden = r.missions.length + r.daily.length === 0;
    ms.innerHTML = [
      ...r.missions.map((m) => `<li>✅ Mission done: ${esc(m)} <small>(claim XP sa lobby)</small></li>`),
      ...r.daily.map((m) => `<li>📅 Daily done: ${esc(m)} <small>(claim coins sa lobby)</small></li>`),
    ].join('');
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
    if (performance.now() < this.bannerUntil) {
      this.pendingToast = [title, subtitle];
      return;
    }
    this.roomToast.classList.remove('big');
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
