import { describe, expect, it } from 'vitest';
import { exhibitStyle, GALLERY_ROOM, GALLERY_WORKS } from '../../src/data/gallery';
import { galleryLayout, spotInReach, spreadCount, spreadPages } from '../../src/gallery/galleryLayout';
import { resolveCircleAabb } from '../../src/physics/Collision';

describe('gallery data', () => {
  it('lists every classmate once, alphabetically by surname', () => {
    const slugs = GALLERY_WORKS.map((w) => w.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(GALLERY_WORKS.length).toBe(16);
    const keys = GALLERY_WORKS.map((w) => w.sortName);
    expect([...keys].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(keys);
  });

  it('one-pagers are scrolls, the rest are books', () => {
    for (const w of GALLERY_WORKS) expect(exhibitStyle(w)).toBe(w.pages.length === 1 ? 'scroll' : 'book');
    expect(exhibitStyle(GALLERY_WORKS.find((w) => w.slug === 'casantusan')!)).toBe('book');
    expect(exhibitStyle(GALLERY_WORKS.find((w) => w.slug === 'uy')!)).toBe('scroll');
  });

  it('every page has a size and a file', () => {
    for (const w of GALLERY_WORKS)
      for (const p of w.pages) {
        expect(p.w).toBeGreaterThan(0);
        expect(p.h).toBeGreaterThan(0);
        expect(p.src).toMatch(/\.(webp|mp4)$/);
      }
  });
});

describe('gallery layout', () => {
  const L = galleryLayout(GALLERY_WORKS.length, GALLERY_ROOM);

  it('places one pedestal per work inside the room, plus the TV and the game plaque', () => {
    const works = L.spots.filter((s) => s.kind === 'work');
    expect(works.length).toBe(GALLERY_WORKS.length);
    expect(L.spots.filter((s) => s.kind === 'tv').length).toBe(1);
    expect(L.spots.filter((s) => s.kind === 'game').length).toBe(1);
    for (const s of L.spots) {
      expect(s.at.x).toBeGreaterThan(L.bounds.minX);
      expect(s.at.x).toBeLessThan(L.bounds.maxX);
      expect(s.at.z).toBeGreaterThan(L.bounds.minZ);
      expect(s.at.z).toBeLessThan(L.bounds.maxZ);
    }
  });

  it('every exhibit can be reached from a free spot in front of it', () => {
    for (const s of L.spots) {
      // Stand in front of the exhibit (toward the room centre / camera).
      const dir = s.kind === 'work' ? { x: -Math.sign(s.at.x), z: 0 } : { x: 0, z: -1 };
      const off = s.kind === 'tv' ? 1.0 : s.kind === 'game' ? 0.7 : 0.95;
      const p = { x: s.at.x + dir.x * off, z: s.at.z + dir.z * off };
      for (const b of L.colliders) expect(resolveCircleAabb(p, 0.35, b)).toBeNull();
      expect(spotInReach(p, L.spots)).toBe(s);
    }
  });

  it('the spawn point is free and nothing is in reach there', () => {
    for (const b of L.colliders) expect(resolveCircleAabb(L.spawn, 0.35, b)).toBeNull();
    expect(spotInReach(L.spawn, L.spots)?.kind ?? null).not.toBe('work');
  });
});

describe('book spreads', () => {
  it('single-page view shows one page per spread', () => {
    expect(spreadCount(5, false)).toBe(5);
    expect(spreadPages(0, 5, false)).toEqual({ left: -1, right: 0 });
    expect(spreadPages(4, 5, false)).toEqual({ left: -1, right: 4 });
  });

  it('two-page view starts with the cover alone on the right', () => {
    expect(spreadCount(5, true)).toBe(3);
    expect(spreadPages(0, 5, true)).toEqual({ left: -1, right: 0 });
    expect(spreadPages(1, 5, true)).toEqual({ left: 1, right: 2 });
    expect(spreadPages(2, 5, true)).toEqual({ left: 3, right: 4 });
    expect(spreadCount(6, true)).toBe(4);
    expect(spreadPages(3, 6, true)).toEqual({ left: 5, right: -1 });
  });
});
