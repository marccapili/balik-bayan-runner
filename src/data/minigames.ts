/**
 * M7 exhibit mini-games: original museum-themed tasks (inspired by "fix the ship" style chores,
 * not copies of any game). Each exhibit names its game in data/exhibits.ts. Tuning lives here.
 * `d` (0…1) = exhibits already cleared this run / total, so the games get harder as you go.
 */

export type MiniGameKind = 'wires' | 'swipe' | 'code' | 'navigate' | 'restore' | 'dust' | 'timeline' | 'baybayin';

export const MINIGAME_INFO: Record<MiniGameKind, { title: string; how: string; icon: string }> = {
  wires: { title: 'Ayusin ang Ilaw ng Display', how: 'I-drag ang bawat wire sa socket na kapareho ng kulay.', icon: '💡' },
  swipe: { title: 'Curator Card Swipe', how: 'I-swipe ang Curator ID sa reader, hindi masyadong mabilis o mabagal.', icon: '🪪' },
  code: { title: 'Display Case Code', how: 'Ilagay ang tamang taon para mabuksan ang salamin.', icon: '🔢' },
  navigate: { title: 'Balangay Navigator', how: 'I-drag ang bangka sa mga isla, sunod-sunod: 1, 2, 3…', icon: '⛵' },
  restore: { title: 'Restore the Artifact', how: 'Tap ang dalawang piraso para pagpalitin hanggang mabuo.', icon: '🧩' },
  dust: { title: 'Dust Off', how: 'Kuskusin ang alikabok hanggang makita ang exhibit.', icon: '🧹' },
  timeline: { title: 'Timeline Sort', how: 'Tap ang mga pangyayari mula pinakauna hanggang pinakahuli.', icon: '🗓️' },
  baybayin: { title: 'Baybayin Match', how: 'Tap ang baybayin, tapos ang tamang tunog nito.', icon: 'ᜊ' },
};

export const MINIGAME = {
  /** Warn the player when an enemy is this close while they play (enemies keep moving). */
  dangerRange: 6,
  wires: { min: 3, max: 5 },
  /** Card swipe: must cross this much of the reader in [minSeconds, maxSeconds]. */
  swipe: { travel: 0.82, minSeconds: 0.35, maxSecondsEasy: 1.3, maxSecondsHard: 0.9 },
  /** Code: one more digit revealed after each wrong try. */
  code: { digits: 4 },
  navigate: { min: 3, max: 5, hitRadius: 0.1, minGap: 0.24 },
  restore: { size: 3, swapsEasy: 3, swapsHard: 6 },
  dust: { cols: 24, rows: 16, brush: 0.09, targetEasy: 0.7, targetHard: 0.82 },
  baybayin: { min: 3, max: 5 },
  /** Seconds the "solved!" flash shows before the exhibit opens. */
  winPause: 0.6,
} as const;

/** Basic baybayin characters (consonant + inherent "a", plus the three vowels), Unicode Tagalog block. */
export const BAYBAYIN: readonly { glyph: string; sound: string }[] = [
  { glyph: 'ᜀ', sound: 'a' },
  { glyph: 'ᜁ', sound: 'e/i' },
  { glyph: 'ᜂ', sound: 'o/u' },
  { glyph: 'ᜊ', sound: 'ba' },
  { glyph: 'ᜃ', sound: 'ka' },
  { glyph: 'ᜇ', sound: 'da' },
  { glyph: 'ᜄ', sound: 'ga' },
  { glyph: 'ᜑ', sound: 'ha' },
  { glyph: 'ᜎ', sound: 'la' },
  { glyph: 'ᜋ', sound: 'ma' },
  { glyph: 'ᜈ', sound: 'na' },
  { glyph: 'ᜅ', sound: 'nga' },
  { glyph: 'ᜉ', sound: 'pa' },
  { glyph: 'ᜐ', sound: 'sa' },
  { glyph: 'ᜆ', sound: 'ta' },
  { glyph: 'ᜏ', sound: 'wa' },
  { glyph: 'ᜌ', sound: 'ya' },
];

/** Wire colours (distinct + named for colour-blind players: each wire also shows a shape). */
export const WIRE_COLORS: readonly { color: string; mark: string }[] = [
  { color: '#e8453c', mark: '●' },
  { color: '#2f7de1', mark: '■' },
  { color: '#f4c430', mark: '▲' },
  { color: '#2fb36d', mark: '◆' },
  { color: '#b05ce0', mark: '★' },
];
