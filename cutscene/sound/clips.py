"""Soundtracks for the 4 s hero start clips (cutscene/src/scenes/heroclips.js), made with the same synth as score.py.

    python3 sound/clips.py out          → out/clip_<hero>.wav for every hero

Times follow heroclips.js: iris open 0–.3, landing .45, line from .85, name card .95, dash 2.9, wipe 3.45, end 4.0.
"""
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import score as S  # noqa: E402

LEN = 4.0
_ = None
# Per hero: root note, lead instrument, a two-bar pentatonic motif (degrees per eighth note at 132 bpm)
STYLE = {
    'lapulapu': (57, 'gong', [0, _, 2, 4, _, 4, 2, _, 4, _, 5, _, 7, _, _, _]),
    'gabriela': (62, 'pluck', [4, _, 5, 7, _, 5, 4, _, 7, _, 9, _, 7, _, _, _]),
    'rizal': (60, 'bell', [2, _, 4, _, 7, _, 9, _, 7, 4, 7, _, 9, _, _, _]),
    'bonifacio': (55, 'gong', [0, _, 0, 2, 4, _, 4, _, 5, 4, 2, _, 4, _, _, _]),
}


def lines():
    src = (Path(__file__).parent.parent / 'src/scenes/heroclips.js').read_text()
    return {m[1]: m[2] for m in re.finditer(r"(\w+): \{\s*line: '([^']*)'", src)}


def reset():
    S.OFF = 0.0
    S.N = int(S.SR * LEN)
    S.MUS = np.zeros((2, S.N))
    S.FX = np.zeros((2, S.N))
    S.VO = np.zeros((2, S.N))
    S.rng = np.random.default_rng(11)


def clip(who, text, out):
    reset()
    root, inst, motif = STYLE[who]
    put, MUS, FX = S.put, S.MUS, S.FX
    # iris opens: a rising swish
    put(FX, 0.0, S.whoosh(0.4, 300, 3000), 0.5)
    # the entrance
    if who in ('gabriela', 'bonifacio'):
        S.steps(0.02, 0.4, 11, 0.35, -0.5 if who == 'gabriela' else 0.5)
    if who == 'gabriela':
        put(FX, 0.42, S.skid(0.4), 0.5)
    if who == 'lapulapu':
        put(FX, 0.05, S.whoosh(0.35, 200, 1800), 0.45)
    if who == 'rizal':
        put(FX, 0.05, S.whoosh(0.4, 2500, 300, up=False), 0.45)
    # landing: thud, low gong and a tom hit
    put(FX, 0.45, S.thud(0.4), 0.8)
    put(MUS, 0.45, S.big_gong(S.mtof(root - 24), 2.0), 0.45)
    put(MUS, 0.45, S.tom(110, 0.3), 0.5)
    if who == 'rizal':
        put(FX, 0.9, S.mix(S.woodblock(1600, 0.12), S.bell(2400, 0.4) * 0.5), 0.4)   # the hat lands on his head
        put(FX, 0.97, S.sparkle(0.8), 0.35)                                            # an idea!
    # the hero's motif over a drone and a light beat
    S.melody(0.6, 132, motif, root + 12, inst, 0.4)
    S.drone(0.5, 2.6, root, 0.3)
    S.beat(0.6, 2.3, 132, [1, 0, 0.5, 0], lambda: S.tom(95, 0.25), 0.35)
    S.beat(0.6, 2.3, 132, [0, 1, 0, 1], S.shaker, 0.25)
    # the name card stamps in
    put(FX, 0.95, S.mix(S.kick(0.25), S.pop(300, 0.2) * 0.5), 0.45)
    # the line
    S.babble(0.85, 2.7, who, text, sum(map(ord, text)))
    # dash off, then the brush wipe
    put(FX, 2.9, S.whoosh(0.5, 400, 4000), 0.55, 0.4)
    S.steps(2.9, 0.4, 12, 0.3, 0.4)
    put(FX, 3.45, S.whoosh(0.55, 600, 2400), 0.5, -0.2)
    put(MUS, 3.45, S.gong(S.mtof(root + 12), 0.8), 0.35)
    S.mixdown(out)


if __name__ == '__main__':
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
    for who, text in lines().items():
        clip(who, text, str(out / f'clip_{who}.wav'))
