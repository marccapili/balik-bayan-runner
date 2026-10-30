import type { SaveManager, UnlockResult } from '../core/SaveManager';
import { HERO_ORDER, HEROES, type HeroId } from '../data/heroes';
import { LEADERBOARD } from '../data/lobby';
import { formatTime } from './Hud';

export interface LobbyCallbacks {
  /** Start a run with the currently selected (owned) hero. */
  onPlay(): void;
  /** Show this hero on the stage (owned or not). */
  onPreview(id: HeroId): void;
  onUnlock(id: HeroId): UnlockResult;
  onToggleMute(): void;
  onToggleReduced(): void;
  onReset(): void;
  onClick(): void;
}

type Panel = 'heroes' | 'leaderboard' | 'settings' | 'profile';

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Lobby element missing: ${sel}`);
  return el;
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number): string => n.toLocaleString('en-US');

/**
 * Home lobby overlay (HTML on top of the 3D stage). Only features that already work are shown;
 * shop, missions, archive, events and achievements join in their milestones.
 */
export class Lobby {
  private readonly root: HTMLElement;
  private readonly sheet: HTMLElement;
  private preview: HeroId;
  private panel: Panel | null = null;
  private resetArmed = 0;
  private toastTimer = 0;

  constructor(
    host: HTMLElement,
    private readonly save: SaveManager,
    private readonly cb: LobbyCallbacks,
  ) {
    this.preview = save.data.selectedHero;
    this.root = document.createElement('div');
    this.root.className = 'lobby';
    this.root.innerHTML = `
      <header class="lb-top">
        <button class="lb-profile" data-act="profile" aria-label="Profile">
          <span class="avatar"></span>
          <span class="pf-text"><b class="pf-name"></b><small class="pf-best"></small></span>
        </button>
        <div class="lb-wallet">
          <span class="money coin" title="Coins"><i></i><b class="w-coins">0</b></span>
          <span class="money gem" title="Hiyas (diamonds)"><i></i><b class="w-gems">0</b></span>
          <button class="icon-btn lb-gear" data-act="settings" aria-label="Settings">⚙</button>
        </div>
      </header>
      <nav class="lb-side lb-left">
        <button class="side-btn" data-act="heroes"><span>🦸</span>Heroes</button>
      </nav>
      <nav class="lb-side lb-right">
        <button class="side-btn" data-act="leaderboard"><span>🏆</span>Top Runs</button>
      </nav>
      <button class="hero-arrow prev" data-act="prev" aria-label="Previous hero">‹</button>
      <button class="hero-arrow next" data-act="next" aria-label="Next hero">›</button>
      <footer class="lb-bottom">
        <div class="hero-card">
          <div class="hc-head"><b class="hc-name"></b><span class="hc-class"></span></div>
          <div class="hc-title"></div>
          <div class="hc-ability"><b class="hc-ab-name"></b> <span class="hc-ab-text"></span> <em>ability arrives next update</em></div>
        </div>
        <button class="play-btn" data-act="play"><span class="pb-label">PLAY</span><small class="pb-sub">Tara, takbo!</small></button>
      </footer>
      <div class="lb-toast" aria-live="polite"></div>
      <div class="sheet overlay" hidden>
        <div class="panel sheet-panel" role="dialog" aria-modal="true">
          <button class="sheet-close icon-btn" data-act="close" aria-label="Close">✕</button>
          <div class="sheet-body"></div>
        </div>
      </div>`;
    host.appendChild(this.root);
    this.sheet = $(this.root, '.sheet');

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = this.root.querySelector<HTMLInputElement>('.nick-input');
      if (!input) return;
      const ok = this.save.setNickname(input.value);
      const msg = $(this.root, '.nick-msg');
      msg.textContent = ok ? 'Saved! ✨' : `${LEADERBOARD.nameMin}–${LEADERBOARD.nameMax} letters/numbers lang, bes.`;
      msg.className = `nick-msg ${ok ? 'ok' : 'bad'}`;
      if (ok) this.refresh();
    });
    this.refresh();
  }

  get previewHero(): HeroId {
    return this.preview;
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('gone', !v);
    if (v) {
      this.preview = this.save.data.selectedHero;
      this.refresh();
    } else {
      this.closePanel();
    }
  }

  /** Lobby UI slides out (PLAY), then is hidden by the caller. */
  playOut(): void {
    this.root.classList.add('leaving');
    window.setTimeout(() => this.root.classList.remove('leaving'), 900);
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const act = el?.dataset.act;
    if (!act || !el) return;
    if (el.hasAttribute('disabled')) return;
    this.cb.onClick();
    const i = HERO_ORDER.indexOf(this.preview);
    switch (act) {
      case 'play':
        if (this.save.data.ownedHeroes.includes(this.preview)) this.cb.onPlay();
        else this.tryUnlock(this.preview);
        break;
      case 'prev':
      case 'next':
        this.showHero(HERO_ORDER[(i + (act === 'next' ? 1 : HERO_ORDER.length - 1)) % HERO_ORDER.length]!);
        break;
      case 'pick':
        this.showHero(el.dataset.hero as HeroId);
        break;
      case 'unlock':
        this.tryUnlock(el.dataset.hero as HeroId);
        break;
      case 'heroes':
      case 'leaderboard':
      case 'settings':
      case 'profile':
        this.openPanel(act);
        break;
      case 'close':
        this.closePanel();
        break;
      case 'mute':
        this.cb.onToggleMute();
        this.renderPanel();
        break;
      case 'reduced':
        this.cb.onToggleReduced();
        this.renderPanel();
        break;
      case 'reset':
        if (performance.now() < this.resetArmed) {
          this.resetArmed = 0;
          this.cb.onReset();
          this.preview = this.save.data.selectedHero;
          this.toast('Fresh start! Na-reset na lahat. 🧹');
          this.refresh();
        } else {
          this.resetArmed = performance.now() + 4000;
          this.renderPanel();
          window.setTimeout(() => this.panel === 'settings' && this.renderPanel(), 4100);
        }
        break;
    }
  }

  /** Puts a hero on the stage; owned heroes also become the selected hero for the next run. */
  private showHero(id: HeroId): void {
    this.preview = id;
    if (this.save.data.ownedHeroes.includes(id)) this.save.selectHero(id);
    this.cb.onPreview(id);
    this.refresh();
  }

  private tryUnlock(id: HeroId): void {
    const r = this.cb.onUnlock(id);
    if (r === 'ok') {
      this.save.selectHero(id);
      this.preview = id;
      this.cb.onPreview(id);
      this.toast(`${HEROES[id].name} unlocked! Let's go! 🎉`);
    } else if (r === 'insufficient') {
      const need = HEROES[id].unlockCost - this.save.data.coins;
      this.toast(`Kulang pa ng ${fmt(need)} coins. Laro pa, bes! 🪙`);
    }
    this.refresh();
  }

  toast(text: string): void {
    const t = $(this.root, '.lb-toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
  }

  /** Re-reads the save and redraws everything visible. */
  refresh(): void {
    const d = this.save.data;
    const r = this.root;
    $(r, '.pf-name').textContent = this.save.displayName;
    $(r, '.pf-best').textContent = `Best: ${fmt(d.bestScore)}`;
    $(r, '.avatar').textContent = this.save.displayName.charAt(0).toUpperCase();
    $(r, '.w-coins').textContent = fmt(d.coins);
    $(r, '.w-gems').textContent = fmt(d.diamonds);

    const h = HEROES[this.preview];
    const owned = d.ownedHeroes.includes(h.id);
    $(r, '.hc-name').textContent = h.name;
    $(r, '.hc-class').textContent = h.heroClass;
    $(r, '.hc-title').textContent = h.title;
    $(r, '.hc-ab-name').textContent = `${h.ability}:`;
    $(r, '.hc-ab-text').textContent = h.abilityBlurb;
    $(r, '.hero-card').dataset.hero = h.id;

    const play = $(r, '.play-btn');
    play.classList.toggle('locked', !owned);
    const affordable = d.coins >= h.unlockCost;
    play.toggleAttribute('disabled', !owned && !affordable);
    $(play, '.pb-label').textContent = owned ? 'PLAY' : `🔒 ${fmt(h.unlockCost)}`;
    $(play, '.pb-sub').textContent = owned ? 'Tara, takbo!' : affordable ? 'Tap para i-unlock' : `Kulang pa ng ${fmt(h.unlockCost - d.coins)} coins`;
    this.renderPanel();
  }

  private openPanel(p: Panel): void {
    this.panel = p;
    this.resetArmed = 0;
    this.sheet.hidden = false;
    this.renderPanel();
    this.sheet.querySelector<HTMLElement>('.sheet-close')?.focus();
  }

  closePanel(): void {
    this.panel = null;
    this.sheet.hidden = true;
  }

  get openPanelName(): Panel | null {
    return this.panel;
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const body = $(this.sheet, '.sheet-body');
    const d = this.save.data;
    switch (this.panel) {
      case 'heroes':
        body.innerHTML = `<h2>Heroes</h2><p>Pumili ng bayani. Unlock gamit ang coins mula sa runs.</p>
          <div class="hero-grid">${HERO_ORDER.map((id) => {
            const h = HEROES[id];
            const own = d.ownedHeroes.includes(id);
            const sel = d.selectedHero === id;
            const btn = own
              ? `<button class="btn ${sel ? 'primary' : ''}" data-act="pick" data-hero="${id}">${sel ? 'Selected ✓' : 'Select'}</button>`
              : `<button class="btn primary" data-act="unlock" data-hero="${id}" ${d.coins < h.unlockCost ? 'disabled' : ''}>🔒 Unlock · ${fmt(h.unlockCost)} 🪙</button>`;
            return `<div class="hero-tile ${own ? '' : 'is-locked'} ${sel ? 'is-sel' : ''}">
              <span class="hero-dot" data-hero="${id}"></span>
              <b>${esc(h.name)}</b><small>${esc(h.heroClass)} · ${esc(h.ability)}</small>${btn}
              <button class="link" data-act="pick" data-hero="${id}">Preview</button></div>`;
          }).join('')}</div>`;
        break;
      case 'leaderboard': {
        const rows = d.leaderboard
          .map(
            (e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${fmt(e.score)}</td><td>${formatTime(e.time)}</td><td>${esc(HEROES[e.hero].name)}</td><td>${esc(e.date)}</td></tr>`,
          )
          .join('');
        body.innerHTML = `<h2>Top Runs 🏆</h2><p>Saved sa device na 'to lang (hindi online).</p>
          ${rows ? `<div class="table-wrap"><table class="lb-table"><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Oras</th><th>Hero</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">Wala pang runs. Ikaw na ang mauna! 🏃</p>'}`;
        break;
      }
      case 'settings': {
        const armed = performance.now() < this.resetArmed;
        body.innerHTML = `<h2>Settings ⚙</h2>
          <button class="btn toggle" data-act="mute">Sound effects: <b>${d.settings.muted ? 'OFF 🔇' : 'ON 🔊'}</b></button>
          <button class="btn toggle" data-act="reduced">Reduced effects: <b>${d.settings.reducedEffects ? 'ON' : 'OFF'}</b><small>Less particles, walang camera shake</small></button>
          <button class="btn danger" data-act="reset">${armed ? 'Sure ka? Tap ulit para i-reset 😬' : 'Reset progress 🧹'}</button>`;
        break;
      }
      case 'profile':
        body.innerHTML = `<h2>Profile</h2>
          <form class="nick-form"><label for="nick">Nickname (para sa Top Runs)</label>
            <div class="nick-row"><input id="nick" class="nick-input" maxlength="${LEADERBOARD.nameMax}" autocomplete="off" value="${esc(d.nickname)}" placeholder="Bagong Bayani" />
            <button class="btn primary" type="submit">Save</button></div><p class="nick-msg"></p></form>
          <dl class="stats"><div><dt>Runs</dt><dd>${fmt(d.runs)}</dd></div><div><dt>Best score</dt><dd>${fmt(d.bestScore)}</dd></div>
          <div><dt>Best oras</dt><dd>${formatTime(d.bestTime)}</dd></div><div><dt>Heroes</dt><dd>${d.ownedHeroes.length}/${HERO_ORDER.length}</dd></div></dl>`;
        break;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
