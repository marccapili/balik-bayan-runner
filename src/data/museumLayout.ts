import { aabbFromCenter, type Aabb } from '../physics/Collision';

/**
 * The museum is described as data so rendering, collision, camera occlusion
 * and (later) A* navigation all read the same source of truth.
 *
 * Coordinates: +x = east (screen right), +z = north (screen up). 1 unit ≈ 1 metre-ish;
 * the chibi hero is ~1.6 units tall.
 */

export type RoomId = 'main' | 'library' | 'heroes' | 'artifacts' | 'folklore';

export interface Room {
  id: RoomId;
  /** Gen Z-flavoured sign text shown on the gallery banner. */
  sign: string;
  subtitle: string;
  bounds: Aabb;
  floor: string;
  floorLine: string;
  wall: string;
  trim: string;
  /** Where the hanging sign sits (on the room's entrance wall). */
  signPos: { x: number; z: number; rotY: number };
}

export type PropKind =
  | 'pedestal'
  | 'bench'
  | 'column'
  | 'bookshelf'
  | 'readingTable'
  | 'displayCase'
  | 'jarCase'
  | 'statue'
  | 'balangay'
  | 'sunMonument'
  | 'balete'
  | 'rock'
  | 'folkPlinth'
  | 'plant';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Rotation in quarter turns for asymmetric props. */
  rot?: 0 | 1 | 2 | 3;
  /** Short display tint for variants (e.g. statue bronze vs. stone). */
  variant?: number;
}

export interface WallSeg {
  box: Aabb;
  height: number;
  room: RoomId;
}

export interface WallArt {
  kind: 'portrait' | 'banner' | 'capiz' | 'painting' | 'chart';
  x: number;
  z: number;
  /** Facing direction in radians (0 = faces +z). */
  rotY: number;
  variant: number;
}

export const MUSEUM_BOUNDS: Aabb = { minX: -30, maxX: 30, minZ: -24, maxZ: 24 };
export const SPAWN_POINT = { x: 0, z: 0 };

const T = 0.6; // wall thickness
const OUTER_H = 3.4;
const INNER_H = 2.6;

function hWall(z: number, x1: number, x2: number, gaps: Array<[number, number]>, h: number, room: RoomId): WallSeg[] {
  return splitByGaps(x1, x2, gaps).map(([a, b]) => ({
    box: { minX: a, maxX: b, minZ: z - T / 2, maxZ: z + T / 2 },
    height: h,
    room,
  }));
}

function vWall(x: number, z1: number, z2: number, gaps: Array<[number, number]>, h: number, room: RoomId): WallSeg[] {
  return splitByGaps(z1, z2, gaps).map(([a, b]) => ({
    box: { minX: x - T / 2, maxX: x + T / 2, minZ: a, maxZ: b },
    height: h,
    room,
  }));
}

function splitByGaps(a: number, b: number, gaps: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur = a;
  for (const [g1, g2] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 > cur) out.push([cur, g1]);
    cur = Math.max(cur, g2);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

const H = T / 2;

/** Doorways are 5 units wide so a chased hero always has room to slip past an enemy. */
export const WALLS: WallSeg[] = [
  // Outer shell (split per room so each gallery keeps its own wall colour)
  ...hWall(24, -30 - H, -10, [], OUTER_H, 'library'),
  ...hWall(24, -10, 10, [], OUTER_H, 'main'),
  ...hWall(24, 10, 30 + H, [], OUTER_H, 'heroes'),
  ...hWall(-24, -30 - H, -10, [], OUTER_H, 'artifacts'),
  ...hWall(-24, -10, 10, [], OUTER_H, 'main'),
  ...hWall(-24, 10, 30 + H, [], OUTER_H, 'folklore'),
  ...vWall(-30, 0, 24, [], OUTER_H, 'library'),
  ...vWall(-30, -24, 0, [], OUTER_H, 'artifacts'),
  ...vWall(30, 0, 24, [], OUTER_H, 'heroes'),
  ...vWall(30, -24, 0, [], OUTER_H, 'folklore'),
  // West wing (Library north, Artifacts south)
  ...vWall(-10, -24, 24, [[-15.5, -10.5], [10.5, 15.5]], INNER_H, 'main'),
  ...hWall(0, -30, -10, [[-22.5, -17.5]], INNER_H, 'artifacts'),
  // East wing (Heroes north, Folklore south)
  ...vWall(10, -24, 24, [[-15.5, -10.5], [10.5, 15.5]], INNER_H, 'main'),
  ...hWall(0, 10, 30, [[17.5, 22.5]], INNER_H, 'folklore'),
];

export const ROOMS: Room[] = [
  {
    id: 'main',
    sign: 'MAIN GALLERY',
    subtitle: 'Bulwagang Pangunahin',
    bounds: { minX: -10, maxX: 10, minZ: -24, maxZ: 24 },
    floor: '#d9b98a',
    floorLine: '#b8925f',
    wall: '#f3e6cf',
    trim: '#8a5a2b',
    signPos: { x: 0, z: 23.6, rotY: 0 },
  },
  {
    id: 'library',
    sign: 'SILID-AKLATAN',
    subtitle: 'Historical Library',
    bounds: { minX: -30, maxX: -10, minZ: 0, maxZ: 24 },
    floor: '#a7714a',
    floorLine: '#7d5233',
    wall: '#e9dcc0',
    trim: '#5b3a22',
    signPos: { x: -25, z: 23.6, rotY: 0 },
  },
  {
    id: 'heroes',
    sign: 'HALL OF HEROES',
    subtitle: 'Bulwagan ng mga Bayani',
    bounds: { minX: 10, maxX: 30, minZ: 0, maxZ: 24 },
    floor: '#c9c3d6',
    floorLine: '#a09ab3',
    wall: '#f0ece2',
    trim: '#1f2d6b',
    signPos: { x: 20, z: 23.6, rotY: 0 },
  },
  {
    id: 'artifacts',
    sign: 'ARTIFACTS',
    subtitle: 'Mga Yaman ng Nakaraan',
    bounds: { minX: -30, maxX: -10, minZ: -24, maxZ: 0 },
    floor: '#cfae7c',
    floorLine: '#a8875a',
    wall: '#efe0c4',
    trim: '#7a4a1e',
    signPos: { x: -26, z: -0.35, rotY: 0 },
  },
  {
    id: 'folklore',
    sign: 'FOLKLORE',
    subtitle: 'Mga Alamat at Nilalang',
    bounds: { minX: 10, maxX: 30, minZ: -24, maxZ: 0 },
    floor: '#5d5476',
    floorLine: '#463e5e',
    wall: '#3b3452',
    trim: '#9b6bd6',
    signPos: { x: 26, z: -0.35, rotY: 0 },
  },
];

export const PROPS: Prop[] = [
  // ── Main gallery: open hall with strong landmarks at both ends ──
  { kind: 'sunMonument', x: 0, z: 15, w: 3.2, d: 3.2, h: 3.6 },
  { kind: 'balangay', x: 0, z: -15, w: 6.4, d: 1.8, h: 1.4 },
  { kind: 'pedestal', x: -5, z: 6, w: 1.2, d: 1.2, h: 1.1, variant: 0 },
  { kind: 'pedestal', x: 5, z: 6, w: 1.2, d: 1.2, h: 1.1, variant: 1 },
  { kind: 'pedestal', x: -5, z: -6, w: 1.2, d: 1.2, h: 1.1, variant: 2 },
  { kind: 'pedestal', x: 5, z: -6, w: 1.2, d: 1.2, h: 1.1, variant: 3 },
  { kind: 'bench', x: -6.5, z: 0, w: 0.8, d: 2.6, h: 0.55 },
  { kind: 'bench', x: 6.5, z: 0, w: 0.8, d: 2.6, h: 0.55 },
  { kind: 'column', x: -7.5, z: 20.5, w: 1, d: 1, h: 3.4 },
  { kind: 'column', x: 7.5, z: 20.5, w: 1, d: 1, h: 3.4 },
  { kind: 'column', x: -7.5, z: -20.5, w: 1, d: 1, h: 3.4 },
  { kind: 'column', x: 7.5, z: -20.5, w: 1, d: 1, h: 3.4 },
  { kind: 'plant', x: -8.8, z: 8.8, w: 0.9, d: 0.9, h: 1.2 },
  { kind: 'plant', x: 8.8, z: 8.8, w: 0.9, d: 0.9, h: 1.2 },
  { kind: 'plant', x: -8.8, z: -8.8, w: 0.9, d: 0.9, h: 1.2 },
  { kind: 'plant', x: 8.8, z: -8.8, w: 0.9, d: 0.9, h: 1.2 },

  // ── Library: shelves along walls + a loop around reading tables ──
  { kind: 'bookshelf', x: -25, z: 23.1, w: 6, d: 1, h: 2.4 },
  { kind: 'bookshelf', x: -15.5, z: 23.1, w: 6, d: 1, h: 2.4 },
  { kind: 'bookshelf', x: -29.1, z: 16, w: 1, d: 6, h: 2.4, rot: 1 },
  { kind: 'bookshelf', x: -29.1, z: 7, w: 1, d: 6, h: 2.4, rot: 1 },
  { kind: 'bookshelf', x: -21, z: 17.5, w: 5, d: 1, h: 2.2 },
  { kind: 'readingTable', x: -21, z: 9, w: 3, d: 1.6, h: 0.8 },
  { kind: 'readingTable', x: -14.5, z: 5, w: 1.6, d: 3, h: 0.8, rot: 1 },

  // ── Artifacts: glass cases with a central jar landmark ──
  { kind: 'jarCase', x: -20, z: -12, w: 2.6, d: 2.6, h: 1.9 },
  { kind: 'displayCase', x: -26, z: -6, w: 2.4, d: 1.3, h: 1.3, variant: 0 },
  { kind: 'displayCase', x: -14, z: -6, w: 2.4, d: 1.3, h: 1.3, variant: 1 },
  { kind: 'displayCase', x: -26, z: -18, w: 2.4, d: 1.3, h: 1.3, variant: 2 },
  { kind: 'displayCase', x: -14, z: -19, w: 2.4, d: 1.3, h: 1.3, variant: 3 },
  { kind: 'plant', x: -29, z: -23, w: 0.9, d: 0.9, h: 1.2 },

  // ── Hall of Heroes: four statues on pedestals ──
  { kind: 'statue', x: 16, z: 7, w: 1.8, d: 1.8, h: 2.6, variant: 0 },
  { kind: 'statue', x: 25, z: 7, w: 1.8, d: 1.8, h: 2.6, variant: 1 },
  { kind: 'statue', x: 16, z: 19, w: 1.8, d: 1.8, h: 2.6, variant: 2 },
  { kind: 'statue', x: 25, z: 19, w: 1.8, d: 1.8, h: 2.6, variant: 3 },
  { kind: 'bench', x: 20.5, z: 13, w: 2.6, d: 0.8, h: 0.55 },

  // ── Folklore: giant balete tree landmark ──
  { kind: 'balete', x: 20, z: -12.5, w: 3.2, d: 3.2, h: 5 },
  { kind: 'rock', x: 14, z: -20, w: 1.6, d: 1.4, h: 0.9 },
  { kind: 'rock', x: 27, z: -4, w: 1.4, d: 1.4, h: 0.8 },
  { kind: 'folkPlinth', x: 26, z: -19.5, w: 1.8, d: 1.8, h: 1.0, variant: 0 },
  { kind: 'folkPlinth', x: 14, z: -4.5, w: 1.6, d: 1.6, h: 1.0, variant: 1 },
];

/** rotY: 0 = faces south (toward the camera), -PI/2 = faces east, PI/2 = faces west. */
export const WALL_ART: WallArt[] = [
  // Portraits in the Hall of Heroes (decorative frames; real exhibits arrive in M6).
  { kind: 'portrait', x: 15, z: 23.65, rotY: 0, variant: 0 },
  { kind: 'portrait', x: 25, z: 23.65, rotY: 0, variant: 1 },
  { kind: 'portrait', x: 29.65, z: 20, rotY: Math.PI / 2, variant: 2 },
  // Wide canvas for the Spoliarium exhibit (a stylised nod, not a reproduction).
  { kind: 'painting', x: 29.65, z: 13, rotY: Math.PI / 2, variant: 0 },
  { kind: 'portrait', x: 29.65, z: 5, rotY: Math.PI / 2, variant: 3 },
  // Flag-inspired banners in the main hall.
  { kind: 'banner', x: -5, z: 23.65, rotY: 0, variant: 0 },
  { kind: 'banner', x: 5, z: 23.65, rotY: 0, variant: 1 },
  { kind: 'banner', x: -9.65, z: 3, rotY: -Math.PI / 2, variant: 2 },
  { kind: 'banner', x: 9.65, z: 3, rotY: Math.PI / 2, variant: 3 },
  // Capiz-window panels (bahay-na-bato heritage motif).
  { kind: 'capiz', x: -29.65, z: -12, rotY: -Math.PI / 2, variant: 0 },
  { kind: 'capiz', x: -9.65, z: -4, rotY: -Math.PI / 2, variant: 0 },
  { kind: 'capiz', x: 9.65, z: -4, rotY: Math.PI / 2, variant: 0 },
  // Baybayin study chart in the Library (see data/baybayinChart.ts).
  { kind: 'chart', x: -20, z: 23.65, rotY: 0, variant: 0 },
];

/** Props that block movement. Small decorative items could opt out later. */
export function buildColliders(): Aabb[] {
  const boxes = WALLS.map((w) => w.box);
  for (const p of PROPS) {
    // Round/organic props get a slightly smaller box so sliding past them feels fair.
    const shrink = p.kind === 'balete' || p.kind === 'rock' || p.kind === 'plant' ? 0.85 : 1;
    boxes.push(aabbFromCenter(p.x, p.z, p.w * shrink, p.d * shrink));
  }
  return boxes;
}

export function roomAt(x: number, z: number): Room | undefined {
  return ROOMS.find((r) => x >= r.bounds.minX && x <= r.bounds.maxX && z >= r.bounds.minZ && z <= r.bounds.maxZ);
}
