import { INPUT_CONFIG } from '../data/config';
import type { Vec2 } from '../utils/math';
import { joystickVector, keysVector } from './joystickMath';

type Action = 'ability' | 'gadget' | 'interact' | 'pause' | 'confirm';

const KEY_MAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const ACTION_KEYS: Record<string, Action> = {
  Space: 'ability',
  KeyQ: 'gadget',
  KeyG: 'gadget',
  KeyE: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
};

/**
 * Merges keyboard and a floating touch joystick into one movement vector,
 * plus edge-triggered actions. Touch joystick appears where the left thumb lands.
 */
export class InputManager {
  private readonly held = { up: false, down: false, left: false, right: false };
  private readonly pressed = new Set<Action>();
  private stick: Vec2 = { x: 0, z: 0 };
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  /** True once any touch has been seen — used to show mobile-only UI. */
  touchSeen = false;
  enabled = true;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly touchZone: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    touchZone.appendChild(this.base);

    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(window, 'blur', () => this.releaseAll());
    this.listen(touchZone, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
    this.listen(window, 'pointercancel', (e) => this.onPointerUp(e as PointerEvent));
  }

  private listen(t: EventTarget, type: string, fn: (e: Event) => void): void {
    t.addEventListener(type, fn, { passive: false });
    this.cleanup.push(() => t.removeEventListener(type, fn));
  }

  /** Combined movement vector (x = right, z = up), magnitude ≤ ~1.4 before motor clamps it. */
  get move(): Vec2 {
    if (!this.enabled) return { x: 0, z: 0 };
    const k = keysVector(this.held.up, this.held.down, this.held.left, this.held.right);
    return { x: k.x + this.stick.x, z: k.z + this.stick.z };
  }

  /** Returns true once per press. */
  consume(action: Action): boolean {
    const had = this.pressed.has(action);
    this.pressed.delete(action);
    return had;
  }

  /** Lets on-screen buttons feed the same action pipeline as keys. */
  press(action: Action): void {
    this.pressed.add(action);
  }

  releaseAll(): void {
    this.held.up = this.held.down = this.held.left = this.held.right = false;
    this.endStick();
    this.pressed.clear();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    // Typing in a text field (nickname) must never move the hero or eat spaces.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const dir = KEY_MAP[e.code];
    if (dir) {
      this.held[dir] = down;
      e.preventDefault();
      return;
    }
    const action = ACTION_KEYS[e.code];
    if (action && down && !e.repeat) {
      this.pressed.add(action);
      e.preventDefault();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || this.stickPointer !== null || !this.enabled) return;
    this.touchSeen = true;
    document.body.classList.add('touch');
    this.stickPointer = e.pointerId;
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    const zr = this.touchZone.getBoundingClientRect();
    this.base.style.left = `${e.clientX - zr.left}px`;
    this.base.style.top = `${e.clientY - zr.top}px`;
    this.base.classList.add('active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickPointer) return;
    const r = INPUT_CONFIG.joystickRadius;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    // Drag the base along when the thumb overshoots so it never "runs out" of stick.
    if (len > r * 1.6) {
      const excess = len - r * 1.6;
      this.stickOrigin.x += (dx / len) * excess;
      this.stickOrigin.y += (dy / len) * excess;
      const zr = this.touchZone.getBoundingClientRect();
      this.base.style.left = `${this.stickOrigin.x - zr.left}px`;
      this.base.style.top = `${this.stickOrigin.y - zr.top}px`;
      dx = e.clientX - this.stickOrigin.x;
      dy = e.clientY - this.stickOrigin.y;
    }
    this.stick = joystickVector(dx, dy, r, INPUT_CONFIG.joystickDeadzone);
    const kl = Math.min(Math.hypot(dx, dy), r);
    const ang = Math.atan2(dy, dx);
    this.knob.style.transform = `translate(calc(-50% + ${Math.cos(ang) * kl}px), calc(-50% + ${Math.sin(ang) * kl}px))`;
    e.preventDefault();
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.stickPointer) this.endStick();
  }

  private endStick(): void {
    this.stickPointer = null;
    this.stick = { x: 0, z: 0 };
    this.base.classList.remove('active');
  }

  dispose(): void {
    for (const c of this.cleanup) c();
    this.base.remove();
  }
}
