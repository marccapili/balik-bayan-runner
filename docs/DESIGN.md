# Balik Bayan Runner — design summary

Core loop: Lobby → PLAY → portal → hero floats in museum ("TAP TO DROP") → falls, lands → guard notices (!) →
chase: collect coins, avoid enemies, use hero ability, survive escalating difficulty → lose 3 hearts → results →
rewards → lobby → unlock/buy → play again. Fun first, learning through discovery.

## Team decisions (from the project owner)
- 3-day schedule. Pause for owner feedback after every milestone.
- Claude does all 3D modeling (procedural low-poly chibi, based on owner's character sheets).
- Generated/synthesised audio is fine.
- Claude drafts history entries from credible sources (NHCP, NCCA, scholarly works); anything unverified is flagged.
- UI text in playful Gen Z Taglish. History panels stay accurate.
- Mostly phone players (touch joystick), desktop WASD/arrows must work.
- Hosting: GitHub Pages via Actions.

## Milestones
1. Foundation — project, engine, state machine, museum, follow camera, player controller, keyboard + joystick. ✅
2. Core survival — guard AI (patrol/alert/chase/search/stunned, A* on layout grid), 3 hearts, i-frames, coins, score + multiplier, timer, game over, replay. ✅
3. Lobby & cinematic intro — 3D hero preview lobby, working nav, PLAY portal transition, float/tap-to-drop/fall/land, guard detection. ✅
4. Heroes & progression — abilities (Rizal sprint, Lapu-Lapu shield, Bonifacio shockwave, Gabriela dash), shop, coins + Hiyas, skins, versioned save, missions. ✅
5. Enemies & difficulty — guard dogs (telegraphed dash), multo (phasing), tikbalang (charge/illusion, reduced-effects option), data-driven director, pooling. ✅
6. History — exhibits with E/tap prompt, pause-while-reading panels with sources, archive, folklore labelled as folklore. ✅
7. Polish — art, animation, lighting, VFX, sound, accessibility, performance, balancing.

## Heroes (gameplay numbers in `src/data/heroes.ts`)
| Hero | Class | Ability | Unlock |
|---|---|---|---|
| José Rizal | Scholar | Mabilis na Isip (sprint) | default |
| Lapu-Lapu | Defender | Kalasag ng Mactan (shield) | 300 coins |
| Andrés Bonifacio | Revolutionary | Sigaw ng Katipunan (shockwave) | 500 coins |
| Gabriela Silang | Agile Leader | Matapang na Hakbang (dash) | 700 coins |

Abilities are fictional gameplay interpretations, not historical claims.
