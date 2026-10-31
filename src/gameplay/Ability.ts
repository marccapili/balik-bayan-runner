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

  /**
   * `cooldown` defaults to the data value; training passes a short one. `boost` (hero level 9) makes
   * it last / reach further; `locked` = hero below level 5 (it never fires).
   */
  constructor(
    readonly kind: AbilityKind,
    readonly cooldown: number = ABILITIES[kind].cooldown,
    readonly boost = 1,
    readonly locked = false,
  ) {}

  /** Seconds the effect lasts (boosted). */
  get duration(): number {
    return this.def.duration * this.boost;
  }

  get def(): (typeof ABILITIES)[AbilityKind] {
    return ABILITIES[this.kind];
  }

  get ready(): boolean {
    return !this.locked && this.cooldownLeft <= 0;
  }

  get active(): boolean {
    return this.activeLeft > 0;
  }

  /** 0 = just used, 1 = ready. */
  get cooldownFrac(): number {
    if (this.locked) return 0;
    return this.ready ? 1 : 1 - this.cooldownLeft / this.cooldown;
  }

  /** Starts the ability if it is off cooldown. Returns whether it fired. */
  trigger(): boolean {
    if (!this.ready) return false;
    this.cooldownLeft = this.cooldown;
    this.activeLeft = this.duration;
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
