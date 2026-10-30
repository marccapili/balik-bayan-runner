import { describe, expect, it } from 'vitest';
import { CollisionWorld, resolveCircleAabb } from '../../src/physics/Collision';
import { buildColliders, MUSEUM_BOUNDS, PROPS, SPAWN_POINT } from '../../src/data/museumLayout';

const wall = { minX: 0, maxX: 1, minZ: -5, maxZ: 5 };

describe('resolveCircleAabb', () => {
  it('returns null when not touching', () => {
    expect(resolveCircleAabb({ x: -1, z: 0 }, 0.4, wall)).toBeNull();
  });
  it('pushes a circle out along the shortest axis', () => {
    const r = resolveCircleAabb({ x: -0.2, z: 0 }, 0.4, wall)!;
    expect(r.x).toBeCloseTo(-0.4);
    expect(r.z).toBeCloseTo(0);
  });
  it('handles a centre inside the box', () => {
    const r = resolveCircleAabb({ x: 0.1, z: 0 }, 0.4, wall)!;
    expect(r.x).toBeCloseTo(-0.4);
  });
});

describe('CollisionWorld.move', () => {
  const world = new CollisionWorld([wall]);
  it('slides along a wall instead of sticking', () => {
    const p = world.move({ x: -0.5, z: 0 }, { x: 1, z: 1 }, 0.4);
    expect(p.x).toBeLessThanOrEqual(-0.4 + 1e-6);
    expect(p.z).toBeCloseTo(1, 5);
  });
  it('never tunnels through a thin wall even with a huge step', () => {
    const p = world.move({ x: -2, z: 0 }, { x: 50, z: 0 }, 0.4);
    expect(p.x).toBeLessThan(0);
  });
});

describe('museum layout', () => {
  const world = new CollisionWorld(buildColliders());
  it('spawn point is free', () => {
    expect(world.overlaps(SPAWN_POINT, 0.42)).toBe(false);
  });
  it('every prop sits inside the museum bounds', () => {
    for (const p of PROPS) {
      expect(p.x - p.w / 2).toBeGreaterThanOrEqual(MUSEUM_BOUNDS.minX);
      expect(p.x + p.w / 2).toBeLessThanOrEqual(MUSEUM_BOUNDS.maxX);
      expect(p.z - p.d / 2).toBeGreaterThanOrEqual(MUSEUM_BOUNDS.minZ);
      expect(p.z + p.d / 2).toBeLessThanOrEqual(MUSEUM_BOUNDS.maxZ);
    }
  });
  it('all doorways are passable for the hero', () => {
    const doorways = [
      { x: -10, z: 13 }, { x: -10, z: -13 }, { x: 10, z: 13 }, { x: 10, z: -13 }, { x: -20, z: 0 }, { x: 20, z: 0 },
    ];
    for (const d of doorways) expect(world.overlaps(d, 0.42), JSON.stringify(d)).toBe(false);
  });
});
