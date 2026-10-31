import { BAYBAYIN, MINIGAME, WIRE_COLORS } from '../data/minigames';
import { clamp, lerp } from '../utils/math';

/**
 * Engine-free rules for the exhibit mini-games (unit-tested). The UI in ui/MiniGameHost.ts only
 * turns pointer input into calls here and draws the state. `d` = difficulty 0…1.
 */

type Rng = () => number;

export function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Shuffles until the order differs from the input (for lists of 2+). */
function shuffledDifferent(n: number, rng: Rng): number[] {
  const base = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return base;
  for (let t = 0; t < 20; t++) {
    const s = shuffle([...base], rng);
    if (s.some((v, i) => v !== i)) return s;
  }
  return [...base.slice(1), base[0]!];
}

export const countFor = (r: { min: number; max: number }, d: number): number => Math.round(lerp(r.min, r.max, clamp(d, 0, 1)));

// ── Rewire the display lights ──
export class WiresGame {
  /** Colour index of each right-hand socket, top to bottom. */
  readonly right: number[];
  readonly left: number[];
  readonly connected = new Set<number>();

  constructor(d: number, rng: Rng) {
    const n = Math.min(WIRE_COLORS.length, countFor(MINIGAME.wires, d));
    this.left = Array.from({ length: n }, (_, i) => i);
    this.right = shuffledDifferent(n, rng);
  }

  /** Left wire `li` dropped on right socket `ri`. True when the colours match. */
  connect(li: number, ri: number): boolean {
    const c = this.left[li];
    if (c === undefined || this.connected.has(c) || this.right[ri] !== c) return false;
    this.connected.add(c);
    return true;
  }

  get done(): boolean {
    return this.connected.size === this.left.length;
  }
}

// ── Curator card swipe ──
export type SwipeVerdict = 'ok' | 'fast' | 'slow' | 'short';

/** `travel` = fraction of the reader crossed (0…1), `seconds` = swipe duration. */
export function swipeVerdict(travel: number, seconds: number, d: number): SwipeVerdict {
  const s = MINIGAME.swipe;
  if (travel < s.travel) return 'short';
  if (seconds < s.minSeconds) return 'fast';
  if (seconds > lerp(s.maxSecondsEasy, s.maxSecondsHard, clamp(d, 0, 1))) return 'slow';
  return 'ok';
}

// ── Display case code ──
export class CodeLock {
  entry = '';
  /** How many leading digits are shown as a hint (grows after each wrong try). */
  revealed = 0;
  wrong = 0;
  solved = false;

  constructor(readonly answer: string) {}

  press(digit: string): void {
    if (this.solved || !/^\d$/.test(digit) || this.entry.length >= this.answer.length) return;
    this.entry += digit;
  }

  back(): void {
    this.entry = this.entry.slice(0, -1);
  }

  /** Checks a full entry. Wrong clears it and reveals one more digit. */
  submit(): 'ok' | 'wrong' | 'incomplete' {
    if (this.entry.length < this.answer.length) return 'incomplete';
    if (this.entry === this.answer) {
      this.solved = true;
      return 'ok';
    }
    this.wrong++;
    this.revealed = Math.min(this.answer.length - 1, this.revealed + 1);
    this.entry = '';
    return 'wrong';
  }

  get hint(): string {
    return this.answer.slice(0, this.revealed) + '_'.repeat(this.answer.length - this.revealed);
  }
}

// ── Balangay navigator (chart a course through numbered islands) ──
export interface Pt {
  x: number;
  y: number;
}

/** Island positions in a 0…1 box, spread out so none overlap; the boat starts at `start`. */
export function makeRoute(d: number, rng: Rng): { start: Pt; stops: Pt[] } {
  const n = countFor(MINIGAME.navigate, d);
  const start = { x: 0.1, y: 0.85 };
  const stops: Pt[] = [];
  let guard = 0;
  while (stops.length < n && guard++ < 500) {
    const p = { x: 0.12 + rng() * 0.76, y: 0.12 + rng() * 0.7 };
    const far = [start, ...stops].every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= MINIGAME.navigate.minGap);
    if (far) stops.push(p);
  }
  // Fallback grid (only if the random fill got stuck).
  while (stops.length < n) stops.push({ x: 0.2 + 0.15 * stops.length, y: 0.2 + 0.1 * (stops.length % 2) });
  return { start, stops };
}

export class RouteGame {
  next = 0;
  constructor(readonly stops: readonly Pt[]) {}

  /** Boat moved to `p`. Returns true when it just reached the next island. */
  visit(p: Pt): boolean {
    const s = this.stops[this.next];
    if (!s || Math.hypot(s.x - p.x, s.y - p.y) > MINIGAME.navigate.hitRadius) return false;
    this.next++;
    return true;
  }

  get done(): boolean {
    return this.next >= this.stops.length;
  }
}

// ── Restore the artifact (swap tiles back into place) ──
export class SwapPuzzle {
  /** order[slot] = the piece shown in that slot. Solved when order[i] === i. */
  readonly order: number[];
  selected: number | null = null;
  moves = 0;

  constructor(
    readonly size: number,
    d: number,
    rng: Rng,
  ) {
    const n = size * size;
    this.order = Array.from({ length: n }, (_, i) => i);
    const swaps = Math.round(lerp(MINIGAME.restore.swapsEasy, MINIGAME.restore.swapsHard, clamp(d, 0, 1)));
    let guard = 0;
    while ((this.solved || this.misplaced < Math.min(n, swaps + 1)) && guard++ < 200) {
      const a = Math.floor(rng() * n);
      const b = Math.floor(rng() * n);
      if (a !== b) [this.order[a], this.order[b]] = [this.order[b]!, this.order[a]!];
    }
  }

  get misplaced(): number {
    return this.order.filter((v, i) => v !== i).length;
  }

  get solved(): boolean {
    return this.order.every((v, i) => v === i);
  }

  /** First tap selects, second tap swaps (same tile = deselect). */
  tap(slot: number): void {
    if (slot < 0 || slot >= this.order.length || this.solved) return;
    if (this.selected === null) {
      this.selected = slot;
      return;
    }
    if (this.selected !== slot) {
      const a = this.selected;
      [this.order[a], this.order[slot]] = [this.order[slot]!, this.order[a]!];
      this.moves++;
    }
    this.selected = null;
  }
}

// ── Dust off ──
export class DustGrid {
  readonly clean: Uint8Array;
  private cleaned = 0;
  readonly target: number;

  constructor(
    readonly cols: number,
    readonly rows: number,
    d: number,
  ) {
    this.clean = new Uint8Array(cols * rows);
    this.target = lerp(MINIGAME.dust.targetEasy, MINIGAME.dust.targetHard, clamp(d, 0, 1));
  }

  /** Rubs at (x, y) in 0…1 with radius r (fraction of width). Returns cells newly cleaned. */
  rub(x: number, y: number, r: number): number {
    let n = 0;
    const aspect = this.cols / this.rows;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i;
        if (this.clean[k]) continue;
        const cx = (i + 0.5) / this.cols;
        const cy = (j + 0.5) / this.rows;
        if (Math.hypot(cx - x, (cy - y) / aspect) <= r) {
          this.clean[k] = 1;
          n++;
        }
      }
    }
    this.cleaned += n;
    return n;
  }

  get fraction(): number {
    return this.cleaned / this.clean.length;
  }

  get done(): boolean {
    return this.fraction >= this.target;
  }
}

// ── Timeline sort ──
export class TimelineSort {
  /** Shown order (indices into `events`). */
  readonly shown: number[];
  /** Events placed so far, in order. */
  readonly placed: number[] = [];
  mistakes = 0;
  private readonly sorted: number[];

  constructor(
    readonly events: readonly { year: number; label: string }[],
    rng: Rng,
  ) {
    this.sorted = events.map((_, i) => i).sort((a, b) => events[a]!.year - events[b]!.year);
    this.shown = shuffledDifferent(events.length, rng);
  }

  /** Taps event `i`. True if it is the next one in time. */
  tap(i: number): boolean {
    if (this.placed.includes(i)) return false;
    if (this.sorted[this.placed.length] === i) {
      this.placed.push(i);
      return true;
    }
    this.mistakes++;
    return false;
  }

  get done(): boolean {
    return this.placed.length === this.events.length;
  }
}

// ── Baybayin match ──
export class BaybayinMatch {
  /** Characters in play (indices into BAYBAYIN). */
  readonly picks: number[];
  /** Sound buttons order (indices into `picks`). */
  readonly sounds: number[];
  readonly matched = new Set<number>();
  selected: number | null = null;
  mistakes = 0;

  constructor(d: number, rng: Rng) {
    const n = countFor(MINIGAME.baybayin, d);
    this.picks = shuffle(BAYBAYIN.map((_, i) => i), rng).slice(0, n);
    this.sounds = shuffledDifferent(n, rng);
  }

  selectGlyph(p: number): void {
    if (!this.matched.has(p)) this.selected = p;
  }

  /** Taps sound for pick `p`. True on a match with the selected glyph. */
  pickSound(p: number): boolean {
    if (this.selected === null) return false;
    if (this.selected === p) {
      this.matched.add(p);
      this.selected = null;
      return true;
    }
    this.mistakes++;
    this.selected = null;
    return false;
  }

  get done(): boolean {
    return this.matched.size === this.picks.length;
  }
}
