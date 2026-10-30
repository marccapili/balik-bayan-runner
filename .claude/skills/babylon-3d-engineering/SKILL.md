---
name: babylon-3d-engineering
description: Use when adding or changing Babylon.js scenes, meshes, lights, materials or the render loop in Balik Bayan Runner.
---
# Babylon 3D engineering (Balik Bayan Runner)

## When to use
New scene, new mesh/prop, lighting change, render-loop or engine setting change, disposal bugs.

## Procedure
1. Import from deep paths (`@babylonjs/core/Meshes/Builders/boxBuilder`) — never `import * as BABYLON`. Bundle size matters on phones.
2. Scenes implement `scenes/GameScene.ts` (`update(dt)`, `dispose()`); `Game.frame` owns the loop and the dt clamp.
3. Materials: `mat(scene, hex, opts)` from `world/materials.ts`. It caches and freezes. Use `{ dynamic: true }` when `mesh.visibility` will animate (camera-faded walls).
4. Static props: add through the `add()` helper in `MuseumBuilder` so they are merged per material; don't parent gameplay-moving meshes to merged groups.
5. Anything that moves: keep as a TransformNode hierarchy, never freeze its world matrix.
6. Dispose: scene-owned meshes go with `scene.dispose()`; DynamicTextures created outside a material must be tracked and disposed.

## Standards
- Coordinates: +x east/right, +z north/up-screen, y up. Yaw 0 faces +z; `Math.atan2(dx, dz)` gives yaw.
- 1 unit ≈ 1 m; hero ≈ 1.9 units tall after `HERO_SCALE`.
- Lights: one Hemispheric + one Directional. Adding point lights multiplies shader cost on every StandardMaterial.

## Common failures
- Frozen material + animated visibility → wall never fades. Use `dynamic`.
- `freezeWorldMatrix()` on spinning parts → they stop moving (see `spinners` exclusion).
- Plane faces −z by default; wall art `rotY` 0 faces the camera.

## Verify
`npm run build`, e2e smoke test, then inspect `tests/e2e/screenshots/*.png` for z-fighting, wrong facing, dark/blown-out colours.
