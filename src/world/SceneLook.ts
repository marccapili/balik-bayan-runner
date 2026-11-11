import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { LOOK } from '../data/config';

/**
 * Colour grade shared by every 3D scene: a touch more contrast and a soft vignette so the frame
 * reads as "shot", not raw. It runs inside the material shaders (no post-process pass), so it costs
 * almost nothing on phones. Call before the first frame: frozen materials compile only once.
 */
export function applyGrade(scene: Scene): void {
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = false;
  ip.contrast = LOOK.contrast;
  ip.exposure = LOOK.exposure;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = LOOK.vignetteWeight;
  ip.vignetteStretch = 0.2;
  ip.vignetteColor = Color4.FromHexString(`${LOOK.vignetteColor}ff`);
  ip.vignetteBlendMode = 0; // multiply
}

/** The key light's travel direction, normalised. */
export function keyDirection(): Vector3 {
  return new Vector3(LOOK.keyDirection.x, LOOK.keyDirection.y, LOOK.keyDirection.z).normalize();
}

/**
 * Sun shadows for a static world. The shadow map is drawn ONCE (after a short warm-up) (the museum never moves) and then
 * only sampled, so walls, pedestals and benches sit on the floor at the cost of one texture read.
 * Characters keep their blob shadows, which follow them for free.
 */
export class BakedShadows {
  private readonly gen: ShadowGenerator;
  private readonly receivers: AbstractMesh[] = [];
  private on = true;

  constructor(
    private readonly scene: Scene,
    private readonly light: DirectionalLight,
    centre: { x: number; z: number },
  ) {
    light.position = new Vector3(centre.x, 0, centre.z).subtract(keyDirection().scale(60));
    light.shadowMinZ = 15;
    light.shadowMaxZ = 105;
    const gen = (this.gen = new ShadowGenerator(LOOK.shadowMapSize, light));
    // Percentage-closer filtering: soft edges from the GPU's own depth compare (WebGL2), and no
    // blur passes that would have to be ready before a one-off bake.
    gen.usePercentageCloserFiltering = true;
    gen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    gen.setDarkness(LOOK.shadowDarkness);
    gen.bias = 0.0015;
    gen.normalBias = 0.02;
    this.bake();
  }

  /** Draws the map for a few frames (shaders compile lazily), then freezes it for good. */
  private bake(): void {
    const map = this.gen.getShadowMap();
    if (!map) return;
    map.refreshRate = 1;
    let frames = 0;
    const obs = this.scene.onAfterRenderObservable.add(() => {
      if (!this.on || ++frames < LOOK.shadowBakeFrames) return;
      map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      this.scene.onAfterRenderObservable.remove(obs);
    });
  }

  addCasters(meshes: readonly AbstractMesh[]): void {
    for (const m of meshes) this.gen.addShadowCaster(m, false);
  }

  addReceivers(meshes: readonly AbstractMesh[]): void {
    for (const m of meshes) {
      m.receiveShadows = this.on;
      this.receivers.push(m);
    }
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Quality switch. Frozen materials are re-checked once so they pick up (or drop) the shadow code. */
  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.light.shadowEnabled = on;
    for (const m of this.receivers) m.receiveShadows = on;
    for (const m of this.scene.materials) {
      if (!m.isFrozen) continue;
      m.unfreeze();
      m.freeze();
    }
    if (on) this.bake();
  }

  dispose(): void {
    this.gen.dispose();
  }
}
