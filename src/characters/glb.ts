/**
 * Minimal, engine-free reader for the static hero GLBs (one textured mesh, as exported by
 * Hunyuan3D / TRELLIS / Tripo without a rig). Keeps the full Babylon glTF loader out of the bundle.
 *
 * Output is already in game space: left-handed (x mirrored, as Babylon's own glTF loader does),
 * face toward +Z like the procedural heroes, feet on y = 0,
 * centred on x/z, and scaled to height 1 so `data/heroModels.ts` landmarks are fractions of height.
 */

export interface GlbMesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  image: { mime: string; bytes: Uint8Array } | null;
}

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
}
interface BufferView {
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface Gltf {
  accessors: Accessor[];
  bufferViews: BufferView[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  nodes?: GltfNode[];
  scenes?: { nodes: number[] }[];
  scene?: number;
  materials?: { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
  textures?: { source?: number }[];
  images?: { bufferView?: number; mimeType?: string }[];
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function chunks(buf: ArrayBuffer): { json: Gltf; bin: Uint8Array } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error('Not a glTF 2.0 binary (.glb)');
  let off = 12;
  let json: Gltf | null = null;
  let bin = new Uint8Array(0);
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true);
    const kind = dv.getUint32(off + 4, true);
    const body = new Uint8Array(buf, off + 8, len);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as Gltf;
    else if (kind === 0x004e4942) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function read(g: Gltf, bin: Uint8Array, index: number): number[] {
  const a = g.accessors[index]!;
  const n = COMPONENTS[a.type] ?? 1;
  const out = new Array<number>(a.count * n);
  if (a.bufferView === undefined) return out.fill(0);
  const v = g.bufferViews[a.bufferView]!;
  const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
  const stride = v.byteStride || size * n;
  const dv = new DataView(bin.buffer, bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0));
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < n; c++) {
      const o = i * stride + c * size;
      out[i * n + c] =
        a.componentType === 5126
          ? dv.getFloat32(o, true)
          : a.componentType === 5125
            ? dv.getUint32(o, true)
            : a.componentType === 5123
              ? dv.getUint16(o, true)
              : dv.getUint8(o);
    }
  }
  return out;
}

type Mat4 = number[];
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major multiply a*b (glTF convention). */
function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}

function localMatrix(n: GltfNode): Mat4 {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y! * y! + z! * z!)) * sx!, 2 * (x! * y! + z! * w!) * sx!, 2 * (x! * z! - y! * w!) * sx!, 0,
    2 * (x! * y! - z! * w!) * sy!, (1 - 2 * (x! * x! + z! * z!)) * sy!, 2 * (y! * z! + x! * w!) * sy!, 0,
    2 * (x! * z! + y! * w!) * sz!, 2 * (y! * z! - x! * w!) * sz!, (1 - 2 * (x! * x! + y! * y!)) * sz!, 0,
    tx!, ty!, tz!, 1,
  ];
}

/** Parses a GLB into one merged, normalised mesh plus its base-colour image. */
export function parseGlb(buf: ArrayBuffer): GlbMesh {
  const { json: g, bin } = chunks(buf);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let image: GlbMesh['image'] = null;

  const visit = (ni: number, parent: Mat4): void => {
    const n = g.nodes?.[ni];
    if (!n) return;
    const m = mul(parent, localMatrix(n));
    if (n.mesh !== undefined) {
      for (const prim of g.meshes[n.mesh]!.primitives) {
        const p = read(g, bin, prim.attributes.POSITION!);
        const t = prim.attributes.TEXCOORD_0 !== undefined ? read(g, bin, prim.attributes.TEXCOORD_0) : null;
        const base = pos.length / 3;
        for (let i = 0; i < p.length; i += 3) {
          const [x, y, z] = [p[i]!, p[i + 1]!, p[i + 2]!];
          pos.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
          uv.push(t ? t[(i / 3) * 2]! : 0, t ? t[(i / 3) * 2 + 1]! : 0);
        }
        const ind = prim.indices !== undefined ? read(g, bin, prim.indices) : Array.from({ length: p.length / 3 }, (_, i) => i);
        for (const k of ind) idx.push(base + k);
        if (!image && prim.material !== undefined) {
          const tex = g.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorTexture;
          const src = tex ? g.textures?.[tex.index]?.source : undefined;
          const img = src !== undefined ? g.images?.[src] : undefined;
          if (img?.bufferView !== undefined) {
            const v = g.bufferViews[img.bufferView]!;
            image = { mime: img.mimeType ?? 'image/png', bytes: bin.slice(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength) };
          }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? (g.nodes ?? []).map((_, i) => i);
  for (const r of roots) visit(r, IDENTITY);
  if (pos.length === 0) throw new Error('GLB has no mesh');

  // Normalise: right-handed glTF → left-handed Babylon (mirror x), feet at 0, centred, height 1.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, -pos[i]!); maxX = Math.max(maxX, -pos[i]!);
    minY = Math.min(minY, pos[i + 1]!); maxY = Math.max(maxY, pos[i + 1]!);
    minZ = Math.min(minZ, pos[i + 2]!); maxZ = Math.max(maxZ, pos[i + 2]!);
  }
  const h = maxY - minY || 1;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const positions = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    positions[i] = (-pos[i]! - cx) / h;
    positions[i + 1] = (pos[i + 1]! - minY) / h;
    positions[i + 2] = (pos[i + 2]! - cz) / h;
  }
  // Winding stays as authored: the mirror turns glTF's counter-clockwise front faces into the
  // clockwise ones Babylon expects in its left-handed space.
  return { positions, uvs: new Float32Array(uv), indices: new Uint32Array(idx), image };
}
