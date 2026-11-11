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
- Heroes are rigs (`characters/HeroModel.ts`) animated by `animations/HeroAnimator.ts`. Bonifacio, Rizal + Lapu-Lapu use owner GLBs (`public/models`, `data/heroModels.ts`), read by `characters/glb.ts` and auto-skinned onto the same `HeroRig` (`characters/autoSkin.ts`, `HeroGlb.ts`); Gabriela stays procedural. Workflow in `docs/ASSETS.md`.

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
Run objective card on the first chase (`Hud.showObjective`, copy `data/tutorial.ts#OBJECTIVE`) and mini-games both run the world in slow motion (`MINIGAME.worldSlow`, body.slowmo tint); debug snapshot `objective`, `slowMo`.
Lore intro (2026-11-05; opens with a 3 s credits card, film shifted +3 s): FSM boot → lore → lobby after a "Tap to start" (`main.ts`). The picture is a pre-rendered hand-painted 2D video (`public/lore/intro.webm`/`.mp4`) made with the vendored Claude Animation Base kit in `cutscene/` (p5.brush; storyboard `cutscene/STORYBOARD.md`, film `src/scenes/lore.js`, cast `src/scenes/bayani.js`); speech bubbles, era cards and the end title are painted in (`captions.js`, text in `lines.js`, unit-tested equal to `data/lore.ts`); score/SFX/babble are baked into the video's audio (`cutscene/sound/score.py`); the game only follows the clock via `gameplay/LoreTimeline.ts#syncTo(video time)` in `ui/LorePlayer.ts` (video volume = mute ? 0 : max(music, sfx) slider). Changing a line = edit both, re-render (~1 h CPU), re-run score.py and mux. Skippable (chip, Esc/Enter/Space), replay from Settings; `?nolore`/`?play` skip it; debug `loreSeek(t)`.
Hero start clips: PLAY → 4 s painted clip of the chosen hero (`cutscene/src/scenes/heroclips.js` loops, sound `cutscene/sound/clips.py`, encode `cutscene/clips.sh` → `public/lore/start-<hero>.*`; data `data/heroClips.ts`, player `ui/ClipPlayer.ts` above the portal wipe; starts inside the tap for sound; tap/Esc skips; gives up after 1.5 s if not loaded; `?noclip`/`?play` skip it).
Phase 7 polish: music `audio/Music.ts` + `data/audio.ts` (driven by `Game.updateMusic`), settings in `save.settings` (musicVolume, sfxVolume, quality, showFps, largeText, tutorialDone), glow via `MuseumScene.setGlow` (High quality only), first-run tips `gameplay/Tutorial.ts` + `data/tutorial.ts` (skipped with ?play unless ?tutorial).
M8 polish pass 1 (2026-11-11): UI icons = Phosphor fill SVGs (`ui/iconData.ts` generated by `tools/build_icons.mjs`; `ui/icons.ts#installIconizer` swaps emoji in the DOM for icons, so never rely on an emoji surviving in `textContent`; canvas = `drawIcon`). Brand = `tools/build_logo.py` → `src/assets/brand/logo.svg` (inlined into index.html by the `bbr-inline-logo` Vite plugin) + `public/icon*`, `share.png` via `tools/render_brand.mjs`. Fonts are self-hosted (`ui/polish.css`, which also holds every polish-layer override; loaded after `styles.css`). Look = `world/SceneLook.ts` (`applyGrade` in every scene before first render, `BakedShadows` in the museum, tuning `data/config.ts#LOOK`; shadows off only when quality = low). Audio mix bus (reverb + limiter) lives in `audio/Sfx.ts`, music joins via `sfx.mixBus`, tuning `data/audio.ts#MIX`; footsteps come from `HeroAnimator.onStep`. Hit-stop = `FEEDBACK.hitStop`.
Future Heroes Gallery (2026-11-05): lobby banner → FSM `gallery` (lobby ⇄ gallery only) → `scenes/GalleryScene.ts` (own Babylon scene, lazy chunk, layout from engine-free `gallery/galleryLayout.ts`) + DOM `ui/GalleryUi.ts`/`ui/gallery.css` (book page-turn, scroll, TV iframe, list). Works = `data/gallery.ts` (names, titles, alphabetical) + generated `data/galleryPages.ts`; files in `public/gallery/<slug>/` made by `tools/gallery_assets.py "<Drive submission folder>"` (>1 page or file = book, 1 page = scroll). `?gallery` opens it directly; e2e `tests/e2e/gallery.mjs`.

## Claude Code Game Studios (installed 2026-11-11, v1.3.0, MIT, github.com/Donchitos/Claude-Code-Game-Studios)
Agents/skills only: 49 studio agents in `.claude/agents/` (game-designer, gameplay-programmer, qa-lead, writer, …) and 78 workflow skills in `.claude/skills/` (`/brainstorm`, `/design-review`, `/balance-check`, `/playtest-report`, `/sprint-plan`, `/adopt`, `/help`, …), plus their docs (`.claude/docs`, `.claude/rules`), helper scripts (`.claude/scripts`) and `project.yaml` (run `/setup-engine web` or `/start` once to configure; engine = Web/TypeScript, code root `src/`).
- **This file wins on any conflict.** Our architecture rules, stack, quality rules and commands above override the framework's generic standards (`.claude/docs/coding-standards.md`, `coordination-rules.md`). Its "ask before every write" collaboration protocol is not adopted here.
- Its hooks (`.claude/hooks/*.sh`) are copied but **not wired** in `.claude/settings.json`; to turn them on, copy the `hooks` block from upstream `.claude/settings.json`.
- Its GDDs go in `design/gdd/`, ADRs in `docs/architecture/`; our existing design doc stays `docs/DESIGN.md`. Upgrades: re-copy upstream `.claude/` dirs (keep our 11 Balik Bayan skills).
