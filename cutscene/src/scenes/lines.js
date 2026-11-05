// lines.js: every word painted into the film: speech lines and era cards. MUST match the game's src/data/lore.ts
// (scene starts, bubble times, texts, eras); tests/unit/lore.test.ts checks that it does.
window.LORE_FILM = {
  scenes: [
    { id: 'title', start: 0, era: null, lines: [[0.5, 2.9, 'narrator', 'May nawawalang mga bayani…']] },
    { id: 'mactan', start: 4, era: 'Mactan, 1521', lines: [[2.1, 4.2, 'lapulapu', 'Ano ’tong ilaw sa dagat?!']] },
    { id: 'ilocos', start: 12, era: 'Ilocos, 1763', lines: [[3.75, 5.6, 'gabriela', 'Ano ito?']] },
    { id: 'dapitan', start: 20, era: 'Dapitan, 1890s', lines: [[2.55, 4.6, 'rizal', 'Teka, hindi pa tapos ’yung sulat ko!']] },
    { id: 'manila', start: 28, era: 'Maynila, 1896', lines: [[0.25, 1.75, 'bonifacio', 'Para sa Inang Bayan!'], [2.05, 3.3, 'bonifacio', 'Ha? Ano ’yon?!'], [3.35, 5.2, 'bonifacio', 'Hindi ako takot sa ’yo!']] },
    { id: 'tunnel', start: 36, era: null, lines: [[2.0, 3.8, 'bonifacio', 'SINO KA?! …SINO KAYO?!']] },
    { id: 'museum', start: 41, era: 'Museo, 2026', lines: [[3.3, 5.5, 'gabriela', 'Nasaan tayo? Kailangan natin malaman!']] },
    { id: 'guard', start: 47, era: null, lines: [[0.65, 2.45, 'guard', 'HOY! Bawal ’yan dito!'], [2.55, 3.7, 'bonifacio', 'TAKBO!!!']] },
    { id: 'logo', start: 52.5, era: null, lines: [] },
  ],
  names: { lapulapu: 'Lapu-Lapu', gabriela: 'Gabriela Silang', rizal: 'José Rizal', bonifacio: 'Andrés Bonifacio', guard: 'Guard' },
  tunnelYears: [1896, 1946, 1986, 2026],
};
