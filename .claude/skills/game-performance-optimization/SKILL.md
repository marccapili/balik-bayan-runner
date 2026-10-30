---
name: game-performance-optimization
description: Use when the game stutters, draw calls/meshes grow, phones heat up, or before marking a milestone done.
---
# Game performance optimisation

## When to use
Adding many objects, particles, enemies; slow phones; before each milestone report.

## Procedure
1. Measure first: open with `?debug` (FPS) on a real phone; in code use `SceneInstrumentation` for draw calls/frame time. Headless Chromium is CPU-rendered (~10 fps) — never quote it as game performance.
2. Static geometry: merge per material (MuseumBuilder does this). Repeated dynamic things (coins, particles): thin instances or pooled meshes.
3. Materials: cached + frozen; one StandardMaterial per colour; avoid per-object material clones.
4. Pixel ratio capped at 2 (`RENDER_CONFIG`); offer a low-quality toggle at 1.
5. AI: stagger path requests; update far enemies at lower rate.
6. Pool coins/effects/enemies; never create meshes inside the per-frame update.
7. Dispose scenes, textures and observers on scene switch.

## Budgets (phone)
≤ 150 draw calls, ≤ 120k triangles, ≤ 8 active enemies, ≤ 300 particles.

## Common failures
- Creating Vector3 every frame in hot loops (GC spikes) — reuse temporaries.
- DynamicTexture.update() every frame.
- Transparent (alpha) meshes overlapping → sort cost and overdraw.

## Verify
Record real-device FPS in `docs/CHANGELOG.md` with device model; note anything below 50 fps as a known issue.
