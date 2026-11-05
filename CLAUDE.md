# Balik Bayan Runner — Claude guide

3D arcade survival game (browser, phone-first, desktop WASD too). Filipino heroes time-travel into a
history museum, get chased by guards/dogs/folklore creatures, collect coins, discover real history.
Design summary + milestone plan: `docs/DESIGN.md`. Milestone status: `docs/CHANGELOG.md`.

## Stack (pinned in package.json)
Babylon.js 9 (`@babylonjs/core`, tree-shaken deep imports) · TypeScript 5.9 strict · Vite 8 · Vitest 5 ·
Playwright (preinstalled `playwright` package) for browser smoke tests. No UI framework: HTML/CSS overlays.

## Commands
- `npm run dev` — dev server (LAN-visible, test on phone)
- `npm run build` — typecheck + production build to `dist/`
- `npm test` — Vitest unit tests (pure logic, no WebGL)
- `npx vite preview --port 4173 &` then `npm run test:e2e` — headless browser smoke test + screenshots in `tests/e2e/screenshots/`
- `node tests/e2e/showcase.mjs` — close-up renders of every hero for art review

## Architecture rules
- `src/core` owns the engine loop + `StateMachine` (boot → lobby → intro → playing ⇄ paused → gameover). Never change game state except via `fsm.transition`.
- Gameplay logic is engine-free and unit-tested: `PlayerMotor`, `Collision`, `cameraMath`, `joystickMath`, `utils/math`. Babylon classes only render/pose.
- All tuning numbers live in `src/data/*` (config, heroes, museumLayout). Do not hard-code speeds/costs/scores in systems.
- The museum is data (`data/museumLayout.ts`): rendering, collision, camera occlusion and future A* all read it.
- Every update takes `dt` seconds (clamped to 1/20 in `Game.frame`); use `damp()` for smoothing — never `lerp(a,b,constant)` per frame.
- Materials go through `world/materials.ts#mat` (cached, frozen). Pass `{dynamic:true}` if mesh visibility animates.
- Heroes are rigs (`characters/HeroModel.ts`) animated by `animations/HeroAnimator.ts`. Bonifacio + Rizal use owner GLBs (`public/models`, `data/heroModels.ts`), read by `characters/glb.ts` and auto-skinned onto the same `HeroRig` (`characters/autoSkin.ts`, `HeroGlb.ts`); others stay procedural. Workflow in `docs/ASSETS.md`.

## Quality rules
- Every visible button must work. No fake UI.
- UI copy: playful Gen Z Taglish. History panels: accurate, sourced, unverified items flagged.
- Never claim FPS/perf numbers without measuring on a real device; headless runs are CPU-rendered (~10 fps).
- Before finishing a change: `npm run build && npm test` and the e2e smoke test must pass; look at the screenshots.

## Current milestone
M1 Foundation ✅ · M2 Core survival ✅ · M3 Lobby + cinematic intro ✅ · M4 Abilities, shop, missions ✅ · M5 Enemies & difficulty ✅ · M6 History exhibits + archive ✅ · M7 Exhibit Mode (mini-games, levels, Shop, Endless) ✅ (awaiting user feedback). Next: M8 polish.
Gameplay rules live in engine-free `gameplay/SurvivalRun.ts`; `?peaceful` disables guards, `?play` skips lobby + intro (both used by e2e checks). FSM: (boot → lore →) lobby → intro (`gameplay/IntroSequence.ts`) → playing. Abilities: `gameplay/Ability.ts` + `SurvivalRun.useAbility`; missions: `gameplay/Missions.ts`; skins are colour remaps (`data/skins.ts`, `Kit.c`). Enemies: every kind extends `enemies/GuardBrain` (`LungerBrain` → Dog/Tikbalang, `MultoBrain`), so `run.guards` holds all enemies; who joins when = `data/enemies.ts#SPAWN_SCHEDULE`; views are pooled per kind in `enemies/EnemyViews.ts`; debug `spawnEnemy(kind, x, z)`. History: exhibits are data (`data/exhibits.ts`, each needs `sources`; uncertain points go in `review`), `history/exhibitMath.ts#exhibitInReach`, FSM `reading` state freezes the run, `SurvivalRun.discover` pays once per run, archive = `save.discovered` (v4). Training mode = `SurvivalRun.reset(..., training=true)` + `data/training.ts` (Hall of Heroes, rope barriers via `CollisionWorld.setExtra`).
M7: exhibits are gated by mini-games (`data/minigames.ts`, logic `gameplay/MiniGames.ts`, DOM `ui/MiniGameHost.ts`); mini-games run inside `playing` with `museum.update(dt, frozen=true)` so enemies keep moving. Exhibit payouts/Endless live in `SurvivalRun.discover`; Curator ID = `run.idCard`. Levels/daily tasks = `gameplay/Progression.ts` + `data/progression.ts`; save v5. Lobby Shop = `Lobby` collection screen. Debug: `winMiniGame`, `giveIdCard`, `clearExhibits(n)`, `addHeroXp`, `addPlayerXp`.
Gadgets: data `data/gadgets.ts`, floor field `gameplay/Gadgets.ts`, effects in `SurvivalRun` (`gadget` slot, `useGadget`, smoke/magnet/freeze timers, `bubble`), visuals `world/GadgetViews.ts`, icons `ui/gadgetArt.ts`; input action `gadget` (Q/G). Debug: `giveGadget(kind)`, `spawnGadget(kind,x,z)`.
Lore intro (2026-11-05): FSM boot → lore → lobby after a "Tap to start" (`main.ts`). The picture is a pre-rendered hand-painted 2D video (`public/lore/intro.webm`/`.mp4`) made with the vendored Claude Animation Base kit in `cutscene/` (p5.brush; storyboard `cutscene/STORYBOARD.md`, film `src/scenes/lore.js`, cast `src/scenes/bayani.js`); the game overlays bubbles/era cards/SFX from `data/lore.ts` via `gameplay/LoreTimeline.ts#syncTo(video time)` in `ui/LorePlayer.ts`. Keep `data/lore.ts` times in step with the film's `shots()`/`talk()`. Skippable (chip, Esc/Enter/Space), replay from Settings; `?nolore`/`?play` skip it; debug `loreSeek(t)`.
Phase 7 polish: music `audio/Music.ts` + `data/audio.ts` (driven by `Game.updateMusic`), settings in `save.settings` (musicVolume, sfxVolume, quality, showFps, largeText, tutorialDone), glow via `MuseumScene.setGlow` (High quality only), first-run tips `gameplay/Tutorial.ts` + `data/tutorial.ts` (skipped with ?play unless ?tutorial).
