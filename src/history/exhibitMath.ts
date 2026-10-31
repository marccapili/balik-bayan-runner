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

export interface GuideTarget {
  kind: 'exhibit' | 'card';
  at: Vec2;
  id: string;
}

/**
 * Where the floor arrow points in Exhibit Mode: the nearest exhibit not yet cleared this run.
 * Card Swipe exhibits need the Curator ID first, so until it's found the ID card is the target for them.
 */
export function guideTarget(pos: Vec2, cleared: ReadonlySet<string>, card: { pos: Vec2; taken: boolean } | null, list: readonly Exhibit[] = EXHIBITS): GuideTarget | null {
  let best: GuideTarget | null = null;
  let bestD = Infinity;
  const consider = (t: GuideTarget): void => {
    const d = Math.hypot(t.at.x - pos.x, t.at.z - pos.z);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  };
  let needsCard = false;
  for (const e of list) {
    if (cleared.has(e.id)) continue;
    if (e.game === 'swipe' && !card?.taken) {
      needsCard = true;
      continue;
    }
    consider({ kind: 'exhibit', at: e.at, id: e.id });
  }
  if (needsCard && card && !card.taken) consider({ kind: 'card', at: card.pos, id: 'id-card' });
  return best;
}
