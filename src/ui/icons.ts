/**
 * One icon set for the whole UI (Phosphor "fill", see iconData.ts) instead of system emoji, which
 * look different on every phone. Three ways in:
 *  - `icon('coin')` → inline SVG markup for templates;
 *  - `installIconizer()` → swaps any known emoji that lands in the DOM (data strings, textContent)
 *    for the same SVG, so copy can keep a readable emoji as its "icon tag";
 *  - `drawIcon(ctx, …)` → the same glyph on a 2D canvas (3D signs, mini-game art).
 */
import { EMOJI_ICONS, ICON_PATHS, type IconName } from './iconData';

export type { IconName };

const SVG_NS = 'http://www.w3.org/2000/svg';
const VARIATION = '️';

/** Longest first so multi-character keys win; an optional variation selector trails each emoji. */
const EMOJI_RE = new RegExp(
  `(${Object.keys(EMOJI_ICONS)
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})${VARIATION}?`,
  'gu',
);

/** Icon name for an emoji (with or without its variation selector), if we draw one. */
export function iconForEmoji(emoji: string): IconName | undefined {
  return EMOJI_ICONS[emoji.replaceAll(VARIATION, '')];
}

/** Inline SVG markup. Sized in `em`, coloured by `currentColor` (tints live in styles.css). */
export function icon(name: IconName, extraClass = ''): string {
  return `<svg class="ic ic-${name}${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${ICON_PATHS[name]}"/></svg>`;
}

function iconEl(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `ic ic-${name}`);
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}

/** Replaces known emoji in a text string with icon markup (for strings that become innerHTML). */
export function iconizeHtml(html: string): string {
  return html.replace(EMOJI_RE, (_m, e: string) => icon(EMOJI_ICONS[e]!));
}

const SKIP = 'svg, script, style, textarea, input, [data-noicon]';

function swapTextNode(node: Text): void {
  const text = node.data;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  EMOJI_RE.lastIndex = 0;
  for (let m = EMOJI_RE.exec(text); m; m = EMOJI_RE.exec(text)) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    frag.appendChild(iconEl(EMOJI_ICONS[m[1]!]!));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.replaceWith(frag);
}

function sweep(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    swapTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || (root as Element).namespaceURI === SVG_NS) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.length > 0) found.push(n as Text);
  }
  for (const t of found) swapTextNode(t);
}

let installed = false;

/** Keeps the page emoji-free: sweeps what is there now, then every node that is added or edited. */
export function installIconizer(root: Node = document.body): void {
  if (installed) return;
  installed = true;
  sweep(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') sweep(r.target);
      else for (const n of r.addedNodes) sweep(n);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
}

const path2d = new Map<IconName, Path2D>();

/** Draws an icon centred on (cx, cy), `size` pixels wide, on a 2D canvas. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number, color: string): void {
  let p = path2d.get(name);
  if (!p) path2d.set(name, (p = new Path2D(ICON_PATHS[name])));
  const s = size / 256;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.fill(p);
  ctx.restore();
}
