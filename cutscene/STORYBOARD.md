# Balik Bayan Runner — opening (2D, hand-painted)

55.5 s, 16:9, 24 fps. Speech is NOT painted in: the game draws the Taglish bubbles over the video
(`src/data/lore.ts`, same times as below). Keep the main action inside the centre ~1200 px so the
phone-portrait crop still reads.

## Rendering

```
npm ci
node render.mjs --sheet=5,9,14 --soft-gl --out=out/check/a.jpg   # contact sheet to review (drop --soft-gl with a GPU)
node render.mjs --frames --workers=4 --soft-gl                    # all frames → out/frames (resumable)
node render.mjs --encode --out=out/intro.mp4
```

Then encode the two web versions into `../public/lore/` (1280×720, no audio: the game plays the sound):

```
ffmpeg -i out/intro.mp4 -vf scale=1280:720 -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -an ../public/lore/intro.webm
ffmpeg -i out/intro.mp4 -vf scale=1280:720 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart -an ../public/lore/intro.mp4
```

Watercolour `fill` is off for this film (`bayani.js` turns fills into flat washes): it costs seconds per call without a GPU.

| # | Shot | Time | Reads (one at a time) |
|---|------|------|------------------------|
| 0 | Title: museum at night | 0–4 | Four empty gold frames → narrator "May nawawalang mga bayani…" → a crack of light tears open in the air → flash, wipe |
| 1 | Mactan 1521 | 4–12 | Lapu-Lapu stands proud at sunset → a portal pops open over the sea (take!) → "Ano 'tong ilaw sa dagat?!" (confused) → he creeps up and pokes it (suspicious) → it INHALES: hair whips, feet slide (scared) → sipped, spinning → portal burps shut |
| 2 | Ilocos 1763 | 12–20 | Gabriela gallops in, determined → portal opens on the road → the horse skids, she is flung over its head → lands on her bottom by the portal (dizzy) → "Ano ito?" → sipped → the horse, alone: "?" then a sad sweat drop |
| 3 | Dapitan 1890s | 20–28 | Rizal writing by candlelight (happy, thinking) → the candle bends, a portal opens on the wall → "Teka, hindi pa tapos 'yung sulat ko!" (angry, clutching the letter) → papers fly in, he hangs on to the desk, horizontal → hat pops off → sipped → the hat hovers alone… then zips in after him |
| 4 | Manila 1896 | 28–36 | Bonifacio rallies with his bolo under a red flag, "Para sa Inang Bayan!" → portal opens behind him → "Ha? Ano 'yon?!" → "Hindi ako takot sa'yo!" (determined) → he CHARGES in on his own → portal gulps and shuts |
| 5 | Time tunnel | 36–41 | All four tumble through swirling rings (dizzy / scared) → Lapu-Lapu and Bonifacio bonk heads → "SINO KA?! …SINO KAYO?!" → light at the end → white |
| 6 | Museum, 2026 | 41–47 | Portal in the ceiling drops them in a pile (KO) → Gabriela lands on her feet → Rizal's hat lands last, on Rizal → they pop up, look around, see their own portraits (starstruck) → "Nasaan tayo? Kailangan natin malaman!" → a flashlight beam sweeps over them |
| 7 | The guard | 47–52.5 | Guard + aspin march in → "HOY! Bawal 'yan dito!" (angry, dog barks) → all four: !! → Bonifacio: "TAKBO!!!" → they bolt, dust clouds → Rizal's hat is left behind… he dashes back for it → iris out |
| 8 | Logo | 52.5–55.5 | Paper, a calm portal, the four running along the bottom; the game shows the logo |
