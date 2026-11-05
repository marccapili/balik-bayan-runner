/**
 * Background music data (original compositions, see audio/Music.ts).
 * Melodies are scale degrees on an anhemitonic pentatonic scale, the kind of scale heard in
 * kulintang gong music from Mindanao. These loops are inspired by that sound, not transcriptions.
 * `null` = rest. Two bars (32 sixteenth steps) of melody, repeated over the root progression.
 */
export type MusicTrack = 'lobby' | 'museum';

const _ = null;

export const MUSIC = {
  /** Overall music level under the player's slider. */
  master: 0.55,
  defaultVolume: 0.5,
  /** Semitone offsets of the pentatonic scale (do re mi sol la). */
  scale: [0, 2, 4, 7, 9] as const,
  tracks: {
    lobby: {
      bpm: 84,
      bars: 8,
      roots: [0, 0, -3, -5, 0, 0, -7, -5],
      gong: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      melody: [0, _, 2, _, 4, _, 2, _, 3, _, _, 2, 4, _, _, _, 5, _, 4, _, 3, _, 2, _, 1, _, 2, _, 0, _, _, _],
      bass: [1, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _],
      layers: { bass: -1, shaker: 0.99, lead: 2 },
    },
    museum: {
      bpm: 132,
      bars: 8,
      roots: [0, 0, -2, -2, -5, -5, -3, -1],
      gong: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      melody: [4, _, 4, 3, 2, _, 4, _, 5, 4, 3, _, 2, _, 0, _, 2, _, 2, 3, 4, _, 2, _, 1, 0, 1, _, 2, _, _, _],
      bass: [1, _, _, 1, _, _, 1, _, 1, _, _, 1, _, 3, _, _],
      layers: { bass: 0.15, shaker: 0.35, lead: 0.85 },
    },
  },
  /** Music level while paused / reading an exhibit / in a mini-game. */
  duckPaused: 0.35,
  duckMini: 0.6,
  /** Enemies on the field for full chase intensity. */
  fullIntensityEnemies: 8,
  /** Endless Mode plays a little faster. */
  endlessTempo: 1.08,
} as const;
