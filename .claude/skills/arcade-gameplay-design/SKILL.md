---
name: arcade-gameplay-design
description: Use when designing or tuning moment-to-moment gameplay — coins, scoring, hearts, abilities, difficulty pacing, game feel.
---
# Arcade gameplay design

## When to use
Coins/score/multiplier, health & i-frames, ability tuning, difficulty timeline, juice/feedback.

## Rules from the brief
- 3 hearts; one heart per hit; ~1 s invulnerability with a visible flash; no double hits from one collision.
- Score ≠ coins. Coin +10, rare coin +100, every 30 s survived +100, artifact discovery +250, challenge +300, elite dodge +50. Consecutive-coin multiplier resets on damage.
- Difficulty timeline: 0:00 guard · 0:45 more guards + dogs · 1:30 multo · 2:30 tikbalang · 4:00+ density/variety up (capped).
- No hero guarantees survival; abilities have cooldowns from `data/heroes.ts`.

## Procedure
1. Put numbers in `data/` (e.g. `data/scoring.ts`), never inline.
2. Write the rule as a pure function/class first, unit test it (deterministic, no double counting, no reward while paused).
3. Add feedback for every event: sound + particle + floating text + HUD bump.
4. Playtest on phone: first 20 seconds must be easy and readable.

## Common failures
- Rewards accrue while paused or reading history — gate everything on `fsm.state === 'playing'`.
- Coins spawning in colliders — validate spawn points with `CollisionWorld.overlaps`.
- Rapid re-trigger of pickups — mark collected immediately, recycle via pool.

## Verify
Unit tests for scoring/health; e2e run that collects coins and loses hearts; read the numbers in the results screen.
