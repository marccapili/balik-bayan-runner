// captions.js: the words painted into the film. Speech bubbles that pop in and type on above whoever is talking, the
// narrator's caption, era cards ("Mactan, 1521") and the tunnel's year counter. Texts and times come from lines.js.
// Call lines(t) in every shot right after camEnd() (before its wipe / iris), so transitions cover the words too.
(() => {
  const FONT = (px) => `800 ${px}px "Baloo 2", "Trebuchet MS", sans-serif`;
  const CX0 = 380, CX1 = 1540;   // keep words inside the centre of the frame (the phone-portrait crop)
  window.HEADS = {};             // screen position of each speaker's head top this frame (hero() fills it)

  let mctx = null;
  const measure = (txt, px) => { mctx = mctx || document.createElement('canvas').getContext('2d'); mctx.font = FONT(px); return mctx.measureText(txt).width; };
  function wrap(txt, px, maxW) {
    const words = txt.split(' '), out = []; let cur = '';
    for (const w of words) { const nxt = cur ? cur + ' ' + w : w; if (cur && measure(nxt, px) > maxW) { out.push(cur); cur = w; } else cur = nxt; }
    if (cur) out.push(cur);
    return out;
  }
  // Types text on at `cps` characters a second, keeping the full layout from the first frame (no reflow).
  const typed = (txt, age, cps = 30) => txt.slice(0, Math.max(0, Math.floor(age * cps)));

  function bubble(who, text, age, left, key) {
    const px = who === 'guard' || /!!!/.test(text) ? 66 : 58, L = wrap(text, px, 820), lh = px * 1.08;
    const tw = Math.max(...L.map(l => measure(l, px))), w = tw + 80, h = L.length * lh + 104;
    const k = backOut(seg(age, 0, .18)) * ease(seg(-left, 0, .14));   // pop in, shrink out
    if (k <= .02) return;
    const head = HEADS[who];
    let bx = head ? head[0] : 960, by = head ? head[1] - 70 - h / 2 : 160 + h / 2;
    bx = clamp(bx, CX0 + w / 2, CX1 - w / 2); by = clamp(by, 40 + h / 2, 760 - h / 2);
    const col = who === 'guard' ? '#DBE8FF' : '#FFFDF6';
    boilSeed('bubble' + key);
    push(); translate(bx, by); scale(k);
    if (head) {   // the tail points at the speaker's head
      const dx = clamp(head[0] - bx, -w / 2 + 40, w / 2 - 40), tip = [clamp(head[0] - bx, -w / 2 - 60, w / 2 + 60), Math.min(h / 2 + 70, Math.max(h / 2 + 30, head[1] - by - 20))];
      paint([[dx - 26, h / 2 - 6], [dx + 26, h / 2 - 6], tip], { wash: col, ink: PAL.ink, sw: 1.1 });
    }
    paint(rrPts(-w / 2, -h / 2, w, h, 34), { wash: col, ink: PAL.ink, sw: 1.3 });
    pop();
    if (k < .9) return;   // words appear once the bubble has landed
    const name = LORE_FILM.names[who];
    if (name) letter(name.toUpperCase(), bx, by - h / 2 + 32, 30, '#C8302C', { font: FONT(30), ink: false });
    let n = Math.max(0, Math.floor((age - .12) * 30));
    L.forEach((line, i) => {
      const part = line.slice(0, n); n -= line.length + 1;
      if (part) letter(part, bx - tw / 2, by - (L.length - 1) * lh / 2 + i * lh + 20, px, PAL.ink, { font: FONT(px), ink: false, align: 'left' });
    });
  }

  function narrator(text, age, left) {
    const a = seg(age, 0, .3) * seg(-left, 0, .3);
    if (a <= 0) return;
    letter(typed(text, age, 22), 960, 860, 60, PAL.cream, { font: `italic ${FONT(60)}`, alpha: a, stroke: PAL.ink, ink: false });
  }

  function eraCard(text, lt) {
    const show = seg(lt, .35, .55) * (1 - seg(lt, 3.2, 3.45));
    if (show <= 0) return;
    const px = 50, w = measure(text, px) + 60, h = 84, x = CX0 + 10, y = 60;
    boilSeed('era' + text);
    push(); translate(x + w / 2, y + h / 2); rotate(-.035); scale(backOut(seg(lt, .35, .6)));
    paint(rectPts(-w / 2 + 8, -h / 2 + 8, w, h), { wash: PAL.ink, washOp: 200, ink: null });
    paint(rectPts(-w / 2, -h / 2, w, h, 1.5), { wash: '#FFF1D0', ink: PAL.ink, sw: 1.4 });
    pop();
    letter(typed(text, lt - .55, 24), x + 30, y + h / 2 + 4, px, '#2A1608', { font: FONT(px), ink: false, align: 'left', rot: -.035, alpha: 1 - seg(lt, 3.2, 3.45) });
  }

  function tunnelYear(lt, dur) {
    const ys = LORE_FILM.tunnelYears, i = Math.min(ys.length - 1, Math.floor(lt / dur * ys.length)), age = lt - i * dur / ys.length;
    const k = 1 + .6 * Math.exp(-age * 8), a = seg(age, 0, .12) * (1 - seg(lt, dur - .5, dur - .2));
    if (a <= 0) return;
    glow(960, 230, 260, '#FF7AD9', .6 * a);
    letter(String(ys[i]), 960, 230, 150 * k, '#FFF6DF', { font: FONT(Math.round(150 * k)), stroke: '#7A1FA8', ink: false, alpha: a });
  }

  // Everything with words for this frame, then the letters are painted in (so the shot's wipe covers them).
  window.lines = function lines(t) {
    const S = LORE_FILM.scenes; let si = 0; while (si + 1 < S.length && t >= S[si + 1].start) si++;
    const s = S[si], lt = t - s.start, dur = (S[si + 1]?.start ?? DUR) - s.start;
    if (s.era) eraCard(s.era, lt);
    if (s.id === 'tunnel') tunnelYear(lt, dur);
    s.lines.forEach(([a, b, who, text], i) => {
      if (lt < a || lt > b) return;
      if (who === 'narrator') narrator(text, lt - a, lt - b);
      else bubble(who, text, lt - a, lt - b, s.id + i);
    });
    window.HEADS = {};
    flushLetters();
  };
})();
