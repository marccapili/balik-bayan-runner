# Assets & licenses

All visuals in Milestone 1 are generated in code — no third-party models, textures or images.

| Asset | Source | License |
|---|---|---|
| Hero models (Rizal, Lapu-Lapu, Bonifacio, Gabriela) | Procedural, `src/characters/HeroModel.ts`, based on the team's own character sheets | Project-owned |
| Museum geometry & props | Procedural, `src/world/MuseumBuilder.ts` | Project-owned |
| Floor, sign, banner, capiz, portrait textures | Canvas-drawn, `src/world/textures.ts` | Project-owned |
| Fonts | Baloo 2, Poppins via Google Fonts | SIL Open Font License |
| Hero portraits in the Shop/lobby (`src/assets/portraits/*.webp`) | Cut out from the owner's own chibi character sheets | Project-owned (owner-provided) |
| Baybayin font (`src/assets/fonts/noto-sans-tagalog-*.woff2`) | Noto Sans Tagalog via @fontsource 5.2.5 | SIL Open Font License (`OFL-NotoSansTagalog.txt`) |
| Spoliarium-style painting, mini-game art | Canvas-drawn, original stylised art (not a reproduction) | Project-owned |

Interim notes
- Hero models are interim procedural art. To replace with GLB: export a model with nodes matching `HeroRig` (root/body/hips/torso/head/legL/legR/armL/armR) and load it in place of `buildHero`.
- Portraits in the Hall of Heroes are generic silhouettes on purpose — not likenesses of real people.
- The boat and jar props are stylised and "inspired by" the Butuan balangay and Manunggul-style burial jars; they are not presented as replicas.
