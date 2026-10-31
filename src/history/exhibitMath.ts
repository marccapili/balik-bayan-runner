import { EXHIBITS, type Exhibit } from '../data/exhibits';
import type { Vec2 } from '../utils/math';

/**
 * The exhibit the hero can read from `pos` (engine-free): the closest one whose reach covers the hero,
 * measured as distance minus reach so a big prop doesn't steal the prompt from a nearby small one.
 */
export function exhibitInReach(pos: Vec2, list: readonly Exhibit[] = EXHIBITS): Exhibit | null {
  let best: Exhibit | null = null;
  let bestGap = 0;
  for (const e of list) {
    const gap = Math.hypot(pos.x - e.at.x, pos.z - e.at.z) - e.reach;
    if (gap <= 0 && (!best || gap < bestGap)) {
      best = e;
      bestGap = gap;
    }
  }
  return best;
}
