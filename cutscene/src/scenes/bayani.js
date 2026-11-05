// bayani.js: the Balik Bayan Runner cast, painted in the kit's watercolour + ink style.
// Chibi humans: a big round head, a small body, stubby limbs. The face reuses Clawd's eyes(), mouth() and blush(), so
// every emotion in EMO (feel / emotions) works on a hero too, plus painted eyebrows that follow the eyes.
//
// hero(x, y, u, o): (x, y) is the ground point between the feet. Body-local units (u):
//   legs 0..-3u, torso -3..-7.2u, shoulders (±2.5u, -6.4u), head centre (0, -11.4u), radius ~4.6u.
// Options: who (lapulapu | gabriela | rizal | bonifacio | guard), view (front | q | side), flip, dx, dy, sq, rot, s
//   (overall scale), aL / aR (Clawd's arm angles: .2 = resting, 1+ = up), walk (leg phase), run (bigger stride),
//   sit, wind (-1..1 hair/cloth streaming), hatOff, noHat, propR / propL (draw at the hand), smear + smearDir,
//   + every face option clawd() takes (eyes, mouth, lookX, lookY, squint, blush, tint, emote, emoteK, emoteAge, seed).
// Watercolour `fill` is very slow without a GPU (seconds a call in SwiftShader), so this video paints with flat washes
// only: a fill becomes a wash of the same colour (blended with the wash when both are given).
{
  const _paintAt = paintAt;
  paintAt = (pts, o) => {
    if (o.fill) {
      const op = (o.fillOp ?? 170) / 255;
      o = o.wash ? { ...o, wash: mixCol(o.wash, o.fill, op * .5), fill: null } : { ...o, wash: o.fill, washOp: Math.round(255 * op * .8), fill: null };
    }
    return _paintAt(pts, o);
  };
}
(() => {
  const SKIN = { lapulapu: '#B8744A', gabriela: '#D9A27A', rizal: '#E6B98F', bonifacio: '#D69E74', guard: '#C98E64' };
  const LOOK = {
    lapulapu: { hair: '#2A1A12', top: null, sleeve: null, pants: null, legSkin: true, belt: '#B5262E', band: '#C3212A' },
    gabriela: { hair: '#2D1A13', top: '#F4EEDF', sleeve: '#F4EEDF', skirt: '#A3262E', band: '#9E2A26' },
    rizal:    { hair: '#1B1411', top: '#2A2733', sleeve: '#2A2733', pants: '#1E1C24', shoe: '#141218' },
    bonifacio:{ hair: '#3B1A14', top: '#F4EEDF', sleeve: '#F4EEDF', pants: '#3A3448', shoe: '#2A2230', scarf: '#C8302C' },
    guard:    { hair: '#231A16', top: '#2F3C7A', sleeve: '#2F3C7A', pants: '#232A55', shoe: '#17162A' },
  };
  const P = (pts, u) => pts.map(([a, b]) => [a * u, b * u]);
  // Clawd's arm angle → a human arm (resting hangs down at the side, 1.1+ reaches out / up)
  const armA = a => clamp((a - .2) * 1.3 - 1.05, -1.52, 2.6);
  const HC = -11.4;   // head centre y (u)

  // views: face offset / squash (as in clawd.js), torso width, which arms show
  const HV = {
    front: { cx: 0, fw: 1, sides: [-1, 1], bx: 3.3, tw: 1, hx: 0 },
    q:     { cx: 1.35, fw: .8, sides: [-1, 1], bx: 3.1, tw: .86, hx: .5 },
    side:  { cx: 2.3, fw: .55, sides: [1], bx: 1.4, tw: .62, hx: .9 },
  };

  function skinOf(o, base) {
    const tc = o.tint && (TINT[o.tint] || o.tint), k = clamp(o.tintK ?? 1);
    return tc && k > 0 ? mixCol(base, tc, .4 * k) : base;
  }

  // ---------- eyebrows: they carry most of a face's acting ----------
  function brows(u, o, sw, sides) {
    const e = Array.isArray(o.eyes) ? o.eyes[1] : o.eyes || 'normal';
    let lift = 0, tilt = 0;   // lift (u, up), tilt (+ = inner end down = cross)
    if (['angry', 'determined', 'red'].includes(e)) { tilt = e === 'determined' ? .5 : .8; lift = -.15; }
    else if (['sad', 'teary', 'cry', 'scared'].includes(e)) { tilt = -.6; lift = .25; }
    else if (['wide', 'shine', 'spark', 'blank'].includes(e)) { lift = .55; }
    else if (['happy', 'closed', 'heart'].includes(e)) { lift = .3; tilt = -.15; }
    else if (['narrow', 'sleepy'].includes(e)) { lift = -.25; tilt = .1; }
    else if (e === 'squeeze') { tilt = .5; lift = -.1; }
    if (o.brow != null) tilt = o.brow;
    const sq = clamp(o.squint || 0) * .3;
    for (const s of sides) {
      const ox = s * 2.5, y0 = -8.15 - lift + sq;
      const inner = [ox - s * 1, y0 + tilt * .45], outer = [ox + s * .95, y0 - tilt * .2 - .1];
      inkLine(P([inner, [ox, y0 - .25], outer], u), sw * 1.5, o.browCol || PAL.ink, 'ink', .5);
    }
  }

  // ---------- hair, per hero (head-local: origin at the head centre) ----------
  function hairBack(who, u, sw, L, wind, t) {
    const w = wind || 0;
    if (who === 'lapulapu') {   // long wavy hair to the shoulders, streams with the wind
      const pts = [[-4.6, -1], [-5.2, 2.5], [-4.4, 4.6 + w * .4], [-2.4, 5.2], [0, 4.6], [2.4, 5.2], [4.4, 4.6 - w * .4], [5.2, 2.5], [4.6, -1]];
      paint(P(pts.map(([a, b]) => [a - w * (b > 2 ? 2.2 * (b - 2) / 3 : 0) + (b > 2 ? .25 * Math.sin(t * 9 + a) : 0), b]), u), { wash: L.hair, ink: PAL.ink, sw: sw * .8, curv: .5 });
    } else if (who === 'gabriela') {   // long hair down the back, a low bun
      const pts = [[-4.5, -.5], [-4.9, 3.6], [-3.6, 6.2], [0, 6.6], [3.6, 6.2], [4.9, 3.6], [4.5, -.5]];
      paint(P(pts.map(([a, b]) => [a - w * (b > 3 ? 2.5 * (b - 3) / 3.6 : 0) + (b > 3 ? .2 * Math.sin(t * 8 + a) : 0), b]), u), { wash: L.hair, ink: PAL.ink, sw: sw * .8, curv: .5 });
    }
  }
  function hairFront(who, u, sw, L, V, o, t) {
    const hx = V.hx, w = o.wind || 0;
    push(); translate(hx * u, 0);
    if (who === 'lapulapu') {
      paint(P([[-4.75, .2], [-4.8, -2.4], [-3.2, -4.3], [0, -4.85], [3.2, -4.3], [4.8, -2.4], [4.75, .2], [3.9, -1.9], [2, -2.6], [.6, -1.9], [-1.4, -2.7], [-3.4, -2.2]], u), { wash: L.hair, ink: PAL.ink, sw: sw * .8, curv: .45 });
      // red putong (headband) and its flying tails
      paint(P([[-4.8, -2.15], [-2, -2.85], [2, -2.85], [4.8, -2.15], [4.75, -1.25], [2, -1.95], [-2, -1.95], [-4.75, -1.25]], u), { wash: L.band, ink: PAL.ink, sw: sw * .6, curv: .3 });
      const f = Math.sin(t * 11) * .5, side = V === HV.front ? -1 : -1;
      paint(ribbon(P([[side * 4.6, -1.8], [side * (6.2 + w * 1.2), -1.2 + f * .4], [side * (7.6 + w * 2), -.6 + f]], u), .8 * u, .35 * u), { wash: L.band, ink: PAL.ink, sw: sw * .5 });
    } else if (who === 'gabriela') {
      paint(P([[-4.75, .4], [-4.8, -2.3], [-3, -4.35], [0, -4.85], [3, -4.35], [4.8, -2.3], [4.75, .4], [4, -1.6], [1.8, -2.75], [0, -2.1], [-1.8, -2.75], [-4, -1.6]], u), { wash: L.hair, ink: PAL.ink, sw: sw * .8, curv: .45 });
      paint(P([[-4.6, -2.6], [0, -3.3], [4.6, -2.6], [4.5, -1.95], [0, -2.6], [-4.5, -1.95]], u), { wash: L.band, ink: PAL.ink, sw: sw * .5, curv: .3 });
      // a small flower tucked by the ear
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; paint(ellPts((-4.2 + Math.cos(a) * .45) * u, (-2.3 + Math.sin(a) * .45) * u, .38 * u, .38 * u, 8), { wash: PAL.cream, ink: PAL.ink, sw: sw * .3 }); }
      paint(ellPts(-4.2 * u, -2.3 * u, .3 * u, .3 * u, 8), { wash: PAL.ochre, ink: null });
    } else if (who === 'rizal') {   // short, neat, side-parted
      paint(P([[-4.7, -.6], [-4.7, -2.6], [-3, -4.4], [0, -4.85], [3, -4.4], [4.7, -2.6], [4.7, -.6], [4.1, -2.3], [1.2, -3.2], [-1.6, -3.5], [-3.6, -2.6]], u), { wash: L.hair, ink: PAL.ink, sw: sw * .8, curv: .45 });
      inkLine(P([[-1.6, -4.6], [-1.3, -3.6]], u), sw * .5, PAL.cream, 'inkfine', 0);
    } else if (who === 'bonifacio') {   // short, a little wild
      paint(P([[-4.7, -.4], [-4.9, -2.8], [-4, -3.8], [-3.6, -4.6], [-2, -4.6], [-1, -5.3], [.6, -4.7], [2, -5.2], [2.8, -4.4], [4.2, -4.1], [4.9, -2.6], [4.7, -.4], [3.8, -2.2], [1.6, -2.9], [-.6, -2.4], [-2.6, -3], [-3.9, -2.1]], u), { wash: L.hair, ink: PAL.ink, sw: sw * .8, curv: .35 });
    } else if (who === 'guard') {   // a cap with a shiny visor
      paint(P([[-4.6, -1.9], [-4.3, -4.2], [-2, -5.6], [2, -5.6], [4.3, -4.2], [4.6, -1.9]], u), { wash: '#26306A', ink: PAL.ink, sw: sw * .8, curv: .3 });
      paint(P([[-4.9, -2.4], [4.9, -2.4], [5.6, -1.4], [-5.6, -1.4]], u), { wash: '#191B33', ink: PAL.ink, sw: sw * .7, curv: .2 });
      paint(ellPts(0, -3.5 * u, .9 * u, .75 * u, 10), { wash: PAL.ochre, ink: PAL.ink, sw: sw * .4 });
    }
    pop();
  }
  function topHat(u, sw, k = 0) {   // Rizal's top hat, head-local; k > 0 lifts it off with a tilt
    paint(rectPts(-2.8 * u, -10.4 * u, 5.6 * u, 6 * u, u * .05), { wash: '#1A1820', ink: PAL.ink, sw: sw * .8 });
    paint(rectPts(-2.8 * u, -5.9 * u, 5.6 * u, .9 * u), { wash: '#4A3B68', ink: null });
    paint(ellPts(0, -4.55 * u, 4.6 * u, .75 * u, 22), { wash: '#1A1820', ink: PAL.ink, sw: sw * .8 });
    inkLine(P([[-2, -10], [-2.1, -6.4]], u), sw * .5, '#5A5666', 'inkfine', 0);
  }

  // ---------- the hero ----------
  window.hero = function hero(x, y, u, o = {}) {
    const who = o.who || 'rizal', L = LOOK[who], V = HV[o.view] || HV.front;
    const id = o.boilKey ?? who, rs = part => boilSeed(`hero ${id} ${part}`);
    const sw = clamp(u / 14, .45, 2.4), s = o.s ?? 1, t = T;
    const skin = skinOf(o, SKIN[who]), skinDk = mixCol(skin, PAL.ink, .25);
    x += (o.dx || 0) * u; const dy = (o.dy || 0) * u, sq = clamp((o.sq || 0), -.5, .5), sm = clamp(o.smear || 0);
    const wind = o.wind || 0;

    rs('shadow');
    if (!o.noShadow && s > .3) {
      const f = 1 - Math.min(.6, Math.abs(o.dy || 0) * .05);
      paint(ellPts(x, y + u * .2, u * 3.6 * f * s, u * .8 * f * s, 18), { wash: PAL.ink, washOp: 70, ink: null });
    }
    if (sm > .05) {   // speed lines behind a fast move
      rs('smear'); const d = o.smearDir ?? (o.flip ? 1 : -1);
      for (let i = 0; i < 5; i++) { const yy = y + dy - (2 + i * 2.6) * u * s, l = (5 + 6 * hash(i + 3)) * u * sm; inkLine([[x + d * 3 * u, yy], [x + d * (3 * u + l), yy + jit(u * .2)]], sw * .7, PAL.ink, 'inkfine', 0); }
    }
    push();
    translate(x, y + dy);
    if (o.rot) rotate(o.rot);
    scale((o.flip ? -1 : 1) * s * (1 + sq * .6) * (1 + sm * .25), s * (1 - sq));

    // arms (behind the body in the q view for the far arm)
    const arm = (which, front) => {
      rs('arm' + which);
      const left = which === 'L', a = armA(left ? (o.aL ?? .2) : (o.aR ?? .2)), dir = left ? -1 : 1;
      const px = dir * 2.45 * V.tw + V.hx * .4, sleeve = L.sleeve || skin;
      push(); translate(px * u, -6.4 * u); rotate(left ? a : -a);
      const len = 3.1;
      paint(rrPts(left ? -len * u : 0, -.6 * u, len * u, 1.2 * u, .5 * u), { wash: front ? sleeve : mixCol(sleeve, PAL.ink, .2), ink: PAL.ink, sw: sw * .7 });
      if (who === 'lapulapu') { inkLine(P([[dir * 1, -.5], [dir * 1.3, .5]], u), sw * .55, PAL.ink, 'inkfine', 0); paint(rectPts((left ? -1.9 : 1.6) * u, -.62 * u, .35 * u, 1.24 * u), { wash: PAL.ochre, ink: null }); }
      if (who === 'gabriela') paint(ellPts(dir * 2.3 * u, 0, 1.1 * u, .95 * u, 12), { wash: sleeve, ink: PAL.ink, sw: sw * .5 });
      translate(dir * len * u, 0);
      paint(ellPts(0, 0, .78 * u, .78 * u, 12), { wash: skin, ink: PAL.ink, sw: sw * .6 });
      const prop = left ? o.propL : o.propR;
      if (prop) { if (left) scale(-1, 1); prop(u, sw); }
      pop();
    };
    const farFirst = V === HV.q ? ['L'] : [];
    if (V !== HV.side) farFirst.forEach(w => arm(w, false));

    // legs
    if (!o.noLegs) {
      const legs = [[-1.05, 0], [1.05, 1]];
      legs.forEach(([lx, i]) => {
        rs('leg' + i);
        let h = 3.1, sx = 0;
        if (o.sit) { h = 1.4; sx = .4; }
        else if (o.walk != null) {
          const ph = (o.walk + i * .5) * TAU, amp = o.run ? 1.1 : .55;
          if (V === HV.side || o.run) { sx = Math.sin(ph) * amp; h = 3.1 - Math.max(0, Math.cos(ph)) * (o.run ? 1.2 : .7); }
          else { const p2 = Math.sin(ph); if (p2 > 0) h = 3.1 - p2 * .9; }
        }
        const lxx = lx * V.tw + sx, col = L.legSkin ? skin : L.pants || skinDk;
        if (who !== 'gabriela') paint(rectPts((lxx - .62) * u, -3.2 * u, 1.24 * u, h * u, u * .04), { wash: i ? col : mixCol(col, PAL.ink, .12), ink: PAL.ink, sw: sw * .6 });
        paint(ellPts((lxx + .25) * u, (-3.2 + h - .1) * u, .95 * u, .55 * u, 10), { wash: L.shoe || skinDk, ink: PAL.ink, sw: sw * .5 });
      });
    }

    // torso / costume
    rs('torso');
    const tw = V.tw;
    if (who === 'gabriela') {   // tapis skirt to the ankles, then the baro
      const flap = wind * .8 + .15 * Math.sin(t * 7);
      const sk = [[-2.5 * tw, -4.2], [2.5 * tw, -4.2], [3.4 * tw - flap, -.5], [-3.4 * tw - flap, -.5]];
      paint(P(sk, u), { wash: L.skirt, ink: PAL.ink, sw: sw * .7, curv: .15 });
      for (const yy of [-3.3, -2.2, -1.1]) inkLine(P([[-2.8 * tw - flap * (yy + 4) / 4, yy], [2.8 * tw - flap * (yy + 4) / 4, yy]], u), sw * .55, PAL.ochre, 'inkfine', 0);
      paint(rrPts(-2.5 * tw * u, -7.3 * u, 5 * tw * u, 3.4 * u, .9 * u), { wash: L.top, ink: PAL.ink, sw: sw * .7 });
      inkLine(P([[-1.2 * tw, -7.1], [0, -6.2], [1.2 * tw, -7.1]], u), sw * .5, PAL.ink, 'inkfine', .5);
    } else {
      const top = L.top || skin;
      paint(rrPts(-2.6 * tw * u, -7.3 * u, 5.2 * tw * u, 4.5 * u, .95 * u), { wash: top, ink: PAL.ink, sw: sw * .75 });
      if (who === 'lapulapu') {   // patik (tattoo) lines and the red bahag
        for (const s2 of [-1, 1]) inkLine(P([[s2 * .6 * tw, -6.9], [s2 * 1.6 * tw, -6.2], [s2 * 1.2 * tw, -5.2], [s2 * 1.9 * tw, -4.4]], u), sw * .55, mixCol(PAL.ink, skin, .25), 'inkfine', .5);
        inkLine(P([[-1.4 * tw, -6.9], [0, -6.4], [1.4 * tw, -6.9]], u), sw * .5, mixCol(PAL.ink, skin, .25), 'inkfine', .5);
        paint(rectPts(-2.65 * tw * u, -3.9 * u, 5.3 * tw * u, 1.1 * u), { wash: L.belt, ink: PAL.ink, sw: sw * .6 });
        paint(P([[-.9, -2.9], [.9, -2.9], [.7 - wind * .6, -1.2], [-.7 - wind * .6, -1.2]], u), { wash: L.belt, ink: PAL.ink, sw: sw * .5 });
      } else if (who === 'rizal') {   // frock coat open over a white shirt, bow tie, coat tails
        paint(P([[-1 * tw, -7.25], [1 * tw, -7.25], [0, -4.8]], u), { wash: '#F5F2EC', ink: PAL.ink, sw: sw * .5 });
        for (const s2 of [-1, 1]) paint(P([[0, -6.9], [s2 * .9, -7.3], [s2 * .9, -6.5]], u), { wash: '#2B2733', ink: PAL.ink, sw: sw * .4 });
        paint(P([[-2.6 * tw, -3.4], [-2.9 * tw - wind * .5, -1.9], [-1.4 * tw, -2.6]], u), { wash: L.top, ink: PAL.ink, sw: sw * .5 });
        paint(P([[2.6 * tw, -3.4], [2.9 * tw - wind * .5, -1.9], [1.4 * tw, -2.6]], u), { wash: L.top, ink: PAL.ink, sw: sw * .5 });
        for (let i = 0; i < 2; i++) paint(ellPts(.55 * u, (-5.3 + i * .8) * u, .16 * u, .16 * u, 6), { wash: PAL.ochre, ink: null });
      } else if (who === 'bonifacio') {   // camisa, red neckerchief, dark sash
        paint(rectPts(-2.65 * tw * u, -3.9 * u, 5.3 * tw * u, .8 * u), { wash: '#4A3B38', ink: PAL.ink, sw: sw * .5 });
        paint(P([[-1.9 * tw, -7.3], [1.9 * tw, -7.3], [0, -5.9]], u), { wash: L.scarf, ink: PAL.ink, sw: sw * .6 });
        paint(ellPts(0, -6.15 * u, .6 * u, .5 * u, 10), { wash: L.scarf, ink: PAL.ink, sw: sw * .5 });
        const fl = .4 * Math.sin(t * 10) + wind;
        paint(ribbon(P([[.2, -6], [.6 - fl * .4, -5], [.9 - fl, -4.3]], u), .55 * u, .3 * u), { wash: L.scarf, ink: PAL.ink, sw: sw * .4 });
      } else if (who === 'guard') {   // uniform: badge, pocket, belt
        paint(rectPts(-2.65 * tw * u, -3.9 * u, 5.3 * tw * u, .75 * u), { wash: '#1A1C33', ink: PAL.ink, sw: sw * .5 });
        paint(rectPts(-.2 * u, -3.85 * u, .9 * u, .62 * u), { wash: PAL.ochre, ink: null });
        paint(starPts(-1.3 * u * tw, -6 * u, .6 * u, .5, 6), { wash: PAL.ochre, ink: PAL.ink, sw: sw * .4 });
        inkLine(P([[0, -7.2], [0, -4]], u), sw * .4, PAL.ink, 'inkfine', 0);
      }
    }

    // head
    push(); translate(0, (HC + (o.headDy || 0)) * u); if (o.headRot) rotate(o.headRot);
    rs('hairback'); hairBack(who, u, sw, L, wind, t);
    rs('head');
    if (V !== HV.side) for (const s2 of [-1, 1]) paint(ellPts(s2 * 4.6 * u + V.hx * u * .3, .6 * u, .8 * u, 1 * u, 10), { wash: skin, ink: PAL.ink, sw: sw * .5 });
    else paint(ellPts(-.6 * u, .6 * u, .8 * u, 1 * u, 10), { wash: skin, ink: PAL.ink, sw: sw * .5 });
    paint(ellPts(0, 0, 4.75 * u, 4.4 * u, 30), { wash: skin, ink: PAL.ink, sw: sw * .9 });
    paint(ellPts(-1.8 * u, -2.1 * u, 1.8 * u, .9 * u, 14, 0, -.4), { wash: mixCol(skin, '#FFFFFF', .25), washOp: 120, ink: null });
    rs('hair'); hairFront(who, u, sw, L, V, o, t);
    // face: Clawd's face lives at body y -6u (eyes) / -4.3u (mouth); shift it onto the head
    rs('face');
    push(); translate(V.cx * u, 6.2 * u); scale(V.fw, 1);   // eyes (-6u) land just under the head's middle
    const F = { sides: V.sides, bx: V.bx };
    if (o.blush) blush(u, sw, F, o.blush === true ? 1 : o.blush);
    eyes(u, o, sw, V.sides, sm);
    if (!(clamp(o.squint || 0) > .8)) brows(u, o, sw, V.sides);
    if (who === 'rizal' || who === 'guard') {   // moustache
      const ms = who === 'guard' ? 1.25 : .9;
      for (const s2 of V.sides.length > 1 ? [-1, 1] : [1, -1]) inkLine(P([[0, -5.05], [s2 * .7 * ms, -5.15], [s2 * 1.25 * ms, -4.8]], u), sw * (who === 'guard' ? 1.9 : 1.3), PAL.ink, 'ink', .6);
    }
    push(); translate((V === HV.side ? .6 : 0) * u, who === 'rizal' || who === 'guard' ? .25 * u : 0); mouth(u, o.mouth, sw); pop();
    pop();
    if (who === 'rizal' && !o.noHat && !o.hatOff) { rs('hat'); push(); translate(V.hx * u * .6, 0); rotate(-.06); topHat(u, sw); pop(); }
    pop();

    rs('torsoFront');
    if (V === HV.q) arm('R', true); else if (V === HV.side) arm('L', true); else { arm('L', true); arm('R', true); }
    pop();

    rs('emote');
    if (o.emote) {
      const top = EMOTE_TOP.includes(o.emote), d = o.flip ? -1 : 1;
      emote(o.emote, x + d * (top ? 0 : 5.4) * u * s, y + dy + (top ? -17.5 : -15) * u * s * (1 - sq), u * .95 * s, o.emoteK ?? 1, o.emoteAge ?? T);
    }
    rs('after');
  };
  window.topHat = topHat;
  window.heroHeadY = (y, u, o = {}) => y + (o.dy || 0) * u + HC * u * (o.s ?? 1);

  // ---------- props ----------
  window.bolo = (u, sw) => {   // Bonifacio's bolo, held point up
    paint(rectPts(-.35 * u, -1.6 * u, .7 * u, 1.6 * u), { wash: '#5A3A22', ink: PAL.ink, sw: sw * .5 });
    paint([[-.5 * u, -1.6 * u], [.55 * u, -1.6 * u], [.75 * u, -5 * u], [0, -6.4 * u], [-.45 * u, -4.6 * u]], { wash: '#CBD3DA', ink: PAL.ink, sw: sw * .6 });
  };
  window.quill = (u, sw) => {
    inkLine([[0, 0], [1.2 * u, -2.4 * u]], sw * .6, PAL.ink, 'inkfine', 0);
    paint([[.6 * u, -1 * u], [1.6 * u, -3.6 * u], [2.2 * u, -2.4 * u], [1.2 * u, -1.2 * u]], { wash: PAL.cream, ink: PAL.ink, sw: sw * .4, curv: .5 });
  };
  window.flashlight = (u, sw) => {
    paint(rrPts(-.3 * u, -.55 * u, 2.4 * u, 1.1 * u, .3 * u), { wash: '#3A3A44', ink: PAL.ink, sw: sw * .5 });
    paint(rectPts(1.9 * u, -.75 * u, .7 * u, 1.5 * u), { wash: '#C9C9D2', ink: PAL.ink, sw: sw * .5 });
  };

  // Lip flap while a character talks: alternates mouths at a speaking rate between t0 and t1.
  window.talk = (t, t0, t1, open = 'open', shut = 'o', rest = null) => {
    if (t < t0 || t > t1) return rest;
    const k = Math.floor((t - t0) * 9);
    return hash(k * 3.1 + t0) > .45 ? open : shut;
  };

  // ---------- the horse (Gabriela's) ----------
  window.horse = function horse(x, y, u, o = {}) {
    boilSeed('horse ' + (o.boilKey || ''));
    const col = '#8A5A3A', dk = '#5E3A24', mane = '#2A1A12', sw = clamp(u / 14, .45, 2.4);
    paint(ellPts(x, y + u * .3, u * 7, u * 1.2, 18), { wash: PAL.ink, washOp: 60, ink: null });
    push(); translate(x, y + (o.dy || 0) * u); if (o.rot) rotate(o.rot); if (o.flip) scale(-1, 1);
    const g = o.gallop;   // leg phase or null
    const legs = [[-4.4, 0], [-2.8, .5], [2.6, .25], [4.2, .75]];
    legs.forEach(([lx, ph], i) => {
      let sx = 0, h = 4.6;
      if (g != null) { const a = (g + ph) * TAU; sx = Math.sin(a) * 1.4; h = 4.6 - Math.max(0, Math.cos(a)) * 1.4; }
      if (o.skid && i >= 2) sx = 1.8; if (o.skid && i < 2) sx = -1.2;
      boilSeed('horse leg' + i);
      paint(rectPts((lx + sx * .6 - .55) * u, -5 * u, 1.1 * u, h * u, u * .05), { wash: i % 2 ? col : dk, ink: PAL.ink, sw: sw * .6 });
      paint(rectPts((lx + sx * .6 - .6) * u, (-5 + h - .6) * u, 1.2 * u, .7 * u), { wash: PAL.ink, ink: null });
    });
    boilSeed('horse body');
    paint(ellPts(0, -7 * u, 6.4 * u, 3.2 * u, 26), { wash: col, ink: PAL.ink, sw: sw * .8 });
    const tl = .5 * Math.sin(T * 8);
    paint(ribbon(P([[-6, -8], [-8, -7.4 + tl], [-9, -5 + tl]], u), 1.2 * u, .5 * u), { wash: mane, ink: PAL.ink, sw: sw * .5 });
    // neck + head
    push(); translate(4.6 * u, -9 * u); rotate(o.headRot || 0);
    paint(P([[-1.6, 1.6], [.6, -3.6], [2.6, -3.2], [1.6, 1.8]], u), { wash: col, ink: PAL.ink, sw: sw * .7, curv: .3 });
    paint(rrPts(.2 * u, -5.8 * u, 4.6 * u, 2.6 * u, 1.1 * u), { wash: col, ink: PAL.ink, sw: sw * .7 });
    paint(P([[.6, -5.6], [1, -7], [1.6, -5.8]], u), { wash: col, ink: PAL.ink, sw: sw * .5 });
    paint(ribbon(P([[0, -5.4], [-.8, -3], [-1.4, 0]], u), 1 * u, .6 * u), { wash: mane, ink: PAL.ink, sw: sw * .5 });
    push(); translate(2.2 * u, -4.3 * u);   // the horse's eye uses Clawd's eyes, one side, small
    const e = o.eyes || 'normal';
    push(); scale(.5); eye(e, 1, u, o, sw * 2); pop();
    pop();
    paint(ellPts(4.2 * u, -4 * u, .3 * u, .25 * u, 8), { wash: PAL.ink, ink: null });
    pop();
    pop();
    if (o.emote) emote(o.emote, x + (o.flip ? -1 : 1) * 7 * u, y - 15 * u, u * .9, o.emoteK ?? 1, o.emoteAge ?? T);
  };

  // ---------- the guard's dog (an aspin) ----------
  window.dog = function dog(x, y, u, o = {}) {
    boilSeed('dog');
    const col = '#C48A4A', dk = '#8A5A2E', sw = clamp(u / 14, .45, 2.4);
    paint(ellPts(x, y + u * .2, u * 4, u * .8, 14), { wash: PAL.ink, washOp: 60, ink: null });
    push(); translate(x, y + (o.dy || 0) * u); if (o.flip) scale(-1, 1);
    const g = o.run;
    [[-2.6, 0], [-1.6, .5], [1.6, .25], [2.6, .75]].forEach(([lx, ph], i) => {
      const a = ((g || 0) + ph) * TAU, sx = g != null ? Math.sin(a) * .9 : 0, h = g != null ? 2.4 - Math.max(0, Math.cos(a)) * .8 : 2.4;
      paint(rectPts((lx + sx - .4) * u, -2.6 * u, .8 * u, h * u), { wash: i % 2 ? col : dk, ink: PAL.ink, sw: sw * .5 });
    });
    paint(ellPts(0, -3.6 * u, 3.8 * u, 1.9 * u, 20), { wash: col, ink: PAL.ink, sw: sw * .7 });
    const wag = Math.sin(T * 22) * .6;
    inkLine(P([[-3.6, -4], [-4.6, -5.4 + wag], [-5, -6.4 + wag]], u), sw * 2.2, dk, 'ink', .5);
    push(); translate(3.4 * u, -5.2 * u);
    paint(ellPts(0, 0, 2.3 * u, 2 * u, 18), { wash: col, ink: PAL.ink, sw: sw * .7 });
    paint(rrPts(1 * u, -.2 * u, 2.2 * u, 1.4 * u, .6 * u), { wash: mixCol(col, PAL.cream, .3), ink: PAL.ink, sw: sw * .6 });
    paint(ellPts(3.1 * u, .1 * u, .4 * u, .35 * u, 8), { wash: PAL.ink, ink: null });
    paint(P([[-1.4, -1.2], [-1.8, -3.2], [-.2, -1.8]], u), { wash: dk, ink: PAL.ink, sw: sw * .5 });
    if (o.bark) { paint(P([[1.2, .9], [3, 1.2], [2.4, 2.2], [1.2, 1.6]], u), { wash: '#4A1F2A', ink: PAL.ink, sw: sw * .4 }); }
    const e = o.eyes || 'normal';
    push(); translate(.6 * u, -.4 * u); scale(.45); eye(e, 1, u, o, sw * 2); pop();
    pop();
    pop();
  };

  // ---------- the time portal ----------
  // open 0..1 (size), spin (radians), suck 0..1 (an inhale: it bulges and pulls streaks in)
  window.portal = function portal(x, y, r, open, t, o = {}) {
    if (open <= .01) return;
    const R = r * open, suck = o.suck || 0;
    glow(x, y, R * (2.2 + .6 * suck), o.glowCol || '#B48CFF', .7 * clamp(open));
    boilSeed('portal');
    const cols = ['#2F3C7A', '#7B5CA8', '#3A9C98', '#C9A6FF', '#FFF5E2'];
    for (let i = 0; i < 5; i++) {
      const k = 1 - i * .19, rot = t * (1.5 + i * .7) * (i % 2 ? -1 : 1);
      paint(ellPts(x, y, R * k * (1 + .05 * Math.sin(t * 6 + i)), R * k * .92, 26, R * .03, rot), { wash: cols[i], washOp: 230, ink: i === 0 ? PAL.ink : null, sw: 1.2 });
    }
    for (let a = 0; a < 4; a++) {   // spiral arms
      const S = []; for (let k = 0; k < 10; k++) { const ang = a * TAU / 4 + t * 3 + k * .45, rr = R * (.95 - k * .09); S.push([x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * .92]); }
      inkLine(S, 1.1, mixCol('#FFF5E2', '#C9A6FF', .3), 'inkfine', .6);
    }
    glow(x, y, R * .6, '#FFF5E2', .9 * clamp(open));
    if (suck > .02) {   // wind streaks flowing INTO the portal
      for (let i = 0; i < 16; i++) {
        const ph = frac(t * 1.6 + hash(i)), ang = hash(i + 7) * TAU, d0 = R * (3.4 - 2.4 * ph), d1 = d0 - R * .7;
        inkLine([[x + Math.cos(ang) * d0, y + Math.sin(ang) * d0 * .8], [x + Math.cos(ang) * d1, y + Math.sin(ang) * d1 * .8]], .9 * suck * (1 - ph), PAL.cream, 'inkfine', 0);
      }
    }
  };
  // A path into the portal: where something at p0 is after k (0..1) of being sipped, spiralling in.
  window.sipPath = (p0, c, k, turns = .6) => {
    const dx = p0[0] - c[0], dy = p0[1] - c[1], d = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx);
    const kk = easeIn(k), a = a0 + turns * TAU * kk, r = d * (1 - kk);
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  };
  // A small crack of light in the air (the title card).
  window.crack = (x, y, s, k, t) => {
    if (k <= 0) return;
    boilSeed('crack');
    const pts = [[0, -1], [.18, -.55], [-.12, -.2], [.2, .2], [-.08, .55], [.1, 1]].map(([a, b]) => [x + a * s, y + b * s * k]);
    glow(x, y, s * 1.2 * k, '#C9A6FF', .9);
    inkLine(pts, 2.4, PAL.cream, 'ink', 0);
  };
})();
