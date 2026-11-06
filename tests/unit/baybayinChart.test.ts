import { describe, expect, it } from 'vitest';
import { BAYBAYIN_CHART, chartInReach } from '../../src/data/baybayinChart';
import { EXHIBITS } from '../../src/data/exhibits';
import { exhibitInReach } from '../../src/history/exhibitMath';
import { buildColliders } from '../../src/data/museumLayout';

describe('baybayin chart', () => {
  it('is reachable in front of the board, not from the room centre', () => {
    expect(chartInReach(BAYBAYIN_CHART.at)).toBe(true);
    expect(chartInReach({ x: -20, z: 12 })).toBe(false);
  });
  it('never overlaps an exhibit prompt', () => {
    expect(exhibitInReach(BAYBAYIN_CHART.at, EXHIBITS)).toBeNull();
  });
  it('reading spot is open floor (not inside a wall or prop)', () => {
    const { x, z } = BAYBAYIN_CHART.at;
    const inside = buildColliders().some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
    expect(inside).toBe(false);
  });
  it('covers every character the Baybayin mini-game asks', () => {
    expect(BAYBAYIN_CHART.glyphs.length).toBe(17);
  });
});
