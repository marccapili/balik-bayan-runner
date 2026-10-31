import { HEALTH } from '../data/gameplay';

/** Hearts + invulnerability window. One hit can never remove more than one heart. */
export class Health {
  hearts: number;
  private invuln: number;

  constructor(
    readonly max: number = HEALTH.maxHearts,
    private readonly iFrames: number = HEALTH.invulnerableSeconds,
    startGrace: number = HEALTH.startGrace,
  ) {
    this.hearts = max;
    this.invuln = startGrace;
  }

  get invulnerable(): boolean {
    return this.invuln > 0;
  }

  get dead(): boolean {
    return this.hearts <= 0;
  }

  /** Seconds of invulnerability left (for flashing). */
  get invulnLeft(): number {
    return Math.max(0, this.invuln);
  }

  update(dt: number): void {
    if (this.invuln > 0) this.invuln -= dt;
  }

  /** Extra invulnerability (Gabriela's dash). Never shortens an existing window. */
  grantInvuln(seconds: number): void {
    this.invuln = Math.max(this.invuln, seconds);
  }

  /** Returns true when the hit landed. */
  damage(): boolean {
    if (this.dead || this.invulnerable) return false;
    this.hearts -= 1;
    this.invuln = this.iFrames;
    return true;
  }

  /** Returns true when a heart was restored (never above max). */
  heal(): boolean {
    if (this.dead || this.hearts >= this.max) return false;
    this.hearts += 1;
    return true;
  }
}
