import { exhibitAsset, exhibitPhoto } from '../data/exhibitPhotos';
import type { Exhibit } from '../data/exhibits';
import { BAYBAYIN, MINIGAME, MINIGAME_INFO, WIRE_COLORS } from '../data/minigames';
import { BaybayinMatch, CodeLock, DustGrid, makeRoute, RouteGame, SwapPuzzle, swipeVerdict, TimelineSort, WiresGame, type Pt } from '../gameplay/MiniGames';
import { esc } from './exhibitHtml';

export type MiniSound = 'click' | 'good' | 'bad' | 'win';

export interface MiniGameCallbacks {
  /** Solved: the Game opens the exhibit (and pays for it). */
  onWin(): void;
  /** The player backed out with ✕. */
  onQuit(): void;
  onSound(s: MiniSound): void;
}

const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * Exhibit mini-game overlay (HTML + pointer events, phone-first). Rules live in gameplay/MiniGames.ts;
 * this class only wires input to them and draws. The run keeps going behind it (enemies move!).
 */
export class MiniGameHost {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly msg: HTMLElement;
  private exhibit: Exhibit | null = null;
  private winLeft = 0;
  private cleanup: Array<() => void> = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private msgTimer = 0;

  constructor(
    host: HTMLElement,
    private readonly cb: MiniGameCallbacks,
    private readonly rng: () => number = Math.random,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'minigame';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="mg-panel" role="dialog" aria-modal="false" aria-label="Exhibit mini-game">
        <header class="mg-head">
          <span class="mg-icon"></span>
          <div class="mg-titles"><b class="mg-title"></b><small class="mg-ex"></small></div>
          <button class="icon-btn mg-quit" data-act="quit" aria-label="Umalis sa mini-game">✕</button>
        </header>
        <p class="mg-how"></p>
        <div class="mg-danger" hidden>⚠️ May papalapit! Bilisan mo!</div>
        <div class="mg-stage"></div>
        <p class="mg-msg" aria-live="polite"></p>
      </div>`;
    host.appendChild(this.root);
    this.stage = this.root.querySelector('.mg-stage')!;
    this.msg = this.root.querySelector('.mg-msg')!;
    this.root.querySelector('[data-act="quit"]')!.addEventListener('click', () => {
      this.cb.onSound('click');
      this.cb.onQuit();
    });
  }

  get active(): boolean {
    return !this.root.hidden;
  }

  get exhibitId(): string | null {
    return this.exhibit?.id ?? null;
  }

  get kind(): string | null {
    return this.exhibit?.game ?? null;
  }

  /** Opens the game for exhibit `e` at difficulty `d` (0…1). */
  open(e: Exhibit, d: number): void {
    this.close();
    this.exhibit = e;
    this.winLeft = 0;
    const info = MINIGAME_INFO[e.game];
    this.root.querySelector('.mg-icon')!.textContent = info.icon;
    this.root.querySelector('.mg-title')!.textContent = info.title;
    this.root.querySelector('.mg-ex')!.textContent = `${e.icon} ${e.title}`;
    this.root.querySelector('.mg-how')!.textContent = info.how;
    this.root.dataset.game = e.game;
    this.root.classList.remove('won');
    this.say('');
    this.root.hidden = false;
    switch (e.game) {
      case 'wires':
        this.buildWires(d);
        break;
      case 'swipe':
        this.buildSwipe(d);
        break;
      case 'code':
        this.buildCode(e);
        break;
      case 'navigate':
        this.buildNavigate(d);
        break;
      case 'restore':
        this.buildRestore(e, d);
        break;
      case 'dust':
        this.buildDust(e, d);
        break;
      case 'timeline':
        this.buildTimeline(e);
        break;
      case 'baybayin':
        this.buildBaybayin(d);
        break;
    }
  }

  close(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.stage.innerHTML = '';
    this.root.hidden = true;
    this.exhibit = null;
    this.winLeft = 0;
  }

  setDanger(on: boolean): void {
    const el = this.root.querySelector<HTMLElement>('.mg-danger')!;
    if (el.hidden === !on) return;
    el.hidden = !on;
  }

  /** Runs the short "solved" beat (only while the run is unpaused). */
  update(dt: number): void {
    if (this.winLeft <= 0) return;
    this.winLeft -= dt;
    if (this.winLeft <= 0) this.cb.onWin();
  }

  /** Test hook: solve instantly. */
  forceWin(): void {
    if (this.active && this.winLeft <= 0) this.win();
  }

  private win(): void {
    if (this.winLeft > 0) return;
    this.root.classList.add('won');
    this.say('✨ Solved! Bukas na ang exhibit…', 'good');
    this.cb.onSound('win');
    this.winLeft = MINIGAME.winPause;
  }

  private say(text: string, kind: 'good' | 'bad' | '' = ''): void {
    this.msg.textContent = text;
    this.msg.className = `mg-msg ${kind}`;
    window.clearTimeout(this.msgTimer);
    if (kind === 'bad') this.msgTimer = window.setTimeout(() => this.msg.textContent === text && this.say(''), 1600);
  }

  private bad(text: string): void {
    this.cb.onSound('bad');
    this.say(text, 'bad');
    this.stage.classList.remove('shake');
    void this.stage.offsetWidth;
    this.stage.classList.add('shake');
  }

  /** Pointer drag helper with capture; returns positions relative to `area` (0…1). */
  private drag(el: HTMLElement, area: HTMLElement, h: { down?(p: Pt, e: PointerEvent): void; move?(p: Pt, e: PointerEvent): void; up?(p: Pt, e: PointerEvent): void }): void {
    const rel = (e: PointerEvent): Pt => {
      const r = area.getBoundingClientRect();
      return { x: (e.clientX - r.left) / Math.max(1, r.width), y: (e.clientY - r.top) / Math.max(1, r.height) };
    };
    let id: number | null = null;
    const down = (e: PointerEvent): void => {
      if (id !== null || this.winLeft > 0) return;
      id = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      h.down?.(rel(e), e);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      h.move?.(rel(e), e);
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = null;
      h.up?.(rel(e), e);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  // ── Wires ──
  private buildWires(d: number): void {
    const g = new WiresGame(d, this.rng);
    const n = g.left.length;
    this.stage.innerHTML = `<div class="mg-wires">
      <svg class="mg-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
      <div class="w-col left">${g.left.map((c, i) => `<button class="w-plug" data-li="${i}" style="--c:${WIRE_COLORS[c]!.color}" aria-label="Wire ${i + 1}"><span>${WIRE_COLORS[c]!.mark}</span></button>`).join('')}</div>
      <div class="w-col right">${g.right.map((c, i) => `<div class="w-sock" data-ri="${i}" style="--c:${WIRE_COLORS[c]!.color}"><span>${WIRE_COLORS[c]!.mark}</span></div>`).join('')}</div>
    </div>`;
    const area = this.stage.querySelector<HTMLElement>('.mg-wires')!;
    const svg = area.querySelector('svg')!;
    const yOf = (i: number): number => ((i + 0.5) / n) * 100;
    const line = (x1: number, y1: number, x2: number, y2: number, color: string, live = false): SVGLineElement => {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      l.setAttribute('stroke', color);
      l.setAttribute('class', live ? 'w-live' : 'w-done');
      svg.appendChild(l);
      return l;
    };
    area.querySelectorAll<HTMLElement>('.w-plug').forEach((plug) => {
      const li = Number(plug.dataset.li);
      const color = WIRE_COLORS[g.left[li]!]!.color;
      let live: SVGLineElement | null = null;
      this.drag(plug, area, {
        down: () => {
          if (g.connected.has(g.left[li]!)) return;
          live = line(12, yOf(li), 12, yOf(li), color, true);
        },
        move: (p) => {
          live?.setAttribute('x2', String(Math.max(0, Math.min(100, p.x * 100))));
          live?.setAttribute('y2', String(Math.max(0, Math.min(100, p.y * 100))));
        },
        up: (_p, e) => {
          live?.remove();
          if (!live) return;
          live = null;
          const sock = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.w-sock');
          if (!sock) return;
          const ri = Number(sock.dataset.ri);
          if (g.connect(li, ri)) {
            line(12, yOf(li), 88, yOf(ri), color);
            plug.classList.add('on');
            sock.classList.add('on');
            this.cb.onSound('good');
            if (g.done) this.win();
          } else {
            this.bad('Mali ang socket! Kapareho dapat ng kulay.');
          }
        },
      });
    });
  }

  // ── Card swipe ──
  private buildSwipe(d: number): void {
    this.stage.innerHTML = `<div class="mg-swipe">
      <div class="sw-reader"><span class="sw-led"></span><span class="sw-label">I-SWIPE ANG CURATOR ID →</span></div>
      <div class="sw-track"><div class="sw-card" role="button" aria-label="Curator ID card"><b>CURATOR ID</b><i></i><small>Museo ng Bayan</small></div></div>
    </div>`;
    const track = this.stage.querySelector<HTMLElement>('.sw-track')!;
    const card = this.stage.querySelector<HTMLElement>('.sw-card')!;
    const led = this.stage.querySelector<HTMLElement>('.sw-led')!;
    let x0 = 0;
    let t0 = 0;
    let travel = 0;
    const span = (): number => Math.max(1, track.clientWidth - card.offsetWidth);
    this.drag(card, track, {
      down: (p) => {
        x0 = p.x * track.clientWidth;
        t0 = performance.now();
        travel = 0;
        card.classList.add('held');
        led.className = 'sw-led';
      },
      move: (p) => {
        const px = Math.max(0, Math.min(span(), p.x * track.clientWidth - x0));
        travel = px / span();
        card.style.transform = `translateX(${px}px)`;
      },
      up: () => {
        card.classList.remove('held');
        const v = swipeVerdict(travel, (performance.now() - t0) / 1000, d);
        card.style.transform = '';
        if (v === 'ok') {
          led.className = 'sw-led ok';
          card.style.transform = `translateX(${span()}px)`;
          this.win();
          return;
        }
        led.className = 'sw-led bad';
        this.bad(v === 'fast' ? 'Masyadong mabilis! Dahan-dahan lang.' : v === 'slow' ? 'Masyadong mabagal, bes. Isa pa!' : 'Hanggang dulo ng reader!');
      },
    });
  }

  // ── Display case code ──
  private buildCode(e: Exhibit): void {
    const spec = e.code ?? { answer: '0000', clue: '' };
    const lock = new CodeLock(spec.answer);
    this.stage.innerHTML = `<div class="mg-code">
      <p class="cd-clue">${esc(spec.clue)}</p>
      <div class="cd-hint" aria-label="Hint"></div>
      <div class="cd-screen" aria-live="polite"></div>
      <div class="cd-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok']
        .map((k) => `<button class="cd-key ${k}" data-k="${k}">${k === 'back' ? '⌫' : k === 'ok' ? 'OK' : k}</button>`)
        .join('')}</div>
    </div>`;
    const screen = this.stage.querySelector<HTMLElement>('.cd-screen')!;
    const hint = this.stage.querySelector<HTMLElement>('.cd-hint')!;
    const draw = (): void => {
      screen.textContent = lock.entry.padEnd(spec.answer.length, '•');
      hint.textContent = lock.revealed > 0 ? `Hint: ${lock.hint}` : 'Hint: basahin ang clue ☝️';
    };
    const key = (k: string): void => {
      if (lock.solved) return;
      this.cb.onSound('click');
      if (k === 'back') lock.back();
      else if (k === 'ok') {
        const r = lock.submit();
        if (r === 'ok') this.win();
        else if (r === 'wrong') this.bad('Mali! May dagdag na hint.');
        else this.bad(`${spec.answer.length} digits dapat.`);
      } else lock.press(k);
      draw();
    };
    const pad = this.stage.querySelector<HTMLElement>('.cd-pad')!;
    const click = (ev: Event): void => {
      const k = (ev.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k;
      if (k) key(k);
    };
    pad.addEventListener('click', click);
    this.keyHandler = (ev: KeyboardEvent): void => {
      if (/^\d$/.test(ev.key)) key(ev.key);
      else if (ev.key === 'Backspace') key('back');
      else if (ev.key === 'Enter') key('ok');
    };
    window.addEventListener('keydown', this.keyHandler);
    draw();
  }

  // ── Balangay navigator ──
  private buildNavigate(d: number): void {
    const { start, stops } = makeRoute(d, this.rng);
    const g = new RouteGame(stops);
    const pct = (p: Pt): string => `left:${p.x * 100}%;top:${p.y * 100}%`;
    this.stage.innerHTML = `<div class="mg-sea">
      <svg class="mg-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline class="nv-path" points="" /></svg>
      ${stops.map((p, i) => `<span class="nv-isle" data-i="${i}" style="${pct(p)}">${i + 1}</span>`).join('')}
      <span class="nv-boat" style="${pct(start)}" role="button" aria-label="Balangay">⛵</span>
    </div>`;
    const sea = this.stage.querySelector<HTMLElement>('.mg-sea')!;
    const boat = sea.querySelector<HTMLElement>('.nv-boat')!;
    const path = sea.querySelector('polyline')!;
    const trail: Pt[] = [start];
    const isles = [...sea.querySelectorAll<HTMLElement>('.nv-isle')];
    const mark = (): void => isles.forEach((el, i) => el.classList.toggle('next', i === g.next));
    mark();
    this.drag(boat, sea, {
      move: (p) => {
        const q = { x: Math.max(0.03, Math.min(0.97, p.x)), y: Math.max(0.03, Math.min(0.97, p.y)) };
        boat.style.left = `${q.x * 100}%`;
        boat.style.top = `${q.y * 100}%`;
        if (g.visit(q)) {
          trail.push(stops[g.next - 1]!);
          path.setAttribute('points', trail.map((t) => `${t.x * 100},${t.y * 100}`).join(' '));
          isles[g.next - 1]!.classList.add('done');
          this.cb.onSound('good');
          mark();
          if (g.done) this.win();
        } else {
          // Touching a later island early is a gentle miss, not a reset.
          const wrong = stops.findIndex((s, i) => i > g.next && Math.hypot(s.x - q.x, s.y - q.y) < MINIGAME.navigate.hitRadius);
          if (wrong >= 0 && !isles[wrong]!.classList.contains('warned')) {
            isles[wrong]!.classList.add('warned');
            this.bad(`Isla ${g.next + 1} muna!`);
            window.setTimeout(() => isles[wrong]?.classList.remove('warned'), 900);
          }
        }
      },
    });
  }

  /**
   * Square artwork for restore / dust. Starts as the icon plaque; when the exhibit has a photo,
   * `onPhoto` gets a square crop of it once loaded (skipped if the game was closed meanwhile).
   */
  private artWithPhoto(e: Exhibit, size: number, onPhoto: (url: string) => void): string {
    const photo = exhibitPhoto(e.id);
    if (photo) {
      const stage = this.stage.firstElementChild;
      const img = new Image();
      img.onload = (): void => {
        if (this.stage.firstElementChild !== stage && stage !== null) return;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d');
        if (!x || !img.naturalWidth) return;
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) * (photo.focusY ?? 0.5);
        x.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        x.strokeStyle = '#ffd34d';
        x.lineWidth = size * 0.03;
        x.strokeRect(size * 0.015, size * 0.015, size * 0.97, size * 0.97);
        onPhoto(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = exhibitAsset(photo.file);
    }
    return this.art(e, size);
  }

  /** Square artwork for restore / dust: the exhibit's icon on a museum-plaque background. */
  private art(e: Exhibit, size: number): string {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x) return '';
    const grd = x.createLinearGradient(0, 0, size, size);
    const pal = e.kind === 'folklore' ? ['#3b2a6b', '#8b5cf6'] : e.kind === 'artifact' ? ['#6b3f1d', '#e0a94a'] : ['#1f2d6b', '#d9483b'];
    grd.addColorStop(0, pal[0]!);
    grd.addColorStop(1, pal[1]!);
    x.fillStyle = grd;
    x.fillRect(0, 0, size, size);
    x.strokeStyle = '#ffd34d';
    x.lineWidth = size * 0.03;
    x.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${size * 0.42}px serif`;
    x.fillText(e.icon, size / 2, size * 0.44);
    x.fillStyle = '#fff6e0';
    x.font = `bold ${size * 0.07}px sans-serif`;
    const t = e.title.length > 26 ? `${e.title.slice(0, 25)}…` : e.title;
    x.fillText(t, size / 2, size * 0.82);
    // Corner marks so every tile has something to line up.
    x.fillStyle = '#ffd34d';
    for (const [cx, cy] of [
      [0.12, 0.12],
      [0.88, 0.12],
      [0.12, 0.88],
      [0.88, 0.88],
    ] as const)
      x.fillRect(size * cx - size * 0.02, size * cy - size * 0.02, size * 0.04, size * 0.04);
    return c.toDataURL();
  }

  // ── Restore the artifact ──
  private buildRestore(e: Exhibit, d: number): void {
    const size = MINIGAME.restore.size;
    const p = new SwapPuzzle(size, d, this.rng);
    let url = '';
    this.stage.innerHTML = `<div class="mg-restore" style="--n:${size}">${p.order.map((_, i) => `<button class="rs-tile" data-i="${i}" aria-label="Piece ${i + 1}"></button>`).join('')}</div>`;
    const tiles = [...this.stage.querySelectorAll<HTMLElement>('.rs-tile')];
    url = this.artWithPhoto(e, 360, (u) => {
      url = u;
      draw();
    });
    const draw = (): void =>
      tiles.forEach((t, slot) => {
        const piece = p.order[slot]!;
        t.style.backgroundImage = `url(${url})`;
        t.style.backgroundSize = `${size * 100}% ${size * 100}%`;
        t.style.backgroundPosition = `${((piece % size) / (size - 1)) * 100}% ${(Math.floor(piece / size) / (size - 1)) * 100}%`;
        t.classList.toggle('sel', p.selected === slot);
        t.classList.toggle('right', piece === slot);
      });
    this.stage.querySelector('.mg-restore')!.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('.rs-tile');
      if (!t || p.solved) return;
      const before = p.misplaced;
      p.tap(Number(t.dataset.i));
      this.cb.onSound(p.misplaced < before ? 'good' : 'click');
      draw();
      if (p.solved) this.win();
    });
    draw();
  }

  // ── Dust off ──
  private buildDust(e: Exhibit, d: number): void {
    const { cols, rows, brush } = MINIGAME.dust;
    const grid = new DustGrid(cols, rows, d);
    this.stage.innerHTML = `<div class="mg-dust"><img class="du-art" alt="" /><canvas class="du-dust"></canvas><div class="du-bar"><i></i></div></div>`;
    const box = this.stage.querySelector<HTMLElement>('.mg-dust')!;
    const img = box.querySelector<HTMLImageElement>('.du-art')!;
    img.src = this.artWithPhoto(e, 360, (u) => (img.src = u));
    const cv = box.querySelector<HTMLCanvasElement>('.du-dust')!;
    const bar = box.querySelector<HTMLElement>('.du-bar i')!;
    cv.width = 360;
    cv.height = 240;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#9c8f7a';
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = this.rng() < 0.5 ? 'rgba(80,70,55,0.35)' : 'rgba(210,200,180,0.35)';
        ctx.fillRect(this.rng() * cv.width, this.rng() * cv.height, 2 + this.rng() * 5, 2 + this.rng() * 5);
      }
      ctx.fillStyle = 'rgba(60,50,40,0.75)';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧹 kuskusin dito', cv.width / 2, cv.height / 2);
    }
    let last: Pt | null = null;
    const rub = (p: Pt): void => {
      const steps = last ? Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (brush * 0.5))) : 1;
      for (let s = 1; s <= steps; s++) {
        const q = last ? { x: last.x + ((p.x - last.x) * s) / steps, y: last.y + ((p.y - last.y) * s) / steps } : p;
        grid.rub(q.x, q.y, brush);
        if (ctx) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(q.x * cv.width, q.y * cv.height, brush * cv.width * 1.05, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      last = p;
      bar.style.width = `${Math.min(100, (grid.fraction / grid.target) * 100)}%`;
      if (grid.done) {
        cv.classList.add('clear');
        this.win();
      }
    };
    this.drag(cv, cv, {
      down: (p) => {
        last = null;
        rub(p);
      },
      move: (p) => rub(p),
      up: () => {
        last = null;
      },
    });
  }

  // ── Timeline sort ──
  private buildTimeline(e: Exhibit): void {
    const events = e.timeline ?? [];
    const t = new TimelineSort(events, this.rng);
    this.stage.innerHTML = `<div class="mg-timeline">
      <ol class="tl-placed"></ol>
      <div class="tl-cards">${t.shown.map((i) => `<button class="tl-card" data-i="${i}">${esc(events[i]!.label)}</button>`).join('')}</div>
    </div>`;
    const placed = this.stage.querySelector<HTMLElement>('.tl-placed')!;
    this.stage.querySelector('.tl-cards')!.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('.tl-card');
      if (!b || b.hasAttribute('disabled')) return;
      const i = Number(b.dataset.i);
      if (t.tap(i)) {
        b.setAttribute('disabled', '');
        b.classList.add('used');
        placed.insertAdjacentHTML('beforeend', `<li><b>${events[i]!.year}</b> ${esc(events[i]!.label)}</li>`);
        this.cb.onSound('good');
        if (t.done) this.win();
      } else {
        this.bad('Hindi pa ‘yan. Ano ang mas nauna?');
      }
    });
  }

  // ── Baybayin match ──
  private buildBaybayin(d: number): void {
    const g = new BaybayinMatch(d, this.rng);
    this.stage.innerHTML = `<div class="mg-bay">
      <div class="by-row glyphs">${g.picks.map((b, p) => `<button class="by-glyph" data-p="${p}" lang="tl">${BAYBAYIN[b]!.glyph}</button>`).join('')}</div>
      <p class="by-tip">⬇ tap ang tamang tunog</p>
      <div class="by-row sounds">${g.sounds.map((p) => `<button class="by-sound" data-p="${p}">${esc(BAYBAYIN[g.picks[p]!]!.sound)}</button>`).join('')}</div>
    </div>`;
    const box = this.stage.querySelector<HTMLElement>('.mg-bay')!;
    const draw = (): void => {
      box.querySelectorAll<HTMLElement>('.by-glyph').forEach((el) => {
        const p = Number(el.dataset.p);
        el.classList.toggle('sel', g.selected === p);
        el.classList.toggle('done', g.matched.has(p));
      });
      box.querySelectorAll<HTMLElement>('.by-sound').forEach((el) => el.classList.toggle('done', g.matched.has(Number(el.dataset.p))));
    };
    box.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('button');
      if (!el || el.classList.contains('done')) return;
      const p = Number(el.dataset.p);
      if (el.classList.contains('by-glyph')) {
        g.selectGlyph(p);
        this.cb.onSound('click');
      } else if (g.selected === null) {
        this.say('Pumili muna ng baybayin sa taas ⬆');
      } else if (g.pickSound(p)) {
        this.cb.onSound('good');
        if (g.done) this.win();
      } else {
        this.bad('Hindi tugma. Subukan ulit!');
      }
      draw();
    });
    draw();
  }

  dispose(): void {
    this.close();
    this.root.remove();
  }
}
