// heroclips.js: a ~4 s start clip per hero, played by the game when you press PLAY. Each is a standalone loop
// (LOOPS.start_<hero>), rendered with: node render.mjs --loop=start_rizal --png --workers=4 --soft-gl --out=out/clip_rizal
// The hero bursts in, strikes their signature pose and says their line (bubble), a name card slams in, then they dash
// off into the museum and a brush wipe in their colours covers the frame (the game's portal transition takes it from there).
// Lines and titles are mirrored in the game's src/data/heroClips.ts (a unit test checks).
(() => {
  const G = 960, U = 34, LEN = 4;
  const CLIPS = {
    lapulapu: {
      line: 'Tara! Laban lang!', title: 'Datu ng Mactan', cols: ['#1E6F7A', '#F2C14E'], ink: '#0E3A40',
    },
    gabriela: {
      line: 'Walang aatras!', title: 'Tapang ng Ilocos', cols: ['#6B3A8A', '#F2B8D0'], ink: '#2E1440',
    },
    rizal: {
      line: 'Pag-aralan natin ’to!', title: 'Ang Pambansang Bayani', cols: ['#2A3A7A', '#8EA2E6'], ink: '#10183A',
    },
    bonifacio: {
      line: 'Sugod, mga kapatid!', title: 'Supremo ng Katipunan', cols: ['#C8302C', '#1F2550'], ink: '#3A0A0A',
    },
  };
  window.HERO_CLIPS = CLIPS;
  const T_LINE = [.75, 2.7], T_CARD = .95, T_DASH = 2.9, T_WIPE = 3.45;

  const FONT = (px) => `800 ${Math.round(px)}px "Baloo 2", "Trebuchet MS", sans-serif`;
  const puff = (x, y, r, k, col = PAL.cream) => { if (k > 0 && k < 1) { boilSeed('cpuff' + Math.round(x) + Math.round(y)); paint(ellPts(x, y - r * k * .4, r * (.4 + k), r * (.3 + k * .7), 14, r * .08), { wash: col, washOp: 230 * (1 - k), ink: k < .5 ? PAL.ink : null, sw: .6 }); } };
  const dust = (x, y, t0, t, n = 4, r = 60) => { for (let i = 0; i < n; i++) puff(x + (i - n / 2) * r * .8, y - hash(i) * 12, r * (.7 + .5 * hash(i + 4)), seg(t, t0 + i * .05, t0 + .7 + i * .05)); };

  // A "versus screen" backdrop: rotating wedges in the hero's colours over a museum floor.
  function burst(c, t, punch) {
    paint(rectPts(-60, -60, W + 120, H + 120), { wash: c.cols[0], ink: null });
    const n = 14, cx = 960, cy = 560, R = 1500, rot = t * .25;
    boilSeed('burst');
    for (let i = 0; i < n; i += 2) {
      const a0 = rot + i * TAU / n, a1 = a0 + TAU / n;
      paint([[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]], { wash: c.cols[1], washOp: 70, ink: null });
    }
    glow(cx, cy, 380 + 120 * punch, '#FFF6DF', .35 + .3 * punch);
    boilSeed('cfloor');
    paint(rectPts(-60, G - 10, W + 120, H - G + 70), { wash: mixCol(c.cols[0], PAL.ink, .45), ink: null });
    inkLine([[-60, G - 10], [W / 2, G - 14], [W + 60, G - 8]], 1.4, PAL.ink, 'ink', .5);
    for (let i = 0; i < 7; i++) inkLine([[-200 + i * 380, G - 10], [-700 + i * 520, H + 60]], .6, mixCol(c.cols[0], PAL.ink, .7), 'inkfine', 0);
  }

  // The name card: a painted banner that slams in under the hero.
  function card(who, c, lt) {
    const k = seg(lt, T_CARD, T_CARD + .3); if (k <= 0) return;
    const s = lerp(1.8, 1, backOut(k)), a = seg(lt, T_CARD, T_CARD + .08), rot = -.04;
    const name = LORE_FILM.names[who].toUpperCase(), w = 820, h = 150, x = 960, y = 1000;
    boilSeed('card' + who);
    push(); translate(x, y); rotate(rot); scale(s);
    paint(rectPts(-w / 2 + 12, -h / 2 + 12, w, h), { wash: PAL.ink, washOp: 200, ink: null });
    paint(rectPts(-w / 2, -h / 2, w, h, 1.5), { wash: '#FFF1D0', ink: PAL.ink, sw: 1.4 });
    paint(rectPts(-w / 2, -h / 2, 26, h), { wash: c.cols[0], ink: null });
    pop();
    const P = (dx, dy) => [x + (dx * Math.cos(rot) - dy * Math.sin(rot)) * s, y + (dx * Math.sin(rot) + dy * Math.cos(rot)) * s];
    letter(name, ...P(0, -18), 74 * s, c.ink, { font: FONT(74 * s), ink: false, rot, alpha: a });
    letter(c.title.slice(0, Math.max(0, Math.floor((lt - T_CARD - .25) * 40))), ...P(0, 46), 38 * s, '#7A4A20', { font: FONT(38 * s), ink: false, rot, alpha: a });
  }

  // Where the hero is and how they move, per hero: entrance → pose → dash.
  function act(who, lt) {
    const x0 = 960, land = .45;
    const dashK = easeIn(seg(lt, T_DASH, T_DASH + .55)), dashX = lerp(0, 1500, dashK);
    const o = { who, boilKey: 'clip' + who };
    let x = x0, dy = 0, extra = {};
    if (who === 'lapulapu') {         // springs up from below the frame, lands in a crouch, then flexes
      const k = seg(lt, 0, land); dy = lt < land ? (1 - k) * 22 - Math.sin(k * Math.PI) * 16 : 0;
      const mood = emotions(lt, [[0, 'surprised'], [land, 'determined'], [1.0, 'excited'], [T_DASH, 'determined']]);
      const pump = .12 * Math.sin(lt * 14);
      extra = { ...mood, aL: lt > .9 && lt < T_DASH ? 1.3 + pump : mood.aL, aR: lt > .9 && lt < T_DASH ? 1.3 - pump : mood.aR, wind: .4 };
    } else if (who === 'gabriela') {  // runs in from the left and skids to a stop, then points the way
      const k = easeOut(seg(lt, 0, land)); x = lerp(-300, x0, k);
      const mood = emotions(lt, [[0, 'determined'], [land, 'surprised'], [.7, 'determined'], [T_DASH, 'determined']]);
      extra = { ...mood, view: lt < land || (lt > .9 && lt < 2.2) ? 'q' : 'front', walk: lt < land ? lt * 6 : null, run: lt < land, smear: lt < land ? .6 : 0, rot: lt > land && lt < land + .25 ? -.12 : 0, aR: lt > .9 && lt < T_DASH ? 1.35 : mood.aR, wind: lt < land ? .8 : .3 };
    } else if (who === 'rizal') {     // drops in from the top, his hat follows a beat later, then: an idea!
      const k = seg(lt, 0, land); dy = lt < land ? -(1 - k * k) * 28 : 0;
      const mood = emotions(lt, [[0, 'surprised'], [land, 'dizzy'], [.95, 'idea'], [T_DASH, 'excited']]);
      extra = { ...mood, hatOff: lt < .9, aR: lt > .95 && lt < T_DASH ? 1.6 : mood.aR, propR: lt > .95 && lt < T_DASH ? quill : null };
    } else {                          // bonifacio: charges in from the right, turns, bolo up
      const k = easeOut(seg(lt, 0, land)); x = lerp(2200, x0, k);
      const mood = emotions(lt, [[0, 'determined'], [1.4, 'excited'], [2.2, 'determined']]);
      extra = { ...mood, view: lt < land + .2 ? 'q' : 'front', flip: lt < land + .2, walk: lt < land ? lt * 6 : null, run: lt < land, smear: lt < land ? .6 : 0, aR: lt > .7 && lt < T_DASH ? 1.3 + .08 * Math.sin(lt * 12) : 1.0, aL: lt > .7 && lt < T_DASH ? .2 : null, propR: bolo, wind: .6, tint: null };
    }
    if (lt > T_DASH) { x += dashX; extra = { ...extra, view: 'q', flip: false, walk: lt * 6, run: true, smear: .8, rot: .1, wind: 1, propR: who === 'bonifacio' ? bolo : null, aR: who === 'bonifacio' ? 1.2 : null, aL: null }; }
    const sq = lt > land && lt < land + .35 ? .3 * Math.exp(-(lt - land) * 10) : 0;
    return { x, y: G, o: { ...o, ...extra, dy: (extra.dy || 0) + dy, sq: (extra.sq || 0) + sq, mouth: talk(lt, T_LINE[0] + .1, T_LINE[0] + 1.2, 'open', 'o') ?? extra.mouth } };
  }

  function clip(who) {
    const c = CLIPS[who];
    const f = function (lt) {
      window.HEADS = {};
      const land = .45, punch = Math.exp(-Math.max(0, lt - land) * 5) * (lt > land ? 1 : 0);
      const sh = lt > land ? shakeXY(lt, 10 * Math.exp(-(lt - land) * 8)) : [0, 0];
      const z = lerp(1.1, 1.18, ease(seg(lt, 0, T_DASH))) + .05 * punch;
      camBegin(960 + sh[0], 640 + sh[1], z);
      burst(c, lt, punch);
      const a = act(who, lt);
      hero(a.x, a.y, U, a.o);
      if (who === 'rizal' && lt > .4 && lt < .9) {   // the hat lands last, on Rizal
        const k = seg(lt, .4, .9); boilSeed('cliphat'); push(); translate(960, lerp(-200, heroHeadY(G, U, { s: 1 }) - .5 * U, k * k)); rotate((1 - k) * 5); topHat(U, 2); pop();
      }
      dust(960, G, land, lt, 4, 70);
      if (lt > T_DASH) dust(960, G, T_DASH, lt, 3, 60);
      camEnd();
      // the line, in the film's speech bubble
      if (lt >= T_LINE[0] && lt <= T_LINE[1]) speech(who, c.line, lt - T_LINE[0], lt - T_LINE[1], 'clip' + who);
      window.HEADS = {};
      card(who, c, lt);
      flushLetters();
      if (lt < .3) iris(960, 600, lerp(0, 1500, easeIn(lt / .3)));
      if (lt > T_WIPE) { boilSeed('cwipe'); brushWipe(Math.min(.5, (lt - T_WIPE) / ((LEN - T_WIPE) * 2) + .02), [c.cols[0], mixCol(c.cols[0], PAL.ink, .4)]); }
    };
    f.len = LEN;
    return f;
  }
  for (const who of Object.keys(CLIPS)) LOOPS['start_' + who] = clip(who);
})();
