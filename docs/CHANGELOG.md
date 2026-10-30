# Development changelog

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
