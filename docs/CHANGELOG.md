# Development changelog

## Opening lore intro, now hand-painted 2D — 2026-11-05 (owner feedback: "make it 2D so you can add facial expressions")
- The intro is now a pre-rendered 55 s watercolour-and-ink cartoon (`public/lore/intro.webm` VP9 + `intro.mp4` H.264 for Safari), made with the MIT "Claude Animation Base" kit (p5.js + p5.brush) vendored in `cutscene/`. Storyboard: `cutscene/STORYBOARD.md`; the film is `cutscene/src/scenes/lore.js`, the cast `cutscene/src/scenes/bayani.js`.
- New 2D chibi cast: Lapu-Lapu (tattoos, red putong, no sword), Gabriela Silang (tapis skirt, on her horse), Rizal (top hat, frock coat, moustache), Bonifacio (camisa, red neckerchief, bolo), plus the guard, his aspin and the horse. Faces reuse the kit's eyes, mouths and its 31 acted emotions (surprised takes, scared, dizzy, starstruck, KO…) with painted eyebrows; mouths flap while a character talks.
- Tighter story with a gag in every shot: the horse skids and flings Gabriela at the portal, Rizal's hat hovers alone then zips in after him, Bonifacio charges into the portal himself, two heroes bonk heads in the time tunnel, they land in a KO pile under their own portraits, and Rizal dashes back for his hat while running from the guard.
- The game overlays the Taglish speech bubbles, era cards, the tunnel year counter and the logo on the video, and plays its own SFX/music on the same cues (`data/lore.ts`, timed to the video clock by `gameplay/LoreTimeline.ts#syncTo`). The video is muted so it always autoplays; the 3D scenes don't render while it plays. Portrait phones show the centre of the frame, where every shot keeps its action.
- Skip chip, Esc / Enter / Space, "Tap to start", Settings → "Panoorin ulit ang intro", `?nolore` / `?play` all work as before. If the video can't start within 8 s (blocked or very slow network) the intro skips itself.
- Removed the real-time Babylon cutscene (`scenes/LoreScene.ts`) and the `loreStep` debug hook.
- Re-render: `cd cutscene && npm ci`, then `node render.mjs --frames --workers=4` (`--soft-gl` on a machine without a GPU) and `--encode`; see the top of `STORYBOARD.md`.

## Sculpted 3D heroes: Bonifacio + Rizal — 2026-11-03 (owner models)
- The owner's image-to-3D models replace the procedural Bonifacio and Rizal (classic look) in the lobby, Shop preview, intro and museum. Lapu-Lapu and Gabriela keep the procedural model until their GLBs arrive.
- Models arrive unrigged, so `characters/autoSkin.ts` skins them onto the same 8-joint chibi rig: each vertex gets a body part from per-hero landmarks (`data/heroModels.ts`), then weights are blended along the mesh's own edges so joints bend smoothly. `HeroAnimator` drives them unchanged (idle, run, wave, fall, hurt, topple); arm swing is capped per model (`armLimit`) so shoulders don't stretch.
- Small engine-free GLB reader (`characters/glb.ts`) instead of the full Babylon loader. Models load at boot; if one fails the hero quietly keeps the procedural look.
- Textures re-encoded to WebP with `tools/optimize_glb.py` (3.1 MB → 0.9 MB for both). Non-classic skins still use the procedural model until skin GLBs exist.
- Tests: 156 unit (GLB parsing, auto-skin), browser check that both heroes load their models.

## Phase 7 polish (part 1) — 2026-10-31 (awaiting feedback)
- Music: two original procedural loops (`audio/Music.ts`, data `data/audio.ts`), inspired by kulintang gong music on a pentatonic scale (not transcriptions). Calm lobby loop; museum chase loop whose bass/shaker/lead layers fade in as more enemies join, a bit faster in Endless. Music ducks while paused, reading or playing a mini-game, and stops on game over. Scheduled on the audio clock, so it doesn't depend on frame rate.
- Settings: separate Music and SFX volume sliders, master mute, Graphics quality (Auto / Low / High), Show FPS, Reduced effects, Large text, and "show tutorial tips again". Saved in the existing v5 save (old saves get defaults; volumes are clamped).
- Graphics quality: Low renders at 1× pixel ratio with no glow (for weak phones); High renders up to 2× with a soft, limited glow on coins, exhibit gems and gadgets only. Auto picks High on desktops and phones with many CPU cores. No FPS numbers are claimed: turn on Show FPS and check on a real phone.
- Accessibility: a new save follows the device's "reduce motion" setting for Reduced effects; Large text makes HUD, lobby, mini-game and history text bigger.
- First-run tips: one short coach card at a time (move, exhibits, ability, gadget when you first hold one), each until you do it or it times out, with a "Gets!" button. Shown once; returning players skip them.
- Results: the score counts up (instant with reduced effects).
- Tests: 152 unit, plus browser checks for the settings and tips.

## Gadgets + guard-heavy spawns — 2026-10-31 (owner request)
- Four collectible gadgets float around the museum (first after 15 s, then every 18–28 s, max 2 on the floor, vanish after 40 s). Original pixel-art icons drawn in code (`ui/gadgetArt.ts`).
  - 🧲 Coin Magnet: fires on pickup, pulls coins within 7 m for 8 s.
  - 💨 Smoke Bomb: every enemy loses you and goes to check the smoke for 5 s.
  - 🛡️ Protective Bubble: absorbs the next enemy collision (shoves + stuns that enemy).
  - ⏳ Time Freeze: enemies within 11 m move at 30% speed for 5 s (hourglass over their heads).
- One gadget slot: a second gadget stays on the floor until you use yours. Use it with Q (or G) on desktop, the 🎒 button on phones; it works during mini-games too. No gadgets in training.
- Spawns: guards come more often than dogs. Guard 0:00 and 0:30, dog 1:00, guard 1:30, guard 2:05, dog 2:45, guard 3:25, guard 4:10, dog 5:00, guard 5:50 (7 guards + 3 dogs, all slower than the hero). Multo on the 10th exhibit, tikbalang on the 12th, unchanged.
- Tests: 148 unit (11 new gadget tests), browser checks for pickup, one slot, Q/button, magnet, smoke, bubble, freeze.

## M7 follow-up: difficulty balance — 2026-10-31 (owner feedback)
- Before 10 exhibits only guards and dogs chase you: guard at 0:00, dog 1:00, guard 2:00, dog 3:20, guard 4:40 (max 5, all slower than the hero's 6.2 m/s top speed). The multo joins on the 10th exhibit, the tikbalang on the 12th, Endless after the 15th.
- Guard chase speed ramps 4.5 → 5.3 over 6 minutes (was 4). Schedule entries can now be gated by exhibits cleared (`SPAWN_SCHEDULE[].exhibits`).
- Tests: 137 unit, 148 browser checks.

## M7 Exhibit Mode, mini-games, Shop & levels — 2026-10-31 (awaiting feedback)
- One run = Exhibit Mode then Endless. 15 exhibits (new: Spoliarium, Ifugao Rice Terraces, EDSA People Power, each sourced with a "for verification" note). Each is locked behind one of 8 original museum mini-games: Wire the Display, Curator Card Swipe, Vault Code, Balangay Navigator, Restore the Artifact, Dust the Find, Timeline Sort, Baybayin Match. Clearing pays +250 score and +20 coins; diamonds at the 5th (+20), 10th (+20) and 15th (+30) exhibit.
- Enemies keep moving while you play a mini-game; a red "May papalapit!" warning shows when one is within 6 m, and getting hit cancels the game.
- Card Swipe exhibits need the Curator ID first: it spawns at least 14 m away and a floor arrow guides you to it (then to the nearest uncleared exhibit).
- After all 15: "MUSEUM CLEARED" banner, Endless Mode badge, new enemy every 9 s (up to 22) and chase speed keeps climbing until you're caught. Before that, difficulty still rises slowly, so a long run is never blocked.
- Hero levels 1–10 (XP from time, exhibits and coins): L3 +10 💎, L4 badge, L5 skill unlocked (locked button shows 🔒Lv5), L7 cooldown −10%, L8 +10 💎, L9 ability +20% duration/reach, L10 +20 💎 and Master frame. Player level up to 300: +10 💎 per level and a new profile frame every 5 levels (60 frames).
- Missions now give XP; 3 daily tasks give coins and reset at local midnight. Diamond exchange removed: diamonds only come from levels and exhibit milestones.
- Shop (LoL-style): Heroes/Skins tabs, Lahat/Owned/Locked filters, cards with your character photos, detail view with Unlock/Use/Train and Try on/Buy/Equip. Bonifacio is the free starter; other heroes 500 coins; skins 300 diamonds. Hero arrows removed from the lobby.
- Gabriela's dash cooldown is now 20 s. Save v5 (migrates v1–v4; old saves keep Rizal).
- Small fix: big banners no longer get overwritten by a room/enemy toast; the toast waits its turn.
- Tests: 137 unit, 146 browser checks (mini-game gate, ID card, payout once, enemies move during games, danger warning, hit cancels, Endless, Shop flow, phone mini-game by touch).

## M6 History exhibits & archive — 2026-10-31
- 12 exhibits across all five galleries (`src/data/exhibits.ts`): Battle of Mactan, Rizal and the Propaganda Movement, Bonifacio and the Katipunan, Gabriela Silang and the Ilocos revolt (Hall of Heroes); the flag's sun and stars, the Butuan balangay (Main Gallery); Manunggul Jar, Laguna Copperplate Inscription (Artifacts); Baybayin, American and Japanese rule (Library); Tikbalang, the balete and multo (Folklore).
- Every entry has a source list (NHCP, National Museum, RA 8491, Pigafetta, Schumacher, Agoncillo, Constantino, W. H. Scott, Postma, R. B. Fox, M. D. Ramos). Points that differ between sources are shown in an orange "For verification" box (date/place of the Cry, Gabriela's dates, balangay dating) and the panel gives only what is certain.
- Folklore entries are labelled "Folklore · alamat, hindi history" and say the game's creature powers are made up. Every panel and the Archive carry the fiction note (time travel, powers and the chase are fiction).
- In the museum: a spinning gem floats over each exhibit (gold = new, purple = folklore, blue = already in the Archive). Walk up and a "Press E to Discover History" prompt appears (a tappable button on phones); a ring lights up under the exhibit.
- Reading panel: new `reading` game state, so enemies, timer, score, cooldowns and pickups are frozen exactly like pause. First read of an exhibit in a run pays +250 score (once per exhibit per run, never in training). Closing (E, Esc or the button) gives 1.2 s of grace so you can't be hit the instant you resume.
- Archive (lobby, left side, shows found/total): found exhibits open the same card; unfound ones show "???" and which gallery to search. Save v4 (migrates v1–v3) stores discoveries.
- New mission: "Mag-discover ng 2 exhibits sa isang run" (+6 Hiyas), appended to the pool so existing missions don't change.
- Fix found while testing: the exhibit prompt could sit on top of the pause menu and block its buttons; it now hides while paused.
- Tests: 110 unit (11 new: content has sources/topics/folklore labels, every exhibit is in its room and reachable from open floor, reach detection, bonus once per run and not in training, reading state, save v4 + migration, exhibit mission), 118 browser checks (prompt, E opens/closes, run frozen while reading, bonus once, prompt click, folklore label, Archive list/detail/reload, phone tap open/close).

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
