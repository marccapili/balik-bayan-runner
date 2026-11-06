/**
 * Baybayin study chart on the Library wall (owner request 2026-11-06): read it before the Baybayin
 * exhibit's matching game. Opening it freezes the run like an exhibit panel (FSM `reading`).
 * The characters are the same set the mini-game asks (`BAYBAYIN` in data/minigames.ts).
 */
import { BAYBAYIN } from './minigames';

export const BAYBAYIN_CHART = {
  /** Where the hero stands to read it (in the gap between the two north-wall bookshelves). */
  at: { x: -20, z: 22.2 },
  reach: 1.8,
  /** The wall board itself (replaces the old capiz window there). */
  wall: { x: -20, z: 23.65 },
  title: 'Baybayin Chart',
  icon: 'ᜊ',
  glyphs: BAYBAYIN,
  /** Kudlit examples: a mark above gives e/i, below gives o/u (Unicode vowel signs U+1712 / U+1713). */
  kudlit: [
    { glyph: 'ᜊ', sound: 'ba' },
    { glyph: 'ᜊᜒ', sound: 'be/bi' },
    { glyph: 'ᜊᜓ', sound: 'bo/bu' },
  ],
  note: 'Bawat titik ay katinig + "a". Lagyan ng kudlit (tuldok o guhit) sa itaas para maging e/i, sa ibaba para maging o/u.',
} as const;

/** True when the hero at `pos` can open the chart. */
export function chartInReach(pos: { x: number; z: number }): boolean {
  return Math.hypot(pos.x - BAYBAYIN_CHART.at.x, pos.z - BAYBAYIN_CHART.at.z) <= BAYBAYIN_CHART.reach;
}
