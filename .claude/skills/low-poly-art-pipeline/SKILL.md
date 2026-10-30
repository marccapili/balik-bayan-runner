---
name: low-poly-art-pipeline
description: Use when creating or restyling 3D props, heroes or enemies (procedural now, GLB later) so art stays consistent.
---
# Low-poly art pipeline

## When to use
New prop/enemy/hero/skin, colour palette changes, replacing procedural models with GLB.

## Procedure (procedural)
1. Block the silhouette first from the top-down game camera (52°, ~14 units). If it doesn't read at 80 px tall, simplify.
2. Use few segments: spheres 8–16, cylinders 6–14. Flat-shade organic props (`convertToFlatShadedMesh`) for faceted look.
3. Colour from the palette: midnight `#0f1430`, royal `#1f2d6b`, gold `#f2c14e`/`#c48a2c`, flag red `#c8202b`, flag blue `#1f3c9e`, cream `#fff6df`. Per-gallery colours live in `ROOMS`.
4. Glow (`emissive` via `glow`) ≤ 0.35 for normal surfaces; 0.5–1.0 only for things that should pop (coins, eyes, fireflies).
5. Render `node tests/e2e/showcase.mjs` and compare against the character sheets in the project uploads.

## GLB replacement
- Export glTF 2.0, Y-up, metres, origin at feet, facing +Z, ≤ 5k tris per hero, one 512² atlas.
- Name nodes like `HeroRig` (root, body, hips, torso, head, legL, legR, armL, armR) so `HeroAnimator` keeps working; or ship skeletal animation groups and add a GLB animator.
- Record the source + license in `docs/ASSETS.md` before committing.

## Common failures
- Gold looks lemon-yellow: too much glow + both lights. Use `#c48a2c` and glow ≤ 0.3.
- Faces hidden under hair cap: check `buildHair` cap rotation/position.
- Real people's likenesses in portraits: keep them generic silhouettes.

## Verify
Showcase screenshots (front + game view) look like the sheets; nothing clips through the head/body.
