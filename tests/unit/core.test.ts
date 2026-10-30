import { describe, expect, it } from 'vitest';
import { GAME_TRANSITIONS, StateMachine, type GameState } from '../../src/core/StateMachine';
import { joystickVector, keysVector } from '../../src/controls/joystickMath';
import { cameraOffset, fovForAspect, segmentHitsBox } from '../../src/camera/cameraMath';
import { damp, dampAngle, wrapAngle } from '../../src/utils/math';

describe('StateMachine', () => {
  it('allows declared transitions and blocks others', () => {
    const fsm = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
    expect(fsm.transition('paused')).toBe(false);
    expect(fsm.state).toBe('boot');
    expect(fsm.transition('playing')).toBe(true);
    expect(fsm.transition('paused')).toBe(true);
    expect(fsm.transition('playing')).toBe(true);
  });
  it('notifies listeners', () => {
    const fsm = new StateMachine<GameState>('boot', GAME_TRANSITIONS);
    const seen: string[] = [];
    fsm.onChange((a, b) => seen.push(`${a}>${b}`));
    fsm.transition('lobby');
    expect(seen).toEqual(['boot>lobby']);
  });
});

describe('input math', () => {
  it('joystick applies deadzone and flips screen y', () => {
    expect(joystickVector(3, 0, 56, 0.12)).toEqual({ x: 0, z: 0 });
    const v = joystickVector(0, -56, 56, 0.12);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
  });
  it('joystick clamps beyond the radius', () => {
    const v = joystickVector(500, 0, 56, 0.12);
    expect(v.x).toBeCloseTo(1);
  });
  it('opposite keys cancel', () => {
    expect(keysVector(true, true, false, true)).toEqual({ x: 1, z: 0 });
  });
});

describe('camera math', () => {
  it('places the camera behind and above at the configured pitch', () => {
    const o = cameraOffset(52, 14);
    expect(o.y).toBeGreaterThan(0);
    expect(o.z).toBeLessThan(0);
    expect((Math.atan2(o.y, -o.z) * 180) / Math.PI).toBeCloseTo(52);
  });
  it('widens FOV for portrait screens only', () => {
    const land = fovForAspect(42, 30, 16 / 9);
    const port = fovForAspect(42, 30, 9 / 19.5);
    expect(land).toBeCloseTo((42 * Math.PI) / 180);
    expect(port).toBeGreaterThan(land);
  });
  it('detects walls between camera and hero', () => {
    const box = { minX: -1, maxX: 1, minZ: -2, maxZ: -1.5 };
    expect(segmentHitsBox({ x: 0, y: 10, z: -8 }, { x: 0, y: 1, z: 0 }, box, 3)).toBe(true);
    expect(segmentHitsBox({ x: 0, y: 10, z: -8 }, { x: 0, y: 1, z: 0 }, box, 0.5)).toBe(false);
  });
  it('smoothing is frame-rate independent', () => {
    const a = 1 - (1 - damp(7, 1 / 30)) ** 30;
    const b = 1 - (1 - damp(7, 1 / 120)) ** 120;
    expect(a).toBeCloseTo(b, 10);
  });
  it('angles take the shortest path', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    const r = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1);
    expect(Math.abs(wrapAngle(r - (-Math.PI + 0.1)))).toBeLessThan(1e-6);
  });
});
