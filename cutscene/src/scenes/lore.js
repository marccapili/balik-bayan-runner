// lore.js: the Balik Bayan Runner opening (see STORYBOARD.md). Speech bubbles are drawn by the game over the video,
// so the times of each line are mirrored in the game's src/data/lore.ts; here they only drive the lip flaps.
(() => {
  const G = 930;
  const NIGHT = ['#1F2550', '#2F3C7A'], DUSK = ['#7B5CA8', '#C8667A'], WARM = ['#8A5A3A', '#D9A27A'];
  const sky = (cols, y0 = -400, y1 = 760) => {   // a banded wash gradient, top to bottom
    boilSeed('sky' + cols.join());
    const n = 7;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), c = kf(k, cols.map((col, j) => [j / (cols.length - 1), j]), x => x), a = Math.floor(c), b = Math.min(cols.length - 1, a + 1);
      const col = mixCol(cols[a], cols[b], c - a), ya = lerp(y0, y1, i / n), yb = lerp(y0, y1, (i + 1) / n);
      paint(rectPts(-500, ya - 6, W + 1000, yb - ya + 12), { wash: col, ink: null });
    }
  };
  const band = (y0, y1, col, key, ink = true) => { boilSeed('band' + key); paint(rectPts(-500, y0, W + 1000, y1 - y0), { wash: col, ink: null }); if (ink) inkLine([[-500, y0], [W / 2, y0 - 4], [W + 500, y0 + 2]], 1, PAL.ink, 'ink', .5); };
  const puff = (x, y, r, k, col = PAL.cream) => { if (k > 0 && k < 1) { boilSeed('puff' + Math.round(x) + Math.round(y)); paint(ellPts(x, y - r * k * .4, r * (.4 + k), r * (.3 + k * .7), 14, r * .08), { wash: col, washOp: 230 * (1 - k), ink: k < .5 ? PAL.ink : null, sw: .6 }); } };
  const dust = (x, y, t0, t, n = 4, r = 40) => { for (let i = 0; i < n; i++) puff(x + (i - n / 2) * r * .8, y - hash(i) * 10, r * (.7 + .5 * hash(i + 4)), seg(t, t0 + i * .05, t0 + .7 + i * .05)); };
  const shake = (t, t0, amt, k = 7) => t < t0 ? [0, 0] : shakeXY(t, amt * Math.exp(-(t - t0) * k));
  const cam = (lt, keys, sh = [0, 0]) => { const [cx, cy, z] = kf(lt, keys); camBegin(cx + sh[0], cy + sh[1], z); };
  // Being sipped into a portal: where, how big, how spun.
  const sip = (lt, t0, t1, from, c, s0 = 1) => {
    const k = seg(lt, t0, t1), p = sipPath(from, c, k, .7);
    return { x: p[0], y: p[1], s: s0 * (1 - .92 * easeIn(k)), rot: k * k * 9, sq: -.3 * Math.sin(k * Math.PI), k };
  };
  const wipeIn = (lt, cols) => { boilSeed('transition'); if (lt < .3) brushWipe(.5 + lt / .6, cols); };
  const wipeOut = (lt, dur, cols) => { boilSeed('transition'); if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, cols); };

  // ---------- 0. title: the museum at night, four empty frames ----------
  function frame(x, y, w, h, inner, key) {
    boilSeed('frame' + key);
    paint(rectPts(x - w / 2 - 22, y - h / 2 - 22, w + 44, h + 44, 2), { wash: '#C9973A', ink: PAL.ink, sw: 1.2 });
    paint(rectPts(x - w / 2, y - h / 2, w, h, 2), { wash: inner, ink: PAL.ink, sw: .9 });
    paint(rectPts(x - 50, y + h / 2 + 44, 100, 26), { wash: '#C9973A', ink: PAL.ink, sw: .6 });
  }
  function museumNight(t) {
    band(-400, 800, '#26244A', 'wall', false);
    for (let i = 0; i < 3; i++) { boilSeed('beam' + i); paint([[300 + i * 520, -100], [480 + i * 520, -100], [700 + i * 520, 800], [420 + i * 520, 800]], { wash: '#8EA2E6', washOp: 26, ink: null }); }
    band(800, 1500, '#352B44', 'floor');
    band(760, 800, '#1C1830', 'skirting');
  }
  function shotTitle(t, lt, dur) {
    cam(lt, [[0, [960, 520, 1]], [3, [960, 470, 1.12]]], shake(lt, 2.95, 10));
    museumNight(t);
    const X = [420, 780, 1140, 1500];
    X.forEach((x, i) => {
      frame(x, 420, 230, 290, '#15132A', i);
      const fl = Math.max(0, Math.sin((lt - .4 - i * .35) * 5)) * seg(lt, .4 + i * .35, .8 + i * .35) * (1 - seg(lt, 1.6 + i * .2, 2));
      if (fl > .02) glow(x, 420, 150, '#9F8CFF', .5 * fl);
      boilSeed('q' + i); if (lt > .5 + i * .3) emote('?', x, 420, 14, seg(lt, .5 + i * .3, .8 + i * .3), lt);
    });
    crack(960, 240, 150, easeOut(seg(lt, 2.1, 2.9)), t);
    const fk = seg(lt, 2.95, 3.3);
    if (fk > 0) { glow(960, 240, 300 + 900 * fk, '#FFF5E2', 1); }
    camEnd();
    lines(t);
    if (lt < .45) iris(960, 520, lerp(0, 1300, easeIn(lt / .45)));
    flash(seg(lt, 3.2, 3.5) * (1 - seg(lt, 3.6, 3.75)), '#F7F0FF');
    wipeOut(lt, dur, NIGHT);
  }

  // ---------- 1. Mactan, 1521: Lapu-Lapu ----------
  function palm(x, y, t, s = 1) {
    boilSeed('palm' + x);
    paint(ribbon([[x, y], [x + 30 * s, y - 220 * s], [x + 90 * s, y - 420 * s]], 30 * s, 18 * s), { wash: '#7A5236', ink: PAL.ink, sw: .9 });
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * .55 + .06 * Math.sin(t * 2 + i), L = 210 * s;
      const c = [x + 90 * s, y - 420 * s], m = [c[0] + Math.cos(a) * L * .55, c[1] + Math.sin(a) * L * .55 - 30 * s], e = [c[0] + Math.cos(a) * L, c[1] + Math.sin(a) * L + 60 * s];
      paint(ribbon(through([c, m, e], 4), 34 * s, 4 * s), { wash: i % 2 ? '#4E8A46' : '#3E7340', ink: PAL.ink, sw: .7 });
    }
  }
  function beach(t, wind) {
    sky(['#3B3A7A', '#9C5B8C', '#F08A5D', '#F7C26B'], -500, 600);
    glow(1250, 560, 420, '#FFB25A', .9);
    boilSeed('sun'); paint(ellPts(1250, 560, 120, 120, 30), { wash: '#FFD27A', ink: null });
    band(560, 780, '#356D8F', 'sea');
    for (let i = 0; i < 7; i++) { const y = 600 + i * 26, ph = frac(t * .25 + hash(i)) * 300; boilSeed('wave' + i); inkLine([[-200 + ph + i * 90, y], [0 + ph + i * 90, y - 5], [200 + ph + i * 90, y]], .8, '#BFE3EE', 'inkfine', .5); inkLine([[900 + ph - i * 60, y + 10], [1100 + ph - i * 60, y + 5], [1300 + ph - i * 60, y + 10]], .8, '#BFE3EE', 'inkfine', .5); }
    band(780, 1500, '#E8C48C', 'sand');
    boilSeed('foam'); inkLine([[-200, 788 + 6 * Math.sin(t * 2)], [700, 780], [W + 200, 790 + 6 * Math.sin(t * 2 + 1)]], 2.4, PAL.cream, 'ink', .5);
    palm(160, 1000, t + wind * 3, 1.3);
  }
  function shotMactan(t, lt, dur) {
    const P0 = [1250, 450], tOpen = 1.5, tSuck = 4.3, tLift = 5.6, tGone = 6.4;
    const open = lt < tGone + .2 ? backOut(seg(lt, tOpen, tOpen + .5)) : 1 - easeIn(seg(lt, tGone + .3, tGone + .8));
    const sh = lt > tSuck && lt < tGone ? shakeXY(lt, 4) : shake(lt, tOpen, 12);
    cam(lt, [[0, [900, 560, 1]], [tOpen, [930, 560, 1.03]], [tOpen + .25, [860, 600, 1.2]], [2.6, [860, 600, 1.18]], [3.4, [960, 600, 1.06]], [tSuck, [1000, 580, 1.05]], [tGone, [1060, 560, 1.12]], [dur, [1000, 560, 1.02]]], sh);
    const suck = seg(lt, tSuck, tSuck + .3) * (1 - seg(lt, tGone, tGone + .3));
    beach(t, suck);
    portal(...P0, 160, open, t, { suck });
    let x = 760;
    if (lt > 3.4) x = lerp(760, 860, ease(seg(lt, 3.4, 4.1)));
    if (lt > tSuck) x = lerp(860, 990, easeIn(seg(lt, tSuck + .2, tLift)));
    const mood = emotions(lt, [[0, 'proud'], [tOpen + .1, 'surprised', { lookX: .8, lookY: -.7 }], [2.2, 'confused', { lookX: .7, lookY: -.5 }], [3.3, 'suspicious', { lookX: .8, lookY: -.6 }], [tSuck, 'scared', { lookX: -.3 }]]);
    const u = 26;
    let o = { who: 'lapulapu', ...mood, mouth: talk(lt, 2.15, 3.8) ?? mood.mouth, view: lt > tOpen + .05 ? 'q' : 'front' };
    if (lt > 3.4 && lt < tSuck) Object.assign(o, { walk: lt < 4.1 ? (x - 760) / 60 : null, rot: .12, aR: kf(lt, [[3.6, .2], [4, 1.25]]), aL: -.6, dy: 0 });
    if (lt > tSuck) Object.assign(o, { rot: -.22 + .04 * Math.sin(lt * 30), wind: -1, aL: 1.6, aR: 1.4, walk: lt * 4, sq: .05 });
    if (lt < tLift) hero(x, G, u, o);
    else if (lt < tGone) { const p = sip(lt, tLift, tGone, [x, G - 9 * u], P0); hero(p.x, p.y + 9 * u * p.s, u, { ...o, eyes: 'cry', mouth: 'wail', s: p.s, rot: p.rot, sq: p.sq, smear: .6, wind: -1, noShadow: true }); }
    // the portal burps shut: a puff and a twinkle
    if (lt > tGone) { glow(...P0, 200 * Math.exp(-(lt - tGone) * 4), '#FFF5E2', .9); dust(P0[0], P0[1] + 40, tGone + .25, lt, 3, 50); }
    camEnd();
    lines(t);
    wipeIn(lt, NIGHT); wipeOut(lt, dur, DUSK);
  }

  // ---------- 2. Ilocos, 1763: Gabriela ----------
  function ilocos(t) {
    sky(['#7FB6DE', '#B9DCEB', '#F4E6BF'], -500, 640);
    boilSeed('mtn'); paint([[-300, 640], [200, 380], [520, 520], [900, 300], [1300, 520], [1650, 360], [2300, 640]], { wash: '#7E9CB8', ink: PAL.ink, sw: .7, curv: .3 });
    boilSeed('h1'); paint(ellPts(400, 760, 1100, 220, 30), { wash: '#86B464', ink: PAL.ink, sw: .8 });
    boilSeed('h2'); paint(ellPts(1600, 780, 1000, 230, 30), { wash: '#6FA556', ink: PAL.ink, sw: .8 });
    for (let i = 0; i < 4; i++) { boilSeed('terr' + i); inkLine([[1000 + i * 40, 640 + i * 40], [1600, 600 + i * 40], [2200, 640 + i * 40]], .6, '#4E7E3E', 'inkfine', .6); }
    for (let i = 0; i < 5; i++) { const tx = 140 + i * 420 + 90 * hash(i), ty = 700 - 40 * hash(i + 3); boilSeed('tree' + i); inkLine([[tx, ty], [tx, ty - 70]], 2, '#5A3A22', 'ink', 0); paint(ellPts(tx, ty - 100, 50, 46, 16, 3), { wash: '#4E8A46', ink: PAL.ink, sw: .6 }); }
    band(820, 1500, '#7FAF5E', 'grass');
    boilSeed('road'); paint([[-500, 860], [W + 500, 850], [W + 500, 960], [-500, 970]], { wash: '#CDA56E', ink: PAL.ink, sw: .8 });
  }
  function shotIlocos(t, lt, dur) {
    const P0 = [1300, 760], tOpen = 1.9, tSkid = 2.1, tFling = 2.45, tLand = 3.15, tSuck = 5.0, tLift = 5.5, tGone = 6.3;
    const open = lt < tGone + .2 ? backOut(seg(lt, tOpen, tOpen + .45)) : 1 - easeIn(seg(lt, tGone + .3, tGone + .8));
    const sh = lt > tLand && lt < tLand + .5 ? shake(lt, tLand, 14) : lt > tSuck && lt < tGone ? shakeXY(lt, 3) : [0, 0];
    cam(lt, [[0, [820, 600, 1.02]], [tSkid, [900, 620, 1.04]], [tLand, [1000, 640, 1.12]], [4.2, [1060, 650, 1.18]], [tGone, [1000, 600, 1.06]], [6.6, [760, 640, 1.16]], [dur, [740, 640, 1.18]]], sh);
    ilocos(t);
    const suck = seg(lt, tSuck - .2, tSuck + .2) * (1 - seg(lt, tGone, tGone + .3));
    portal(...P0, 120, open, t, { suck });
    // the horse: gallops in, skids, then stands alone
    const hx = lt < tSkid ? lerp(-300, 700, easeOut(seg(lt, 0, tSkid))) : lerp(700, 780, easeOut(seg(lt, tSkid, 2.7)));
    const hu = 15, skid = lt > tSkid && lt < 2.9;
    const hMood = lt < tSkid ? 'determined' : lt < 3.4 ? 'surprised' : lt < 6.6 ? 'scared' : lt < 7.1 ? 'confused' : 'sad';
    const hFeel = feel(hMood, lt);
    horse(hx, 912, hu, { gallop: lt < tSkid ? lt * 2.6 : null, skid, rot: skid ? -.16 * Math.sin(seg(lt, tSkid, 2.9) * Math.PI) : 0, headRot: lt > 7.1 ? .35 : 0, eyes: hFeel.eyes, emote: lt > 6.6 ? (lt < 7.1 ? '?' : 'sweat') : lt > tSkid && lt < 3.2 ? '!' : null, emoteK: lt > 6.6 ? seg(lt, lt < 7.1 ? 6.6 : 7.1, (lt < 7.1 ? 6.6 : 7.1) + .25) : seg(lt, tSkid, tSkid + .2), dy: lt < tSkid ? -Math.abs(Math.sin(lt * 2.6 * Math.PI)) * .5 : 0 });
    if (skid) dust(hx - 60, 930, tSkid, lt, 4, 46);
    // Gabriela
    const u = 16;
    const mood = emotions(lt, [[0, 'determined'], [tSkid, 'surprised'], [tLand, 'dizzy'], [3.7, 'surprised', { lookX: .9 }], [4.1, 'scared', { lookX: .8 }], [tLift, 'scared']]);
    const o = { who: 'gabriela', ...mood, mouth: talk(lt, 3.8, 5.3) ?? mood.mouth, view: 'q' };
    const seat = [hx - 10, 912 - 10.2 * hu + 1.8 * u];
    if (lt < tFling) hero(seat[0], seat[1], u, { ...o, sit: true, wind: lt < tSkid ? .9 : .3, aL: lt < tSkid ? -.3 : 1.4, aR: lt < tSkid ? .6 : 1.4, noShadow: true, dy: lt < tSkid ? -Math.abs(Math.sin(lt * 2.6 * Math.PI)) * .3 : 0 });
    else if (lt < tLand) { const k = seg(lt, tFling, tLand), p = arcPt(seat, [1070, G], 260, k); hero(p[0], p[1], u, { ...o, rot: k * TAU * .9, sq: -.15, aL: 1.6, aR: 1.6, wind: -.6, noShadow: k < .9, smear: .4 }); }
    else if (lt < tLift) {
      const lean = lt > tSuck ? -.18 + .04 * Math.sin(lt * 30) : 0;
      hero(1070, G, u, { ...o, sit: lt < 4.5, sq: lt < 3.4 ? .2 * Math.exp(-(lt - tLand) * 8) : 0, rot: lean, wind: lt > tSuck ? -1 : 0, aL: lt > tSuck ? 1.5 : o.aL, aR: lt > tSuck ? 1.5 : o.aR, walk: lt > tSuck ? lt * 4 : null });
      if (lt < 3.6) dust(1070, G, tLand, lt, 3, 40);
    } else if (lt < tGone) { const p = sip(lt, tLift, tGone, [1070, G - 9 * u], P0); hero(p.x, p.y + 9 * u * p.s, u, { ...o, eyes: 'cry', mouth: 'wail', s: p.s, rot: p.rot, sq: p.sq, smear: .6, wind: -1, noShadow: true }); }
    if (lt > tGone) glow(...P0, 180 * Math.exp(-(lt - tGone) * 4), '#FFF5E2', .9);
    camEnd();
    lines(t);
    wipeIn(lt, DUSK); wipeOut(lt, dur, WARM);
  }

  // ---------- 3. Dapitan, 1890s: Rizal ----------
  function study(t, bend) {
    band(-400, 1500, '#4A3848', 'wall', false);
    boilSeed('window'); paint(rectPts(160, 180, 330, 400, 2), { wash: '#1F2550', ink: PAL.ink, sw: 1.2 });
    paint(ellPts(380, 290, 46, 46, 18), { wash: PAL.cream, ink: null }); glow(380, 290, 110, '#DDE6FF', .5);
    inkLine([[325, 180], [325, 580]], 2, PAL.ink, 'ink', 0); inkLine([[160, 380], [490, 380]], 2, PAL.ink, 'ink', 0);
    paint(rectPts(140, 570, 370, 30), { wash: '#6A4A36', ink: PAL.ink, sw: .8 });
    boilSeed('shelf'); paint(rectPts(1500, 160, 330, 26), { wash: '#6A4A36', ink: PAL.ink, sw: .8 });
    for (let i = 0; i < 9; i++) { boilSeed('book' + i); const bh = 80 + 40 * hash(i); paint(rectPts(1515 + i * 34, 160 - bh, 28, bh, 1), { wash: ['#8A3B3B', '#3A5A7A', '#6E7A3A', '#7A5A2A'][i % 4], ink: PAL.ink, sw: .5 }); }
    band(840, 1500, '#3A2A2E', 'floor');
  }
  function desk(t) {
    boilSeed('desk');
    paint(rectPts(760, 760, 640, 40, 2), { wash: '#7A5236', ink: PAL.ink, sw: 1 });
    paint(rectPts(790, 800, 580, 150, 2), { wash: '#5E3E2A', ink: PAL.ink, sw: 1 });
    paint(rectPts(1020, 820, 120, 40, 2), { wash: '#4A3020', ink: PAL.ink, sw: .6 });
    paint(ellPts(1080, 840, 8, 8, 8), { wash: PAL.ochre, ink: null });
  }
  function candle(x, y, t, bend) {
    boilSeed('candle'); paint(rectPts(x - 14, y - 70, 28, 70, 1), { wash: PAL.cream, ink: PAL.ink, sw: .6 });
    paint(ellPts(x, y, 34, 9, 12), { wash: '#C9973A', ink: PAL.ink, sw: .6 });
    const fx = x + bend * 40 + 3 * Math.sin(t * 17);
    glow(fx, y - 92, 170, '#FFB04A', .8 - .4 * Math.abs(bend));
    paint([[x - 8, y - 72], [fx, y - 120 + 30 * Math.abs(bend)], [x + 8, y - 72]], { wash: '#FFC94A', ink: PAL.ink, sw: .5, curv: .6 });
  }
  function shotDapitan(t, lt, dur) {
    const P0 = [1450, 470], tGlow = 1.5, tOpen = 1.8, tSuck = 4.4, tHatOff = 4.85, tLift = 5.6, tGone = 6.3, tHatGo = 7.0, tClose = 7.35;
    const open = lt < tClose ? backOut(seg(lt, tOpen, tOpen + .45)) * (1 + .06 * Math.sin(lt * 7)) : 1 - easeIn(seg(lt, tClose, tClose + .3));
    const sh = lt > tSuck && lt < tGone ? shakeXY(lt, 3) : shake(lt, tOpen, 10);
    cam(lt, [[0, [1000, 620, 1.18]], [tOpen, [1000, 600, 1.1]], [2.6, [980, 600, 1.2]], [tSuck, [1100, 580, 1.04]], [tGone, [1150, 560, 1.04]], [tHatGo, [1200, 540, 1.1]], [dur, [1250, 540, 1.12]]], sh);
    const suck = seg(lt, tSuck - .2, tSuck + .2) * (1 - seg(lt, tClose - .1, tClose + .2));
    study(t, suck);
    portal(...P0, 140, open, t, { suck });
    const u = 20, rx = 900, ry = 850;
    const mood = emotions(lt, [[0, 'happy'], [.9, 'thinking'], [tOpen + .1, 'surprised', { lookX: .9, lookY: -.6 }], [2.6, 'angry', { lookX: .6 }], [tSuck, 'scared', { lookX: .6 }]]);
    const o = { who: 'rizal', ...mood, mouth: talk(lt, 2.6, 4.3) ?? mood.mouth, view: 'q' };
    // papers: on the desk, then sucked in one after another
    for (let i = 0; i < 4; i++) {
      const p0 = [1020 + i * 70, 748 - i * 4], t0 = tSuck + .1 + i * .18;
      if (lt > t0 + .7) continue;
      const k = seg(lt, t0, t0 + .7), p = k > 0 ? sipPath(p0, P0, k, .5) : p0, sc = 1 - .85 * k;
      boilSeed('paper' + i); push(); translate(...p); rotate(k * 7 + i * .1); paint(rectPts(-38 * sc, -10 * sc, 76 * sc, 20 * sc), { wash: PAL.cream, ink: PAL.ink, sw: .5 }); pop();
    }
    if (lt < tSuck) { boilSeed('writing'); const n = Math.floor(seg(lt, .2, 1.4) * 5); for (let i = 0; i < n; i++) inkLine([[1040, 738 + i * 4], [1090 + 20 * hash(i), 738 + i * 4]], .5, PAL.ink, 'inkfine', .3); }
    // Rizal: writing → startled → hanging on to the desk → gone
    const scrib = lt < tOpen ? .25 * Math.sin(lt * 24) : 0;
    if (lt < tSuck) {
      hero(rx, ry, u, { ...o, sit: true, aR: lt < tOpen ? -.1 + scrib : lt < 2.6 ? 1.3 : .8, aL: lt < 2.6 ? -.3 : 1.2, propR: lt < 2.6 ? quill : null, propL: lt > 2.6 ? ((u2, sw) => paint(rectPts(-.4 * u2, -2.2 * u2, 2.4 * u2, 2.8 * u2), { wash: PAL.cream, ink: PAL.ink, sw: sw * .5 })) : null, noShadow: true });
    } else if (lt < tLift) {
      const k = ease(seg(lt, tSuck, tSuck + .5));
      hero(lerp(rx, 1160, k), lerp(ry, 760, k), u, { ...o, rot: lerp(0, 1.45, k) + .08 * Math.sin(lt * 26), aL: lerp(1.2, -1.7, k), aR: lerp(.8, -1.6, k), walk: lt * 9, run: true, wind: -1, hatOff: lt > tHatOff, noShadow: true, sq: -.1 * k });
    } else if (lt < tGone) { const p = sip(lt, tLift, tGone, [1240, 700], P0); hero(p.x, p.y, u, { ...o, eyes: 'cry', mouth: 'wail', s: p.s, rot: 1.4 + p.rot, sq: p.sq, smear: .6, wind: -1, hatOff: true, noShadow: true }); }
    desk(t);
    candle(1300, 760, t, -.9 * suck);
    // the hat: pops off, hovers alone (beat), then zips in after him
    if (lt > tHatOff) {
      let hp, hr = 0;
      if (lt < tHatGo) { const k = easeOut(seg(lt, tHatOff, tHatOff + .5)); hp = [lerp(1150, 1150, k), lerp(580, 420, k) + 10 * Math.sin(lt * 3)]; hr = .25 * Math.sin(lt * 2.4); }
      else { const k = seg(lt, tHatGo, tHatGo + .35); hp = sipPath([1150, 420], P0, k, .3); hr = k * 6; }
      if (lt < tHatGo + .35) { boilSeed('hat'); push(); translate(...hp); rotate(hr); const sc = lt < tHatGo ? 1 : 1 - .9 * seg(lt, tHatGo, tHatGo + .35); scale(sc); topHat(u, 1.2); pop(); if (lt > tGone + .1 && lt < tHatGo) emote('dots', hp[0] + 70, hp[1] - 200, 15, seg(lt, tGone + .1, tGone + .4), lt); }
    }
    if (lt > tClose) glow(...P0, 180 * Math.exp(-(lt - tClose) * 4), '#FFF5E2', .9);
    camEnd();
    lines(t);
    flash(.35 * seg(lt, tGlow, tGlow + .1) * (1 - seg(lt, tGlow + .1, tGlow + .4)), '#E9DDFF');
    wipeIn(lt, WARM); wipeOut(lt, dur, DUSK);
  }

  // ---------- 4. Manila, 1896: Bonifacio ----------
  function kubo(x, y, s, key) {
    boilSeed('kubo' + key);
    for (const sx of [-1, 1]) inkLine([[x + sx * 90 * s, y], [x + sx * 90 * s, y + 70 * s]], 2, '#5A3A22', 'ink', 0);
    paint(rectPts(x - 110 * s, y - 120 * s, 220 * s, 130 * s, 2), { wash: '#B98B5E', ink: PAL.ink, sw: .8 });
    paint(rectPts(x - 30 * s, y - 80 * s, 60 * s, 55 * s), { wash: '#3A2A2E', ink: PAL.ink, sw: .5 });
    paint([[x - 150 * s, y - 110 * s], [x, y - 250 * s], [x + 150 * s, y - 110 * s]], { wash: '#8A6A3A', ink: PAL.ink, sw: .8 });
  }
  function manila(t) {
    sky(['#4A3B7A', '#B05A7A', '#F2A65A', '#F7CF8A'], -500, 700);
    glow(1500, 640, 380, '#FFB25A', .7);
    kubo(260, 650, .9, 1); kubo(1660, 640, 1, 2); kubo(1250, 600, .6, 3); kubo(560, 590, .55, 4);
    band(700, 1500, '#B58A5E', 'street');
    // the red flag on its pole
    boilSeed('flag'); inkLine([[1180, 920], [1180, 420]], 3, '#5A3A22', 'ink', 0);
    const F = []; for (let i = 0; i <= 6; i++) F.push([1180 + i * 40, 430 + 14 * Math.sin(t * 6 - i * .9) * i / 6]);
    for (let i = 6; i >= 0; i--) F.push([1180 + i * 40, 560 + 14 * Math.sin(t * 6 - i * .9) * i / 6]);
    paint(F, { wash: '#C8302C', ink: PAL.ink, sw: .8, curv: .5 });
    glow(1290, 495, 46, '#FFF5E2', .6); paint(ellPts(1290, 495 + 7 * Math.sin(t * 6 - 2.7), 22, 22, 14), { wash: PAL.cream, ink: null });
  }
  function shotManila(t, lt, dur) {
    const P0 = [380, 560], tOpen = 1.8, tTurn = 1.95, tWind = 5.0, tRun = 5.3, tJump = 5.85, tGone = 6.3;
    const open = lt < tGone ? backOut(seg(lt, tOpen, tOpen + .45)) : lt < 6.7 ? 1 + .25 * Math.sin(seg(lt, tGone, 6.7) * Math.PI) : 1 - easeIn(seg(lt, 6.8, 7.25));
    cam(lt, [[0, [900, 560, 1.12]], [tOpen, [860, 580, 1.04]], [2.1, [760, 600, 1.12]], [3.3, [800, 610, 1.2]], [tWind, [760, 600, 1.08]], [tGone, [560, 560, 1.06]], [dur, [600, 560, 1.06]]], shake(lt, tOpen, 10));
    manila(t);
    portal(...P0, 150, open, t, { suck: .25 });
    const u = 25;
    const mood = emotions(lt, [[0, 'determined'], [tTurn, 'surprised', { lookX: .9 }], [3.25, 'angry'], [4.3, 'determined']]);
    const o = { who: 'bonifacio', ...mood, mouth: talk(lt, .3, 1.6) ?? talk(lt, 2.1, 3.2) ?? talk(lt, 3.4, 4.9) ?? mood.mouth, propR: bolo };
    const turned = lt > tTurn;
    if (lt < tRun) {
      const rally = lt < tOpen ? Math.abs(Math.sin(lt * 5)) : 0;
      const w = lt > tWind ? ease(seg(lt, tWind, tRun)) : 0;
      hero(860, G, u, { ...o, view: turned ? 'q' : 'front', flip: turned, aR: lt < tOpen ? 1.95 + .2 * rally : 1.3, aL: lt < tOpen ? -.4 : o.aL, dy: lt < tOpen ? -.4 * rally : o.dy, sq: (o.sq || 0) + .2 * w, rot: -.1 * w, headDy: 0 });
    } else if (lt < tJump) {
      const k = easeIn(seg(lt, tRun, tJump));
      hero(lerp(860, 520, k), G, u, { ...o, view: 'q', flip: true, walk: lt * 4, run: true, smear: .5, rot: -.15, aR: 1.4, aL: -.8 });
      dust(860 - (860 - 520) * k + 60, G, tRun, lt, 2, 40);
    } else if (lt < tGone) {
      const k = seg(lt, tJump, tGone), p = arcPt([520, G - 9 * u], P0, 120, easeIn(k));
      hero(p[0], p[1] + 9 * u * (1 - k), u, { ...o, view: 'q', flip: true, s: 1 - .9 * easeIn(k), rot: -.6 * k, sq: -.25, aR: 1.6, aL: 1.6, smear: .5, noShadow: true });
    }
    if (lt > tGone) glow(...P0, 200 * Math.exp(-(lt - tGone) * 3), '#FFF5E2', .9);
    if (lt > 6.8 && lt < 7.6) dust(P0[0], P0[1] + 60, 6.85, lt, 3, 50);
    camEnd();
    lines(t);
    wipeIn(lt, DUSK); wipeOut(lt, dur, NIGHT);
  }

  // ---------- 5. the time tunnel ----------
  function tunnel(t, light) {
    band(-400, 1500, '#121433', 'void', false);
    const cols = ['#2F3C7A', '#7B5CA8', '#3A9C98', '#C9A6FF', '#2F3C7A', '#E27A92'];
    for (let i = 7; i >= 0; i--) {   // rings rushing outward: the zoom loops every 1/7 s of phase
      const ph = frac(t * .55 + i / 8), r = 60 + 1400 * ph * ph;
      boilSeed('ring' + i);
      paint(ellPts(960, 540, r, r * .62, 30, r * .02, t * .6 + i), { wash: cols[i % cols.length], washOp: 120 * (1 - ph * .6), ink: ph < .7 ? PAL.ink : null, sw: .6 });
    }
    for (let i = 0; i < 26; i++) {
      const ph = frac(t * .9 + hash(i)), a = hash(i + 50) * TAU, d0 = 80 + 1100 * ph * ph, d1 = d0 + 40 + 160 * ph;
      boilSeed('streak' + i); inkLine([[960 + Math.cos(a) * d0, 540 + Math.sin(a) * d0 * .62], [960 + Math.cos(a) * d1, 540 + Math.sin(a) * d1 * .62]], 1 + ph, PAL.cream, 'inkfine', 0);
    }
    glow(960, 540, 200 + 1400 * light, '#FFF5E2', .6 + .4 * light);
  }
  function shotTunnel(t, lt, dur) {
    const tBonk = 1.9, tLight = 3.7;
    cam(lt, [[0, [960, 540, 1.05]], [tBonk, [960, 540, 1.12]], [dur, [960, 540, 1.3]]], shake(lt, tBonk, 14));
    const light = easeIn(seg(lt, tLight, dur));
    tunnel(t, light);
    const cast = [
      ['lapulapu', 0, 'dizzy', 'surprised'], ['gabriela', 1, 'scared', 'angry'],
      ['rizal', 2, 'cry', 'confused'], ['bonifacio', 3, 'dizzy', 'surprised'],
    ];
    cast.forEach(([who, i, m0, m1]) => {
      let a = i * TAU / 4 + lt * .9, R = 330 + 40 * Math.sin(lt * 2 + i);
      if (who === 'lapulapu' || who === 'bonifacio') {   // they drift together and bonk
        const k = ease(seg(lt, tBonk - .6, tBonk)), apart = seg(lt, tBonk + .05, tBonk + .35);
        const side = who === 'lapulapu' ? -1 : 1;
        const tx = 960 + side * (90 + 120 * easeOut(apart) * (1 - seg(lt, 3.2, 3.8) * .3)), ty = 560;
        const free = [960 + Math.cos(a) * R, 560 + Math.sin(a) * R * .6];
        var x = lerp(free[0], tx, lt > tBonk ? 1 : k), y = lerp(free[1], ty, lt > tBonk ? 1 : k);
      } else { var x = 960 + Math.cos(a) * R, y = 560 + Math.sin(a) * R * .6; }
      const bonked = lt > tBonk && (who === 'lapulapu' || who === 'bonifacio');
      const mood = emotions(lt, [[0, m0], [tBonk, m1, who === 'lapulapu' ? { lookX: .9 } : who === 'bonifacio' ? { lookX: .9 } : {}]]);
      const spin = bonked ? -.15 * spring(lt, tBonk, 5, 16) : lt * (1.4 + .3 * i) * (i % 2 ? -1 : 1);
      hero(x, y + 8 * 15, 15, { who, ...mood, mouth: who === 'bonifacio' ? (talk(lt, 2.05, 3.5) ?? mood.mouth) : mood.mouth, view: bonked ? 'q' : 'front', flip: who === 'bonifacio' && bonked, rot: spin, aL: 1.4 + .3 * Math.sin(lt * 7 + i), aR: 1.2 + .3 * Math.sin(lt * 6 + i), walk: bonked ? null : lt * 3, wind: Math.sin(lt * 3 + i), noShadow: true, boilKey: who + 'tun', hatOff: who === 'rizal' && lt > 1 });
      if (bonked && lt < tBonk + .6) { boilSeed('bonk'); paint(starPts(960, y - 30, 70 * backOut(seg(lt, tBonk, tBonk + .15)) * (1 - seg(lt, tBonk + .3, tBonk + .6)), .45, 8), { wash: PAL.ochre, ink: PAL.ink, sw: .8 }); }
    });
    // Rizal's hat tumbles along behind
    if (lt > 1) { const a = 2 * TAU / 4 + lt * .9 - .5, R = 420; boilSeed('hatT'); push(); translate(960 + Math.cos(a) * R, 560 + Math.sin(a) * R * .6 - 120); rotate(lt * 5); scale(.8); topHat(15, 1); pop(); }
    camEnd();
    lines(t);
    flash(seg(lt, dur - .45, dur), '#FFFDF6');
  }

  // ---------- 6. the museum, 2026 ----------
  // A painted portrait: a cheap bust (the full hero is ~60 brush marks; a wall of them is slow to render)
  const BUST = { lapulapu: ['#B8744A', '#2A1A12', '#C3212A', '#B8744A'], gabriela: ['#D9A27A', '#2D1A13', '#9E2A26', '#F4EEDF'], rizal: ['#E6B98F', '#1B1411', null, '#2A2733'], bonifacio: ['#D69E74', '#3B1A14', null, '#F4EEDF'] };
  function bust(x, y, who) {
    const [skin, hair, band, top] = BUST[who];
    boilSeed('bust' + who);
    paint(rrPts(x - 62, y + 40, 124, 90, 30), { wash: top, ink: PAL.ink, sw: .6 });
    if (who === 'bonifacio') paint([[x - 40, y + 42], [x + 40, y + 42], [x, y + 80]], { wash: '#C8302C', ink: null });
    if (who === 'gabriela' || who === 'lapulapu') paint(ellPts(x, y + 10, 62, 66, 16), { wash: hair, ink: null });
    paint(ellPts(x, y - 8, 52, 48, 20), { wash: skin, ink: PAL.ink, sw: .7 });
    paint([[x - 54, y - 6], [x - 48, y - 40], [x, y - 58], [x + 48, y - 40], [x + 54, y - 6], [x + 30, y - 30], [x - 30, y - 30]], { wash: hair, ink: null, curv: .4 });
    if (band) paint(rectPts(x - 52, y - 34, 104, 9), { wash: band, ink: null });
    if (who === 'rizal') { paint(rectPts(x - 30, y - 120, 60, 66), { wash: '#1A1820', ink: null }); paint(rectPts(x - 50, y - 60, 100, 9), { wash: '#1A1820', ink: null }); inkLine([[x - 12, y + 12], [x, y + 9], [x + 12, y + 12]], 1, PAL.ink, 'ink', .5); }
    for (const sx of [-1, 1]) paint(ellPts(x + sx * 18, y - 4, 4.5, 8, 8), { wash: PAL.ink, ink: null });
    inkLine([[x - 9, y + 20], [x, y + 24], [x + 9, y + 20]], .8, PAL.ink, 'ink', .5);
  }
  function museumDay(t) {
    band(-400, 1500, '#E4CFA6', 'wall', false);
    band(640, 760, '#8A5A3A', 'wainscot');
    band(760, 1500, '#B98B5E', 'floor');
    for (let i = 0; i < 9; i++) { boilSeed('tile' + i); inkLine([[-200 + i * 300, 760], [-500 + i * 360, 1200]], .6, '#8A5A3A', 'inkfine', 0); }
    // the heroes' own portraits on the wall
    for (const x of [260, 700, 1220, 1660]) { boilSeed('lamp' + x); paint([[x - 30, 60], [x + 30, 60], [x + 150, 480], [x - 150, 480]], { wash: '#FFF2C8', washOp: 60, ink: null }); }
    [['lapulapu', 260], ['gabriela', 700], ['rizal', 1220], ['bonifacio', 1660]].forEach(([who, x], i) => {
      frame(x, 330, 200, 250, '#3A4A6A', 'p' + i);
      bust(x, 330, who);
    });
    // a rope barrier
    boilSeed('rope'); for (const sx of [300, 960, 1620]) { paint(rectPts(sx - 10, 690, 20, 120), { wash: '#C9973A', ink: PAL.ink, sw: .6 }); paint(ellPts(sx, 690, 18, 18, 10), { wash: '#C9973A', ink: PAL.ink, sw: .6 }); }
    inkLine([[300, 700], [630, 760], [960, 700], [1290, 760], [1620, 700]], 3.2, '#A3262E', 'ink', .7);
  }
  function shotMuseum(t, lt, dur) {
    const P0 = [960, 170], X = { lapulapu: 560, gabriela: 1200, rizal: 800, bonifacio: 1000 };
    const drops = { lapulapu: .45, rizal: .7, bonifacio: .95, gabriela: 1.2 }, tHat = 1.6, tUp = 2.4, tLook = 3.15, tBeam = 5.2;
    const open = lt < 1.5 ? backOut(seg(lt, 0, .3)) : 1 - easeIn(seg(lt, 1.8, 2.2));
    cam(lt, [[0, [960, 520, 1.08]], [1.3, [960, 600, 1.16]], [tUp, [960, 560, 1.08]], [tLook, [960, 470, 1]], [tBeam, [980, 540, 1.04]], [dur, [1040, 560, 1.08]]], ring(lt, Object.values(drops), 8, 30) ? [0, 6 * ring(lt, Object.values(drops), 8, 30)] : [0, 0]);
    museumDay(t);
    portal(...P0, 130, open, t);
    const u = 18;
    const order = ['lapulapu', 'rizal', 'bonifacio', 'gabriela'];
    order.forEach((who, i) => {
      const td = drops[who]; if (lt < td - .35) return;
      const x = X[who];
      const pile = who === 'gabriela' ? 0 : 1;
      const fall = seg(lt, td - .35, td), y = lerp(P0[1], G, fall * fall);
      const keys = who === 'gabriela'
        ? [[0, 'surprised'], [td + .05, 'proud'], [tUp, 'neutral', { lookX: -.5 }], [tLook, 'starstruck', { lookY: -.8 }], [tBeam, 'scared', { lookX: .9 }]]
        : [[0, 'scared'], [td, 'ko'], [tUp, 'confused', { lookX: i % 2 ? .7 : -.7 }], [tLook, i === 1 ? 'proud' : 'starstruck', { lookY: -.8 }], [tBeam, 'scared', { lookX: .9 }]];
      const mood = emotions(lt, keys);
      const o = { who, ...mood, mouth: who === 'gabriela' ? (talk(lt, 3.35, 5.0) ?? mood.mouth) : mood.mouth, boilKey: who + 'mus', hatOff: who === 'rizal' && lt < tHat + .3 };
      if (lt < td) hero(x, y, u, { ...o, rot: (1 - fall) * 2 * (i % 2 ? 1 : -1), aL: 1.6, aR: 1.6, sq: -.2, noShadow: fall < .7 });
      else if (lt < tUp && pile) hero(x, G, u, { ...o, sq: .35 + .1 * spring(lt, td, 8, 28), rot: [.25, -.2, .15][i] ?? 0, aL: -.6, aR: 1.2, emote: 'stars' });
      else { const j = lt < tUp + .4 && pile ? jump(lt, tUp, tUp + .35, 1.4) : { dy: 0, sq: 0 }; hero(x, G, u, { ...o, dy: (o.dy || 0) + j.dy, sq: (o.sq || 0) + j.sq + (who === 'gabriela' && lt < td + .3 ? .25 * Math.exp(-(lt - td) * 9) : 0), view: lt > tBeam ? 'q' : 'front' }); }
      if (lt > td && lt < td + .7) dust(x, G, td, lt, 3, 36);
    });
    // the hat lands last, on Rizal
    if (lt > tHat - .45 && lt < tHat + .3) { const k = seg(lt, tHat - .45, tHat); boilSeed('hatM'); push(); translate(X.rizal, lerp(P0[1], heroHeadY(G, u, { s: 1 }) + 0, k * k)); rotate((1 - k) * 4); topHat(u, 1.1); pop(); }
    // the flashlight beam sweeps in from the right
    if (lt > tBeam) {
      const k = ease(seg(lt, tBeam, tBeam + .6)), bx = lerp(1800, 1000, k);
      boilSeed('beamM'); paint([[2300, 560], [bx - 160, 760], [bx + 160, 1040]], { wash: '#FFF2B0', washOp: 90, ink: null });
      glow(bx, 900, 220, '#FFF2B0', .5);
    }
    camEnd();
    lines(t);
    flash(1 - seg(lt, 0, .35), '#FFFDF6');
  }

  // ---------- 7. the guard ----------
  function shotGuard(t, lt, dur) {
    const tHoy = .7, tFear = .95, tTakbo = 2.6, tRun = 3.1, tChase = 3.5, tHatBack = 4.3, tIris = 4.95;
    cam(lt, [[0, [1060, 560, 1.06]], [tHoy, [1250, 560, 1.18]], [tFear, [860, 600, 1.12]], [tTakbo, [800, 600, 1.16]], [tRun, [880, 560, 1.02]], [dur, [880, 560, 1.02]]], shake(lt, tHoy, 8));
    museumDay(t);
    const u = 18, gx = lt < tChase ? lerp(2300, 1680, easeOut(seg(lt, 0, .8))) : lerp(1680, -500, easeIn(seg(lt, tChase, tChase + 1.6)));
    // heroes
    const X = { lapulapu: 560, rizal: 800, bonifacio: 1000, gabriela: 1200 };
    Object.entries(X).forEach(([who, x0], i) => {
      const mood = emotions(lt, [[0, 'scared', { lookX: .9 }], [tFear, 'scared', { emote: '!!', lookX: .9 }], [tTakbo + (who === 'bonifacio' ? 0 : .15), who === 'bonifacio' ? 'determined' : 'surprised']]);
      const o = { who, ...mood, mouth: who === 'bonifacio' ? (talk(lt, tTakbo, 3.5, 'O', 'open') ?? mood.mouth) : mood.mouth, boilKey: who + 'g' };
      const tr = tRun + i * .07, k = easeIn(seg(lt, tr, tr + .9)), x = lerp(x0, x0 - 1900, k);
      if (who === 'rizal' && lt > tHatBack - .2) {   // dashes back for his hat
        const kk = seg(lt, tHatBack - .2, tHatBack + .7), xx = kk < .5 ? lerp(-300, 820, easeOut(kk * 2)) : lerp(820, -300, easeIn(kk * 2 - 1));
        if (kk < 1) hero(xx, G, u, { ...o, ...feel('relieved', lt), view: 'q', flip: kk > .5, walk: lt * 5, run: true, smear: .5, hatOff: kk < .5 });
        return;
      }
      if (lt < tRun) hero(x0, G, u, { ...o, view: lt > tTakbo + .2 ? 'q' : 'front', flip: lt > tTakbo + .2, sq: lt > tFear && lt < tFear + .4 ? take(lt, tFear, 1).sq : o.sq, aR: who === 'bonifacio' && lt > tTakbo ? 1.7 : o.aR, propR: who === 'bonifacio' ? bolo : null });
      else if (k < 1) { hero(x, G, u, { ...o, view: 'q', flip: true, walk: lt * 5, run: true, smear: .7, rot: -.12, wind: 1, hatOff: who === 'rizal', propR: who === 'bonifacio' ? bolo : null }); }
      dust(x0, G, tr + .05, lt, 3, 38);
    });
    // Rizal's hat, left spinning on the floor
    if (lt > tRun && lt < tHatBack + .35) { const k = seg(lt, tRun, tRun + .5); boilSeed('hatG'); push(); translate(820 + 60 * k, lerp(700, G - 6, k * k)); rotate(lt < tRun + .5 ? k * 8 : .2 * Math.sin(lt * 14) * Math.exp(-(lt - tRun - .5) * 2)); topHat(u, 1.1); pop(); }
    // the guard and his aspin
    const gm = emotions(lt, [[0, 'suspicious'], [tHoy, 'angry'], [tChase, 'furious']]);
    hero(gx, G, u * 1.1, { who: 'guard', ...gm, lid: 0, eyes: gm.eyes === 'red' ? 'angry' : gm.eyes, mouth: talk(lt, tHoy, 2.3, 'teeth', 'open') ?? (gm.mouth || 'teeth'), view: 'q', flip: true, walk: lt < .8 || lt > tChase ? lt * 4 : null, run: lt > tChase, propR: flashlight, aR: 1.1, boilKey: 'guard' });
    dog(gx + 230, G, 10, { flip: true, run: lt < .8 || lt > tChase ? lt * 5 : null, bark: Math.floor(lt * 6) % 2 === 0 && lt > tHoy && lt < 2.5, dy: lt > tHoy && lt < 2.5 ? -Math.abs(Math.sin(lt * 18)) * .6 : 0 });
    if (lt < tChase + .6) { boilSeed('beamG'); paint([[gx - 120, 760], [gx - 900, 600], [gx - 900, 1000]], { wash: '#FFF2B0', washOp: 70, ink: null }); }
    const eye = toScreen(880, G - 160);
    camEnd();
    lines(t);
    if (lt > tIris) iris(...eye, lt < dur - .3 ? lerp(1500, 260, ease(seg(lt, tIris, dur - .3))) : lerp(260, 0, easeIn(seg(lt, dur - .3, dur - .05))));
  }

  // ---------- 8. logo backdrop ----------
  // ---------- 8. the title, then a portal transition into the game ----------
  function shotLogo(t, lt, dur) {
    window.HEADS = {};
    const tSlam = .3, tSub = 1.0, tGo = dur - .95;
    const go = easeIn(seg(lt, tGo, dur - .2));
    paint(rectPts(-60, -60, W + 120, H + 120), { wash: '#1F2550', ink: null });
    portal(960, 470, 330 + 1400 * go, backOut(seg(lt, 0, .5)), t, { suck: .4 + go });
    boilSeed('logoGround'); paint(rectPts(-60, 1000, W + 120, 300), { wash: '#2F3C7A', ink: null });
    ['lapulapu', 'gabriela', 'rizal', 'bonifacio'].forEach((who, i) => {
      const x = lerp(-200, 2100, frac(lt * .22 + i * .09));
      hero(x - i * 190, 1000, 12, { who, ...feel('excited', lt + i), view: 'q', walk: lt * 4 + i * .3, run: true, boilKey: who + 'logo', wind: 1 });
    });
    // darken behind the title as it slams in
    const dim = seg(lt, tSlam, tSlam + .3) * (1 - go);
    if (dim > 0) { boilSeed('dim'); paint(rectPts(-60, -60, W + 120, H + 120), { wash: '#0A0D24', washOp: 150 * dim, ink: null }); }
    const k = lt < tSlam ? 0 : lerp(2.4, 1, backOut(seg(lt, tSlam, tSlam + .45))) * (1 - .95 * go), rot = lerp(-.1, -.035, seg(lt, tSlam, tSlam + .45)) + go * 2;
    const a = seg(lt, tSlam, tSlam + .12) * (1 - seg(go, .7, 1));
    if (k > 0 && a > 0) {
      const P = (y) => [960 + Math.sin(rot) * (540 - y) * k, 540 + (y - 540) * k * Math.cos(rot)];
      push(); translate(...P(250)); rotate(lt * .4); boilSeed('sun');
      glow(0, 0, 150 * k, '#F2C14E', a);
      paint(starPts(0, 0, 80 * k, .55, 8), { wash: '#F2C14E', ink: PAL.ink, sw: 1.2 });
      paint(ellPts(0, 0, 38 * k, 38 * k, 18), { wash: '#FFE08A', ink: PAL.ink, sw: 1 });
      pop();
      const F = (px) => `800 ${Math.round(px)}px "Baloo 2", "Trebuchet MS", sans-serif`;
      letter('Balik Bayan', ...P(470), 170 * k, '#FFF6DF', { font: F(170 * k), stroke: '#2A1608', ink: false, rot, alpha: a });
      letter('Runner', ...P(640), 190 * k, '#F2C14E', { font: F(190 * k), stroke: '#2A1608', ink: false, rot, alpha: a });
      const sub = 'Takbo, bayani. Ang kasaysayan ay naghihintay!';
      if (lt > tSub) letter(sub.slice(0, Math.floor((lt - tSub) * 34)), ...P(780), 46 * k, '#FFF6DF', { font: F(46 * k), stroke: '#0A0D24', ink: false, rot, alpha: a });
    }
    flushLetters();
    if (lt < .3) iris(960, 540, lerp(0, 1500, easeIn(lt / .3)));
    flash(seg(lt, dur - .45, dur - .1), '#FFFDF6');
  }

  // ---------- credits: who made the game, in a gold museum frame ----------
  function shotCredits(t, lt, dur) {
    window.HEADS = {};
    paint(rectPts(-60, -60, W + 120, H + 120), { wash: '#100E22', ink: null });
    const k = backOut(seg(lt, .1, .55)), out = seg(lt, dur - .45, dur - .05);
    boilSeed('credframe');
    push(); translate(960, 540); scale(.85 + .15 * k);
    frame(0, 0, 1180, 560, '#1F2550', 'credits');
    pop();
    glow(960, 540, 520, '#9F8CFF', .25 * k);
    for (let i = 0; i < 7; i++) {   // little sparkles drifting up around the frame
      const x = 380 + hash(i * 7.1) * 1160, y = 860 - frac(lt * .25 + hash(i * 3.3)) * 700, a = Math.sin(frac(lt * .6 + hash(i)) * Math.PI) * k;
      if (a > .05) { boilSeed('cs' + i); paint(starPts(x, y, 14 + 10 * hash(i + 2), .4, 4), { wash: '#F2C14E', washOp: 255 * a, ink: null }); }
    }
    const F = (px) => `800 ${px}px "Baloo 2", "Trebuchet MS", sans-serif`, a = seg(lt, .3, .5);
    letter('Created by', 960, 360, 54, '#F2C14E', { font: F(54), ink: false, alpha: a });
    const n1 = 'Marc Reiven Capili', n2 = 'Anne Marielle Dillena';
    letter(n1.slice(0, Math.max(0, Math.floor((lt - .5) * 40))), 960, 480, 92, '#FFF6DF', { font: F(92), stroke: '#2A1608', ink: false });
    letter('and', 960, 572, 46, '#C9C2E8', { font: `italic ${F(46)}`, ink: false, alpha: seg(lt, .95, 1.1) });
    letter(n2.slice(0, Math.max(0, Math.floor((lt - 1.05) * 40))), 960, 670, 92, '#FFF6DF', { font: F(92), stroke: '#2A1608', ink: false });
    flushLetters();
    if (lt < .25) flash(1 - lt / .25, '#000000');
    if (out > 0) paint(rectPts(-60, -60, W + 120, H + 120), { wash: '#000000', washOp: 255 * out, ink: null });
  }

  // The credits come first; the film itself starts 3 s in (keep in step with lines.js and the game's data/lore.ts).
  const CREDITS = 3;
  shots([[0, shotCredits], ...[[0, shotTitle], [4, shotMactan], [12, shotIlocos], [20, shotDapitan], [28, shotManila], [36, shotTunnel], [41, shotMuseum], [47, shotGuard], [52.5, shotLogo]].map(([t0, f]) => [t0 + CREDITS, f])]);
})();
