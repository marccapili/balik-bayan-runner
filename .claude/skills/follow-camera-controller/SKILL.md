---
name: follow-camera-controller
description: Use when changing the elevated follow camera — framing, smoothing, look-ahead, shake, wall fading, intro camera moves.
---
# Follow camera controller

## When to use
Camera feels laggy/snappy, hero hidden by walls, portrait framing, cinematic intro moves, damage shake.

## Procedure
1. Tuning lives in `CAMERA_CONFIG` (`data/config.ts`): pitch 45–55°, distance, followSharpness, lookAhead.
2. Pure math in `camera/cameraMath.ts` is unit-tested; keep new math there.
3. Smoothing must be `damp(sharpness, dt)`; test at 30 and 144 fps.
4. Snap (`snapTo`) on spawn/replay so the camera never swoops from the old position.
5. Occlusion: anything tall between camera and hero registers an occluder `{box, height, meshes}`; materials must be `dynamic`.
6. Shake via `shake(strength, duration)` — keep ≤ 0.4 strength; respect the reduced-effects setting once it exists (M7).

## Standards
- Fixed orientation (no player rotation) — screen-up always equals +z so controls never flip.
- Hero stays near screen centre; look-ahead ≤ 2 units.

## Common failures
- Portrait phones: horizontal FOV collapses → `fovForAspect` widens; don't push minHorizontalFov above ~32° or perspective distorts.
- Merged meshes can't fade — keep occluders as separate meshes.

## Verify
Unit tests (`tests/unit/core.test.ts` camera section) + e2e screenshot where the hero walks behind a wall (`desktop-north.png`).
