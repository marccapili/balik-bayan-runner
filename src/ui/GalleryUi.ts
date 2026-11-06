import './gallery.css';
import { exhibitStyle, GALLERY_TV, GALLERY_UI, GALLERY_WORKS, GAME_PLAQUE, galleryFile, type GalleryPage, type GalleryWork } from '../data/gallery';
import { spreadCount, spreadPages, type Spot } from '../gallery/galleryLayout';
import { esc } from './exhibitHtml';

export interface GalleryUiCallbacks {
  onBack(): void;
  /** A viewer opened (`index` = work index, -1 for the TV / game plaque). */
  onOpen(index: number): void;
  onClose(): void;
  onClick(): void;
  /** Page-turn / unroll sound. */
  onPage(): void;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Gallery element missing: ${sel}`);
  return el;
};

const reduced = (): boolean => document.body.classList.contains('reduced-fx') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** HTML for one page (image or video). `still` = poster instead of a live video (used on the turning leaf). */
function pageHtml(work: GalleryWork, i: number, still = false): string {
  const p: GalleryPage | undefined = work.pages[i];
  if (!p) return '';
  if (p.type === 'video') {
    const poster = galleryFile(work.slug, p.poster);
    if (still) return `<img src="${poster}" alt="" draggable="false" />`;
    return `<video src="${galleryFile(work.slug, p.src)}" poster="${poster}" controls playsinline preload="none"></video>`;
  }
  return `<img src="${galleryFile(work.slug, p.src)}" alt="${esc(work.title)}, pahina ${i + 1}" draggable="false" data-zoom="${i}" />`;
}

/**
 * Everything on screen in the Future Heroes Gallery: the walk-around HUD (back, list, interact prompt) and the
 * viewers: a book with page-turn animation for multi-page works, an unrolling scroll for one-pagers, the TV
 * (YouTube) and the game's own plaque. Pure DOM; the Game decides when the room is shown.
 */
export class GalleryUi {
  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private promptKey = '';
  private openIndex: number | null = null;
  /** Book state while a book is open. */
  private book: { work: GalleryWork; spread: number; twoUp: boolean; flipping: boolean; pageW: number; pageH: number } | null = null;
  private readonly seen = new Set<number>();
  private swipe: { x: number; y: number; id: number } | null = null;

  constructor(
    host: HTMLElement,
    private readonly cb: GalleryUiCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'gallery-ui';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="gl-hud">
        <button class="gl-back icon-btn" data-act="back" aria-label="Balik sa lobby">‹</button>
        <div class="gl-title"><b>${esc(GALLERY_UI.heading)}</b><small class="gl-count"></small></div>
        <button class="gl-list-btn" data-act="list">☰ <span>Lahat ng gawa</span></button>
        <p class="gl-hint"><span class="hint-desktop">WASD para maglakad · </span>Lapitan ang exhibit para basahin</p>
        <button class="gl-prompt" data-act="interact" hidden></button>
      </div>
      <div class="gl-overlay" hidden></div>`;
    host.appendChild(this.root);
    this.hud = $(this.root, '.gl-hud');
    this.prompt = $(this.root, '.gl-prompt');
    this.overlay = $(this.root, '.gl-overlay');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.overlay.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.overlay.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.book && this.layoutBook());
    this.updateCount();
  }

  /** The interact button pressed (tap or E): open what's in reach. */
  interactPressed: (() => void) | null = null;

  setVisible(v: boolean): void {
    this.root.hidden = !v;
    if (!v) this.close(true);
  }

  /** The TV (YouTube) viewer is open. */
  get showingTv(): boolean {
    return this.openIndex !== null && this.overlay.classList.contains('is-tv');
  }

  get viewing(): boolean {
    return this.openIndex !== null;
  }

  /** Prompt for the exhibit in reach (null hides it). */
  setNear(s: Spot | null): void {
    const key = s ? `${s.kind}${s.index}` : '';
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.prompt.hidden = !s;
    this.hud.classList.toggle('has-prompt', !!s);
    if (!s) return;
    const kbd = '<span class="hint-desktop"><b>E</b> · </span>';
    if (s.kind === 'tv') this.prompt.innerHTML = `${kbd}📺 Panoorin<small>${esc(GALLERY_TV.title)}</small>`;
    else if (s.kind === 'game') this.prompt.innerHTML = `${kbd}☀ Basahin<small>${esc(GAME_PLAQUE.title)} · ${esc(GAME_PLAQUE.name)}</small>`;
    else {
      const w = GALLERY_WORKS[s.index]!;
      const icon = exhibitStyle(w) === 'book' ? '📖 Buksan ang libro' : '📜 Buksan ang scroll';
      this.prompt.innerHTML = `${kbd}${icon}<small>${esc(w.name)} · ${esc(w.title)}</small>`;
    }
  }

  /** Opens the viewer for a spot. */
  openSpot(s: Spot): void {
    if (s.kind === 'tv') this.openTv();
    else if (s.kind === 'game') this.openGame();
    else this.openWork(s.index);
  }

  openWork(index: number): void {
    const w = GALLERY_WORKS[index];
    if (!w) return;
    this.seen.add(index);
    this.updateCount();
    if (exhibitStyle(w) === 'book') this.openBook(index, w);
    else this.openScroll(index, w);
  }

  // ── Viewers ──

  private head(name: string, title: string, form: string): string {
    return `<header class="gv-head">
        <div><small>${esc(form)}</small><h2>${esc(title)}</h2><p>Gawa ${/ at /.test(name) ? 'nina' : 'ni'} <b>${esc(name)}</b></p></div>
        <button class="icon-btn gv-close" data-act="close" aria-label="Isara">✕</button>
      </header>`;
  }

  private show(index: number, cls: string, html: string): void {
    this.openIndex = index;
    this.book = null;
    this.overlay.className = `gl-overlay ${cls}`;
    this.overlay.innerHTML = html;
    this.overlay.hidden = false;
    this.cb.onOpen(index);
  }

  private openBook(index: number, w: GalleryWork): void {
    this.show(
      index,
      'is-book',
      `${this.head(w.name, w.title, w.form)}
      <div class="gv-stage">
        <div class="gv-book">
          <div class="gv-page gv-left"></div><div class="gv-page gv-right"></div>
          <div class="gv-leaf" hidden><div class="gv-face gv-front"></div><div class="gv-face gv-back"></div></div>
        </div>
        <button class="gv-nav gv-prev" data-act="prev" aria-label="Nakaraang pahina">‹</button>
        <button class="gv-nav gv-next" data-act="next" aria-label="Susunod na pahina">›</button>
      </div>
      <footer class="gv-foot"><span class="gv-pageno"></span><span class="gv-tip">Swipe o pindutin ang ‹ › para lumipat ng pahina · tap para i-zoom</span></footer>`,
    );
    this.book = { work: w, spread: 0, twoUp: false, flipping: false, pageW: 0, pageH: 0 };
    this.layoutBook();
    this.cb.onPage();
  }

  /** Sizes the book to the screen: two-page spreads when there's room, one page otherwise. */
  private layoutBook(): void {
    const b = this.book;
    if (!b) return;
    const stage = $(this.overlay, '.gv-stage');
    const W = Math.max(200, stage.clientWidth - 24);
    const H = Math.max(200, stage.clientHeight - 16);
    const first = b.work.pages[0]!;
    const twoUp = b.work.pages.length > 1 && W > 640 && W / H > (first.w / first.h) * 1.45;
    const cols = twoUp ? 2 : 1;
    // One page at a time (phones): size the page to the tallest page, so a portrait text page after
    // a landscape drawing shows whole instead of being squeezed into the drawing's shape.
    const aspect = twoUp ? first.w / first.h : Math.min(...b.work.pages.map((p) => p.w / p.h));
    let pw = Math.min(W / cols, H * aspect);
    let ph = pw / aspect;
    if (ph > H) {
      ph = H;
      pw = ph * aspect;
    }
    // Keep the reader on the same page when the layout switches.
    if (twoUp !== b.twoUp) {
      const page = b.twoUp ? Math.max(0, spreadPages(b.spread, b.work.pages.length, true).left) : b.spread;
      b.spread = twoUp ? Math.ceil(page / 2) : page;
      b.twoUp = twoUp;
    }
    b.pageW = Math.floor(pw);
    b.pageH = Math.floor(ph);
    const book = $(this.overlay, '.gv-book');
    book.style.setProperty('--pw', `${b.pageW}px`);
    book.style.setProperty('--ph', `${b.pageH}px`);
    book.classList.toggle('two-up', twoUp);
    this.renderSpread();
  }

  private renderSpread(): void {
    const b = this.book;
    if (!b) return;
    const n = b.work.pages.length;
    const { left, right } = spreadPages(b.spread, n, b.twoUp);
    const L = $(this.overlay, '.gv-left');
    const R = $(this.overlay, '.gv-right');
    L.innerHTML = left >= 0 ? pageHtml(b.work, left) : '';
    R.innerHTML = right >= 0 ? pageHtml(b.work, right) : '';
    L.classList.toggle('blank', left < 0);
    R.classList.toggle('blank', right < 0);
    L.hidden = !b.twoUp;
    const total = spreadCount(n, b.twoUp);
    $(this.overlay, '.gv-pageno').textContent = b.twoUp
      ? `Pahina ${[left, right].filter((p) => p >= 0).map((p) => p + 1).join('–')} / ${n}`
      : `Pahina ${b.spread + 1} / ${n}`;
    $<HTMLButtonElement>(this.overlay, '.gv-prev').disabled = b.spread <= 0;
    $<HTMLButtonElement>(this.overlay, '.gv-next').disabled = b.spread >= total - 1;
  }

  /** Turns the page with a 3D leaf, like an e-book. */
  private flip(dir: 1 | -1): void {
    const b = this.book;
    if (!b || b.flipping) return;
    const n = b.work.pages.length;
    const total = spreadCount(n, b.twoUp);
    const to = b.spread + dir;
    if (to < 0 || to >= total) return;
    this.stopVideos();
    const cur = spreadPages(b.spread, n, b.twoUp);
    const nxt = spreadPages(to, n, b.twoUp);
    const leaf = $(this.overlay, '.gv-leaf');
    const front = $(this.overlay, '.gv-front');
    const back = $(this.overlay, '.gv-back');
    const L = $(this.overlay, '.gv-left');
    const R = $(this.overlay, '.gv-right');
    const ms = reduced() ? 120 : GALLERY_UI.flipSeconds * 1000;
    const fill = (el: HTMLElement, i: number): void => {
      el.innerHTML = i >= 0 ? pageHtml(b.work, i, true) : '';
      el.classList.toggle('blank', i < 0);
    };
    let frames: Keyframe[];
    if (b.twoUp) {
      if (dir > 0) {
        // Right page lifts and turns over to the left; the next right page is already underneath.
        leaf.className = 'gv-leaf on-right';
        fill(front, cur.right);
        fill(back, nxt.left);
        fill(R, nxt.right);
        frames = [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }];
      } else {
        leaf.className = 'gv-leaf on-left';
        fill(front, cur.left);
        fill(back, nxt.right);
        fill(L, nxt.left);
        frames = [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }];
      }
    } else if (dir > 0) {
      // Single page: the current page turns away to the left, revealing the next one.
      leaf.className = 'gv-leaf on-right single';
      fill(front, cur.right);
      fill(back, -1);
      fill(R, nxt.right);
      frames = [
        { transform: 'rotateY(0deg)', opacity: 1 },
        { transform: 'rotateY(-90deg)', opacity: 1, offset: 0.5 },
        { transform: 'rotateY(-180deg)', opacity: 0 },
      ];
    } else {
      // Single page back: the previous page swings in from the left over the current one.
      leaf.className = 'gv-leaf on-right single';
      fill(front, nxt.right);
      fill(back, -1);
      frames = [
        { transform: 'rotateY(-180deg)', opacity: 0 },
        { transform: 'rotateY(-90deg)', opacity: 1, offset: 0.5 },
        { transform: 'rotateY(0deg)', opacity: 1 },
      ];
    }
    leaf.hidden = false;
    b.flipping = true;
    this.cb.onPage();
    const done = (): void => {
      if (this.book !== b) return;
      b.flipping = false;
      b.spread = to;
      leaf.hidden = true;
      this.renderSpread();
    };
    const anim = leaf.animate?.(frames, { duration: ms, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)' });
    if (anim) anim.onfinish = done;
    else window.setTimeout(done, ms);
  }

  private openScroll(index: number, w: GalleryWork): void {
    const p = w.pages[0]!;
    this.show(
      index,
      'is-scroll',
      `${this.head(w.name, w.title, w.form)}
      <div class="gv-scroll">
        <div class="gv-rod"></div>
        <div class="gv-paper" style="--ratio:${(p.h / p.w).toFixed(4)}">${pageHtml(w, 0)}</div>
        <div class="gv-rod"></div>
      </div>
      <footer class="gv-foot"><span class="gv-tip">I-scroll pababa para basahin · tap para i-zoom</span></footer>`,
    );
    const paper = $(this.overlay, '.gv-paper');
    this.cb.onPage();
    if (reduced()) return;
    paper.animate?.([{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
      duration: GALLERY_UI.unrollSeconds * 1000,
      easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)',
    });
    for (const [i, rod] of [...this.overlay.querySelectorAll<HTMLElement>('.gv-rod')].entries()) {
      rod.animate?.([{ transform: `translateY(${i === 0 ? 40 : -40}vh)` }, { transform: 'translateY(0)' }], {
        duration: GALLERY_UI.unrollSeconds * 1000,
        easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)',
      });
    }
  }

  private openTv(): void {
    const src = `https://www.youtube-nocookie.com/embed/${GALLERY_TV.youtubeId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    this.show(
      -1,
      'is-tv',
      `${this.head(GALLERY_TV.credit.replace(/^Video ni /, ''), GALLERY_TV.title, 'Video')}
      <div class="gv-tv"><div class="gv-tv-screen">
        <iframe src="${src}" title="${esc(GALLERY_TV.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div></div>
      <footer class="gv-foot"><a class="gv-yt" href="https://www.youtube.com/watch?v=${GALLERY_TV.youtubeId}" target="_blank" rel="noopener">Hindi nagpe-play? Buksan sa YouTube ↗</a></footer>`,
    );
  }

  private openGame(): void {
    this.show(
      -1,
      'is-game',
      `${this.head(GAME_PLAQUE.name, GAME_PLAQUE.title, GAME_PLAQUE.form)}
      <div class="gv-card">${GAME_PLAQUE.body.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`,
    );
  }

  /** List of every work (for players who'd rather not walk). */
  private openList(): void {
    const cards = GALLERY_WORKS.map(
      (w, i) => `<button class="gv-item${this.seen.has(i) ? ' seen' : ''}" data-act="work" data-i="${i}">
          <img src="${galleryFile(w.slug, 'thumb.webp')}" alt="" loading="lazy" />
          <span><b>${esc(w.name)}</b><em>${esc(w.title)}</em><small>${exhibitStyle(w) === 'book' ? `📖 ${w.pages.length} pahina` : '📜 Scroll'} · ${esc(w.form)}</small></span>
        </button>`,
    ).join('');
    this.show(
      -1,
      'is-list',
      `<header class="gv-head">
        <div><small>${esc(GALLERY_UI.subheading)}</small><h2>Lahat ng gawa</h2><p>${esc(GALLERY_UI.note)}</p></div>
        <button class="icon-btn gv-close" data-act="close" aria-label="Isara">✕</button>
      </header>
      <div class="gv-list">
        <button class="gv-item special" data-act="tv"><span class="gv-ico">📺</span><span><b>${esc(GALLERY_TV.title)}</b><em>${esc(GALLERY_TV.credit)}</em><small>Video sa gitna ng gallery</small></span></button>
        <button class="gv-item special" data-act="game"><span class="gv-ico">☀</span><span><b>${esc(GAME_PLAQUE.title)}</b><em>nina ${esc(GAME_PLAQUE.name)}</em><small>${esc(GAME_PLAQUE.form)}</small></span></button>
        ${cards}
      </div>`,
    );
  }

  private zoom(src: string): void {
    const z = document.createElement('div');
    z.className = 'gv-zoom';
    z.innerHTML = `<img src="${src}" alt="" draggable="false" /><button class="icon-btn gv-close" data-act="unzoom" aria-label="Isara ang zoom">✕</button>`;
    z.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="unzoom"]')) z.remove();
      else if (t.tagName === 'IMG') z.classList.toggle('full');
    });
    this.overlay.appendChild(z);
  }

  /** Closes the open viewer (`silent` = no callback, used when leaving the room). */
  close(silent = false): void {
    if (this.openIndex === null) return;
    const i = this.openIndex;
    this.stopVideos();
    this.openIndex = null;
    this.book = null;
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
    if (!silent) this.cb.onClose();
    if (i >= 0) this.updateCount();
  }

  /** Esc / back: closes the zoom first, then the viewer. Returns false when nothing was open. */
  back(): boolean {
    const z = this.overlay.querySelector('.gv-zoom');
    if (z) {
      z.remove();
      return true;
    }
    if (this.openIndex === null) return false;
    this.close();
    return true;
  }

  hasSeen(index: number): boolean {
    return this.seen.has(index);
  }

  private stopVideos(): void {
    for (const v of this.overlay.querySelectorAll('video')) v.pause();
  }

  private updateCount(): void {
    $(this.root, '.gl-count').textContent = `Nabasa: ${this.seen.size}/${GALLERY_WORKS.length}`;
  }

  // ── Input ──

  private onClick(e: Event): void {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act]');
    const act = el?.dataset.act;
    if (!act) {
      const img = t.closest<HTMLImageElement>('img[data-zoom]');
      if (img && this.openIndex !== null && !this.book?.flipping) this.zoom(img.src);
      return;
    }
    if (act !== 'unzoom') this.cb.onClick();
    switch (act) {
      case 'back':
        this.cb.onBack();
        break;
      case 'list':
        this.openList();
        break;
      case 'interact':
        this.interactPressed?.();
        break;
      case 'close':
        this.close();
        break;
      case 'prev':
        this.flip(-1);
        break;
      case 'next':
        this.flip(1);
        break;
      case 'work':
        this.close(true);
        this.openWork(Number(el!.dataset.i));
        break;
      case 'tv':
        this.close(true);
        this.openTv();
        break;
      case 'game':
        this.close(true);
        this.openGame();
        break;
      default:
        break;
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.book || (e.target as HTMLElement).closest('video, button, .gv-zoom')) return;
    this.swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  private onPointerUp(e: PointerEvent): void {
    const s = this.swipe;
    this.swipe = null;
    if (!s || s.id !== e.pointerId || !this.book) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      this.flip(dx < 0 ? 1 : -1);
      // Don't let the swipe's click open the zoom.
      const block = (ev: Event): void => {
        ev.stopPropagation();
        window.removeEventListener('click', block, true);
      };
      window.addEventListener('click', block, true);
      window.setTimeout(() => window.removeEventListener('click', block, true), 50);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.root.hidden || this.openIndex === null) return;
    if (!this.book || this.overlay.querySelector('.gv-zoom')) return;
    if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'PageDown') this.flip(1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'PageUp') this.flip(-1);
  }
}
