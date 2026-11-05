import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autoSkin, SKIN_BONES } from '../../src/characters/autoSkin';
import { parseGlb } from '../../src/characters/glb';
import { HERO_MODELS } from '../../src/data/heroModels';

/** Builds a tiny GLB: one triangle with UVs and an embedded 4-byte "image". */
function tinyGlb(): ArrayBuffer {
  const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 4, 1]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const idx = new Uint16Array([0, 1, 2, 0]); // padded to 4 bytes
  const img = new Uint8Array([1, 2, 3, 4]);
  const bin = new Uint8Array(pos.byteLength + uv.byteLength + idx.byteLength + img.byteLength);
  let o = 0;
  for (const part of [pos, uv, idx, img]) {
    bin.set(new Uint8Array(part.buffer), o);
    o += part.byteLength;
  }
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [5, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/webp' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
      { buffer: 0, byteOffset: 60, byteLength: 6 },
      { buffer: 0, byteOffset: 68, byteLength: 4 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  js = new Uint8Array([...js, ...new Array(pad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true);
  dv.setUint32(24 + js.length, 0x004e4942, true);
  out.set(bin, 28 + js.length);
  return out.buffer;
}

type GlbHero = 'bonifacio' | 'rizal' | 'lapulapu';
/** Loads a shipped model the way `HeroGlb` does (parse, then shift onto the body midline). */
const load = (id: GlbHero) => {
  const b = readFileSync(`public/models/${id}.glb`);
  const g = parseGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const cx = HERO_MODELS[id]!.centerX ?? 0;
  for (let i = 0; i < g.positions.length; i += 3) g.positions[i] = g.positions[i]! - cx;
  return g;
};

describe('GLB hero models', () => {
  it('parses a GLB, applies node transforms and normalises to height 1, feet on 0, mirrored x', () => {
    const g = parseGlb(tinyGlb());
    expect(Array.from(g.indices)).toEqual([0, 1, 2]);
    const ys = [g.positions[1], g.positions[4], g.positions[7]];
    expect(Math.min(...(ys as number[]))).toBe(0);
    expect(Math.max(...(ys as number[]))).toBe(1);
    // x 5..7 (after translation) mirrored and centred: vertex 0 (x=5) ends on the right.
    expect(g.positions[0]).toBeCloseTo(0.25);
    expect(g.positions[3]).toBeCloseTo(-0.25);
    expect(g.image?.mime).toBe('image/webp');
    expect(Array.from(g.image!.bytes)).toEqual([1, 2, 3, 4]);
  });

  it('rejects files that are not GLB', () => {
    expect(() => parseGlb(new ArrayBuffer(20))).toThrow();
  });

  it('every configured hero model ships and stays phone-friendly', () => {
    for (const [id, def] of Object.entries(HERO_MODELS)) {
      expect(def!.url).toBe(`models/${id}.glb`);
      const g = load(id as GlbHero);
      expect(g.indices.length / 3).toBeLessThan(30000);
      expect(g.image).not.toBeNull();
      expect(def!.neck).toBeGreaterThan(def!.shoulder.y);
      expect(def!.hip).toBeGreaterThan(def!.crotch);
    }
  });

  it('auto-skins: weights sum to 1, head on top, legs split left/right at the feet', () => {
    for (const id of ['bonifacio', 'rizal', 'lapulapu'] as const) {
      const g = load(id);
      const s = autoSkin(g.positions, g.indices, HERO_MODELS[id]!);
      const n = g.positions.length / 3;
      const counts = new Array(SKIN_BONES.length).fill(0);
      for (let v = 0; v < n; v++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += s.weights[v * 4 + k]!;
        expect(sum).toBeCloseTo(1, 4);
        const y = g.positions[v * 3 + 1]!;
        const x = g.positions[v * 3]!;
        const top = SKIN_BONES[s.indices[v * 4]!];
        counts[s.indices[v * 4]!]++;
        if (y > 0.8) expect(top).toBe('head');
        if (y < 0.05 && Math.abs(x) > 0.06) expect(top).toBe(x < 0 ? 'legL' : 'legR');
      }
      // Every part of the rig drives some of the mesh (body is only a parent).
      for (const b of ['hips', 'torso', 'head', 'legL', 'legR', 'armL', 'armR']) expect(counts[SKIN_BONES.indexOf(b as 'head')]).toBeGreaterThan(50);
    }
  });
});
