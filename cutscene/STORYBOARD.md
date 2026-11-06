# Balik Bayan Runner — opening (2D, hand-painted)

59.5 s, 16:9, 24 fps: a 3 s credits card, then the film (every shot time below is film time; add 3 s for video time). The Taglish speech bubbles, narrator line, era cards, tunnel years and the title are
painted in (`src/scenes/captions.js`, texts and times in `src/scenes/lines.js`, which must match the game's
`src/data/lore.ts`: a unit test checks). Keep the main action inside the centre ~1200 px so the
phone-portrait crop still reads.

## Rendering

```
npm ci
node render.mjs --sheet=5,9,14 --soft-gl --out=out/check/a.jpg   # contact sheet to review (drop --soft-gl with a GPU)
node render.mjs --frames --workers=4 --soft-gl                    # all frames → out/frames (resumable)
node render.mjs --encode --out=out/intro.mp4
```

Then make the soundtrack (original score, SFX and chibi voice blips, all synthesized; needs only numpy) and encode
the two web versions into `../public/lore/` (1280×720, with that sound):

```
python3 sound/score.py out/intro.wav      # credits sting at 0–3 s, the film's sound shifted by OFF = 3 s
ffmpeg -i out/intro.mp4 -i out/intro.wav -map 0:v -map 1:a -vf scale=1280:720 -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -c:a libopus -b:a 96k -shortest ../public/lore/intro.webm
ffmpeg -i out/intro.mp4 -i out/intro.wav -map 0:v -map 1:a -vf scale=1280:720 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart ../public/lore/intro.mp4
```

Sound times live in `sound/score.py` (`compose()` = music per scene, `effects()` = SFX, `voices()` reads `lines.js`).
If a shot's timing changes, move its sounds there too.

Watercolour `fill` is off for this film (`bayani.js` turns fills into flat washes): it costs seconds per call without a GPU.

| # | Shot | Time | Reads (one at a time) |
|---|------|------|------------------------|
| C | Credits | −3–0 | A gold museum frame: "Created by Marc Reiven Capili and Anne Marielle Dillena" types on with sparkles, fades to black |
| 0 | Title: museum at night | 0–4 | Four empty gold frames → narrator "May nawawalang mga bayani…" → a crack of light tears open in the air → flash, wipe |
| 1 | Mactan 1521 | 4–12 | Lapu-Lapu stands proud at sunset → a portal pops open over the sea (take!) → "Ano 'tong ilaw sa dagat?!" (confused) → he creeps up and pokes it (suspicious) → it INHALES: hair whips, feet slide (scared) → sipped, spinning → portal burps shut |
| 2 | Ilocos 1763 | 12–20 | Gabriela gallops in, determined → portal opens on the road → the horse skids, she is flung over its head → lands on her bottom by the portal (dizzy) → "Ano ito?" → sipped → the horse, alone: "?" then a sad sweat drop |
| 3 | Dapitan 1890s | 20–28 | Rizal writing by candlelight (happy, thinking) → the candle bends, a portal opens on the wall → "Teka, hindi pa tapos 'yung sulat ko!" (angry, clutching the letter) → papers fly in, he hangs on to the desk, horizontal → hat pops off → sipped → the hat hovers alone… then zips in after him |
| 4 | Manila 1896 | 28–36 | Bonifacio rallies with his bolo under a red flag, "Para sa Inang Bayan!" → portal opens behind him → "Ha? Ano 'yon?!" → "Hindi ako takot sa'yo!" (determined) → he CHARGES in on his own → portal gulps and shuts |
| 5 | Time tunnel | 36–41 | All four tumble through swirling rings (dizzy / scared) → Lapu-Lapu and Bonifacio bonk heads → "SINO KA?! …SINO KAYO?!" → light at the end → white |
| 6 | Museum, 2026 | 41–47 | Portal in the ceiling drops them in a pile (KO) → Gabriela lands on her feet → Rizal's hat lands last, on Rizal → they pop up, look around, see their own portraits (starstruck) → "Nasaan tayo? Kailangan natin malaman!" → a flashlight beam sweeps over them |
| 7 | The guard | 47–52.5 | Guard + aspin march in → "HOY! Bawal 'yan dito!" (angry, dog barks) → all four: !! → Bonifacio: "TAKBO!!!" → they bolt, dust clouds → Rizal's hat is left behind… he dashes back for it → iris out |
| 8 | Title | 52.5–56.5 | Portal and the four running → "Balik Bayan Runner" slams in over a sun, subtitle types on ("Takbo, bayani. Ang kasaysayan ay naghihintay!") → the title is pulled into the portal, which swells to fill the screen → white, into the game |

## Hero start clips (4 s each, played on PLAY)

`src/scenes/heroclips.js` holds four standalone loops, `LOOPS.start_<hero>`. Each clip runs:

1. An iris opens on a backdrop of wedges in the hero's colours.
2. The hero bursts in at 0.45 s: Lapu-Lapu leaps up, Gabriela skids in, Rizal drops in with his hat landing a beat later, and Bonifacio charges in with his bolo.
3. The hero strikes a signature pose and says their line (0.75–2.7 s), while a name card with their title slams in.
4. At 2.9 s the hero dashes off, and a brush wipe in the hero's colours covers the frame.

The lines and titles must match `src/data/heroClips.ts` and `src/data/heroes.ts` (a unit test checks this).

```
node render.mjs --loop=start_rizal --sheet=0.5,1,2,3 --soft-gl --out=out/check/rizal.jpg   # review
node render.mjs --loop=start_rizal --png --workers=2 --soft-gl --out=out/clip_rizal       # ~5 min a hero (4 workers time out here)
./clips.sh rizal                                                                         # sound (sound/clips.py) + web encodes → ../public/lore/start-rizal.*
```
