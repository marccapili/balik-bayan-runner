#!/bin/bash
# Encodes the hero start clips (rendered PNGs in out/clip_<hero>/, sound from sound/clips.py) into ../public/lore/.
# Render first: node render.mjs --loop=start_<hero> --png --workers=2 --soft-gl --out=out/clip_<hero>
set -e
cd "$(dirname "$0")"
python3 sound/clips.py out
for w in ${@:-lapulapu gabriela rizal bonifacio}; do
  ffmpeg -y -loglevel error -framerate 24 -i out/clip_$w/f%04d.png -i out/clip_$w.wav -map 0:v -map 1:a -vf scale=1280:720 \
    -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -pix_fmt yuv420p -c:a libopus -b:a 96k -shortest ../public/lore/start-$w.webm
  ffmpeg -y -loglevel error -framerate 24 -i out/clip_$w/f%04d.png -i out/clip_$w.wav -map 0:v -map 1:a -vf scale=1280:720 \
    -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart ../public/lore/start-$w.mp4
  echo "start-$w: $(du -h ../public/lore/start-$w.webm | cut -f1) webm, $(du -h ../public/lore/start-$w.mp4 | cut -f1) mp4"
done
