/**
 * First-run coach tips (engine-free, unit-tested). Shows one short tip at a time, in order,
 * each until the player does the thing or a few seconds pass. The gadget tip waits for the
 * first gadget in the slot. Copy lives in data/tutorial.ts.
 */
export type TipId = 'move' | 'exhibit' | 'ability' | 'gadget';

export interface TutorialInput {
  /** Metres the hero has moved this run. */
  moved: number;
  /** A mini-game or exhibit panel has been opened. */
  openedExhibit: boolean;
  usedAbility: boolean;
  holdingGadget: boolean;
  usedGadget: boolean;
}

export const TIP_SECONDS = { move: 8, exhibit: 9, ability: 7, gadget: 8 } as const;

export class Tutorial {
  private queue: TipId[] = ['move', 'exhibit', 'ability'];
  private current: TipId | null = null;
  private shownFor = 0;
  private gadgetShown = false;
  /** Every tip has been shown (or skipped). */
  done = false;

  get tip(): TipId | null {
    return this.current;
  }

  /** Player tapped "Gets!" on the current tip. */
  dismiss(): void {
    this.current = null;
  }

  update(dt: number, s: TutorialInput): TipId | null {
    if (this.done) return null;
    if (this.current) {
      this.shownFor += dt;
      const satisfied =
        (this.current === 'move' && s.moved > 5) ||
        (this.current === 'exhibit' && s.openedExhibit) ||
        (this.current === 'ability' && s.usedAbility) ||
        (this.current === 'gadget' && s.usedGadget);
      // A tip stays at least 2 s so it can be read, then goes once done or timed out.
      if ((satisfied && this.shownFor > 2) || this.shownFor > TIP_SECONDS[this.current]) this.current = null;
      return this.current;
    }
    let next: TipId | undefined;
    if (!this.gadgetShown && s.holdingGadget) {
      this.gadgetShown = true;
      next = 'gadget';
    } else {
      next = this.queue.shift();
    }
    if (next) {
      this.current = next;
      this.shownFor = 0;
    } else if (this.gadgetShown) {
      this.done = true;
    }
    return this.current;
  }
}
