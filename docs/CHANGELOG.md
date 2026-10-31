# Development changelog

## M5 Enemies & difficulty — 2026-10-31 (awaiting feedback)
- Difficulty director (`src/data/enemies.ts` → `SPAWN_SCHEDULE`): guard at 0:00 (the intro guard), dog 0:35, guard 1:10, multo 1:40, dog 2:15, tikbalang 2:50, guard 3:40, multo 4:30. Each arrival gets its own toast + sound. Guard chase speed still ramps with run time.
- Guard dog (aspin in a security vest): faster than guards, shorter sight. When it has a clear line within 6 m it crouches and growls for 0.7 s while a red lane shows where it will lunge; the aim is locked, so stepping sideways dodges it. Lunge ~5.9 m, then it pants for 1.1 s. 3.5 s between lunges.
- Multo (white-sheet ghost, labelled Folklore): slow, never gives up, floats straight through walls. Fades out every ~5 s for 2.4 s; while faded it can't hurt you (a faint shimmer stays visible so it's fair to track).
- Tikbalang (horse-headed, labelled Folklore): big and a bit slower. Rears up for 0.9 s (red lane + neigh), then charges ~14 m in a straight line; slamming into a wall stuns it for 1.6 s ("BONK!"). Every 10 s of chasing it casts 2 purple see-through copies that circle the hero for 4 s; they are harmless and pop when touched (after a 0.8 s spread-out moment) or when hit by Bonifacio's shockwave.
- Folklore basis: "multo" is the common Filipino word for ghost; the tikbalang is a tall horse-headed creature said to lead travellers astray (the illusions nod to that). Their in-game powers are game inventions.
- All abilities work on every kind: shockwave stuns/shoves all of them, Lapu-Lapu's shield blocks any of them, Gabriela's dash i-frames dodge lunges.
- Reduced effects (settings): no lane pulsing, no illusion flicker, no camera shake on tikbalang bonks.
- Pooling: one view per scheduled arrival is built when the museum loads (none mid-run); views are bound to enemies per run and returned on replay. Enemy materials are shared.
- Tests: 99 unit (12 new: director order/timing, dog telegraph + locked aim + cooldown, multo through walls + harmless while faded, tikbalang charge + wall bonk, illusions expire/pop/no damage, abilities on every kind), 98 browser checks (new: toast, dog windup → lunge, multo through a wall, tikbalang illusions). `node tests/e2e/showcase.mjs` now also renders each enemy close-up.

## M4 follow-up — 2026-10-31 (owner feedback)
- Cooldowns: Rizal sprint 1:30, Lapu-Lapu shield 1:00 (owner-set); Bonifacio shockwave 1:15, Gabriela dash 0:45 to balance. Long cooldowns show as m:ss on the ability button.
- Training mode: "🎯 Training" button in the lobby tries the previewed hero (locked heroes too, nothing is bought). Runs in the Hall of Heroes with the doorways roped off; no guards, no coins, no score, no missions/leaderboard. Three straw practice dummies react to Bonifacio's shockwave and Lapu-Lapu's shield; ability cooldown is 3 s while training. Exit via the tag button or pause → lobby.
- Tests: 83 unit, 88 browser checks.

## M4 Hero abilities, shop & missions — 2026-10-31 (awaiting feedback)
- Abilities (Space on desktop, round ability button on phones, cooldown ring + seconds left; tuning in `src/data/abilities.ts`):
  - Rizal, Mabilis na Isip: sprint ×1.55 top speed for 3.5 s, 12 s cooldown.
  - Lapu-Lapu, Kalasag ng Mactan: shield bubble for up to 8 s that blocks the next hit and stuns that guard, 15 s cooldown.
  - Bonifacio, Sigaw ng Katipunan: shockwave ring that stuns (2.5 s) and shoves every guard within 5 m, 16 s cooldown.
  - Gabriela, Matapang na Hakbang: quick dash (~5 m) with brief invulnerability, 6 s cooldown. Walls still stop it.
- Shop (lobby): one extra skin per hero (colourways only, no stat boosts) for 30 Hiyas each; "Try on" preview; equip any owned skin; coins → Hiyas exchange (200 → 5). No real-money store.
- Missions (lobby): 3 active missions from a fixed pool (coins in a run, survive time, score, combo, ability uses, runs, total coins). Claim pays coins/Hiyas and brings the next mission; later cycles get harder and pay more. Results screen lists missions completed by the run; badge shows claimable rewards.
- Save v3 (migrates v1/v2): owned/equipped skins, missions; tampered mission targets/rewards are rebuilt from the pool.
- New sounds for each ability, block, denied (on cooldown) and claim.
- Tests: 77 unit, 80 browser checks (each ability in a live run, cooldown, touch ability button, shop exchange/try-on/buy/equip, mission claim, persistence across reload).

## M3 Lobby & cinematic intro — 2026-10-30 (awaiting feedback)
- Game now opens on a home lobby: night-time bahay-na-bato stage (adobe arches, capiz windows, lanterns, banderitas) with the selected hero on a sun-medallion platform. Drag to spin the hero; idle wave emote. Camera framing adapts to portrait/landscape.
- Lobby UI (every button works): profile chip → nickname + stats; coins/Hiyas wallet; settings (sound, reduced effects, two-tap reset); Heroes panel (select, preview, unlock); Top Runs leaderboard (local, best run per nickname, top 10); ‹ › hero arrows; PLAY (or "🔒 Unlock" when the previewed hero is locked).
- PLAY → portal wipe → hero floats under a time portal with "TAP TO DROP" (click / tap / Space / WASD). No timer, no damage, guard doesn't move while floating.
- Drop: hop, gravity fall, landing dust + camera shake. A guard placed 7–8.5 m up-screen turns, shows "!" + alert sound, then hunts. Only then do timer, score and HUD start.
- Pause menu and results gained "Lobby" buttons; replay goes through the intro again. `?play` skips lobby + intro (dev/testing).
- Save data v2 (migrates v1): owned/selected hero, nickname, leaderboard, settings.
- Guard rules (owner request): new guards hunt immediately at any distance; lose range 8, sight 5, hearing 2.5.
- Tests: 61 unit, 60 browser checks (lobby panels, settings, reset, nickname validation, unlock flow, float-waits-for-input, drop → land → alert → chase, pause/results → lobby, phone touch).
- Hidden until their milestones: hero abilities (M4), shop/missions/archive/events/achievements (M4–M6).

## M2 Core survival — 2026-10-30 (awaiting feedback)
- Security guard: chibi uniform model, patrol → alert ("!" + sound) → chase → search FSM, A* on a 0.5 m nav grid with line-of-sight shortcuts, staggered repaths, guard-guard separation.
- Difficulty director: guards join at 0/45/90/150 s (max 4), chase speed ramps 4.5 → 5.3 over 4 min (capped). All numbers in `src/data/gameplay.ts`.
- Hearts (3), 2 s start grace, 1.1 s i-frames with blink, knockback, hurt recoil, guard staggers after a hit.
- Coins (+10), rare purple coins (+100), heart pickups only when hurt; combo multiplier up to x4; +100 survival bonus every 30 s; floating score text and particle bursts.
- HUD: hearts, score, combo, timer, run coins. Game over: slow-mo knockdown → results (score, time, coins, best, wallet) → "Laro ulit" clean replay.
- Versioned local save (wallet, best score/time, runs, mute). Synth sound effects + mute toggle in pause.
- Tests: 46 unit, 32 browser checks (chase, coin, one-heart damage, game over, save, replay, pause, mute).

## Milestone 1 — Foundation (2026-10-30)
Implemented
- Vite + TS strict + Babylon.js 9 project, pinned versions, GitHub Pages workflow.
- Game loop with clamped delta time, central `StateMachine`, pause/resume (Esc / P / on-screen button, auto-pause on tab hide).
- Data-driven low-poly museum: Main Gallery, Silid-Aklatan (library), Hall of Heroes, Artifacts, Folklore; 5-unit doorways and looping routes; landmarks (sun monument, balangay-inspired boat, burial-jar case, balete tree).
- Procedural chibi models for Rizal, Lapu-Lapu, Bonifacio, Gabriela Silang matching the supplied sheets (interim art): canvas-painted anime faces, clumped hair, rim lighting, costume details (tattoos, beads, tapis/bahag patterns, embroidery). Lapu-Lapu has no sword (owner request).
- Procedural animation: idle breathing, walk→run blend driven by distance travelled, trailing cloth/hair/headband.
- PlayerMotor: acceleration, deceleration, turn-brake, normalised diagonals, slide-along-wall collision with sub-stepping.
- Fixed-angle (52°) follow camera with look-ahead, frame-rate independent smoothing, wall/tree fade when blocking the hero, portrait FOV adaptation, shake API.
- Input: WASD/arrows, floating multi-touch joystick (left 55% of screen), action keys reserved (Space/E/Esc).
- HUD: hero chip (tap / keys 1–4 to preview other heroes), gallery name toasts, pause menu, optional FPS (`F` or `?debug`).

Tests
- 24 Vitest unit tests (collision, movement frame-rate independence, camera math, input math, state machine, layout sanity).
- Playwright smoke test: 20/20 checks (desktop keys, collisions, pause, doorway traversal, phone landscape + portrait joystick, touch buttons, zero console errors).

Known issues / not yet done
- Real-device FPS not measured yet (headless runs are CPU-rendered ~10 fps; not representative).
- Hero switching in-run is a preview tool; real unlocks/shop arrive in M4.
- Heroes are procedural blockout-quality models, not final rigged GLB assets.
- No audio yet (M2/M7).
