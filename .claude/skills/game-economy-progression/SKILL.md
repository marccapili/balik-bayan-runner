---
name: game-economy-progression
description: Use when working on coins, Hiyas (diamonds), shop purchases, unlocks, skins, missions, achievements, events or the save file.
---
# Game economy & progression

## When to use
Shop, unlocks, skins, missions/achievements/events, leaderboard, save schema (M4+).

## Procedure
1. Single `SaveData` type with `version: number`; load via `migrate(raw)` that handles missing, corrupted (JSON parse fail), older versions and invalid numbers (NaN/negative → 0).
2. All mutations go through an `Economy` service: `canAfford`, `purchase(itemId)` is idempotent (owned → no charge), atomic (check + deduct + grant + save together).
3. Missions: `{id, objective, target, progress, completed, claimed, reward}`; `claim()` only if completed && !claimed.
4. Events have `start`/`end` ISO dates; inactive outside the range.
5. Leaderboard is local (`localStorage`), behind an interface so a backend can be added later. Never say scores sync across devices.

## Standards
- Costs in `data/` (heroes 0/300/500/700 coins; skins in Hiyas). Skins are cosmetic only.
- No real money, loot boxes or gambling.
- Wrap every `localStorage` access in try/catch (private mode can throw).

## Common failures
- Double-tap buys twice → disable button + idempotent purchase.
- Currency going negative after migration bugs → clamp on load.
- Claiming one-time rewards repeatedly.

## Verify
Unit tests for migrate(), purchase idempotency, insufficient funds, mission claim once. E2E: buy hero → reload → still owned.
