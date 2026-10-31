import { COIN_VALUES, SCORING } from '../data/gameplay';

export type ScoreEvent = 'coin' | 'rareCoin' | 'survival';

/**
 * Deterministic run score. Score points and spendable run-coins are tracked separately.
 * Time only advances through `update(dt)`, which the game calls only while playing —
 * so pausing or reading exhibits can never farm points.
 */
export class ScoreKeeper {
  score = 0;
  runCoins = 0;
  coinsPicked = 0;
  time = 0;
  combo = 0;
  /** Highest multiplier reached this run (missions). */
  bestMultiplier = 1;
  /** Exhibits cleared this run. */
  discoveries = 0;
  private comboTimer = 0;
  private bonusesPaid = 0;
  onBonus: ((points: number) => void) | null = null;

  get multiplier(): number {
    return Math.min(SCORING.maxMultiplier, 1 + Math.floor(this.combo / SCORING.coinsPerStep));
  }

  update(dt: number): void {
    this.time += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    // Survival bonus — computed from elapsed intervals so it can never double-pay.
    const due = Math.floor(this.time / SCORING.survivalInterval);
    while (this.bonusesPaid < due) {
      this.bonusesPaid++;
      this.score += SCORING.survivalBonus;
      this.onBonus?.(SCORING.survivalBonus);
    }
  }

  /** Returns the points awarded (after multiplier). */
  collect(kind: 'coin' | 'rareCoin'): number {
    const pts = SCORING[kind] * this.multiplier;
    this.score += pts;
    this.runCoins += COIN_VALUES[kind];
    this.coinsPicked++;
    this.combo++;
    this.bestMultiplier = Math.max(this.bestMultiplier, this.multiplier);
    this.comboTimer = SCORING.comboWindow;
    return pts;
  }

  /** Exhibit cleared this run (the run makes sure each pays once): score + spendable coins. */
  discover(coins = 0): number {
    this.score += SCORING.artifactDiscovery;
    this.runCoins += coins;
    this.discoveries++;
    return SCORING.artifactDiscovery;
  }

  /** Taking damage breaks the combo. */
  breakCombo(): void {
    this.combo = 0;
    this.comboTimer = 0;
  }
}
