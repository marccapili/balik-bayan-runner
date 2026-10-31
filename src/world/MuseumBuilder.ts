import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PROPS, ROOMS, WALL_ART, WALLS, type Prop, type RoomId } from '../data/museumLayout';
import type { Aabb } from '../physics/Collision';
import { mat, type MatOpts } from './materials';
import { bannerTexture, capizTexture, floorTiles, paintingTexture, portraitTexture, signTexture, sunMedallion } from './textures';

export interface MuseumOccluder {
  box: Aabb;
  height: number;
  meshes: AbstractMesh[];
}

export interface MuseumBuild {
  root: TransformNode;
  occluders: MuseumOccluder[];
  /** Objects animated every frame (the rotating sun on the monument). */
  spinners: TransformNode[];
  dispose(): void;
}

const WOOD = '#8a5a2b';
const WOOD_DARK = '#5b3a22';
const MARBLE = '#efe9df';
const GOLD = '#c48a2c';

/**
 * Builds the whole museum from data/museumLayout.ts.
 * Static props are merged per material at the end to keep draw calls low on phones.
 */
export function buildMuseum(scene: Scene): MuseumBuild {
  const root = new TransformNode('museum', scene);
  const staticMeshes: Mesh[] = [];
  const occluders: MuseumOccluder[] = [];
  const spinners: TransformNode[] = [];
  const textures: Texture[] = [];

  const add = (m: Mesh, hex: string, opts?: MatOpts, parent: TransformNode = root): Mesh => {
    m.material = mat(scene, hex, opts);
    m.parent = parent;
    m.isPickable = false;
    staticMeshes.push(m);
    return m;
  };
  const texMat = (name: string, t: Texture, opts: { alpha?: boolean; glow?: number } = {}): StandardMaterial => {
    textures.push(t);
    const m = new StandardMaterial(name, scene);
    m.diffuseTexture = t;
    m.specularColor = new Color3(0.03, 0.03, 0.03);
    m.emissiveColor = new Color3(1, 1, 1).scale(opts.glow ?? 0.2);
    if (opts.alpha) {
      m.diffuseTexture.hasAlpha = true;
      m.useAlphaFromDiffuseTexture = true;
    }
    return m;
  };
  const roomOf = (id: RoomId) => ROOMS.find((r) => r.id === id)!;

  // ── Floors ──
  ROOMS.forEach((room, i) => {
    const w = room.bounds.maxX - room.bounds.minX;
    const d = room.bounds.maxZ - room.bounds.minZ;
    const g = CreateGround(`floor_${room.id}`, { width: w, height: d }, scene);
    g.position.set((room.bounds.minX + room.bounds.maxX) / 2, 0, (room.bounds.minZ + room.bounds.maxZ) / 2);
    const pattern = room.id === 'library' ? 'wood' : room.id === 'main' ? 'banig' : 'tile';
    const t = floorTiles(scene, room.floor, room.floorLine, 11 + i * 7, pattern);
    const tileSize = pattern === 'banig' ? 2.5 : 2;
    t.uScale = w / tileSize;
    t.vScale = d / tileSize;
    g.material = texMat(`floorMat_${room.id}`, t, { glow: room.id === 'folklore' ? 0.25 : 0.12 });
    g.parent = root;
    g.isPickable = false;
    g.receiveShadows = true;
  });
  // Doorway thresholds so floors don't show seams under gaps.
  for (const [x, z, w, d] of [
    [-10, 13, 0.7, 5], [-10, -13, 0.7, 5], [10, 13, 0.7, 5], [10, -13, 0.7, 5], [-20, 0, 5, 0.7], [20, 0, 5, 0.7],
  ] as const) {
    const th = CreateBox('threshold', { width: w, height: 0.02, depth: d }, scene);
    th.position.set(x, 0.01, z);
    add(th, GOLD, { glow: 0.3 });
  }

  // Sun medallion under the spawn point — the portal landing spot.
  const med = CreateDisc('sunMedallion', { radius: 3.2, tessellation: 40 }, scene);
  med.rotation.x = Math.PI / 2;
  med.position.y = 0.015;
  med.material = texMat('sunMedMat', sunMedallion(scene), { alpha: true, glow: 0.3 });
  med.parent = root;

  // ── Walls (kept as separate meshes so the camera can fade them individually) ──
  for (const seg of WALLS) {
    const room = roomOf(seg.room);
    const w = seg.box.maxX - seg.box.minX;
    const d = seg.box.maxZ - seg.box.minZ;
    const cx = (seg.box.minX + seg.box.maxX) / 2;
    const cz = (seg.box.minZ + seg.box.maxZ) / 2;
    const wall = CreateBox('wall', { width: w, height: seg.height, depth: d }, scene);
    wall.position.set(cx, seg.height / 2, cz);
    wall.material = mat(scene, room.wall, { dynamic: true, glow: room.id === 'folklore' ? 0.35 : 0.25 });
    wall.parent = root;
    wall.isPickable = false;
    const base = CreateBox('baseboard', { width: w + 0.04, height: 0.28, depth: d + 0.04 }, scene);
    base.position.set(cx, 0.14, cz);
    base.material = mat(scene, room.trim, { dynamic: true });
    base.parent = root;
    const cap = CreateBox('wallcap', { width: w + 0.1, height: 0.14, depth: d + 0.1 }, scene);
    cap.position.set(cx, seg.height + 0.07, cz);
    cap.material = mat(scene, room.trim, { dynamic: true, glow: 0.3 });
    cap.parent = root;
    occluders.push({ box: seg.box, height: seg.height + 0.15, meshes: [wall, base, cap] });
  }

  // ── Gallery signs ──
  for (const room of ROOMS) {
    const sign = CreatePlane(`sign_${room.id}`, { width: 3.4, height: 1.06 }, scene);
    sign.position.set(room.signPos.x, room.id === 'main' ? 3.0 : 2.15, room.signPos.z);
    sign.rotation.y = room.signPos.rotY;
    sign.material = texMat(`signMat_${room.id}`, signTexture(scene, room.sign, room.subtitle, room.id === 'folklore' ? '#2a2140' : '#1f2d6b', room.id === 'folklore' ? '#b48cff' : '#f2c14e'), { glow: 0.55 });
    sign.parent = root;
  }

  // ── Wall art ──
  const capizMat = texMat('capizMat', capizTexture(scene), { glow: 0.45 });
  for (const art of WALL_ART) {
    const holder = new TransformNode(`art_${art.kind}`, scene);
    holder.parent = root;
    holder.position.set(art.x, 0, art.z);
    holder.rotation.y = art.rotY;
    if (art.kind === 'portrait') {
      const frame = CreateBox('frame', { width: 1.5, height: 1.85, depth: 0.08 }, scene);
      frame.position.y = 1.7;
      add(frame, GOLD, { glow: 0.3, spec: 0.5 }, holder);
      const pic = CreatePlane('portrait', { width: 1.25, height: 1.6 }, scene);
      pic.position.set(0, 1.7, -0.05);
      pic.material = texMat(`portraitMat${art.variant}`, portraitTexture(scene, art.variant), { glow: 0.3 });
      pic.parent = holder;
    } else if (art.kind === 'painting') {
      const frame = CreateBox('pframe', { width: 3.7, height: 2.05, depth: 0.1 }, scene);
      frame.position.y = 1.65;
      add(frame, GOLD, { glow: 0.3, spec: 0.5 }, holder);
      const pic = CreatePlane('painting', { width: 3.45, height: 1.8 }, scene);
      pic.position.set(0, 1.65, -0.06);
      pic.material = texMat('paintingMat', paintingTexture(scene), { glow: 0.35 });
      pic.parent = holder;
    } else if (art.kind === 'banner') {
      const pole = CreateCylinder('pole', { height: 1.4, diameter: 0.06 }, scene);
      pole.rotation.z = Math.PI / 2;
      pole.position.set(0, 2.65, -0.06);
      add(pole, GOLD, { glow: 0.4 }, holder);
      const flag = CreatePlane('banner', { width: 1.1, height: 2.1 }, scene);
      flag.position.set(0, 1.6, -0.05);
      flag.material = texMat(`bannerMat${art.variant}`, bannerTexture(scene, art.variant), { alpha: true, glow: 0.35 });
      flag.parent = holder;
    } else {
      const frame = CreateBox('capizFrame', { width: 2.2, height: 1.5, depth: 0.1 }, scene);
      frame.position.y = 1.6;
      add(frame, WOOD_DARK, {}, holder);
      const pane = CreatePlane('capiz', { width: 2, height: 1.3 }, scene);
      pane.position.set(0, 1.6, -0.06);
      pane.material = capizMat;
      pane.parent = holder;
    }
  }

  // ── Props ──
  for (const p of PROPS) {
    const holder = new TransformNode(`prop_${p.kind}`, scene);
    holder.parent = root;
    holder.position.set(p.x, 0, p.z);
    buildProp(scene, p, holder, add, spinners, occluders);
  }

  // Merge static geometry per material (big draw-call win on mobile).
  const byMat = new Map<string, Mesh[]>();
  for (const m of staticMeshes) {
    if (!m.material || m.isDisposed()) continue;
    const k = m.material.uniqueId.toString();
    let list = byMat.get(k);
    if (!list) byMat.set(k, (list = []));
    list.push(m);
  }
  for (const list of byMat.values()) {
    if (list.length < 2) continue;
    for (const m of list) m.computeWorldMatrix(true);
    const merged = Mesh.MergeMeshes(list, true, true, undefined, false, false);
    if (merged) {
      merged.name = 'mergedProps';
      merged.parent = root;
      merged.isPickable = false;
      merged.freezeWorldMatrix();
    }
  }
  const spinning = new Set(spinners.flatMap((s) => s.getChildMeshes()));
  root.getChildMeshes().forEach((m) => {
    if (!spinning.has(m)) m.freezeWorldMatrix();
  });

  return {
    root,
    occluders,
    spinners,
    dispose() {
      root.dispose(false, true);
      for (const t of textures) t.dispose();
    },
  };
}

type AddFn = (m: Mesh, hex: string, opts?: MatOpts, parent?: TransformNode) => Mesh;

function buildProp(scene: Scene, p: Prop, h: TransformNode, add: AddFn, spinners: TransformNode[], occluders: MuseumOccluder[]): void {
  const box = (w: number, hh: number, d: number, y: number, hex: string, opts?: MatOpts, x = 0, z = 0): Mesh => {
    const m = CreateBox('pb', { width: w, height: hh, depth: d }, scene);
    m.position.set(x, y, z);
    return add(m, hex, opts, h);
  };
  const cyl = (hh: number, dt: number, db: number, y: number, hex: string, tess = 12, opts?: MatOpts, x = 0, z = 0): Mesh => {
    const m = CreateCylinder('pc', { height: hh, diameterTop: dt, diameterBottom: db, tessellation: tess }, scene);
    m.position.set(x, y, z);
    return add(m, hex, opts, h);
  };
  const sph = (d: number, y: number, hex: string, seg = 8, opts?: MatOpts, x = 0, z = 0): Mesh => {
    const m = CreateSphere('ps', { diameter: d, segments: seg }, scene);
    m.position.set(x, y, z);
    return add(m, hex, opts, h);
  };

  switch (p.kind) {
    case 'pedestal': {
      box(p.w, p.h, p.d, p.h / 2, MARBLE, { glow: 0.25 });
      box(p.w + 0.1, 0.08, p.d + 0.1, p.h, GOLD, { glow: 0.3 });
      const v = p.variant ?? 0;
      if (v === 0) {
        sph(0.55, p.h + 0.3, '#a0522d', 10).scaling.y = 0.9; // palayok clay pot
        cyl(0.12, 0.26, 0.3, p.h + 0.6, '#8b4513');
      } else if (v === 1) {
        const gong = CreateTorus('gong', { diameter: 0.5, thickness: 0.1, tessellation: 16 }, scene);
        gong.rotation.x = Math.PI / 2;
        gong.position.y = p.h + 0.4;
        add(gong, GOLD, { glow: 0.4, spec: 0.7 }, h);
        cyl(0.04, 0.48, 0.48, p.h + 0.4, '#c9952f', 16, { glow: 0.3 }).rotation.x = Math.PI / 2;
      } else if (v === 2) {
        cyl(0.32, 0.02, 0.8, p.h + 0.2, '#c9a560', 10); // salakot-style hat
        sph(0.1, p.h + 0.38, '#8a6b2f');
      } else {
        sph(0.5, p.h + 0.3, '#3d7ab8', 12, { glow: 0.3, spec: 0.5 }); // globe
        cyl(0.1, 0.18, 0.24, p.h + 0.05, GOLD);
      }
      break;
    }
    case 'bench': {
      box(p.w, 0.12, p.d, p.h, WOOD, {});
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.1, p.h, 0.1, p.h / 2, WOOD_DARK, {}, sx * (p.w / 2 - 0.12), sz * (p.d / 2 - 0.12));
      break;
    }
    case 'column': {
      box(p.w + 0.2, 0.3, p.d + 0.2, 0.15, MARBLE, { glow: 0.2 });
      cyl(p.h - 0.6, p.w * 0.8, p.w * 0.85, p.h / 2, MARBLE, 10, { glow: 0.25 });
      box(p.w + 0.25, 0.3, p.d + 0.25, p.h - 0.15, MARBLE, { glow: 0.2 });
      break;
    }
    case 'plant': {
      cyl(0.5, 0.7, 0.5, 0.25, '#b5562e', 10);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leaf = sph(0.55, 0.75 + (i % 2) * 0.2, i % 2 ? '#3f8f3a' : '#2f7a34', 6, {}, Math.cos(a) * 0.2, Math.sin(a) * 0.2);
        leaf.scaling.set(0.7, 1.3, 0.7);
        leaf.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
      }
      break;
    }
    case 'bookshelf': {
      const along = p.w >= p.d ? p.w : p.d;
      const depth = p.w >= p.d ? p.d : p.w;
      const inner = new TransformNode('shelf', scene);
      inner.parent = h;
      // rot 1 = books face east (against the west wall)
      if (p.rot === 1) inner.rotation.y = -Math.PI / 2;
      const ib = (w: number, hh: number, d: number, x: number, y: number, z: number, hex: string): void => {
        const m = CreateBox('bk', { width: w, height: hh, depth: d }, scene);
        m.position.set(x, y, z);
        add(m, hex, {}, inner);
      };
      ib(along, p.h, depth * 0.9, 0, p.h / 2, 0, WOOD_DARK);
      const colors = ['#b03a2e', '#2e5eaa', '#d9a441', '#3f7f4f', '#7a4aa0', '#e8e0cc', '#c8642e'];
      const doubleSided = Math.abs(p.z - 23.1) > 1 && Math.abs(p.x + 29.1) > 1;
      const sides = doubleSided ? [-1, 1] : [-1];
      for (const side of sides) {
        for (let row = 0; row < 3; row++) {
          let x = -along / 2 + 0.15;
          let k = row * 3 + (side > 0 ? 2 : 0);
          while (x < along / 2 - 0.3) {
            const bw = 0.12 + ((k * 37) % 5) * 0.025;
            const bh = 0.45 + ((k * 13) % 4) * 0.04;
            ib(bw, bh, 0.12, x + bw / 2, 0.3 + row * 0.72 + bh / 2, side * (depth * 0.45 + 0.01), colors[k % colors.length]!);
            x += bw + 0.02;
            k++;
          }
          ib(along, 0.06, 0.16, 0, 0.28 + row * 0.72, side * (depth * 0.45), WOOD);
        }
      }
      break;
    }
    case 'readingTable': {
      box(p.w, 0.1, p.d, p.h, WOOD, {});
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.12, p.h, 0.12, p.h / 2, WOOD_DARK, {}, sx * (p.w / 2 - 0.15), sz * (p.d / 2 - 0.15));
      box(0.7, 0.05, 0.5, p.h + 0.08, '#f5ecd5', { glow: 0.4 });
      box(0.02, 0.06, 0.5, p.h + 0.1, '#8a5a2b');
      cyl(0.25, 0.08, 0.1, p.h + 0.18, '#f0e6c8', 8, {}, p.w / 2 - 0.3);
      sph(0.1, p.h + 0.36, '#ffcf6b', 6, { glow: 1 }, p.w / 2 - 0.3);
      break;
    }
    case 'displayCase':
    case 'jarCase': {
      box(p.w, 0.8, p.d, 0.4, WOOD_DARK, {});
      box(p.w + 0.06, 0.06, p.d + 0.06, 0.82, GOLD, { glow: 0.3 });
      const glassH = p.h - 0.8;
      box(p.w - 0.06, glassH, p.d - 0.06, 0.8 + glassH / 2, '#bfe3ff', { alpha: 0.22, glow: 0.4, spec: 0.8 });
      if (p.kind === 'jarCase') {
        // Burial-jar inspired centrepiece (stylised, not a replica).
        const jar = sph(0.8, 1.25, '#b0643a', 12);
        jar.scaling.set(1, 1.1, 1);
        cyl(0.18, 0.6, 0.7, 1.7, '#9a5530', 12);
        sph(0.12, 1.85, '#7a4020', 6, {}, -0.1);
        sph(0.12, 1.85, '#7a4020', 6, {}, 0.12);
      } else {
        const v = p.variant ?? 0;
        const items = ['#d9b25a', '#6aa0c9', '#c46a4a', '#88b05a'];
        sph(0.35, 1.05, items[v % 4]!, 8, { glow: 0.35, spec: 0.5 }, -0.4);
        cyl(0.3, 0.2, 0.25, 0.97, items[(v + 1) % 4]!, 8, {}, 0.4);
      }
      break;
    }
    case 'statue': {
      const bronze = (p.variant ?? 0) % 2 === 0 ? '#9c6b3a' : '#a9a49a';
      box(p.w, 0.9, p.d, 0.45, MARBLE, { glow: 0.2 });
      box(p.w + 0.1, 0.08, p.d + 0.1, 0.92, GOLD, { glow: 0.3 });
      cyl(0.6, 0.45, 0.6, 1.25, bronze, 10, { spec: 0.4 });
      cyl(0.5, 0.35, 0.45, 1.8, bronze, 10, { spec: 0.4 });
      sph(0.5, 2.3, bronze, 10, { spec: 0.4 });
      const arm = cyl(0.55, 0.12, 0.12, 2.15, bronze, 8, { spec: 0.4 }, 0.3);
      arm.rotation.z = (p.variant ?? 0) > 1 ? -2.4 : -0.6;
      arm.position.y = (p.variant ?? 0) > 1 ? 2.35 : 1.95;
      arm.position.x = (p.variant ?? 0) > 1 ? 0.35 : 0.32;
      break;
    }
    case 'balangay': {
      box(p.w, 0.3, p.d, 0.15, '#6b4a2e', {});
      const hull = CreateSphere('hull', { diameter: 1, segments: 10, slice: 0.5 }, scene);
      hull.rotation.x = Math.PI;
      hull.scaling.set(p.w * 0.95, 0.9, p.d * 0.9);
      hull.position.y = 1.05;
      add(hull, '#8a5a2b', {}, h);
      box(p.w * 0.9, 0.06, p.d * 0.7, 1.02, '#a8743f', {});
      for (const sx of [-1, 1]) {
        const prow = cyl(0.7, 0.05, 0.22, 1.3, '#7a4a22', 6, {}, sx * p.w * 0.47);
        prow.rotation.z = sx * -0.6;
      }
      cyl(2.6, 0.08, 0.1, 2.3, WOOD_DARK, 8);
      const sail = CreatePlane('sail', { width: 1.4, height: 1.6, sideOrientation: Mesh.DOUBLESIDE }, scene);
      sail.position.set(0.15, 2.6, 0);
      sail.rotation.y = Math.PI / 2;
      add(sail, '#e8d6a8', { glow: 0.35 }, h);
      break;
    }
    case 'sunMonument': {
      cyl(0.5, p.w, p.w + 0.2, 0.25, MARBLE, 16, { glow: 0.2 });
      cyl(0.08, p.w + 0.1, p.w + 0.1, 0.52, GOLD, 16, { glow: 0.3 });
      cyl(1.6, 0.9, 1.1, 1.3, MARBLE, 10, { glow: 0.25 });
      // Rotating eight-rayed sun on top (not merged, so it can spin).
      const sun = new TransformNode('sun', scene);
      sun.parent = h;
      sun.position.y = 2.85;
      const gold = mat(scene, '#f2c14e', { glow: 0.55, spec: 0.6 });
      const core = CreateSphere('sunCore', { diameter: 0.85, segments: 10 }, scene);
      core.material = gold;
      core.parent = sun;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ray = CreateCylinder('ray', { height: 0.6, diameterTop: 0, diameterBottom: 0.24, tessellation: 4 }, scene);
        ray.material = gold;
        ray.parent = sun;
        ray.position.set(Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0);
        ray.rotation.z = a - Math.PI / 2;
      }
      spinners.push(sun);
      // Three stars around the base
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
        const st = cyl(0.12, 0.42, 0.42, 0.62, '#f2c14e', 5, { glow: 0.5 }, Math.cos(a) * 1.2, Math.sin(a) * 1.2);
        st.rotation.y = a;
      }
      break;
    }
    case 'balete': {
      const trunk = '#4a3326';
      cyl(p.h, 0.9, 1.7, p.h / 2, trunk, 9);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        const root = cyl(2.2, 0.12, 0.32, 1.0, i % 2 ? '#3d2a1f' : trunk, 6, {}, Math.cos(a) * 0.9, Math.sin(a) * 0.9);
        root.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      }
      // Canopy (fades with the camera like walls — registered below).
      const canopy: Mesh[] = [];
      const leafCols = ['#2c5e3b', '#23503a', '#346b40'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = CreateSphere('canopy', { diameter: 2.6, segments: 6 }, scene);
        c.convertToFlatShadedMesh();
        c.material = mat(scene, leafCols[i % 3]!, { dynamic: true, glow: 0.25 });
        c.parent = h;
        c.position.set(Math.cos(a) * 1.3, p.h + 0.2 + (i % 2) * 0.4, Math.sin(a) * 1.3);
        canopy.push(c);
      }
      occluders.push({ box: { minX: p.x - 2.6, maxX: p.x + 2.6, minZ: p.z - 2.6, maxZ: p.z + 2.6 }, height: p.h + 1.6, meshes: canopy });
      // Fireflies (alitaptap)
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4;
        sph(0.09, 1 + (i % 4) * 0.7, '#e8ff9a', 4, { glow: 1 }, Math.cos(a) * (2 + (i % 3)), Math.sin(a) * (2 + (i % 3)));
      }
      break;
    }
    case 'rock': {
      const r = CreateSphere('rock', { diameter: 1, segments: 3 }, scene);
      r.convertToFlatShadedMesh();
      r.scaling.set(p.w, p.h * 1.4, p.d);
      r.position.y = p.h * 0.35;
      add(r, '#6f6a7d', {}, h);
      break;
    }
    case 'folkPlinth': {
      box(p.w, p.h, p.d, p.h / 2, '#2a2438', { glow: 0.2 });
      box(p.w + 0.1, 0.06, p.d + 0.1, p.h, '#9b6bd6', { glow: 0.6 });
      if ((p.variant ?? 0) === 0) {
        // Stylised horse-headed silhouette hinting at the Tikbalang legend.
        cyl(0.9, 0.3, 0.4, p.h + 0.45, '#1c1726', 8);
        const head = cyl(0.6, 0.18, 0.3, p.h + 1.05, '#1c1726', 8, {}, 0, 0.15);
        head.rotation.x = 0.9;
        sph(0.07, p.h + 1.15, '#ff5a3c', 4, { glow: 1 }, 0.1, 0.3);
        sph(0.07, p.h + 1.15, '#ff5a3c', 4, { glow: 1 }, -0.1, 0.3);
      } else {
        sph(0.6, p.h + 0.45, '#b48cff', 8, { glow: 0.9, alpha: 0.75 });
        cyl(0.1, 0.5, 0.5, p.h + 0.08, '#4a3b66', 8);
      }
      break;
    }
  }
}
