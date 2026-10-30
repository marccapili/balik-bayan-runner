import { describe, expect, it } from 'vitest';
import { PlayerMotor } from '../../src/characters/PlayerMotor';
import { PLAYER_CONFIG } from '../../src/data/config';
import { CollisionWorld } from '../../src/physics/Collision';

const empty = new CollisionWorld([]);

function simulate(fps: number, seconds: number, input = { x: 1, z: 0 }) {
  const m = new PlayerMotor({ x: 0, z: 0 }, empty);
  const dt = 1 / fps;
  for (let t = 0; t < seconds - 1e-9; t += dt) m.update(input, dt);
  return m;
}

describe('PlayerMotor', () => {
  it('reaches max speed quickly but not instantly', () => {
    const m = simulate(60, 0.05);
    expect(m.speed).toBeGreaterThan(0);
    expect(m.speed).toBeLessThan(PLAYER_CONFIG.maxSpeed);
    expect(simulate(60, 0.5).speed).toBeCloseTo(PLAYER_CONFIG.maxSpeed, 5);
  });

  it('normalises diagonal movement', () => {
    const m = simulate(60, 1, { x: 1, z: 1 });
    expect(m.speed).toBeCloseTo(PLAYER_CONFIG.maxSpeed, 5);
  });

  it('is frame-rate independent (30 vs 144 fps within 3%)', () => {
    const a = simulate(30, 2).state.pos.x;
    const b = simulate(144, 2).state.pos.x;
    expect(Math.abs(a - b) / b).toBeLessThan(0.03);
  });

  it('decelerates to a stop when input is released', () => {
    const m = simulate(60, 1);
    for (let i = 0; i < 30; i++) m.update({ x: 0, z: 0 }, 1 / 60);
    expect(m.speed).toBe(0);
  });

  it('turns to face the travel direction', () => {
    const m = simulate(60, 1, { x: 0, z: -1 });
    expect(Math.abs(Math.abs(m.state.yaw) - Math.PI)).toBeLessThan(0.05);
  });

  it('loses velocity into a wall so it does not stick', () => {
    const world = new CollisionWorld([{ minX: 1, maxX: 2, minZ: -10, maxZ: 10 }]);
    const m = new PlayerMotor({ x: 0, z: 0 }, world);
    for (let i = 0; i < 60; i++) m.update({ x: 1, z: 0 }, 1 / 60);
    expect(m.state.pos.x).toBeLessThanOrEqual(1 - PLAYER_CONFIG.radius + 1e-6);
    expect(Math.abs(m.state.vel.x)).toBeLessThan(0.5);
  });
});
