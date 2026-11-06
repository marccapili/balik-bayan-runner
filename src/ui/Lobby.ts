import type { SaveManager, ShopResult, UnlockResult } from '../core/SaveManager';
import { ABILITIES } from '../data/abilities';
import { exhibitAsset, exhibitPhoto } from '../data/exhibitPhotos';
import { EXHIBIT_BY_ID, EXHIBITS, FICTION_NOTE, KIND_LABEL } from '../data/exhibits';
import { HERO_ORDER, HEROES, type HeroId } from '../data/heroes';
import { LEADERBOARD } from '../data/lobby';
import { ROOMS } from '../data/museumLayout';
import { GALLERY_UI } from '../data/gallery';
import '../ui/gallery.css';
import { HERO_LEVEL, PLAYER_LEVEL, PROFILE_FRAMES, type ProfileFrame } from '../data/progression';
import { SKIN_BY_ID, SKINS, type SkinDef } from '../data/skins';
import { describe, isDone } from '../gameplay/Missions';
import { abilityCooldown, describeDaily, heroLevelProgress, heroPerks, playerLevelProgress, secondsToMidnight } from '../gameplay/Progression';
import { formatTime } from '../utils/format';
import { esc, exhibitHtml } from './exhibitHtml';
import { PORTRAIT } from './portraits';

export interface LobbyCallbacks {
  /** Start a run with the selected (owned) hero. */
  onPlay(): void;
  /** Practice room with this hero (owned or not): no guards, no coins, short cooldown. */
  onTrain(id: HeroId): void;
  /** Show this hero on the stage, optionally in a specific skin (try-on). */
  onPreview(id: HeroId, skin?: string): void;
  onUnlock(id: HeroId): UnlockResult;
  /** Any wallet / reward change — plays the right sound. */
  onPurchase(kind: 'skin' | 'claim' | 'daily' | 'frame'): void;
  onToggleMute(): void;
  onToggleReduced(): void;
  /** Any other setting changed from the Settings panel (already saved by the caller). */
  onSetting(key: 'musicVolume' | 'sfxVolume' | 'quality' | 'showFps' | 'largeText' | 'tutorial', value: number | string | boolean): void;
  onReset(): void;
  onClick(): void;
  /** Settings → watch the opening lore cutscene again. */
  onReplayLore(): void;
  /** Event banner → the Future Heroes Gallery (classmates' works). */
  onGallery(): void;
}

type Panel = 'leaderboard' | 'settings' | 'profile' | 'missions' | 'daily' | 'archive';
type Tab = 'heroes' | 'skins';
type Filter = 'all' | 'owned' | 'locked';

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Lobby element missing: ${sel}`);
  return el;
};

/** The gallery banner shows NEW until it's been opened once on this device (not part of the save). */
const GALLERY_SEEN_KEY = 'bbr-gallery-visited';
function galleryVisited(): boolean {
  try {
    return localStorage.getItem(GALLERY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markGalleryVisited(): void {
  try {
    localStorage.setItem(GALLERY_SEEN_KEY, '1');
  } catch {
    /* private mode: the badge just stays */
  }
}

const fmt = (n: number): string => n.toLocaleString('en-US');

/** Inline CSS vars for a profile frame (rendered by `.pframe` in styles.css). */
export const frameStyle = (f: ProfileFrame): string => `--fa:${f.a};--fb:${f.b}`;

const bar = (into: number, need: number): string => `<span class="xpbar"><i style="width:${need > 0 ? Math.min(100, (into / need) * 100) : 100}%"></i></span>`;

/**
 * Home lobby overlay (HTML on top of the 3D stage). Heroes and skins are chosen in the Collection
 * (shop) screen; the lobby shows the selected hero, levels, missions and daily tasks.
 */
export class Lobby {
  private readonly root: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly col: HTMLElement;
  private panel: Panel | null = null;
  private tab: Tab = 'heroes';
  private filter: Filter = 'all';
  /** Collection detail view: a hero id or a skin id (null = the grid). */
  private detail: { kind: 'hero' | 'skin'; id: string } | null = null;
  private reading: string | null = null;
  private resetArmed = 0;
  private toastTimer = 0;
  private clockTimer = 0;

  constructor(
    host: HTMLElement,
    private readonly save: SaveManager,
    private readonly cb: LobbyCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'lobby';
    this.root.innerHTML = `
      <header class="lb-top">
        <button class="lb-profile" data-act="profile" aria-label="Profile">
          <span class="pframe avatar"><img alt="" /></span>
          <span class="pf-text"><b class="pf-name"></b><small class="pf-level"></small><span class="pf-bar"></span></span>
        </button>
        <div class="lb-wallet">
          <span class="money coin" title="Coins"><i></i><b class="w-coins">0</b></span>
          <span class="money gem" title="Diamonds (Hiyas)"><i></i><b class="w-gems">0</b></span>
          <button class="icon-btn lb-gear" data-act="settings" aria-label="Settings">⚙</button>
        </div>
      </header>
      <button class="gl-banner" data-act="gallery">
        <span class="gb-ico">🏛️</span>
        <span><b>${GALLERY_UI.bannerTitle}</b><small>${GALLERY_UI.bannerSub}</small></span>
        <span class="gb-new" hidden>NEW</span>
      </button>
      <nav class="lb-side lb-left">
        <button class="side-btn" data-act="collection" data-tab="heroes"><span>🛍️</span>Shop</button>
        <button class="side-btn" data-act="archive"><span>📜</span>Archive<b class="arch-count"></b></button>
      </nav>
      <nav class="lb-side lb-right">
        <button class="side-btn" data-act="leaderboard"><span>🏆</span>Top Runs</button>
        <button class="side-btn" data-act="missions"><span>🎯</span>Missions<b class="badge m-badge" hidden></b></button>
        <button class="side-btn" data-act="daily"><span>📅</span>Daily<b class="badge d-badge" hidden></b></button>
      </nav>
      <footer class="lb-bottom">
        <div class="hero-card">
          <div class="hc-head"><b class="hc-name"></b><span class="hc-class"></span><span class="hc-level"></span></div>
          <div class="hc-title"></div>
          <div class="hc-xp"></div>
          <div class="hc-ability"><span class="hc-ab-icon"></span> <b class="hc-ab-name"></b> <span class="hc-ab-text"></span></div>
          <button class="link hc-change" data-act="collection" data-tab="heroes">Palitan ang hero ›</button>
        </div>
        <div class="lb-actions">
          <button class="train-btn" data-act="train"><span>🎯 Training</span><small>Try muna, libre!</small></button>
          <button class="play-btn" data-act="play"><span class="pb-label">PLAY</span><small class="pb-sub">Tara, takbo!</small></button>
        </div>
      </footer>
      <div class="lb-toast" aria-live="polite"></div>
      <div class="collection" hidden>
        <aside class="col-tabs">
          <h2>Shop</h2>
          <button class="col-tab" data-act="tab" data-tab="heroes">🦸 <span>Heroes</span></button>
          <button class="col-tab" data-act="tab" data-tab="skins">👕 <span>Skins</span></button>
        </aside>
        <section class="col-main">
          <header class="col-head">
            <div class="col-filters">
              <button class="chip" data-act="filter" data-f="all">Lahat</button>
              <button class="chip" data-act="filter" data-f="owned">Owned</button>
              <button class="chip" data-act="filter" data-f="locked">Locked</button>
            </div>
            <div class="col-wallet"><span class="money coin"><i></i><b class="cw-coins"></b></span><span class="money gem"><i></i><b class="cw-gems"></b></span></div>
            <button class="icon-btn" data-act="closeCollection" aria-label="Close shop">✕</button>
          </header>
          <div class="col-grid"></div>
        </section>
        <div class="col-detail" hidden><div class="cd-card panel"></div></div>
      </div>
      <div class="sheet overlay" hidden>
        <div class="panel sheet-panel" role="dialog" aria-modal="true">
          <button class="sheet-close icon-btn" data-act="close" aria-label="Close">✕</button>
          <div class="sheet-body"></div>
        </div>
      </div>`;
    host.appendChild(this.root);
    this.sheet = $(this.root, '.sheet');
    this.col = $(this.root, '.collection');

    this.root.addEventListener('click', (e) => this.onClick(e));
    // Volume sliders: live while dragging.
    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.vol === 'music' || el.dataset.vol === 'sfx') {
        const v = Number(el.value) / 100;
        this.cb.onSetting(el.dataset.vol === 'music' ? 'musicVolume' : 'sfxVolume', v);
        const out = el.parentElement?.querySelector('output');
        if (out) out.textContent = `${el.value}%`;
      }
    });
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

  /** The hero shown on the stage = the selected hero. */
  get previewHero(): HeroId {
    return this.save.data.selectedHero;
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('gone', !v);
    $(this.root, '.gb-new').hidden = galleryVisited();
    if (v) {
      this.save.ensureDaily();
      this.refresh();
    } else {
      this.closePanel();
      this.closeCollection();
    }
  }

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
    const d = this.save.data;
    switch (act) {
      case 'play':
        this.cb.onPlay();
        break;
      case 'gallery':
        markGalleryVisited();
        this.cb.onGallery();
        break;
      case 'train':
        this.cb.onTrain(el.dataset.hero ? (el.dataset.hero as HeroId) : d.selectedHero);
        break;
      case 'collection':
        this.openCollection((el.dataset.tab as Tab) ?? 'heroes');
        break;
      case 'closeCollection':
        this.closeCollection();
        break;
      case 'tab':
        this.tab = el.dataset.tab as Tab;
        this.detail = null;
        this.renderCollection();
        break;
      case 'filter':
        this.filter = el.dataset.f as Filter;
        this.renderCollection();
        break;
      case 'detail':
        this.detail = { kind: el.dataset.kind as 'hero' | 'skin', id: el.dataset.id ?? '' };
        this.renderCollection();
        break;
      case 'detailBack':
        this.detail = null;
        this.renderCollection();
        break;
      case 'use': {
        const id = el.dataset.hero as HeroId;
        if (this.save.selectHero(id)) {
          this.cb.onPreview(id);
          this.toast(`${HEROES[id].name} na ang gamit mo! 🔥`);
        }
        this.refresh();
        break;
      }
      case 'unlock':
        this.tryUnlock(el.dataset.hero as HeroId);
        break;
      case 'try': {
        const s = SKIN_BY_ID[el.dataset.skin ?? ''];
        if (s) {
          this.closeCollection();
          this.cb.onPreview(s.hero, s.id);
          this.toast(`Preview: ${s.name} 👀 (balik sa Shop para bilhin)`);
        }
        break;
      }
      case 'buy':
        this.buySkin(el.dataset.skin ?? '');
        break;
      case 'equip': {
        const s = SKIN_BY_ID[el.dataset.skin ?? ''];
        if (s && this.save.equipSkin(s.id)) {
          if (d.selectedHero === s.hero) this.cb.onPreview(s.hero, s.id);
          this.toast(`${s.name} equipped! ✨`);
        }
        this.refresh();
        break;
      }
      case 'claim': {
        const r = this.save.claimMission(Number(el.dataset.seq));
        if (r) {
          this.cb.onPurchase('claim');
          this.toast(r.to > r.from ? `+${r.xp} XP · LEVEL UP! Lv ${r.to} (+${r.diamonds} 💎) 🎉` : `+${r.xp} XP 🎉`);
        }
        this.refresh();
        break;
      }
      case 'claimDaily': {
        const c = this.save.claimDaily(Number(el.dataset.i));
        if (c) {
          this.cb.onPurchase('daily');
          this.toast(`+${fmt(c)} coins! Daily done ✅`);
        }
        this.refresh();
        break;
      }
      case 'frame':
        if (this.save.setFrame(Number(el.dataset.id))) {
          this.cb.onPurchase('frame');
          this.refresh();
        }
        break;
      case 'exhibit':
        if (d.discovered.includes(el.dataset.id ?? '')) {
          this.reading = el.dataset.id ?? null;
          this.renderPanel();
          this.sheet.querySelector('.sheet-panel')?.scrollTo(0, 0);
        }
        break;
      case 'archiveBack':
        this.reading = null;
        this.renderPanel();
        break;
      case 'archive':
      case 'missions':
      case 'daily':
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
      case 'quality':
        this.cb.onSetting('quality', el.dataset.q ?? 'auto');
        this.renderPanel();
        break;
      case 'fps':
        this.cb.onSetting('showFps', !this.save.data.settings.showFps);
        this.renderPanel();
        break;
      case 'largeText':
        this.cb.onSetting('largeText', !this.save.data.settings.largeText);
        this.renderPanel();
        break;
      case 'replayLore':
        this.cb.onReplayLore();
        break;
      case 'tutorial':
        this.cb.onSetting('tutorial', true);
        this.toast('Lalabas ulit ang tips sa susunod mong run 👍');
        break;
      case 'reset':
        if (performance.now() < this.resetArmed) {
          this.resetArmed = 0;
          this.cb.onReset();
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

  private buySkin(id: string): void {
    const s = SKIN_BY_ID[id];
    if (!s) return;
    const r: ShopResult = this.save.buySkin(id);
    if (r === 'ok') {
      this.save.equipSkin(id);
      this.cb.onPurchase('skin');
      if (this.save.data.selectedHero === s.hero) this.cb.onPreview(s.hero, s.id);
      this.toast(`${s.name} unlocked + equipped! Fresh fit 🔥`);
    } else if (r === 'insufficient') {
      this.toast(`Kulang pa ng ${s.cost - this.save.data.diamonds} 💎. Level up muna!`);
    } else if (r === 'locked') {
      this.toast(`I-unlock muna si ${HEROES[s.hero].name}.`);
    }
    this.refresh();
  }

  private tryUnlock(id: HeroId): void {
    const r = this.cb.onUnlock(id);
    if (r === 'ok') {
      this.save.selectHero(id);
      this.cb.onPreview(id);
      this.toast(`${HEROES[id].name} unlocked! Let's go! 🎉`);
    } else if (r === 'insufficient') {
      this.toast(`Kulang pa ng ${fmt(HEROES[id].unlockCost - this.save.data.coins)} coins. Laro pa, bes! 🪙`);
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
    const pl = playerLevelProgress(d.playerXp);
    const frame = PROFILE_FRAMES[d.profileFrame] ?? PROFILE_FRAMES[0]!;
    $(r, '.pf-name').textContent = this.save.displayName;
    $(r, '.pf-level').textContent = `Lv ${pl.level}${pl.need ? ` · ${fmt(pl.into)}/${fmt(pl.need)} XP` : ' · MAX'}`;
    $(r, '.pf-bar').innerHTML = bar(pl.into, pl.need);
    const av = $(r, '.avatar');
    av.setAttribute('style', frameStyle(frame));
    av.dataset.style = frame.style;
    $<HTMLImageElement>(av, 'img').src = PORTRAIT[d.selectedHero];
    $(r, '.w-coins').textContent = fmt(d.coins);
    $(r, '.w-gems').textContent = fmt(d.diamonds);

    const h = HEROES[d.selectedHero];
    const hl = heroLevelProgress(d.heroXp[h.id] ?? 0);
    const perks = heroPerks(hl.level);
    $(r, '.hc-name').textContent = h.name;
    $(r, '.hc-class').textContent = h.heroClass;
    $(r, '.hc-level').textContent = `Lv ${hl.level}`;
    $(r, '.hc-title').textContent = h.title;
    $(r, '.hc-xp').innerHTML = hl.need ? `${bar(hl.into, hl.need)}<small>${fmt(hl.into)}/${fmt(hl.need)} hero XP</small>` : `${bar(1, 0)}<small>MASTER ✨</small>`;
    $(r, '.hc-ab-icon').textContent = perks.abilityUnlocked ? ABILITIES[h.abilityKind].icon : '🔒';
    $(r, '.hc-ab-name').textContent = `${h.ability}:`;
    $(r, '.hc-ab-text').textContent = perks.abilityUnlocked ? h.abilityBlurb : `Ma-unlock sa hero Lv ${HERO_LEVEL.abilityLevel}. Try mo muna sa Training!`;
    $(r, '.hero-card').dataset.hero = h.id;

    const mb = $(r, '.m-badge');
    mb.hidden = this.save.claimableMissions === 0;
    mb.textContent = String(this.save.claimableMissions);
    const db = $(r, '.d-badge');
    db.hidden = this.save.claimableDaily === 0;
    db.textContent = String(this.save.claimableDaily);
    $(r, '.arch-count').textContent = `${d.discovered.length}/${EXHIBITS.length}`;
    this.renderPanel();
    if (!this.col.hidden) this.renderCollection();
  }

  // ── Collection (shop) ──

  openCollection(tab: Tab = 'heroes'): void {
    this.closePanel();
    this.tab = tab;
    this.detail = null;
    this.col.hidden = false;
    this.root.classList.add('col-open');
    this.renderCollection();
  }

  closeCollection(): void {
    this.col.hidden = true;
    this.detail = null;
    this.root.classList.remove('col-open');
  }

  get collectionOpen(): boolean {
    return !this.col.hidden;
  }

  private heroCard(id: HeroId): string {
    const d = this.save.data;
    const h = HEROES[id];
    const own = d.ownedHeroes.includes(id);
    const lv = this.save.heroLevel(id);
    const p = heroPerks(lv);
    const use = d.selectedHero === id;
    const foot = own ? `<span class="c-lv">Lv ${lv}</span>` : `<span class="c-price coin"><i></i>${fmt(h.unlockCost)}</span>`;
    return `<button class="ccard ${own ? 'owned' : 'locked'} ${use ? 'inuse' : ''} ${p.master ? 'master' : ''}" data-act="detail" data-kind="hero" data-id="${id}" data-hero="${id}">
      <span class="c-art"><img src="${PORTRAIT[id]}" alt="" loading="lazy" /></span>
      ${use ? '<span class="c-ribbon">IN USE</span>' : ''}
      ${p.badge ? '<span class="c-badge" title="Hero badge (Lv 4)">🎖️</span>' : ''}
      ${p.master ? '<span class="c-master">MASTER</span>' : ''}
      <span class="c-info"><b>${esc(h.name)}</b><small>${esc(h.heroClass)}</small></span>
      <span class="c-foot">${foot}${own ? '' : '<span class="c-lock">🔒</span>'}</span>
    </button>`;
  }

  private skinCard(s: SkinDef): string {
    const d = this.save.data;
    const own = d.ownedSkins.includes(s.id);
    const eq = d.equippedSkins[s.hero] === s.id;
    const foot = eq ? '<span class="c-lv">Suot ✓</span>' : own ? '<span class="c-lv">Owned</span>' : `<span class="c-price gem"><i></i>${fmt(s.cost)}</span>`;
    return `<button class="ccard skin ${own ? 'owned' : 'locked'} ${eq ? 'inuse' : ''}" data-act="detail" data-kind="skin" data-id="${s.id}" style="--sa:${s.swatch[0]};--sb:${s.swatch[1]}">
      <span class="c-art"><img src="${PORTRAIT[s.hero]}" alt="" loading="lazy" /></span>
      <span class="c-swatch"></span>
      <span class="c-info"><b>${esc(s.name)}</b><small>${esc(HEROES[s.hero].name)}</small></span>
      <span class="c-foot">${foot}</span>
    </button>`;
  }

  private renderCollection(): void {
    if (this.col.hidden) return;
    const d = this.save.data;
    this.col.querySelectorAll<HTMLElement>('.col-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.col.querySelectorAll<HTMLElement>('.chip').forEach((b) => b.classList.toggle('on', b.dataset.f === this.filter));
    $(this.col, '.cw-coins').textContent = fmt(d.coins);
    $(this.col, '.cw-gems').textContent = fmt(d.diamonds);
    const keep = (own: boolean): boolean => this.filter === 'all' || (this.filter === 'owned') === own;
    const grid = $(this.col, '.col-grid');
    grid.dataset.tab = this.tab;
    if (this.tab === 'heroes') {
      const cards = HERO_ORDER.filter((id) => keep(d.ownedHeroes.includes(id))).map((id) => this.heroCard(id));
      grid.innerHTML = cards.join('') || '<p class="empty">Wala dito, bes. Ibang filter?</p>';
    } else {
      const cards = SKINS.filter((s) => keep(d.ownedSkins.includes(s.id))).map((s) => this.skinCard(s));
      grid.innerHTML = cards.join('') || '<p class="empty">Wala dito, bes. Ibang filter?</p>';
    }
    const det = $(this.col, '.col-detail');
    det.hidden = !this.detail;
    if (this.detail) $(det, '.cd-card').innerHTML = this.detail.kind === 'hero' ? this.heroDetail(this.detail.id as HeroId) : this.skinDetail(this.detail.id);
  }

  private heroDetail(id: HeroId): string {
    const d = this.save.data;
    const h = HEROES[id];
    if (!h) return '';
    const own = d.ownedHeroes.includes(id);
    const hl = heroLevelProgress(d.heroXp[id] ?? 0);
    const p = heroPerks(hl.level);
    const ab = ABILITIES[h.abilityKind];
    const action = !own
      ? `<button class="btn primary" data-act="unlock" data-hero="${id}" ${d.coins < h.unlockCost ? 'disabled' : ''}>Buy · ${fmt(h.unlockCost)} 🪙</button>`
      : d.selectedHero === id
        ? '<button class="btn primary" disabled>In use ✓</button>'
        : `<button class="btn primary" data-act="use" data-hero="${id}">Gamitin ‘to ▶</button>`;
    const track = HERO_LEVEL.rewards
      .map((r) => `<li class="${hl.level >= r.level ? 'got' : ''}"><b>Lv ${r.level}</b><span>${esc(r.label)}</span>${hl.level >= r.level ? '<i>✓</i>' : ''}</li>`)
      .join('');
    const cd = abilityCooldown(h.abilityKind, p);
    return `<button class="link cd-back" data-act="detailBack">‹ Balik</button>
      <div class="cd-grid">
        <div class="cd-art ${p.master ? 'master' : ''}"><img src="${PORTRAIT[id]}" alt="${esc(h.name)}" /></div>
        <div class="cd-info">
          <span class="cd-class">${esc(h.heroClass)}</span>
          <h2>${esc(h.name)} ${p.badge ? '🎖️' : ''}</h2>
          <p class="cd-title">${esc(h.title)}</p>
          ${own ? `<p class="cd-lv"><b>Hero Lv ${hl.level}</b> ${hl.need ? `· ${fmt(hl.into)}/${fmt(hl.need)} XP` : '· MASTER'}</p>${bar(hl.into, hl.need)}` : ''}
          <div class="cd-ability"><span>${ab.icon}</span><div><b>${esc(h.ability)}</b><small>${esc(h.abilityBlurb)} · cooldown ${formatTime(cd)}</small>
            ${p.abilityUnlocked ? '' : `<small class="lockline">🔒 Ma-unlock sa hero Lv ${HERO_LEVEL.abilityLevel}</small>`}</div></div>
          <div class="cd-actions">${action}<button class="btn" data-act="train" data-hero="${id}">🎯 Try sa Training</button></div>
          <h3>Level rewards</h3>
          <ol class="cd-track">${track}</ol>
          <p class="cd-note">Hero XP = segundo na naka-survive + 20 bawat exhibit + 1 bawat coin.</p>
        </div>
      </div>`;
  }

  private skinDetail(id: string): string {
    const d = this.save.data;
    const s = SKIN_BY_ID[id];
    if (!s) return '';
    const heroOwned = d.ownedHeroes.includes(s.hero);
    const own = d.ownedSkins.includes(id);
    const eq = d.equippedSkins[s.hero] === id;
    const action = eq
      ? '<button class="btn primary" disabled>Suot na ✓</button>'
      : own
        ? `<button class="btn primary" data-act="equip" data-skin="${id}" ${heroOwned ? '' : 'disabled'}>Equip</button>`
        : !heroOwned
          ? `<button class="btn" disabled>🔒 Bilhin muna si ${esc(HEROES[s.hero].name)}</button>`
          : `<button class="btn primary" data-act="buy" data-skin="${id}" ${d.diamonds < s.cost ? 'disabled' : ''}>Buy · ${fmt(s.cost)} 💎</button>`;
    return `<button class="link cd-back" data-act="detailBack">‹ Balik</button>
      <div class="cd-grid">
        <div class="cd-art skin" style="--sa:${s.swatch[0]};--sb:${s.swatch[1]}"><img src="${PORTRAIT[s.hero]}" alt="" /><span class="c-swatch"></span></div>
        <div class="cd-info">
          <span class="cd-class">Skin · ${esc(HEROES[s.hero].name)}</span>
          <h2>${esc(s.name)}</h2>
          <p class="cd-title">Outfit colourway lang, walang stat boost. Diamonds 💎 galing sa level ups at exhibit milestones.</p>
          <div class="cd-actions">${action}<button class="btn" data-act="try" data-skin="${id}">👀 Try on sa stage</button></div>
        </div>
      </div>`;
  }

  // ── Panels ──

  private openPanel(p: Panel): void {
    this.panel = p;
    this.reading = null;
    this.resetArmed = 0;
    this.sheet.hidden = false;
    this.renderPanel();
    this.sheet.querySelector<HTMLElement>('.sheet-close')?.focus();
    window.clearInterval(this.clockTimer);
    if (p === 'daily') this.clockTimer = window.setInterval(() => this.tickDaily(), 1000);
  }

  closePanel(): void {
    this.panel = null;
    this.sheet.hidden = true;
    window.clearInterval(this.clockTimer);
  }

  /** Esc: closes whatever is on top (detail → collection → panel). */
  back(): void {
    if (this.detail) {
      this.detail = null;
      this.renderCollection();
    } else if (!this.col.hidden) this.closeCollection();
    else this.closePanel();
  }

  get openPanelName(): Panel | 'collection' | null {
    return this.panel ?? (this.col.hidden ? null : 'collection');
  }

  private tickDaily(): void {
    if (this.panel !== 'daily') return;
    if (this.save.ensureDaily()) this.refresh();
    const el = this.sheet.querySelector('.dl-clock b');
    if (el) el.textContent = formatTime(secondsToMidnight(new Date()));
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const body = $(this.sheet, '.sheet-body');
    const d = this.save.data;
    switch (this.panel) {
      case 'missions': {
        const rows = d.missions
          .map((m) => {
            const done = isDone(m);
            const pct = Math.round((m.progress / m.target) * 100);
            const shown = m.kind === 'surviveRun' ? `${formatTime(m.progress)} / ${formatTime(m.target)}` : `${fmt(m.progress)} / ${fmt(m.target)}`;
            return `<div class="mission ${done ? 'done' : ''}">
              <div class="m-text"><b>${esc(describe(m))}</b><small>${shown} · Reward: +${fmt(m.xp)} XP</small>
                <div class="m-bar"><i style="width:${pct}%"></i></div></div>
              ${done ? `<button class="btn primary" data-act="claim" data-seq="${m.seq}">Claim</button>` : `<span class="m-pct">${pct}%</span>`}</div>`;
          })
          .join('');
        body.innerHTML = `<h2>Missions 🎯</h2><p>Player XP ang reward. Bawat level up = +${PLAYER_LEVEL.diamondsPerLevel} 💎. May bago agad pag na-claim mo.</p>${rows}`;
        break;
      }
      case 'daily': {
        const rows = d.daily.tasks
          .map((t, i) => {
            const done = t.progress >= t.target;
            const pct = Math.round((t.progress / t.target) * 100);
            const shown = t.kind === 'survive' ? `${formatTime(t.progress)} / ${formatTime(t.target)}` : `${fmt(t.progress)} / ${fmt(t.target)}`;
            const right = t.claimed
              ? '<span class="m-pct">✓ Claimed</span>'
              : done
                ? `<button class="btn primary" data-act="claimDaily" data-i="${i}">Claim</button>`
                : `<span class="m-pct">${pct}%</span>`;
            return `<div class="mission ${done ? 'done' : ''} ${t.claimed ? 'claimed' : ''}">
              <div class="m-text"><b>${esc(describeDaily(t))}</b><small>${shown} · Reward: +${fmt(t.coins)} 🪙</small>
                <div class="m-bar"><i style="width:${pct}%"></i></div></div>${right}</div>`;
          })
          .join('');
        body.innerHTML = `<h2>Daily Tasks 📅</h2><p class="dl-clock">Bagong tasks in <b>${formatTime(secondsToMidnight(new Date()))}</b> (hatinggabi sa oras mo)</p>${rows}`;
        break;
      }
      case 'archive': {
        const open = this.reading ? EXHIBIT_BY_ID[this.reading] : undefined;
        if (open) {
          body.innerHTML = `<button class="link ex-back" data-act="archiveBack">‹ Balik sa Archive</button>${exhibitHtml(open)}`;
          break;
        }
        const roomName = (id: string): string => ROOMS.find((r) => r.id === id)?.sign ?? id;
        const tiles = EXHIBITS.map((e) => {
          const found = d.discovered.includes(e.id);
          const photo = exhibitPhoto(e.id);
          const thumb = photo ? `<img class="ex-tile-photo" src="${exhibitAsset(photo.file)}" alt="" loading="lazy" />` : `<span class="ex-tile-icon">${e.icon}</span>`;
          return found
            ? `<button class="ex-tile found" data-act="exhibit" data-id="${e.id}" data-kind="${e.kind}">
                ${thumb}<b>${esc(e.title)}</b><small>${esc(KIND_LABEL[e.kind])}</small></button>`
            : `<div class="ex-tile" data-kind="${e.kind}"><span class="ex-tile-icon">❔</span><b>???</b><small>Hanapin sa ${esc(roomName(e.room))}</small></div>`;
        }).join('');
        body.innerHTML = `<h2>Archive 📜</h2>
          <p>${d.discovered.length}/${EXHIBITS.length} na-unlock. Sundan ang arrow sa museo, lapit sa exhibit, tapos manalo sa mini-game para mabasa.</p>
          <div class="ex-grid">${tiles}</div><p class="ex-fiction">${esc(FICTION_NOTE)}</p>`;
        break;
      }
      case 'leaderboard': {
        const rows = d.leaderboard
          .map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${fmt(e.score)}</td><td>${formatTime(e.time)}</td><td>${esc(HEROES[e.hero].name)}</td><td>${esc(e.date)}</td></tr>`)
          .join('');
        body.innerHTML = `<h2>Top Runs 🏆</h2><p>Saved sa device na 'to lang (hindi online).</p>
          ${rows ? `<div class="table-wrap"><table class="lb-table"><thead><tr><th>#</th><th>Name</th><th>Score</th><th>Oras</th><th>Hero</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">Wala pang runs. Ikaw na ang mauna! 🏃</p>'}`;
        break;
      }
      case 'settings': {
        const armed = performance.now() < this.resetArmed;
        body.innerHTML = `<h2>Settings ⚙</h2>
          <h3>Tunog</h3>
          <button class="btn toggle" data-act="mute">Lahat ng tunog: <b>${d.settings.muted ? 'OFF 🔇' : 'ON 🔊'}</b></button>
          <label class="vol-row">🎵 Music <input type="range" min="0" max="100" step="5" data-vol="music" value="${Math.round(d.settings.musicVolume * 100)}" aria-label="Music volume" /><output>${Math.round(d.settings.musicVolume * 100)}%</output></label>
          <label class="vol-row">🔔 SFX <input type="range" min="0" max="100" step="5" data-vol="sfx" value="${Math.round(d.settings.sfxVolume * 100)}" aria-label="Sound effects volume" /><output>${Math.round(d.settings.sfxVolume * 100)}%</output></label>
          <h3>Graphics</h3>
          <div class="seg" role="group" aria-label="Graphics quality">${(['auto', 'low', 'high'] as const)
            .map((q) => `<button class="seg-btn ${d.settings.quality === q ? 'on' : ''}" data-act="quality" data-q="${q}">${q === 'auto' ? 'Auto' : q === 'low' ? 'Low 🔋' : 'High ✨'}</button>`)
            .join('')}</div>
          <p class="cd-note">Low = mas magaan sa luma/mahinang phone. High = mas sharp + konting glow.</p>
          <button class="btn toggle" data-act="fps">Show FPS: <b>${d.settings.showFps ? 'ON' : 'OFF'}</b><small>Pang-check ng performance sa phone mo</small></button>
          <h3>Accessibility</h3>
          <button class="btn toggle" data-act="reduced">Reduced effects: <b>${d.settings.reducedEffects ? 'ON' : 'OFF'}</b><small>Less particles, walang camera shake / flicker</small></button>
          <button class="btn toggle" data-act="largeText">Malaking text: <b>${d.settings.largeText ? 'ON' : 'OFF'}</b></button>
          <button class="btn toggle" data-act="replayLore">Panoorin ulit ang intro 🎬<small>Paano napunta ang mga bayani sa 2026</small></button>
          <button class="btn toggle" data-act="tutorial">Ipakita ulit ang tutorial tips 🎓</button>
          <button class="btn danger" data-act="reset">${armed ? 'Sure ka? Tap ulit para i-reset 😬' : 'Reset progress 🧹'}</button>`;
        break;
      }
      case 'profile': {
        const pl = playerLevelProgress(d.playerXp);
        const unlocked = PROFILE_FRAMES.filter((f) => f.level <= pl.level);
        const next = PROFILE_FRAMES.find((f) => f.level > pl.level);
        const frames = [...unlocked, ...(next ? [next] : [])]
          .map((f) => {
            const locked = f.level > pl.level;
            return `<button class="frame-pick ${d.profileFrame === f.id ? 'on' : ''}" data-act="frame" data-id="${f.id}" ${locked ? 'disabled' : ''} title="${esc(f.name)}">
              <span class="pframe" data-style="${f.style}" style="${frameStyle(f)}"><img src="${PORTRAIT[d.selectedHero]}" alt="" /></span>
              <small>${locked ? `🔒 Lv ${f.level}` : esc(f.name)}</small></button>`;
          })
          .join('');
        body.innerHTML = `<h2>Profile</h2>
          <p class="pf-big"><b>Player Lv ${pl.level}</b> / ${PLAYER_LEVEL.cap} ${pl.need ? `· ${fmt(pl.into)}/${fmt(pl.need)} XP` : '· MAX'}</p>${bar(pl.into, pl.need)}
          <p class="cd-note">XP: score ÷ ${PLAYER_LEVEL.scoreDivisor} + ${PLAYER_LEVEL.perExhibit} bawat exhibit + missions. Bawat level = +${PLAYER_LEVEL.diamondsPerLevel} 💎, bagong frame bawat ${PLAYER_LEVEL.frameEvery} levels.</p>
          <form class="nick-form"><label for="nick">Nickname (para sa Top Runs)</label>
            <div class="nick-row"><input id="nick" class="nick-input" maxlength="${LEADERBOARD.nameMax}" autocomplete="off" value="${esc(d.nickname)}" placeholder="Bagong Bayani" />
            <button class="btn primary" type="submit">Save</button></div><p class="nick-msg"></p></form>
          <h3>Profile frames</h3><div class="frame-grid">${frames}</div>
          <dl class="stats"><div><dt>Runs</dt><dd>${fmt(d.runs)}</dd></div><div><dt>Best score</dt><dd>${fmt(d.bestScore)}</dd></div>
          <div><dt>Best oras</dt><dd>${formatTime(d.bestTime)}</dd></div><div><dt>Heroes</dt><dd>${d.ownedHeroes.length}/${HERO_ORDER.length}</dd></div></dl>`;
        break;
      }
    }
  }

  dispose(): void {
    window.clearInterval(this.clockTimer);
    this.root.remove();
  }
}
