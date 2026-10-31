import { ABILITIES, type AbilityKind } from '../data/abilities';

/**
 * Cooldown + active-window bookkeeping for the hero's one ability. Engine-free:
 * SurvivalRun applies the effect, the scene renders it, the HUD reads `ready`/`cooldownFrac`.
 */
export class Ability {
  /** Seconds until it can be used again. */
  cooldownLeft = 0;
  /** Seconds the effect is still running (shield: still up and unbroken). */
  activeLeft = 0;
  uses = 0;

  constructor(readonly kind: AbilityKind) {}

  get def(): (typeof ABILITIES)[AbilityKind] {
    return ABILITIES[this.kind];
  }

  get ready(): boolean {
    return this.cooldownLeft <= 0;
  }

  get active(): boolean {
    return this.activeLeft > 0;
  }

  /** 0 = just used, 1 = ready. */
  get cooldownFrac(): number {
    return this.ready ? 1 : 1 - this.cooldownLeft / this.def.cooldown;
  }

  /** Starts the ability if it is off cooldown. Returns whether it fired. */
  trigger(): boolean {
    if (!this.ready) return false;
    this.cooldownLeft = this.def.cooldown;
    this.activeLeft = this.def.duration;
    this.uses++;
    return true;
  }

  /** Ends the active window early (shield broke). Cooldown keeps running. */
  end(): void {
    this.activeLeft = 0;
  }

  update(dt: number): void {
    if (this.cooldownLeft > 0) this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    if (this.activeLeft > 0) this.activeLeft = Math.max(0, this.activeLeft - dt);
  }
}
