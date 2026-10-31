import type { Material } from '@babylonjs/core/Materials/material';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { EXHIBITS, type Exhibit } from '../data/exhibits';
import { mat } from './materials';

interface Marker {
  ex: Exhibit;
  node: TransformNode;
  gem: Mesh;
  ring: Mesh;
  known: boolean | null;
}

/**
 * Floating gems over every exhibit so players can spot them from the follow camera:
 * gold = not yet in the Archive, purple = folklore, pale blue = already discovered.
 * A floor ring lights up under the exhibit the hero can read right now.
 */
export class ExhibitMarkers {
  private readonly markers: Marker[] = [];
  private readonly mats: Record<'new' | 'folk' | 'known', Material>;
  private t = 0;

  constructor(scene: Scene) {
    this.mats = {
      new: mat(scene, '#ffae1a', { glow: 0.5, spec: 0.9, rim: 0.6 }),
      folk: mat(scene, '#a46bff', { glow: 0.5, spec: 0.9, rim: 0.6 }),
      known: mat(scene, '#7fc4ff', { glow: 0.35, spec: 0.6, rim: 0.4 }),
    };
    const ringMat = mat(scene, '#ffe9a8', { glow: 1, alpha: 0.7 });
    for (const ex of EXHIBITS) {
      const node = new TransformNode(`exhibit_${ex.id}`, scene);
      const at = ex.marker ?? ex.at;
      node.position.set(at.x, ex.markerY, at.z);
      const gem = CreatePolyhedron(`exGem_${ex.id}`, { type: 1, size: 0.3 }, scene);
      gem.parent = node;
      gem.scaling.y = 1.5;
      gem.isPickable = false;
      const ring = CreateTorus(`exRing_${ex.id}`, { diameter: ex.reach * 2 - 0.4, thickness: 0.07, tessellation: 64 }, scene);
      ring.position.set(ex.at.x, 0.05, ex.at.z);
      ring.scaling.y = 0.2;
      ring.material = ringMat;
      ring.isPickable = false;
      ring.setEnabled(false);
      this.markers.push({ ex, node, gem, ring, known: null });
    }
  }

  /** `near` = exhibit in reach (or null); `known(id)` = already in the Archive. */
  update(dt: number, near: Exhibit | null, known: (id: string) => boolean): void {
    this.t += dt;
    for (const m of this.markers) {
      const k = known(m.ex.id);
      if (k !== m.known) {
        m.known = k;
        m.gem.material = k ? this.mats.known : m.ex.kind === 'folklore' ? this.mats.folk : this.mats.new;
      }
      const active = near === m.ex;
      const phase = m.ex.at.x * 0.7 + m.ex.at.z;
      m.node.position.y = m.ex.markerY + Math.sin(this.t * 2.2 + phase) * 0.12;
      m.node.rotation.y = this.t * 1.4 + phase;
      m.node.scaling.setAll(active ? 1.35 + Math.sin(this.t * 8) * 0.1 : 1);
      m.ring.setEnabled(active);
      if (active) m.ring.rotation.y = this.t;
    }
  }

  dispose(): void {
    for (const m of this.markers) {
      m.node.dispose();
      m.ring.dispose();
    }
  }
}
