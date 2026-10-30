/**
 * Tiny deterministic finite-state machine.
 * Transitions must be declared up front; anything else throws in dev and is ignored in prod,
 * so two systems can never put the game into a conflicting state.
 */
export class StateMachine<S extends string> {
  private current: S;
  private readonly listeners: Array<(from: S, to: S) => void> = [];

  constructor(
    initial: S,
    private readonly allowed: Readonly<Record<S, readonly S[]>>,
  ) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  can(to: S): boolean {
    return this.allowed[this.current].includes(to);
  }

  /** Returns true when the transition happened. */
  transition(to: S): boolean {
    if (!this.can(to)) {
      if (import.meta.env?.DEV) console.warn(`[StateMachine] blocked ${this.current} -> ${to}`);
      return false;
    }
    const from = this.current;
    this.current = to;
    for (const l of this.listeners) l(from, to);
    return true;
  }

  onChange(listener: (from: S, to: S) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }
}

/** Top-level game flow: boot → lobby → intro (cinematic) → playing ⇄ paused → gameover → intro | lobby. */
export type GameState = 'boot' | 'lobby' | 'intro' | 'playing' | 'paused' | 'gameover';

export const GAME_TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  boot: ['lobby', 'playing'],
  lobby: ['intro', 'playing'],
  intro: ['playing', 'lobby'],
  playing: ['paused', 'gameover', 'lobby'],
  paused: ['playing', 'lobby', 'intro'],
  gameover: ['intro', 'lobby', 'playing'],
};
