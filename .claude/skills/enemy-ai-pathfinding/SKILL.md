---
name: enemy-ai-pathfinding
description: Use when building enemy AI (guard, dog, multo, tikbalang), state machines, A* pathfinding or spawn logic.
---
# Enemy AI & pathfinding

## When to use
Any enemy behaviour, navigation, spawn placement, difficulty director work (M2, M5).

## Procedure
1. Navigation grid: rasterise `buildColliders()` (data/museumLayout) into a 0.5-unit grid, inflate by enemy radius. Build once per scene.
2. A* on the grid (8-connected, octile heuristic, no corner cutting), then string-pull/smooth the path. Re-path at most every 0.25–0.5 s per enemy, staggered.
3. Each enemy = pure logic class (state machine: e.g. guard Patrol→Alert→Chase→Search→Stunned) + a visual rig. Logic must be unit-testable without Babylon.
4. Move enemies with the same `CollisionWorld.move` as the player (multo may skip boxes flagged as passable).
5. Telegraph every big attack (dog dash, tikbalang charge) ≥ 0.6 s with a visible + audible warning.
6. Spawn: only on free cells ≥ 10 units from the player and not in the camera view; cap active enemies (data-driven).

## Standards
- All speeds, ranges, cooldowns in a data file (e.g. `data/enemies.ts`). Speed caps — never unbounded growth.
- Pause/history panels freeze AI (they run only in `playing`).

## Common failures
- Enemies jitter at doorway corners → path smoothing + arrival radius.
- Re-pathing every frame for every enemy → CPU spikes on phones.
- Spawning on top of the player or blocking the only exit.

## Verify
Unit tests: path exists between every pair of room centres; enemy never ends inside a collider; damage only once per contact (with i-frames). E2E: enemy reaches player on an open path.
