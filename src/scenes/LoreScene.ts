import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Material } from '@babylonjs/core/Materials/material';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { HeroAnimator, type AnimState } from '../animations/HeroAnimator';
import { buildHero, Kit, type HeroRig } from '../characters/HeroModel';
import { buildDog, buildMulto, type DogRig, type MultoRig } from '../enemies/EnemyModels';
import { buildGuard } from '../enemies/GuardModel';
import type { HeroId } from '../data/heroes';
import { LORE, PORTAL_AT, VIGNETTE, type LoreSet } from '../data/lore';
import { ease, type LoreTimeline } from '../gameplay/LoreTimeline';
import { clamp, lerp } from '../utils/math';
import { mat } from '../world/materials';
import { floorTiles, paintingTexture, portraitTexture } from '../world/textures';

const HEROES: readonly HeroId[] = ['lapulapu', 'gabriela', 'rizal', 'bonifacio'];
const VIGNETTE_HERO: Record<string, HeroId> = { mactan: 'lapulapu', ilocos: 'gabriela', dapitan: 'rizal', manila: 'bonifacio' };
/** Where each hero lands / runs in the museum (x, z). */
const PILE: Record<HeroId, [number, number]> = { lapulapu: [-0.55, 0.15], gabriela: [0.55, 0.2], rizal: [-0.2, 0.75], bonifacio: [0.2, -0.3] };
const RUN_DIR: Record<HeroId, number> = { lapulapu: -0.55, gabriela: 0.5, rizal: -0.2, bonifacio: 0.18 };
const GUARD_AT = new Vector3(0, 0, 7);

export interface LoreSceneOptions {
  skins: Partial<Record<HeroId, string>>;
  /** Glow + full particle count. */
  high: boolean;
  /** Reduced effects: no shake / flicker, fewer particles. */
  reduced: boolean;
}

interface Actor {
  id: HeroId;
  rig: HeroRig;
  anim: AnimState;
  animator: HeroAnimator;
  holder: TransformNode;
  speed: number;
}

interface Bit {
  mesh: Mesh;
  seed: number;
}

const rand = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/** Gradient sky texture (top → bottom), optionally with a sun disc. */
function skyTexture(scene: Scene, name: string, top: string, bottom: string, sun?: { x: number; y: number; r: number; color: string }): DynamicTexture {
  const t = new DynamicTexture(name, { width: 256, height: 256 }, scene, false);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  if (sun) {
    const rg = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.r * 2.4);
    rg.addColorStop(0, sun.color);
    rg.addColorStop(0.4, sun.color);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, 256, 256);
  }
  t.update();
  return t;
}

/** Spiral vortex (magenta / gold) for the portal face. */
function vortexTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('loreVortex', { width: 256, height: 256 }, scene, false);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, '#fff6df');
  g.addColorStop(0.25, '#ff7ad9');
  g.addColorStop(0.7, '#7a1fa8');
  g.addColorStop(1, 'rgba(40,0,60,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  c.lineWidth = 7;
  for (let arm = 0; arm < 5; arm++) {
    c.strokeStyle = arm % 2 ? 'rgba(242,193,78,0.85)' : 'rgba(255,214,250,0.7)';
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (arm / 5) * Math.PI * 2 + i * 0.09;
      const r = i * 2;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  t.hasAlpha = true;
  t.update();
  return t;
}

/** Jagged glowing crack in the air (before the portal opens). */
function crackTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('loreCrack', { width: 64, height: 256 }, scene, false);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, 64, 256);
  const pts: [number, number][] = [[32, 4], [22, 50], [40, 92], [24, 140], [42, 186], [30, 252]];
  for (const [w, col] of [
    [16, 'rgba(255,90,210,0.45)'],
    [7, 'rgba(255,200,120,0.95)'],
    [3, '#fffaf0'],
  ] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.lineJoin = 'round';
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }
  t.hasAlpha = true;
  t.update();
  return t;
}

/** Time-tunnel wall: banig-like woven bands in magenta / gold / violet that scroll past. */
function tunnelTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('loreTunnel', { width: 256, height: 256 }, scene, false);
  const c = t.getContext() as unknown as CanvasRenderingContext2D;
  const cols = ['#7a1fa8', '#c2338f', '#f2c14e', '#9a3ad0', '#ff7ad9', '#5a1a8a'];
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const k = ((x / 16) ^ (y / 16)) & 1;
      c.fillStyle = cols[((x + y * 3) / 16 + k * 2) % cols.length]!;
      c.fillRect(x, y, 16, 16);
      c.fillStyle = 'rgba(255,240,200,0.25)';
      if (k) c.fillRect(x + 2, y + 7, 12, 2);
      else c.fillRect(x + 7, y + 2, 2, 12);
    }
  }
  t.update();
  return t;
}

/**
 * Real-time lore cutscene (lazily imported): every set, the four hero rigs, the guard, dog and
 * multo, one shared time portal. Pure rendering + posing; the timeline (data/lore.ts +
 * gameplay/LoreTimeline.ts) decides what happens when.
 */
export class LoreScene {
  readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly hemi: HemisphericLight;
  private readonly key: DirectionalLight;
  private readonly lamp: PointLight;
  private readonly portalLight: PointLight;
  private readonly flashlight: SpotLight;
  private readonly sets = new Map<LoreSet, TransformNode>();
  private readonly actors = new Map<HeroId, Actor>();
  private readonly guard: { rig: HeroRig; animator: HeroAnimator; beam: Mesh; pivot: TransformNode; holder: TransformNode };
  private readonly dog: DogRig;
  private readonly multo: MultoRig;
  private readonly horse: { root: TransformNode; body: TransformNode; legs: TransformNode[]; head: TransformNode; tail: TransformNode };
  private readonly portal: { root: TransformNode; face: Mesh; ring: Mesh; rim: Mesh };
  private readonly crack: Mesh;
  private readonly bits: Bit[] = [];
  private readonly sparks: Bit[] = [];
  private readonly coins: Bit[] = [];
  private readonly papers: Mesh[] = [];
  private pen: Mesh | null = null;
  private tunnelTex: DynamicTexture | null = null;
  private tunnelEnd: Mesh | null = null;
  private lampMesh: Mesh | null = null;
  private glow: GlowLayer | null = null;
  private set: LoreSet = 'title';
  private sceneId = 'title';
  private time = 0;
  private shake = 0;
  /** Freeze-frame for the logo hit: stops every animator. */
  private frozen = false;

  constructor(
    engine: Engine,
    private readonly opts: LoreSceneOptions,
  ) {
    const scene = (this.scene = new Scene(engine));
    scene.skipPointerMovePicking = true;
    scene.clearColor = new Color4(0, 0, 0, 1);
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);

    this.hemi = new HemisphericLight('loreHemi', new Vector3(0.2, 1, -0.3), scene);
    this.key = new DirectionalLight('loreKey', new Vector3(0.4, -0.8, 0.5), scene);
    this.key.intensity = 0.55;
    this.lamp = new PointLight('loreLamp', new Vector3(0.35, 1.05, 0.55), scene);
    this.lamp.range = 6;
    this.lamp.diffuse = Color3.FromHexString('#ffb45c');
    this.portalLight = new PointLight('lorePortalLight', new Vector3(...PORTAL_AT), scene);
    this.portalLight.diffuse = Color3.FromHexString('#ff7ad9');
    this.portalLight.range = 7;
    this.portalLight.intensity = 0;
    this.flashlight = new SpotLight('loreTorch', new Vector3(0, 1.3, 6.6), new Vector3(0, -0.15, -1), 0.5, 8, scene);
    this.flashlight.diffuse = Color3.FromHexString('#fff2c4');
    this.flashlight.range = 14;
    this.flashlight.intensity = 0;

    this.camera = new FreeCamera('loreCam', new Vector3(0, 1.5, -5), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.1;
    this.camera.maxZ = 120;
    scene.activeCamera = this.camera;

    const pc = opts.high && !opts.reduced ? LORE.particles : Math.ceil(LORE.particles / 2);
    this.buildMactan();
    this.buildIlocos();
    this.buildDapitan();
    this.buildManila();
    this.buildTunnel();
    this.buildMuseum();
    this.horse = this.buildHorse();
    this.portal = this.buildPortal();
    this.crack = CreatePlane('loreCrackMesh', { width: 0.32, height: 1.3 }, scene);
    const cm = new StandardMaterial('loreCrackMat', scene);
    cm.diffuseTexture = crackTexture(scene);
    cm.diffuseTexture.hasAlpha = true;
    cm.useAlphaFromDiffuseTexture = true;
    cm.emissiveColor = Color3.White();
    cm.disableLighting = true;
    cm.backFaceCulling = false;
    this.crack.material = cm;
    this.crack.position.set(...PORTAL_AT);
    this.crack.setEnabled(false);

    const r = rand(42);
    const paperMat = mat(scene, '#f4e6c4', { glow: 0.5 });
    paperMat.backFaceCulling = false;
    const leafMat = mat(scene, '#8fbf5a', { glow: 0.35 });
    leafMat.backFaceCulling = false;
    for (let i = 0; i < pc; i++) {
      const m = CreatePlane('loreBit', { width: 0.14, height: 0.1 }, scene);
      m.material = i % 3 === 0 ? leafMat : paperMat;
      m.isPickable = false;
      m.setEnabled(false);
      this.bits.push({ mesh: m, seed: r() });
    }
    const sparkMats = [mat(scene, '#f2c14e', { glow: 1 }), mat(scene, '#ff7ad9', { glow: 1 }), mat(scene, '#fff6df', { glow: 1 })];
    for (let i = 0; i < pc; i++) {
      const m = CreateSphere('loreSpark', { diameter: 0.07, segments: 4 }, scene);
      m.material = sparkMats[i % 3]!;
      m.isPickable = false;
      m.setEnabled(false);
      this.sparks.push({ mesh: m, seed: r() });
    }
    const coinMat = mat(scene, '#f2c14e', { glow: 0.6, spec: 0.8 });
    for (let i = 0; i < 12; i++) {
      const m = CreateCylinder('loreCoin', { diameter: 0.2, height: 0.04, tessellation: 14 }, scene);
      m.material = coinMat;
      m.isPickable = false;
      m.parent = this.sets.get('museum')!;
      m.setEnabled(false);
      this.coins.push({ mesh: m, seed: r() });
    }

    for (const id of HEROES) {
      const rig = buildHero(scene, id, opts.skins[id]);
      const holder = new TransformNode(`loreHolder_${id}`, scene);
      rig.root.parent = holder;
      holder.setEnabled(false);
      this.actors.set(id, { id, rig, anim: 'idle', animator: new HeroAnimator(rig), holder, speed: 0 });
    }
    const grig = buildGuard(scene);
    const gh = new TransformNode('loreGuard', scene);
    grig.root.parent = gh;
    gh.parent = this.sets.get('museum')!;
    gh.scaling.setAll(1.05);
    // Flashlight in the right hand + a soft visible beam.
    const torch = CreateCylinder('loreTorchMesh', { diameterTop: 0.09, diameterBottom: 0.06, height: 0.22, tessellation: 10 }, scene);
    torch.material = mat(scene, '#2a2a30', { spec: 0.6 });
    torch.parent = grig.armR;
    torch.position.set(0, -0.36, 0.06);
    const beam = CreateCylinder('loreBeam', { diameterTop: 0.1, diameterBottom: 2.2, height: 7, tessellation: 18, cap: Mesh.NO_CAP }, scene);
    beam.material = mat(scene, '#fff2c4', { glow: 1, alpha: 0.13, dynamic: true });
    beam.isPickable = false;
    const pivot = new TransformNode('loreBeamPivot', scene);
    pivot.parent = this.sets.get('museum')!;
    beam.parent = pivot;
    beam.rotation.x = -Math.PI / 2;
    this.guard = { rig: grig, animator: new HeroAnimator(grig), beam, pivot, holder: gh };
    this.dog = buildDog(scene);
    this.dog.root.parent = this.sets.get('museum')!;
    this.multo = buildMulto(scene);
    this.multo.root.parent = this.sets.get('museum')!;
    this.multo.root.scaling.setAll(0.8);

    if (opts.high && !opts.reduced) {
      this.glow = new GlowLayer('loreGlow', scene, { mainTextureRatio: 0.35, blurKernelSize: 16 });
      this.glow.intensity = 0.55;
    }
    for (const n of this.sets.values()) n.setEnabled(false);
    this.enterSet('title');
  }

  // ───────────────────────── sets ─────────────────────────

  private node(set: LoreSet): TransformNode {
    const n = new TransformNode(`loreSet_${set}`, this.scene);
    this.sets.set(set, n);
    return n;
  }

  private put<M extends Mesh>(m: M, parent: TransformNode, material: Material, x = 0, y = 0, z = 0): M {
    m.parent = parent;
    m.material = material;
    m.isPickable = false;
    m.position.set(x, y, z);
    return m;
  }

  private backdrop(parent: TransformNode, name: string, tex: DynamicTexture, w: number, h: number, z: number, y: number): Mesh {
    const sm = new StandardMaterial(`${name}Mat`, this.scene);
    sm.diffuseTexture = tex;
    sm.emissiveTexture = tex;
    sm.disableLighting = true;
    sm.fogEnabled = false;
    return this.put(CreatePlane(name, { width: w, height: h }, this.scene), parent, sm, 0, y, z);
  }

  private palm(parent: TransformNode, x: number, z: number, lean: number): void {
    const s = this.scene;
    const trunk = this.put(CreateCylinder('palmTrunk', { diameterTop: 0.14, diameterBottom: 0.24, height: 3.2, tessellation: 8 }, s), parent, mat(s, '#7a5634', { glow: 0.2 }), x, 1.6, z);
    trunk.rotation.z = lean;
    const topX = x - Math.sin(lean) * 1.6;
    const leafM = mat(s, '#3f7f3a', { glow: 0.25 });
    leafM.backFaceCulling = false;
    for (let i = 0; i < 7; i++) {
      const leaf = this.put(CreatePlane('palmLeaf', { width: 0.38, height: 1.5 }, s), parent, leafM, topX, 3.15, z);
      leaf.rotation.set(1.05, (i / 7) * Math.PI * 2, 0);
      leaf.setPivotPoint(new Vector3(0, -0.75, 0));
    }
  }

  private buildMactan(): void {
    const s = this.scene;
    const n = this.node('mactan');
    this.put(CreateGround('sand', { width: 90, height: 20 }, s), n, mat(s, '#e8c890', { glow: 0.3 }), 0, 0, -8);
    const sea = this.put(CreateGround('sea', { width: 80, height: 50 }, s), n, mat(s, '#2f8a9a', { glow: 0.35, spec: 0.6 }), 0, -0.05, 26);
    sea.rotation.y = 0;
    this.put(CreateGround('foam', { width: 90, height: 0.5 }, s), n, mat(s, '#fff6df', { glow: 0.6 }), 0, -0.03, 2.05);
    this.backdrop(n, 'mactanSky', skyTexture(s, 'mactanSkyTex', '#5a4a9a', '#ffb46b', { x: 150, y: 190, r: 18, color: '#fff2c4' }), 170, 60, 40, 16);
    this.palm(n, -3.2, -1.5, 0.25);
    this.palm(n, 3.6, -2.2, -0.18);
    this.palm(n, -6, -3.5, 0.1);
    // Bangka (outrigger canoe) pulled up on the sand.
    const hull = this.put(CreateCylinder('bangka', { diameter: 0.5, height: 3, tessellation: 10 }, s), n, mat(s, '#8e4a24', { glow: 0.2 }), 2.4, 0.18, 0.4);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = 0.5;
    hull.scaling.z = 0.6;
    for (const dz of [-0.9, 0.9]) {
      const arm = this.put(CreateBox('outrigArm', { width: 0.05, height: 0.05, depth: 2 }, s), n, mat(s, '#c9a070'), 2.4 + dz * 0.48, 0.35, 0.4 + dz * 0.88);
      arm.rotation.y = 0.5 + Math.PI / 2;
    }
  }

  private buildIlocos(): void {
    const s = this.scene;
    const n = this.node('ilocos');
    this.put(CreateGround('grass', { width: 60, height: 60 }, s), n, mat(s, '#7fa04a', { glow: 0.25 }), 0, 0, 10);
    this.put(CreateGround('road', { width: 2.2, height: 60 }, s), n, mat(s, '#c79a64', { glow: 0.25 }), 0, 0.01, 10);
    this.backdrop(n, 'ilocosSky', skyTexture(s, 'ilocosSkyTex', '#7ab0e0', '#ffe2a8'), 180, 64, 45, 18);
    const hillCols = ['#5d7f36', '#6f9440', '#4d6b2e'];
    const r = rand(7);
    for (let i = 0; i < 9; i++) {
      const h = this.put(CreateSphere('hill', { diameter: 10, segments: 10 }, s), n, mat(s, hillCols[i % 3]!, { glow: 0.2 }), (i - 4) * 7 + r() * 3, -2.5, 20 + r() * 10);
      h.scaling.set(1.4, 0.7 + r() * 0.4, 1);
    }
    // A few bamboo-and-cogon houses far down the road.
    for (const [x, z] of [
      [-6, 12],
      [7, 15],
    ] as const) {
      this.put(CreateBox('hutBody', { width: 2, height: 1.4, depth: 1.6 }, s), n, mat(s, '#c9a070', { glow: 0.2 }), x, 1.1, z);
      const roof = this.put(CreateCylinder('hutRoof', { diameterTop: 0, diameterBottom: 3, height: 1.4, tessellation: 4 }, s), n, mat(s, '#9a7a3a', { glow: 0.2 }), x, 2.5, z);
      roof.rotation.y = Math.PI / 4;
    }
  }

  private buildDapitan(): void {
    const s = this.scene;
    const n = this.node('dapitan');
    const deck = floorTiles(s, '#9a6a3c', '#6e4524', 5, 'wood');
    deck.uScale = deck.vScale = 4;
    const dm = new StandardMaterial('dapitanDeck', s);
    dm.diffuseTexture = deck;
    dm.emissiveColor = new Color3(0.18, 0.12, 0.07);
    dm.specularColor = Color3.Black();
    this.put(CreateGround('deck', { width: 8, height: 6 }, s), n, dm, 0, 0, 0);
    this.put(CreateGround('dapitanSea', { width: 80, height: 50 }, s), n, mat(s, '#3a7f9a', { glow: 0.35, spec: 0.5 }), 0, -0.4, 28);
    this.backdrop(n, 'dapitanSky', skyTexture(s, 'dapitanSkyTex', '#6a5aa8', '#ffb877', { x: 70, y: 200, r: 14, color: '#ffe8c0' }), 170, 60, 40, 16);
    // Writing desk, chair, paper stack, ink pot, oil lamp.
    const wood = mat(s, '#6b3d1f', { glow: 0.18 });
    this.put(CreateBox('desk', { width: 1.5, height: 0.08, depth: 0.7 }, s), n, wood, 0, 0.62, 0.62);
    for (const [x, z] of [
      [-0.68, 0.32],
      [0.68, 0.32],
      [-0.68, 0.92],
      [0.68, 0.92],
    ] as const)
      this.put(CreateBox('deskLeg', { width: 0.06, height: 0.62, depth: 0.06 }, s), n, wood, x, 0.31, z);
    this.put(CreateBox('chair', { width: 0.6, height: 0.06, depth: 0.5 }, s), n, wood, 0, 0.3, -0.05);
    this.put(CreateBox('chairBack', { width: 0.6, height: 0.7, depth: 0.06 }, s), n, wood, 0, 0.62, -0.3);
    const paper = mat(s, '#f4e6c4', { glow: 0.45 });
    for (let i = 0; i < 4; i++) {
      const p = this.put(CreateBox('deskPaper', { width: 0.3, height: 0.01, depth: 0.22 }, s), n, paper, -0.25 + i * 0.03, 0.67 + i * 0.006, 0.55);
      p.rotation.y = (i - 2) * 0.12;
      this.papers.push(p);
    }
    this.put(CreateCylinder('inkpot', { diameter: 0.1, height: 0.1, tessellation: 10 }, s), n, mat(s, '#1a1a2a', { spec: 0.7 }), 0.4, 0.71, 0.75);
    this.pen = this.put(CreateCylinder('pen', { diameterTop: 0.02, diameterBottom: 0.005, height: 0.26, tessellation: 6 }, s), n, mat(s, '#fff6df', { glow: 0.5 }), 0.2, 0.7, 0.5);
    this.pen.rotation.z = 1.2;
    // Bahay kubo eave + posts framing the sea view.
    const thatch = mat(s, '#9a7a3a', { glow: 0.2 });
    const eave = this.put(CreateBox('eave', { width: 8, height: 0.25, depth: 2 }, s), n, thatch, 0, 2.7, -1.2);
    eave.rotation.x = -0.35;
    for (const x of [-3, 3]) this.put(CreateCylinder('kuboPost', { diameter: 0.14, height: 2.6, tessellation: 8 }, s), n, mat(s, '#7a5634'), x, 1.3, -0.4);
  }

  private buildManila(): void {
    const s = this.scene;
    const n = this.node('manila');
    const floor = floorTiles(s, '#6e4524', '#4a2a14', 9, 'wood');
    floor.uScale = floor.vScale = 3;
    const fm = new StandardMaterial('manilaFloor', s);
    fm.diffuseTexture = floor;
    fm.specularColor = Color3.Black();
    this.put(CreateGround('hutFloor', { width: 8, height: 8 }, s), n, fm, 0, 0, 1);
    // Bamboo slat walls (back, sides) with a little window to the night.
    const bamboo = mat(s, '#b08a4a', { glow: 0.15 });
    const bambooDark = mat(s, '#8a6a32', { glow: 0.12 });
    for (let i = -16; i <= 16; i++) {
      const slat = this.put(CreateCylinder('slat', { diameter: 0.2, height: 3.2, tessellation: 6 }, s), n, i % 2 ? bamboo : bambooDark, i * 0.21, 1.6, 4.5);
      if (Math.abs(i) <= 2) slat.scaling.y = 0.42;
      if (Math.abs(i) <= 2) slat.position.y = 0.67;
    }
    this.backdrop(n, 'manilaNight', skyTexture(s, 'manilaNightTex', '#05081a', '#1c2a5a', { x: 180, y: 60, r: 10, color: '#fff6df' }), 6, 4, 6, 2.2);
    for (const x of [-3.4, 3.4]) {
      const side = this.put(CreateBox('hutSide', { width: 0.15, height: 3.2, depth: 8 }, s), n, bambooDark, x, 1.6, 1);
      side.isPickable = false;
    }
    // Low table with Katipunan papers (kept generic: no specific document or flag variant).
    const wood = mat(s, '#5a3418', { glow: 0.14 });
    this.put(CreateBox('table', { width: 1.4, height: 0.08, depth: 0.7 }, s), n, wood, 0, 0.62, 0.62);
    for (const [x, z] of [
      [-0.62, 0.34],
      [0.62, 0.34],
      [-0.62, 0.9],
      [0.62, 0.9],
    ] as const)
      this.put(CreateBox('tableLeg', { width: 0.06, height: 0.62, depth: 0.06 }, s), n, wood, x, 0.31, z);
    const paper = mat(s, '#f0dcb0', { glow: 0.45 });
    for (let i = 0; i < 4; i++) {
      const p = this.put(CreateBox('kkkPaper', { width: 0.3, height: 0.01, depth: 0.22 }, s), n, paper, -0.3 + i * 0.12, 0.67 + i * 0.004, 0.55 + (i % 2) * 0.06);
      p.rotation.y = (i - 1.5) * 0.25;
      this.papers.push(p);
    }
    // Oil lamp: glass bulb (flickers) on a brass base.
    this.put(CreateCylinder('lampBase', { diameterTop: 0.08, diameterBottom: 0.16, height: 0.1, tessellation: 10 }, s), n, mat(s, '#b8862a', { spec: 0.6 }), 0.42, 0.71, 0.7);
    this.lampMesh = this.put(CreateSphere('lampBulb', { diameter: 0.18, segments: 10 }, s), n, mat(s, '#ffd27a', { glow: 1, dynamic: true }), 0.42, 0.84, 0.7);
    // The bamboo post Bonifacio hangs on to.
    this.put(CreateCylinder('post', { diameter: 0.16, height: 3.2, tessellation: 8 }, s), n, bamboo, 0, 1.6, -0.55);
    for (let y = 0.4; y < 3.2; y += 0.55) this.put(CreateTorus('node', { diameter: 0.17, thickness: 0.035, tessellation: 10 }, s), n, bambooDark, 0, y, -0.55);
  }

  private buildTunnel(): void {
    const s = this.scene;
    const n = this.node('tunnel');
    const tube = CreateCylinder('tunnelTube', { diameter: 8, height: 70, tessellation: 24, cap: Mesh.NO_CAP, sideOrientation: Mesh.BACKSIDE }, s);
    tube.rotation.x = Math.PI / 2;
    const tm = new StandardMaterial('tunnelMat', s);
    this.tunnelTex = tunnelTexture(s);
    this.tunnelTex.uScale = 4;
    this.tunnelTex.vScale = 10;
    tm.diffuseTexture = this.tunnelTex;
    tm.emissiveTexture = this.tunnelTex;
    tm.disableLighting = true;
    tm.fogEnabled = true;
    this.put(tube, n, tm, 0, 0, 20);
    this.tunnelEnd = this.put(CreateDisc('tunnelEnd', { radius: 3.9, tessellation: 24 }, s), n, mat(s, '#fff6df', { glow: 1, dynamic: true }), 0, 0, 52);
  }

  private buildMuseum(): void {
    const s = this.scene;
    const n = this.node('museum');
    const ft = floorTiles(s, '#2a3a52', '#1a2638', 3, 'tile');
    ft.uScale = ft.vScale = 6;
    const fm = new StandardMaterial('loreMuseumFloor', s);
    fm.diffuseTexture = ft;
    fm.specularColor = new Color3(0.3, 0.3, 0.35);
    fm.emissiveColor = new Color3(0.04, 0.07, 0.1);
    this.put(CreateGround('mFloor', { width: 16, height: 22 }, s), n, fm, 0, 0, 2);
    const wall = mat(s, '#1e3550', { glow: 0.18 });
    const trim = mat(s, '#c9952f', { glow: 0.3, spec: 0.5 });
    this.put(CreateBox('mBack', { width: 16, height: 5, depth: 0.3 }, s), n, wall, 0, 2.5, 9.5);
    for (const x of [-7.5, 7.5]) this.put(CreateBox('mSide', { width: 0.3, height: 5, depth: 22 }, s), n, wall, x, 2.5, 2);
    this.put(CreateBox('mCeil', { width: 16, height: 0.2, depth: 22 }, s), n, mat(s, '#0f1e30'), 0, 5, 2);
    // Doorway the guard comes through (lit corridor behind).
    this.put(CreateBox('mDoor', { width: 2.2, height: 3, depth: 0.32 }, s), n, mat(s, '#ffe6a8', { glow: 0.9 }), 0, 1.5, 9.42);
    // Display pedestals with glass cases + framed portraits / a painting on the walls.
    for (const [x, z] of [
      [-4.2, 1.5],
      [4.2, 1.5],
      [-4.2, -2.5],
      [4.2, -2.5],
    ] as const) {
      this.put(CreateBox('ped', { width: 0.9, height: 1, depth: 0.9 }, s), n, mat(s, '#d8cdb8', { glow: 0.2 }), x, 0.5, z);
      this.put(CreateBox('pedTrim', { width: 0.96, height: 0.06, depth: 0.96 }, s), n, trim, x, 1.02, z);
      this.put(CreateBox('glass', { width: 0.8, height: 0.7, depth: 0.8 }, s), n, mat(s, '#9fe3ff', { glow: 0.45, alpha: 0.22, spec: 0.9 }), x, 1.4, z);
      this.put(CreateSphere('relic', { diameter: 0.3, segments: 8 }, s), n, mat(s, '#c9952f', { glow: 0.5, spec: 0.7 }), x, 1.22, z);
    }
    for (const [i, z] of [-3, 1, 5].entries()) {
      for (const side of [-1, 1]) {
        const pic = this.put(CreatePlane('mPortrait', { width: 1.2, height: 1.5 }, s), n, (() => {
          const m = new StandardMaterial(`lorePortrait${i}${side}`, s);
          m.diffuseTexture = i === 1 ? paintingTexture(s) : portraitTexture(s, i + (side > 0 ? 3 : 0));
          m.emissiveColor = new Color3(0.25, 0.25, 0.28);
          return m;
        })(), side * 7.33, 2.4, z);
        pic.rotation.y = side * (Math.PI / 2);
        this.put(CreateBox('frame', { width: 0.06, height: 1.66, depth: 1.36 }, s), n, trim, side * 7.36, 2.4, z);
      }
    }
    // Moonlight windows (high on the side walls).
    for (const z of [-1, 3, 7]) {
      for (const side of [-1, 1]) {
        const w = this.put(CreatePlane('mWin', { width: 1, height: 0.9 }, s), n, mat(s, '#3a7aa8', { glow: 0.8 }), side * 7.34, 4.1, z);
        w.rotation.y = side * (Math.PI / 2);
      }
    }
    // Ceiling hole glow under the portal.
    this.sets.set('logo', n);
  }

  private buildHorse(): { root: TransformNode; body: TransformNode; legs: TransformNode[]; head: TransformNode; tail: TransformNode } {
    const k = new Kit(this.scene, 'loreHorse');
    const COAT = '#7a4a2a';
    const MANE = '#2a1a12';
    const root = k.node('root', this.sets.get('ilocos')!);
    const body = k.node('body', root, 0, 0.78, 0);
    const torso = k.sphere(body, COAT, 0.7, 14);
    torso.scaling.set(0.8, 0.85, 1.75);
    const neck = k.node('neck', body, 0, 0.18, 0.5);
    neck.rotation.x = -0.6;
    k.cyl(neck, COAT, 0.55, 0.22, 0.3, 10).position.y = 0.25;
    const head = k.node('head', neck, 0, 0.5, 0.05);
    const skull = k.box(head, COAT, 0.24, 0.24, 0.5);
    skull.position.z = 0.15;
    skull.rotation.x = 0.7;
    k.box(head, MANE, 0.06, 0.4, 0.2).position.set(0, -0.12, -0.1);
    for (const x of [-0.07, 0.07]) {
      const ear = k.cyl(head, COAT, 0.12, 0.0, 0.06, 6);
      ear.position.set(x, 0.18, -0.02);
    }
    // Saddle blanket in a woven Ilocano-inspired stripe (generic, not a specific textile).
    const sad = k.box(body, '#c8202b', 0.62, 0.05, 0.5);
    sad.position.y = 0.3;
    k.box(body, '#f2c14e', 0.63, 0.052, 0.08).position.set(0, 0.302, 0.08);
    const legs: TransformNode[] = [];
    for (const [x, z] of [
      [-0.17, 0.42],
      [0.17, 0.42],
      [-0.17, -0.42],
      [0.17, -0.42],
    ] as const) {
      const pivot = k.node('leg', body, x, -0.1, z);
      const l = k.cyl(pivot, COAT, 0.62, 0.1, 0.13, 8);
      l.position.y = -0.31;
      const hoof = k.cyl(pivot, '#2a1a12', 0.08, 0.13, 0.13, 8);
      hoof.position.y = -0.64;
      legs.push(pivot);
    }
    const tail = k.node('tail', body, 0, 0.1, -0.6);
    tail.rotation.x = 0.5;
    k.cyl(tail, MANE, 0.5, 0.05, 0.12, 8).position.y = -0.25;
    return { root, body, legs, head, tail };
  }

  private buildPortal(): { root: TransformNode; face: Mesh; ring: Mesh; rim: Mesh } {
    const s = this.scene;
    const root = new TransformNode('lorePortal', s);
    const fm = new StandardMaterial('lorePortalFace', s);
    fm.diffuseTexture = vortexTexture(s);
    fm.diffuseTexture.hasAlpha = true;
    fm.useAlphaFromDiffuseTexture = true;
    fm.emissiveColor = Color3.White();
    fm.disableLighting = true;
    fm.backFaceCulling = false;
    const face = this.put(CreateDisc('portalFace', { radius: 1.1, tessellation: 40 }, s), root as TransformNode, fm);
    // Gold ring wrapped in a banig weave band.
    const band = floorTiles(s, '#f2c14e', '#c2338f', 21, 'banig');
    band.uScale = 8;
    const bm = new StandardMaterial('lorePortalBand', s);
    bm.diffuseTexture = band;
    bm.emissiveColor = new Color3(0.6, 0.45, 0.3);
    const ring = this.put(CreateTorus('portalRing', { diameter: 2.25, thickness: 0.16, tessellation: 40 }, s), root, bm);
    ring.rotation.x = Math.PI / 2;
    const rim = this.put(CreateTorus('portalRim', { diameter: 2.45, thickness: 0.05, tessellation: 40 }, s), root, mat(s, '#fff1c4', { glow: 1 }));
    rim.rotation.x = Math.PI / 2;
    root.setEnabled(false);
    return { root, face, ring, rim };
  }

  // ───────────────────────── direction ─────────────────────────

  private enterSet(set: LoreSet): void {
    const node = set === 'logo' ? this.sets.get('museum') : this.sets.get(set);
    for (const [k, n] of this.sets) if (k !== 'logo') n.setEnabled(n === node);
    this.set = set;
    const p = LORE.palette[set];
    const sky = Color3.FromHexString(p.sky);
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogMode = set === 'tunnel' || set === 'museum' || set === 'logo' ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    this.scene.fogColor = sky;
    this.scene.fogDensity = set === 'tunnel' ? 0.035 : 0.03;
    this.hemi.diffuse = Color3.FromHexString(p.light);
    this.hemi.groundColor = Color3.FromHexString(p.ground);
    this.hemi.intensity = p.amb;
    this.key.diffuse = Color3.FromHexString(p.light);
    this.key.intensity = set === 'manila' ? 0.15 : set === 'museum' || set === 'logo' ? 0.35 : 0.6;
    this.lamp.intensity = set === 'manila' ? 1.4 : 0;
    this.flashlight.intensity = 0;
    this.guard.beam.setEnabled(false);
    this.portal.root.setEnabled(false);
    this.crack.setEnabled(false);
    for (const b of this.bits) b.mesh.setEnabled(false);
    for (const b of this.sparks) b.mesh.setEnabled(false);
    for (const c of this.coins) c.mesh.setEnabled(false);
    for (const a of this.actors.values()) a.holder.setEnabled(false);
    this.horse.root.setEnabled(set === 'ilocos');
    this.frozen = false;
  }

  /** The timeline jumped to a new scene. */
  enter(sceneId: string, set: LoreSet): void {
    this.sceneId = sceneId;
    if (set !== this.set || sceneId === 'guard' || sceneId === 'logo') this.enterSet(set);
    // Reset the vignette props so a replay (or a seek back) starts clean.
    if (this.pen) {
      this.pen.position.set(0.2, 0.7, 0.5);
      this.pen.setEnabled(true);
    }
    for (const p of this.papers) p.setEnabled(true);
  }

  private actor(id: HeroId, set: LoreSet, x: number, y: number, z: number, ry: number): Actor {
    const a = this.actors.get(id)!;
    const node = this.sets.get(set === 'logo' ? 'museum' : set)!;
    if (a.holder.parent !== node) a.holder.parent = node;
    a.holder.setEnabled(true);
    a.holder.position.set(x, y, z);
    a.holder.rotation.set(0, ry, 0);
    a.holder.scaling.setAll(1);
    a.speed = 0;
    return a;
  }

  private pose(a: Actor, s: AnimState): void {
    if (a.anim !== s) {
      a.anim = s;
      a.animator.setState(s);
    }
  }

  /** Portal open amount 0..1 in a vignette (eased with a small overshoot). */
  private portalOpen(L: number): number {
    if (L < VIGNETTE.open) return 0;
    if (L >= VIGNETTE.flash) return clamp(1 - (L - VIGNETTE.flash) / (VIGNETTE.close - VIGNETTE.flash), 0, 1);
    return ease('back', (L - VIGNETTE.open) / 0.6);
  }

  private placePortal(set: LoreSet, at: Vector3, open: number, faceDown = false): void {
    const p = this.portal;
    p.root.parent = this.sets.get(set === 'logo' ? 'museum' : set)!;
    p.root.position.copyFrom(at);
    p.root.setEnabled(open > 0.001);
    p.root.scaling.setAll(Math.max(0.001, open));
    p.root.rotation.set(faceDown ? Math.PI / 2 : 0, 0, 0);
    p.face.rotation.z = -this.time * 3.2;
    p.rim.scaling.setAll(1 + Math.sin(this.time * 9) * 0.03);
    this.portalLight.parent = p.root.parent;
    this.portalLight.position.copyFrom(at);
    this.portalLight.intensity = open * 1.6;
  }

  /** Wind particles (papers / leaves) spiralling into the portal. */
  private suck(set: LoreSet, L: number, from: number, to: number, origin: Vector3): void {
    const parent = this.sets.get(set)!;
    const live = L >= from && L < to;
    for (const [i, b] of this.bits.entries()) {
      b.mesh.setEnabled(live);
      if (!live) continue;
      b.mesh.parent = parent;
      const period = 0.9 + b.seed * 0.7;
      const k = (((L - from) / period + b.seed * 3) % 1 + 1) % 1;
      const ang = b.seed * 40 + k * 7;
      const r = (1 - k) * (1.2 + b.seed * 1.5);
      const sx = origin.x + Math.cos(b.seed * 31) * (1.5 + b.seed);
      const sz = origin.z - 0.5 - b.seed * 1.5;
      b.mesh.position.set(lerp(sx, PORTAL_AT[0], k) + Math.cos(ang) * r * 0.4, lerp(0.2 + b.seed * 1.2, PORTAL_AT[1], k) + Math.sin(ang) * r * 0.3, lerp(sz, PORTAL_AT[2], k));
      b.mesh.rotation.set(ang, ang * 0.7, i);
      b.mesh.scaling.setAll(1 - k * 0.7);
    }
  }

  private vignette(L: number): void {
    const set = this.set;
    const id = VIGNETTE_HERO[set]!;
    const V = VIGNETTE;
    const reduced = this.opts.reduced;
    let x = 0;
    let y = 0;
    let z = 0;
    // Gabriela rides in on horseback; the horse rears and bolts when the portal opens.
    if (set === 'ilocos') {
      const h = this.horse;
      const arrive = ease('out', clamp(L / V.crack, 0, 1));
      const bolt = clamp((L - (V.open + 0.9)) / 1.4, 0, 1);
      h.root.position.set(0, 0, lerp(-3, 0, arrive) - ease('inOut', bolt) * 3.5);
      h.root.rotation.y = bolt * 2.6;
      const rear = L > V.open + 0.3 ? Math.sin(clamp((L - V.open - 0.3) / 1.0, 0, 1) * Math.PI) : 0;
      h.body.rotation.x = -rear * 0.55;
      h.body.position.y = 0.78 + rear * 0.25;
      const trot = L < V.crack + 0.3 || bolt > 0 ? 1 : 0.1;
      for (const [i, leg] of h.legs.entries()) leg.rotation.x = Math.sin(this.time * 9 + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 * trot - (i < 2 ? rear * 0.9 : 0);
      h.tail.rotation.x = 0.5 + Math.sin(this.time * 5) * 0.2;
      h.head.rotation.x = Math.sin(this.time * 3) * 0.1 - rear * 0.4;
      z = lerp(-3, 0, arrive);
      y = 1.05;
      // Lifted off the saddle as the horse backs away.
      if (L >= V.resist) {
        const lift = ease('inOut', clamp((L - V.resist) / 1.2, 0, 1));
        y = lerp(1.05 + rear * 0.25, 1.35, lift);
      }
    }
    const a = this.actor(id, set, x, y, z, 0);
    // Calm activity → startle → resist → wind-up → sipped (anticipation, then the pull wins).
    let state: AnimState = set === 'mactan' ? 'idle' : set === 'ilocos' ? 'ride' : set === 'dapitan' ? 'sitWrite' : 'write';
    if (L >= V.startle && set !== 'ilocos') state = 'startle';
    if (set === 'dapitan' && L >= V.open + 0.25) state = 'reach';
    if (L >= V.resist) state = set === 'mactan' ? 'brace' : set === 'ilocos' ? 'brace' : set === 'dapitan' ? 'reach' : 'cling';
    if (L >= V.sip) state = 'tumble';
    this.pose(a, state);
    if (set === 'mactan' && L < V.startle) a.rig.head.rotation.y = Math.sin(this.time * 0.6) * 0.4;

    // Pull: slide toward the portal while resisting (Lapu-Lapu's feet dig into the sand).
    const pull = L >= V.resist ? ease('inOut', clamp((L - V.resist) / (V.windup - V.resist), 0, 1)) : 0;
    const shakeAmt = reduced ? 0 : 0.02;
    a.holder.position.z += pull * (set === 'manila' ? 0.15 : 0.4) + Math.sin(this.time * 37) * shakeAmt * pull;
    a.holder.position.x += Math.sin(this.time * 29) * shakeAmt * pull;
    if (set === 'manila') a.holder.rotation.x = pull * 0.5; // stretched out toward the portal, hands on the post
    // Anticipation: a lean back before the pull wins.
    if (L >= V.windup && L < V.sip) a.holder.rotation.x = (set === 'manila' ? 0.5 : 0) - ease('out', (L - V.windup) / (V.sip - V.windup)) * 0.35;
    // Sipped: arc up into the portal, stretch toward it (squash & stretch), shrink, spin.
    if (L >= V.sip) {
      const k = clamp((L - V.sip) / V.sipDur, 0, 1);
      const e = ease('inOut', k);
      const sx = a.holder.position.x;
      const sy = a.holder.position.y;
      const sz = a.holder.position.z;
      a.holder.position.set(lerp(sx, PORTAL_AT[0], e), lerp(sy, PORTAL_AT[1] - 0.9, e) + Math.sin(e * Math.PI) * 0.6, lerp(sz, PORTAL_AT[2], e));
      a.holder.rotation.set(-1.2 * e, 0, e * 6);
      const st = Math.sin(k * Math.PI) * 0.35;
      const shrink = 1 - e * 0.95;
      a.holder.scaling.set((1 - st * 0.4) * shrink, (1 + st) * shrink, (1 - st * 0.4) * shrink);
      a.holder.setEnabled(k < 1);
    }

    // Rizal's pen and the papers fly in first.
    if (set === 'dapitan' && this.pen) {
      const k = clamp((L - V.open) / 0.55, 0, 1);
      this.pen.position.set(lerp(0.2, PORTAL_AT[0], ease('inOut', k)), lerp(0.7, PORTAL_AT[1], ease('inOut', k)) + Math.sin(k * Math.PI) * 0.4, lerp(0.5, PORTAL_AT[2], ease('inOut', k)));
      this.pen.rotation.z = 1.2 + k * 12;
      this.pen.setEnabled(k < 1);
    }
    for (const [i, p] of this.papers.entries()) {
      if (p.parent !== this.sets.get(set)) continue;
      const k = clamp((L - V.open - 0.15 - i * 0.12) / 0.7, 0, 1);
      p.setEnabled(k < 1);
    }
    if (set === 'manila' && this.lampMesh) {
      // Lamp flickers as the crack appears (unless Reduced effects).
      const flick = L > V.crack && !reduced ? 0.6 + Math.abs(Math.sin(this.time * 23) * Math.sin(this.time * 7)) * 0.6 : 1;
      this.lamp.intensity = 1.4 * flick;
      this.lampMesh.visibility = 0.7 + 0.3 * flick;
    }

    // Crack → portal.
    const crackOn = L >= V.crack && L < V.open + 0.2;
    this.crack.parent = this.sets.get(set)!;
    this.crack.setEnabled(crackOn);
    if (crackOn) {
      const g = ease('out', clamp((L - V.crack) / 0.6, 0, 1));
      this.crack.scaling.set(1 + (reduced ? 0 : Math.sin(this.time * 40) * 0.15), g, 1);
      this.crack.rotation.y = 0;
    }
    this.placePortal(set, new Vector3(...PORTAL_AT), this.portalOpen(L));
    this.suck(set, L, V.open + 0.2, V.flash, a.holder.position);
    if (L >= V.sip + V.sipDur - 0.1 && L < V.sip + V.sipDur) this.shake = 0.25;
  }

  private tunnel(L: number): void {
    if (this.tunnelTex) this.tunnelTex.vOffset = -this.time * 1.6;
    const ids = HEROES;
    for (const [i, id] of ids.entries()) {
      const a = this.actor(id, 'tunnel', 0, 0, 0, 0);
      const ph = i * 1.7;
      const bump = clamp((L - 2.3) / 0.5, 0, 1) * (1 - clamp((L - 3.6) / 0.4, 0, 1));
      const away = ease('inOut', clamp((L - 4.1) / 1.8, 0, 1));
      const bx = (i % 2 ? 0.75 : -0.75) * (1 - bump * 0.62);
      const by = (i < 2 ? 0.45 : -0.45) * (1 - bump * 0.55);
      a.holder.position.set(bx + Math.sin(this.time * 1.3 + ph) * 0.2, by + Math.cos(this.time * 1.1 + ph) * 0.2, i * 0.35 + away * 14);
      a.holder.rotation.set(this.time * (0.8 + i * 0.3) * (1 - bump), ph + this.time * 0.5 * (1 - bump) + (bump > 0.5 ? (i % 2 ? -0.9 : 0.9) : 0), this.time * (1.1 - i * 0.2) * (1 - bump));
      a.holder.position.y -= 0.9;
      this.pose(a, bump > 0.5 ? 'startle' : 'tumble');
    }
    const live = true;
    for (const b of this.sparks) {
      b.mesh.setEnabled(live);
      b.mesh.parent = this.sets.get('tunnel')!;
      const z = ((b.seed * 40 - this.time * 14) % 40 + 40) % 40 - 6;
      const ang = b.seed * 90;
      b.mesh.position.set(Math.cos(ang) * (1.4 + b.seed * 2.2), Math.sin(ang) * (1.4 + b.seed * 2.2), z);
      b.mesh.scaling.set(1, 1, 4);
    }
    if (this.tunnelEnd) this.tunnelEnd.scaling.setAll(0.4 + ease('inOut', clamp((L - 3.8) / 2.2, 0, 1)) * 0.8);
  }

  private museum(L: number): void {
    // Ceiling portal opens, the four heroes drop in a pile, coins scatter, they sit up dazed.
    const open = L < 0.6 ? 0 : L < 2.6 ? ease('back', (L - 0.6) / 0.6) : clamp(1 - (L - 2.6) / 0.5, 0, 1);
    this.placePortal('museum', new Vector3(0, 4.6, 0.2), open, true);
    for (const [i, id] of HEROES.entries()) {
      const [px, pz] = PILE[id];
      const fallStart = 1.5 + i * 0.08;
      const k = clamp((L - fallStart) / 0.5, 0, 1);
      const yy = L < fallStart ? 99 : (1 - k * k) * 4.2;
      const a = this.actor(id, 'museum', px, yy, pz, Math.PI + (i - 1.5) * 0.45);
      a.holder.setEnabled(L >= fallStart);
      if (k < 1) {
        this.pose(a, 'fall');
        a.holder.rotation.z = (1 - k) * (i % 2 ? 2 : -2);
        a.holder.rotation.y = Math.PI + (i - 1.5) * 0.45;
      } else if (L < 2.6 + i * 0.1) this.pose(a, 'land');
      else this.pose(a, 'sitUp');
      if (L >= 3.4 && id === 'bonifacio') a.rig.head.rotation.y = Math.sin(this.time * 2.2) * 0.5;
    }
    if (L >= 2.05 && L < 2.15) this.shake = 0.28;
    const ct = L - 2.1;
    for (const [i, c] of this.coins.entries()) {
      c.mesh.setEnabled(ct > 0);
      if (ct <= 0) continue;
      const ang = (i / this.coins.length) * Math.PI * 2 + c.seed;
      const dist = clamp(ct / 0.8, 0, 1) * (1.2 + c.seed * 1.6);
      const hop = Math.max(0, Math.sin(clamp(ct / 0.8, 0, 1) * Math.PI)) * (0.9 + c.seed * 0.5);
      c.mesh.position.set(Math.cos(ang) * dist, 0.03 + hop, 0.2 + Math.sin(ang) * dist);
      c.mesh.rotation.set(ct * 12 * (1 - clamp(ct / 0.8, 0, 1)) + Math.PI / 2 * clamp(ct / 0.8, 0, 1), ang, 0);
    }
    this.placeGuard(L < 0 ? 0 : -1);
  }

  /** Guard + dog + multo. `L` < 0 hides them (before the guard scene). */
  private placeGuard(L: number): void {
    const g = this.guard;
    const on = L >= 0;
    g.holder.setEnabled(on);
    this.dog.root.setEnabled(on);
    this.multo.root.setEnabled(on && L > 2.5);
    g.beam.setEnabled(on);
    this.flashlight.intensity = on ? 1.6 : 0;
    if (!on) return;
    const chase = this.sceneId === 'logo' ? 1.5 + L : clamp(L - 4.0, 0, 2);
    g.holder.position.set(GUARD_AT.x, 0, GUARD_AT.z - chase * 2.4);
    g.holder.rotation.y = Math.PI;
    if (chase > 0) {
      g.animator.setState('locomotion');
      if (!this.frozen) g.animator.update(1 / 60, 3.2, 4);
    } else {
      g.animator.setState(L > 0.25 ? 'point' : 'idle');
    }
    // Torch beam from the hand toward the pile (narrow end at the torch).
    const from = new Vector3(GUARD_AT.x + 0.25, 1.25, g.holder.position.z - 0.3);
    const to = new Vector3(0, 0.3, 0.2);
    const dir = to.subtract(from);
    const len = dir.length();
    g.pivot.position.copyFrom(from);
    g.pivot.lookAt(to);
    g.beam.position.set(0, 0, len / 2);
    g.beam.scaling.set(1, len / 7, 1);
    (g.beam.material as StandardMaterial).alpha = 0.1 + (this.opts.reduced ? 0 : Math.sin(this.time * 17) * 0.015);
    this.flashlight.position.copyFrom(from);
    this.flashlight.direction.copyFrom(dir.normalize());
    // Dog: barks (head bob) beside the guard, then gives chase.
    const d = this.dog;
    d.root.position.set(1.1, 0, GUARD_AT.z - 0.4 - chase * 2.6);
    d.root.rotation.y = Math.PI;
    const bark = L > 2.4 && L < 3.2 ? Math.abs(Math.sin(this.time * 18)) : 0;
    d.head.rotation.x = -bark * 0.35;
    d.tail.rotation.z = Math.sin(this.time * 14) * 0.5;
    for (const [i, leg] of d.legs.entries()) leg.rotation.x = chase > 0 ? Math.sin(this.time * 14 + (i % 2) * Math.PI) * 0.7 : 0;
    // Multo drifts across the back of the hall.
    const mt = clamp((L - 2.5) / 3, 0, 1);
    this.multo.root.position.set(lerp(-5, 5, mt), 0.3 + Math.sin(this.time * 2) * 0.12, 5);
    this.multo.root.rotation.y = -Math.PI / 2;
    for (const m of this.multo.meshes) m.visibility = 0.55 * Math.sin(mt * Math.PI);
  }

  private guardScene(L: number): void {
    this.placePortal('museum', new Vector3(0, 4.6, 0.2), 0, true);
    for (const [i, id] of HEROES.entries()) {
      const [px, pz] = PILE[id];
      const run = clamp(L - 3.6, 0, 2);
      const dir = RUN_DIR[id];
      const a = this.actor(id, 'museum', px + Math.sin(dir) * run * 2.2, 0, pz - Math.cos(dir) * run * 2.2, run > 0 ? Math.PI + dir : (i - 1.5) * 0.25);
      if (run > 0) {
        this.pose(a, 'locomotion');
        a.speed = 4.2;
      } else if (L >= 3.3) this.pose(a, 'startle');
      else this.pose(a, 'sitUp');
      if (L < 3.3) a.rig.head.rotation.y = 0;
    }
    this.placeGuard(L);
  }

  private logo(L: number): void {
    this.frozen = L >= LORE.logoAt;
    const tt = Math.min(L, LORE.logoAt);
    for (const [i, id] of HEROES.entries()) {
      const dir = RUN_DIR[id] * 0.5;
      const a = this.actor(id, 'logo', (i - 1.5) * 0.85 + Math.sin(dir) * tt * 2, i % 2 ? 0.0 : 0.05, 1.2 - tt * 2.6 + (i % 2) * 0.4, Math.PI + dir);
      this.pose(a, 'locomotion');
      a.speed = this.frozen ? 0 : 4.2;
      // Freeze-frame pose: mid-stride, a little hop.
      if (this.frozen) a.holder.position.y = 0.12;
    }
    this.placeGuard(tt);
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number, tl: LoreTimeline): void {
    this.time += dt;
    const s = tl.scene;
    if (s.id !== this.sceneId) this.enter(s.id, s.set);
    const L = tl.local;
    switch (s.set) {
      case 'mactan':
      case 'ilocos':
      case 'dapitan':
      case 'manila':
        this.vignette(L);
        break;
      case 'tunnel':
        this.tunnel(L);
        break;
      case 'museum':
        if (s.id === 'guard') this.guardScene(L);
        else this.museum(L);
        break;
      case 'logo':
        this.logo(L);
        break;
      default:
        break;
    }
    if (!this.frozen) {
      for (const a of this.actors.values()) if (a.holder.isEnabled()) a.animator.update(dt, a.speed, 4);
      if (this.guard.holder.isEnabled() && this.guard.animator.current !== 'locomotion') this.guard.animator.update(dt, 0, 4);
    }

    // Camera: eased shot pose, pulled back on portrait screens, short shake on impacts.
    const { pos, tgt, fov, pull: maxPull } = tl.camPose();
    const aspect = this.scene.getEngine().getAspectRatio(this.camera);
    const portrait = clamp((1.3 - aspect) / 0.75, 0, 1);
    const pull = 1 + portrait * maxPull;
    let cx = tgt[0] + (pos[0] - tgt[0]) * pull;
    let cy = tgt[1] + (pos[1] - tgt[1]) * pull;
    let cz = tgt[2] + (pos[2] - tgt[2]) * pull;
    if (this.shake > 0 && !this.opts.reduced) {
      const m = this.shake * 0.12;
      cx += (Math.random() - 0.5) * m;
      cy += (Math.random() - 0.5) * m;
      cz += (Math.random() - 0.5) * m;
    }
    this.shake = Math.max(0, this.shake - dt);
    this.camera.position.set(cx, cy, cz);
    this.camera.setTarget(new Vector3(tgt[0], tgt[1], tgt[2]));
    // Shots that can't pull back (walls) widen the lens a little more on portrait instead.
    this.camera.fov = fov * (1 + portrait * (0.12 + (LORE.portraitPull - maxPull) * 0.5));
  }

  dispose(): void {
    this.glow?.dispose();
    this.scene.dispose();
  }
}
