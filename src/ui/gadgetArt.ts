import type { GadgetKind } from '../data/gadgets';

/**
 * Original pixel-art gadget icons, drawn on a 24×24 grid with an automatic dark outline,
 * then scaled up with nearest-neighbour so they stay crisp. Shared by the 3D pickups and the HUD.
 */
const N = 24;
const OUTLINE = '#1a1030';

type Grid = (string | null)[];

function grid(): Grid {
  return new Array<string | null>(N * N).fill(null);
}

function set(g: Grid, x: number, y: number, c: string): void {
  if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = c;
}

function rect(g: Grid, x0: number, y0: number, w: number, h: number, c: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(g, x, y, c);
}

function disc(g: Grid, cx: number, cy: number, r: number, c: string): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(g, x, y, c);
}

/** Adds a 1-pixel dark outline around every filled shape. */
function outline(g: Grid): Grid {
  const out = g.slice();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (g[y * N + x]) continue;
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && !!g[ny * N + nx] && g[ny * N + nx] !== 'spark';
      });
      if (near) out[y * N + x] = OUTLINE;
    }
  return out;
}

function smoke(): Grid {
  const g = grid();
  // Round bomb with a purple band and a lit fuse, puffing a lilac cloud.
  disc(g, 8.5, 15, 6, '#c9d3e6');
  rect(g, 3, 13, 12, 3, '#8a4fd1');
  disc(g, 6.5, 12.5, 1.5, '#ffffff');
  rect(g, 7, 7, 3, 2, '#7d86a0');
  rect(g, 9, 5, 1, 2, '#c08a3e');
  set(g, 10, 4, '#ffcf3f');
  disc(g, 17, 6, 3.2, '#d6b6ff');
  disc(g, 20, 9, 2.6, '#d6b6ff');
  disc(g, 15, 9.5, 2.4, '#c59cff');
  set(g, 16, 5, '#ffffff');
  set(g, 20, 8, '#ffffff');
  return outline(g);
}

function magnet(): Grid {
  const g = grid();
  // Gold coin top-left, red horseshoe magnet bottom-right.
  disc(g, 7, 7, 5, '#f2c14e');
  disc(g, 7, 7, 3, '#e0962f');
  rect(g, 6, 5, 2, 4, '#ffe28a');
  for (let a = 0; a <= 180; a += 6) {
    const r = (a * Math.PI) / 180;
    disc(g, 15 + Math.cos(r) * 5, 15 + Math.sin(r) * 5, 1.7, '#e0413c');
  }
  rect(g, 8, 10, 4, 5, '#e0413c');
  rect(g, 18, 10, 4, 5, '#e0413c');
  rect(g, 8, 9, 4, 2, '#f4f4f4');
  rect(g, 18, 9, 4, 2, '#f4f4f4');
  rect(g, 12, 18, 6, 1, '#a52a2a');
  return outline(g);
}

function bubble(): Grid {
  const g = grid();
  // Quartered blue shield with sparkles.
  for (let y = 4; y < 20; y++) {
    const half = y < 13 ? 7 : Math.max(0, 7 - (y - 12));
    for (let x = 12 - half; x < 12 + half; x++) {
      const left = x < 12;
      const top = y < 12;
      set(g, x, y, left === top ? '#e8f4ff' : '#3f8fe0');
    }
  }
  rect(g, 6, 4, 12, 1, '#7fc4ff');
  const sp = '#5fb8ff';
  for (const [x, y] of [
    [2, 6],
    [21, 6],
    [2, 15],
    [21, 15],
    [12, 1],
  ]) {
    set(g, x!, y!, sp);
    set(g, x! - 1, y!, sp);
    set(g, x! + 1, y!, sp);
    set(g, x!, y! - 1, sp);
    set(g, x!, y! + 1, sp);
  }
  return outline(g);
}

function freeze(): Grid {
  const g = grid();
  // Hourglass: gold caps, glass bulbs, sand running down.
  rect(g, 5, 2, 14, 3, '#f2c14e');
  rect(g, 5, 19, 14, 3, '#f2c14e');
  for (let y = 5; y < 19; y++) {
    const t = y < 12 ? y - 5 : 18 - y;
    const half = Math.max(1, 6 - t);
    rect(g, 12 - half, y, half * 2, 1, '#bfe8ff');
  }
  rect(g, 8, 6, 8, 3, '#5aa8e8');
  rect(g, 11, 9, 2, 8, '#e0962f');
  rect(g, 7, 16, 10, 3, '#e0962f');
  set(g, 9, 7, '#ffffff');
  return outline(g);
}

const DRAW: Record<GadgetKind, () => Grid> = { smoke, magnet, bubble, freeze };
const cache = new Map<string, HTMLCanvasElement>();

/** The icon as a canvas, `px` pixels per grid cell (no smoothing). */
export function gadgetCanvas(kind: GadgetKind, px = 4): HTMLCanvasElement {
  const key = `${kind}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = N * px;
  const ctx = c.getContext('2d')!;
  const g = DRAW[kind]();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const col = g[y * N + x];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * px, y * px, px, px);
    }
  cache.set(key, c);
  return c;
}

/** Data URL for HUD `<img>` tags. */
export function gadgetIconUrl(kind: GadgetKind): string {
  return gadgetCanvas(kind, 4).toDataURL();
}
