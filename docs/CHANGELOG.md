# Development changelog

## Milestone 1 — Foundation (2026-10-30)
Implemented
- Vite + TS strict + Babylon.js 9 project, pinned versions, GitHub Pages workflow.
- Game loop with clamped delta time, central `StateMachine`, pause/resume (Esc / P / on-screen button, auto-pause on tab hide).
- Data-driven low-poly museum: Main Gallery, Silid-Aklatan (library), Hall of Heroes, Artifacts, Folklore; 5-unit doorways and looping routes; landmarks (sun monument, balangay-inspired boat, burial-jar case, balete tree).
- Procedural chibi models for Rizal, Lapu-Lapu, Bonifacio, Gabriela Silang matching the supplied sheets (interim art).
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
