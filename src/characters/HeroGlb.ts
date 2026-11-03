import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { HERO_MODELS, type HeroModelDef } from '../data/heroModels';
import type { HeroId } from '../data/heroes';
import { autoSkin, SKIN_BONES } from './autoSkin';
import { parseGlb } from './glb';
import type { HeroRig } from './HeroModel';

interface Loaded {
  def: HeroModelDef;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  skinIndices: Float32Array;
  skinWeights: Float32Array;
  imageUrl: string | null;
}

const cache = new Map<HeroId, Loaded>();

/**
 * Fetches and prepares every hero GLB listed in `data/heroModels.ts`. A model that fails to load
 * is skipped (the hero keeps its procedural look), so a bad file can never block the game.
 */
export async function preloadHeroModels(): Promise<void> {
  const jobs = Object.entries(HERO_MODELS).map(async ([id, def]) => {
    if (!def || cache.has(id as HeroId)) return;
    try {
      const res = await fetch(def.url);
      if (!res.ok) throw new Error(`${res.status} ${def.url}`);
      const g = parseGlb(await res.arrayBuffer());
      // Scale to rig units here so every scene can build the mesh instantly.
      const positions = g.positions.map((v) => v * def.height);
      const normals = new Float32Array(positions.length);
      VertexData.ComputeNormals(positions, g.indices, normals);
      const skin = autoSkin(g.positions, g.indices, def);
      const imageUrl = g.image ? URL.createObjectURL(new Blob([g.image.bytes as BlobPart], { type: g.image.mime })) : null;
      cache.set(id as HeroId, { def, positions, uvs: g.uvs, indices: g.indices, normals, skinIndices: skin.indices, skinWeights: skin.weights, imageUrl });
    } catch (e) {
      console.warn('Hero model skipped:', id, e);
    }
  });
  await Promise.all(jobs);
}

export function hasHeroModel(id: HeroId): boolean {
  return cache.has(id);
}

const materials = new WeakMap<Scene, Map<HeroId, StandardMaterial>>();

function material(scene: Scene, id: HeroId, m: Loaded): StandardMaterial {
  let perScene = materials.get(scene);
  if (!perScene) materials.set(scene, (perScene = new Map()));
  let mat = perScene.get(id);
  if (!mat) {
    mat = new StandardMaterial(`heroGlb_${id}`, scene);
    if (m.imageUrl) {
      // glTF UVs have v pointing down, so don't flip the image.
      const tex = new Texture(m.imageUrl, scene, { invertY: false, samplingMode: Texture.TRILINEAR_SAMPLINGMODE });
      mat.diffuseTexture = tex;
      mat.emissiveTexture = tex;
    }
    mat.emissiveColor = new Color3(m.def.emissive, m.def.emissive, m.def.emissive);
    mat.specularColor = new Color3(0.06, 0.06, 0.06);
    perScene.set(id, mat);
  }
  return mat;
}

/**
 * Builds a HeroRig from a cached GLB: the same node hierarchy as the procedural chibi
 * (so HeroAnimator, Player and the lobby work unchanged), with the sculpted mesh skinned to it.
 */
export function buildGlbHero(scene: Scene, id: HeroId): HeroRig {
  const m = cache.get(id);
  if (!m) throw new Error(`No model for ${id}`);
  const d = m.def;
  const H = d.height;
  const node = (name: string, parent: TransformNode | null, x = 0, y = 0, z = 0): TransformNode => {
    const t = new TransformNode(`${id}_${name}`, scene);
    t.parent = parent;
    t.position.set(x, y, z);
    return t;
  };
  const root = node('root', null);
  const body = node('body', root);
  const hips = node('hips', body, 0, d.hip * H, 0);
  const torso = node('torso', hips);
  const head = node('head', torso, 0, (d.neck - d.hip) * H, 0);
  const legL = node('legL', hips, -0.06 * H);
  const legR = node('legR', hips, 0.06 * H);
  const armL = node('armL', torso, -d.shoulder.x * H, (d.shoulder.y - d.hip) * H);
  const armR = node('armR', torso, d.shoulder.x * H, (d.shoulder.y - d.hip) * H);
  // Same resting arm angle the animator uses at idle, so the sculpted pose is the bind pose.
  armL.rotation.z = -0.16;
  armR.rotation.z = 0.16;

  const nodes: Record<(typeof SKIN_BONES)[number], TransformNode> = { body, hips, torso, head, legL, legR, armL, armR };
  const skeleton = new Skeleton(`${id}_skel`, `${id}_skel_${scene.getUniqueId()}`, scene);
  const bones = new Map<TransformNode, Bone>();
  for (const name of SKIN_BONES) {
    const n = nodes[name];
    const local = Matrix.Compose(n.scaling, Quaternion.FromEulerVector(n.rotation), n.position);
    const bone = new Bone(name, skeleton, (n.parent && bones.get(n.parent as TransformNode)) || null, local);
    bone.linkTransformNode(n);
    bones.set(n, bone);
  }

  const mesh = new Mesh(`${id}_glb`, scene);
  const vd = new VertexData();
  vd.positions = m.positions;
  vd.indices = m.indices;
  vd.normals = m.normals;
  vd.uvs = m.uvs;
  vd.matricesIndices = m.skinIndices;
  vd.matricesWeights = m.skinWeights;
  vd.applyToMesh(mesh);
  mesh.parent = root;
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 4;
  mesh.material = material(scene, id, m);
  mesh.isPickable = false;
  // Skinned bounds don't follow the pose; keep it from being culled while it moves.
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.metadata = { glb: true };

  // Disposing the root must take the skeleton too.
  root.onDisposeObservable.addOnce(() => skeleton.dispose());

  return { id, skin: `${id}.classic`, root, body, hips, torso, head, legL, legR, armL, armR, flutter: [], meshes: [mesh], armLimit: d.armLimit };
}

/** Mesh stats for the debug snapshot / e2e check. */
export function heroModelInfo(id: HeroId): { vertices: number; triangles: number } | null {
  const m = cache.get(id);
  return m ? { vertices: m.positions.length / 3, triangles: m.indices.length / 3 } : null;
}
