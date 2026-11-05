// modelsheet.js: the cast lined up, for review (not part of the video).
(() => {
  function sheet(t) {
    paint(rectPts(-60, -60, W + 120, H + 120), { wash: '#EDE3CF', ink: null });
    const who = ['lapulapu', 'gabriela', 'rizal', 'bonifacio', 'guard'];
    const moods = ['proud', 'determined', 'happy', 'surprised', 'angry'];
    who.forEach((w, i) => hero(220 + i * 370, 560, 22, { who: w, ...feel(moods[i], t), boilKey: w, propR: w === 'bonifacio' ? bolo : w === 'guard' ? flashlight : null }));
    const em = ['scared', 'confused', 'dizzy', 'starstruck', 'cry'];
    who.forEach((w, i) => hero(220 + i * 370, 1040, 18, { who: w, view: i % 2 ? 'q' : 'front', ...feel(em[i], t), boilKey: w + '2' }));
    horse(1500, 760 - 640, 9, { gallop: t * 2 });
    dog(1800, 150, 10, { run: t * 3, bark: true });
    portal(120, 140, 90, 1, t, { suck: 1 });
  }
  shots([[0, sheet]]);
})();
