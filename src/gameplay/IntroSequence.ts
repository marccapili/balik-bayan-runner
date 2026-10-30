import { INTRO } from '../data/lobby';

export type IntroPhase = 'reveal' | 'float' | 'fall' | 'land' | 'notice' | 'done';
export type IntroEvent = 'awaitDrop' | 'drop' | 'landed' | 'guardTurns' | 'guardAlert' | 'chase';

/**
 * Deterministic run-start cinematic (engine-free, unit-tested). One state machine drives it,
 * no free-running timers: reveal → float (waits for input) → fall → land → notice → done.
 * The scene reads `heroY`, `phase` and the per-step events to pose the hero, guard and camera.
 */
export class IntroSequence {
  phase: IntroPhase = 'reveal';
  phaseTime = 0;
  heroY: number = INTRO.floatHeight;
  private vy = 0;
  private t = 0;
  private alerted = false;

  constructor(private readonly cfg = INTRO) {}

  /** 0 → 1 over the reveal (camera swoop). */
  get revealT(): number {
    return this.phase === 'reveal' ? Math.min(1, this.phaseTime / this.cfg.revealSeconds) : 1;
  }

  get waitingForDrop(): boolean {
    return this.phase === 'float';
  }

  private enter(p: IntroPhase, out: IntroEvent[], e?: IntroEvent): void {
    this.phase = p;
    this.phaseTime = 0;
    if (e) out.push(e);
  }

  /**
   * @param drop true on the step the player tapped / pressed a key. Ignored outside 'float',
   *             so an early tap during the reveal can't skip the hover.
   */
  update(dt: number, drop: boolean): IntroEvent[] {
    const out: IntroEvent[] = [];
    const c = this.cfg;
    this.t += dt;
    this.phaseTime += dt;
    switch (this.phase) {
      case 'reveal':
        this.heroY = c.floatHeight + Math.sin(this.t * Math.PI * 2 * c.floatBobHz) * c.floatBob;
        if (this.phaseTime >= c.revealSeconds) this.enter('float', out, 'awaitDrop');
        break;
      case 'float':
        this.heroY = c.floatHeight + Math.sin(this.t * Math.PI * 2 * c.floatBobHz) * c.floatBob;
        if (drop) {
          this.vy = c.dropHop;
          this.enter('fall', out, 'drop');
        }
        break;
      case 'fall':
        this.vy -= c.gravity * dt;
        this.heroY += this.vy * dt;
        if (this.heroY <= 0) {
          this.heroY = 0;
          this.vy = 0;
          this.enter('land', out, 'landed');
        }
        break;
      case 'land':
        if (this.phaseTime >= c.landSeconds) this.enter('notice', out, 'guardTurns');
        break;
      case 'notice':
        if (!this.alerted && this.phaseTime >= c.guardTurnSeconds) {
          this.alerted = true;
          out.push('guardAlert');
        }
        if (this.phaseTime >= c.guardTurnSeconds + c.guardSurpriseSeconds) this.enter('done', out, 'chase');
        break;
      case 'done':
        break;
    }
    return out;
  }
}
