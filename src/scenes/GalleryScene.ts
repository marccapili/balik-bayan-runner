import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { FollowCamera } from '../camera/FollowCamera';
import { Player } from '../characters/Player';
import type { InputManager } from '../controls/InputManager';
import { exhibitStyle, GALLERY_ROOM, GALLERY_TV, GALLERY_UI, GALLERY_WORKS, GAME_PLAQUE, galleryFile } from '../data/gallery';
import type { HeroId } from '../data/heroes';
import { galleryLayout, spotInReach, type GalleryLayout, type Spot } from '../gallery/galleryLayout';
import { CollisionWorld } from '../physics/Collision';
import type { Vec2 } from '../utils/math';
import { mat } from '../world/materials';
import { floorTiles } from '../world/textures';
import type { GameScene } from './GameScene';

const WOOD = '#8a5a2b';
const WOOD_DARK = '#5b3a22';
const GOLD = '#c48a2c';
const PAPER = '#f4e7c8';
const STILL = { x: 0, z: 0 } as const;

interface SpotView {
  spot: Spot;
  /** Bobs / glows while the hero is in reach. */
  item: TransformNode;
  baseY: number;
}

/** Canvas texture helper (text is drawn once). */
function canvasTex(scene: Scene, name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): DynamicTexture {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(t.getContext() as unknown as CanvasRenderingContext2D);
  t.update(true);
  t.anisotropicFilteringLevel = 4;
  return t;
}

/** Fits `text` into `maxW` by shrinking the font (px) down to `min`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: string, size: number, min: number, maxW: number): void {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px system-ui, "Segoe UI", sans-serif`;
    if (ctx.measureText(text).width <= maxW) return;
    s -= 2;
  } while (s > min);
}

/**
 * The Future Heroes Gallery: one calm museum hall with the class's works on pedestals (books on lecterns,
 * scrolls on stands, each with its cover framed on the wall), a TV in the middle and the game's own plaque
 * by the door. No enemies or coins: the hero just walks around. Layout comes from gallery/galleryLayout.ts.
 */
export class GalleryScene implements GameScene {
  readonly scene: Scene;
  readonly player: Player;
  readonly layout: GalleryLayout;
  private readonly cam: FollowCamera;
  private readonly views: SpotView[] = [];
  private readonly ring: Mesh;
  private readonly textures: BaseTexture[] = [];
  private readonly mats: Material[] = [];
  private t = 0;
  /** Exhibit in reach right now (null = none). */
  near: Spot | null = null;
  /** Works opened this visit (their plaques get a check). */
  private readonly seenMarks = new Map<number, Mesh>();

  constructor(
    private readonly engine: Engine,
    private readonly input: InputManager,
    heroId: HeroId,
  ) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.06, 0.08, 0.18, 1);
    scene.ambientColor = new Color3(0.3, 0.28, 0.32);
    scene.skipPointerMovePicking = true;
    const hemi = new HemisphericLight('gHemi', new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.78;
    hemi.diffuse = new Color3(1, 0.95, 0.86);
    hemi.groundColor = new Color3(0.36, 0.3, 0.38);
    hemi.specular = new Color3(0.15, 0.15, 0.15);
    const sun = new DirectionalLight('gKey', new Vector3(-0.35, -1, 0.45), scene);
    sun.intensity = 0.4;
    sun.diffuse = new Color3(1, 0.9, 0.75);

    this.layout = galleryLayout(GALLERY_WORKS.length, GALLERY_ROOM);
    const world = new CollisionWorld(this.layout.colliders);
    this.buildRoom();
    for (const s of this.layout.spots) this.views.push(this.buildSpot(s));

    this.ring = CreateTorus('gRing', { diameter: 1.7, thickness: 0.07, tessellation: 48 }, scene);
    this.ring.scaling.y = 0.2;
    this.ring.material = mat(scene, '#ffe9a8', { glow: 1, alpha: 0.75 });
    this.ring.isPickable = false;
    this.ring.setEnabled(false);

    this.player = new Player(scene, world, this.layout.spawn, heroId);
    this.cam = new FollowCamera(scene, this.layout.spawn);
    scene.activeCamera = this.cam.camera;
  }

  setHero(id: HeroId, skin?: string): void {
    this.player.setHero(id, skin);
  }

  /** Back to the door (each visit starts at the entrance). */
  reset(): void {
    this.player.respawn(this.layout.spawn);
    this.player.motor.state.yaw = 0;
    this.cam.snapTo(this.layout.spawn);
    this.near = null;
  }

  /** Puts a check on a work's plaque after it has been opened. */
  markSeen(index: number): void {
    const m = this.seenMarks.get(index);
    if (m) m.setEnabled(true);
  }

  update(dt: number, frozen = false): void {
    this.t += dt;
    this.player.update(frozen ? STILL : this.input.move, dt);
    this.near = frozen ? this.near : spotInReach(this.player.position, this.layout.spots);
    for (const v of this.views) {
      const active = v.spot === this.near;
      const phase = v.spot.at.z * 0.9 + v.spot.at.x;
      v.item.position.y = v.baseY + (active ? 0.06 + Math.sin(this.t * 5) * 0.05 : Math.sin(this.t * 1.6 + phase) * 0.015);
    }
    this.ring.setEnabled(!!this.near);
    if (this.near) {
      this.ring.position.set(this.near.at.x, 0.05, this.near.at.z);
      this.ring.scaling.x = this.ring.scaling.z = this.near.kind === 'tv' ? 2.2 : 1 + Math.sin(this.t * 6) * 0.04;
      this.ring.rotation.y = this.t;
    }
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    this.cam.update(this.player.position, this.player.velocity, dt, aspect);
  }

  get position(): Vec2 {
    return this.player.position;
  }

  // ── Building ──

  private box(name: string, w: number, h: number, d: number, x: number, y: number, z: number, hex: string, parent?: TransformNode, glow?: number): Mesh {
    const m = CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    m.position.set(x, y, z);
    m.material = mat(this.scene, hex, glow === undefined ? {} : { glow });
    m.isPickable = false;
    if (parent) m.parent = parent;
    return m;
  }

  private texMat(name: string, t: BaseTexture, glow = 0.35): StandardMaterial {
    this.textures.push(t);
    const m = new StandardMaterial(name, this.scene);
    m.diffuseTexture = t;
    m.specularColor = new Color3(0.03, 0.03, 0.03);
    m.emissiveColor = new Color3(glow, glow, glow);
    this.mats.push(m);
    return m;
  }

  private buildRoom(): void {
    const { bounds } = this.layout;
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    const H = GALLERY_ROOM.wallHeight;
    const floor = CreateGround('gFloor', { width: w, height: d }, this.scene);
    floor.position.set(0, 0, d / 2);
    const ft = floorTiles(this.scene, '#b07a45', '#7a4f2a', 37, 'wood');
    ft.uScale = w / 2;
    ft.vScale = d / 2;
    floor.material = this.texMat('gFloorMat', ft, 0.25);
    floor.isPickable = false;
    // Red carpet runner down the middle.
    this.box('gCarpet', 2.6, 0.02, d - 1.2, 0, 0.01, d / 2, '#9e2430');
    this.box('gCarpetEdgeL', 0.12, 0.025, d - 1.2, -1.36, 0.012, d / 2, GOLD);
    this.box('gCarpetEdgeR', 0.12, 0.025, d - 1.2, 1.36, 0.012, d / 2, GOLD);

    // Walls: tall at the back and sides, a low rail at the front so the camera sees in.
    const wallHex = '#e9dcc0';
    this.box('gWallBack', w + 1, H, 0.5, 0, H / 2, bounds.maxZ + 0.25, wallHex);
    this.box('gWallL', 0.5, H, d, bounds.minX - 0.25, H / 2, d / 2, wallHex);
    this.box('gWallR', 0.5, H, d, bounds.maxX + 0.25, H / 2, d / 2, wallHex);
    this.box('gWallFront', w + 1, 0.55, 0.5, 0, 0.275, -0.25, WOOD_DARK);
    // Wainscot + crown trim.
    for (const [n, x, z, ww, dd] of [
      ['B', 0, bounds.maxZ - 0.02, w, 0.08],
      ['L', bounds.minX + 0.02, d / 2, 0.08, d],
      ['R', bounds.maxX - 0.02, d / 2, 0.08, d],
    ] as const) {
      this.box(`gWains${n}`, ww, 0.9, dd, x, 0.45, z, WOOD);
      this.box(`gCrown${n}`, ww, 0.14, dd, x, H - 0.1, z, GOLD);
    }

    // Big title sign on the back wall.
    const sign = CreatePlane('gSign', { width: 7.2, height: 1.6 }, this.scene);
    sign.position.set(0, H - 0.95, bounds.maxZ - 0.06);
    sign.material = this.texMat(
      'gSignMat',
      canvasTex(this.scene, 'gSignTex', 1024, 228, (ctx) => {
        ctx.fillStyle = '#1f2d6b';
        ctx.fillRect(0, 0, 1024, 228);
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 10;
        ctx.strokeRect(10, 10, 1004, 208);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff6df';
        fitText(ctx, GALLERY_UI.heading.toUpperCase(), '900', 84, 40, 940);
        ctx.fillText(GALLERY_UI.heading.toUpperCase(), 512, 112);
        ctx.fillStyle = '#f2c14e';
        fitText(ctx, GALLERY_UI.subheading, 'italic 600', 40, 24, 940);
        ctx.fillText(GALLERY_UI.subheading, 512, 178);
      }),
      0.55,
    );
    sign.isPickable = false;

    // Capiz-style windows of light along the side walls, between the frames.
    const lamp = mat(this.scene, '#fff2c4', { glow: 0.9 });
    for (const s of this.layout.spots) {
      if (s.kind !== 'work') continue;
      const side = Math.sign(s.at.x);
      const x = side * (w / 2 - 0.04);
      for (const dz of [-1.3, 1.3]) {
        const l = CreateCylinder(`gLamp${s.index}_${dz}`, { diameter: 0.22, height: 0.08, tessellation: 12 }, this.scene);
        l.rotation.z = Math.PI / 2;
        l.position.set(x - side * 0.04, H - 0.55, s.at.z + dz);
        l.material = lamp;
        l.isPickable = false;
      }
    }
  }

  private buildSpot(s: Spot): SpotView {
    const node = new TransformNode(`gSpot${s.kind}${s.index}`, this.scene);
    node.position.set(s.at.x, 0, s.at.z);
    node.rotation.y = s.facing;
    if (s.kind === 'tv') return this.buildTv(node, s);
    if (s.kind === 'game') return this.buildGamePlaque(node, s);
    const work = GALLERY_WORKS[s.index]!;
    const style = exhibitStyle(work);
    // Pedestal (local +z points at the wall behind it).
    this.box(`gPed${s.index}`, 0.9, 0.85, 0.9, 0, 0.425, 0, '#efe9df', node);
    this.box(`gPedTop${s.index}`, 1.0, 0.08, 1.0, 0, 0.88, 0, GOLD, node);
    const item = new TransformNode(`gItem${s.index}`, this.scene);
    item.parent = node;
    item.position.y = 0.92;
    if (style === 'book') {
      // Lectern slope + open book.
      const slope = this.box(`gLectern${s.index}`, 0.8, 0.06, 0.62, 0, 0.08, 0, WOOD_DARK, item);
      slope.rotation.x = -0.35;
      const book = new TransformNode(`gBook${s.index}`, this.scene);
      book.parent = item;
      book.position.set(0, 0.16, 0);
      book.rotation.x = -0.35;
      this.box(`gCover${s.index}`, 0.74, 0.03, 0.52, 0, 0, 0, '#7a1f2b', book);
      for (const side of [-1, 1]) {
        const page = this.box(`gPage${s.index}_${side}`, 0.34, 0.05, 0.48, side * 0.18, 0.035, 0, PAPER, book, 0.3);
        page.rotation.z = side * 0.08;
      }
    } else {
      // Scroll on a little cradle, with a red ribbon.
      this.box(`gCradle${s.index}`, 0.7, 0.08, 0.26, 0, 0.04, 0, WOOD_DARK, item);
      const roll = CreateCylinder(`gScroll${s.index}`, { diameter: 0.2, height: 0.62, tessellation: 18 }, this.scene);
      roll.rotation.z = Math.PI / 2;
      roll.position.y = 0.18;
      roll.material = mat(this.scene, PAPER, { glow: 0.3 });
      roll.parent = item;
      roll.isPickable = false;
      for (const x of [-0.34, 0.34]) {
        const knob = CreateCylinder(`gKnob${s.index}_${x}`, { diameter: 0.1, height: 0.1, tessellation: 10 }, this.scene);
        knob.rotation.z = Math.PI / 2;
        knob.position.set(x, 0.18, 0);
        knob.material = mat(this.scene, WOOD);
        knob.parent = item;
        knob.isPickable = false;
      }
      this.box(`gRibbon${s.index}`, 0.06, 0.22, 0.22, 0, 0.18, 0, '#c8202b', item);
    }

    // The work's cover, framed on the wall behind the pedestal.
    const thumb = new Texture(galleryFile(work.slug, 'thumb.webp'), this.scene, true, true);
    const first = work.pages[0]!;
    const aspect = first.w / first.h;
    const fh = aspect >= 1 ? 1.15 / aspect : 1.5;
    const fw = aspect >= 1 ? 1.15 : 1.5 * aspect;
    const wallZ = GALLERY_ROOM.wallInset - 0.08;
    this.box(`gFrame${s.index}`, fw + 0.16, fh + 0.16, 0.06, 0, 1.95, wallZ, GOLD, node);
    const pic = CreatePlane(`gPic${s.index}`, { width: fw, height: fh }, this.scene);
    pic.parent = node;
    pic.position.set(0, 1.95, wallZ - 0.035);
    pic.material = this.texMat(`gPicMat${s.index}`, thumb, 0.5);
    pic.isPickable = false;
    // Plaque on the pedestal front: name, title, book/scroll.
    const plaque = CreatePlane(`gPlaque${s.index}`, { width: 0.84, height: 0.42 }, this.scene);
    plaque.parent = node;
    plaque.position.set(0, 0.5, -0.46);
    plaque.material = this.texMat(
      `gPlaqueMat${s.index}`,
      canvasTex(this.scene, `gPlaqueTex${s.index}`, 512, 256, (ctx) => {
        ctx.fillStyle = '#2a1d10';
        ctx.fillRect(0, 0, 512, 256);
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, 496, 240);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f2c14e';
        fitText(ctx, work.name, '800', 46, 24, 470);
        ctx.fillText(work.name, 256, 90);
        ctx.fillStyle = '#fff6df';
        fitText(ctx, work.title, 'italic 600', 36, 20, 470);
        ctx.fillText(work.title, 256, 150);
        ctx.font = '600 28px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,246,223,0.75)';
        ctx.fillText(style === 'book' ? `📖 ${work.pages.length} pahina` : '📜 Scroll', 256, 212);
      }),
      0.55,
    );
    plaque.isPickable = false;
    // Seen check (hidden until opened).
    const check = CreatePlane(`gSeen${s.index}`, { width: 0.2, height: 0.2 }, this.scene);
    check.parent = node;
    check.position.set(0.34, 0.78, -0.47);
    check.material = this.texMat(
      `gSeenMat${s.index}`,
      canvasTex(this.scene, `gSeenTex${s.index}`, 64, 64, (ctx) => {
        ctx.fillStyle = '#3fbf6a';
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(17, 33);
        ctx.lineTo(28, 44);
        ctx.lineTo(47, 21);
        ctx.stroke();
      }),
      0.8,
    );
    check.isPickable = false;
    check.setEnabled(false);
    this.seenMarks.set(s.index, check);
    return { spot: s, item, baseY: 0.92 };
  }

  private buildTv(node: TransformNode, s: Spot): SpotView {
    // Low wooden cabinet, a retro TV on top and a small bench in front.
    this.box('gTvCab', 2.0, 0.7, 0.8, 0, 0.35, 0, WOOD, node);
    this.box('gTvCabTop', 2.1, 0.06, 0.86, 0, 0.73, 0, WOOD_DARK, node);
    const item = new TransformNode('gTvItem', this.scene);
    item.parent = node;
    item.position.y = 0.76;
    this.box('gTvBody', 1.7, 1.15, 0.6, 0, 0.6, 0.02, '#3a2a20', item);
    this.box('gTvBezel', 1.5, 0.98, 0.05, 0, 0.62, -0.29, '#141414', item);
    for (const x of [-0.25, 0.25]) {
      const ant = CreateCylinder(`gAnt${x}`, { diameter: 0.03, height: 0.7, tessellation: 6 }, this.scene);
      ant.parent = item;
      ant.position.set(x, 1.45, 0.05);
      ant.rotation.z = -x * 1.4;
      ant.material = mat(this.scene, '#9a9a9a');
      ant.isPickable = false;
    }
    const screen = CreatePlane('gTvScreen', { width: 1.38, height: 0.86 }, this.scene);
    screen.parent = item;
    screen.position.set(0, 0.62, -0.32);
    screen.material = this.texMat(
      'gTvScreenMat',
      canvasTex(this.scene, 'gTvTex', 512, 320, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 320);
        g.addColorStop(0, '#2d3f8f');
        g.addColorStop(1, '#0f1430');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#c8202b';
        ctx.beginPath();
        ctx.roundRect?.(196, 92, 120, 84, 22);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(240, 112);
        ctx.lineTo(240, 156);
        ctx.lineTo(280, 134);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f2c14e';
        fitText(ctx, 'PANOORIN', '900', 40, 20, 480);
        ctx.fillText('PANOORIN', 256, 232);
        ctx.fillStyle = '#fff6df';
        fitText(ctx, GALLERY_TV.title, '600', 26, 14, 480);
        ctx.fillText(GALLERY_TV.title, 256, 276);
      }),
      0.85,
    );
    screen.isPickable = false;
    this.box('gBench', 2.0, 0.42, 0.5, 0, 0.21, -1.7, WOOD_DARK, node);
    return { spot: s, item, baseY: 0.76 };
  }

  private buildGamePlaque(node: TransformNode, s: Spot): SpotView {
    this.box('gGamePost', 0.14, 1.1, 0.14, 0, 0.55, 0.05, WOOD_DARK, node);
    const item = new TransformNode('gGameItem', this.scene);
    item.parent = node;
    item.position.y = 1.1;
    const board = CreatePlane('gGameBoard', { width: 1.25, height: 0.82 }, this.scene);
    board.parent = item;
    board.position.set(0, 0.2, 0);
    board.material = this.texMat(
      'gGameMat',
      canvasTex(this.scene, 'gGameTex', 512, 336, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 512, 336);
        g.addColorStop(0, '#c8202b');
        g.addColorStop(1, '#1f3c9e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 336);
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, 496, 320);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe08a';
        ctx.font = '900 64px system-ui, sans-serif';
        ctx.fillText('☀', 256, 92);
        ctx.fillStyle = '#fff6df';
        fitText(ctx, GAME_PLAQUE.title.toUpperCase(), '900', 50, 24, 470);
        ctx.fillText(GAME_PLAQUE.title.toUpperCase(), 256, 170);
        ctx.fillStyle = '#f2c14e';
        fitText(ctx, `Ang larong ito · ni ${GAME_PLAQUE.name}`, '600', 30, 18, 470);
        ctx.fillText(`Ang larong ito · ni ${GAME_PLAQUE.name}`, 256, 230);
        ctx.fillStyle = 'rgba(255,246,223,0.8)';
        ctx.font = '600 24px system-ui, sans-serif';
        ctx.fillText('Lapit para basahin', 256, 286);
      }),
      0.6,
    );
    board.isPickable = false;
    return { spot: s, item, baseY: 1.1 };
  }

  dispose(): void {
    this.player.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
    this.scene.dispose();
  }
}
