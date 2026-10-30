---
name: character-animation
description: Use when adding or tuning hero/enemy animation states (idle, run, fall, land, hurt, ability, defeated) for the procedural rigs.
---
# Character animation

## When to use
New animation state, foot sliding, snapping between states, new rig.

## Procedure
1. States live in `animations/HeroAnimator.ts` (`AnimState`). Call `setState()` every frame if you like — it no-ops when unchanged, so animations never restart each frame.
2. Locomotion phase advances by distance (`speed * dt / stride`), not time → no foot sliding at any speed. Tune `stride` if feet slide.
3. Blend with `moveBlend` (smoothed speed ratio via `damp`), never by switching poses instantly.
4. One-shot states (land, hurt, ability) use `stateTime` and return to `idle` themselves.
5. Reset any channel you touch in a one-shot (scaling, rotation.z) when it ends — otherwise the next state inherits it.
6. Trailing cloth/hair: push the node into `rig.flutter`; animator lifts it with speed.

## Standards
- Rotations in radians; limb swing ≤ 1.0 rad; torso lean ≤ 0.25 rad.
- Required states (brief §21): idle, walk, run, sprint, fall, landing, take damage, ability, stunned/knockback, defeated.

## Common failures
- Pose leaks from fall → locomotion (arms stay up): reset `armL/armR.rotation` on state entry.
- Using wall-clock time for walk cycle → moonwalking when blocked by walls.

## Verify
Record a few frames in e2e at different speeds; check legs alternate and stop when speed is 0.
