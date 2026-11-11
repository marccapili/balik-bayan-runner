#!/usr/bin/env python3
"""Builds the game's logo and app icon as SVG (text converted to outlines, so no font is needed).

Usage:
  pip install fonttools brotli
  python3 tools/build_logo.py src/assets/fonts/baloo-2-latin-800-normal.woff2

Writes:
  src/assets/brand/logo.svg   wordmark over the eight-ray sun (loading screen, share image)
  public/icon.svg             square app icon (browser tab, home screen)
"""
import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

NAVY = "#0f1430"
NAVY_2 = "#1f2d6b"
GOLD = "#f2c14e"
GOLD_HI = "#ffe59a"
GOLD_DEEP = "#c9892b"
RED = "#c8202b"
RED_DEEP = "#8e141d"
CREAM = "#fff6df"


def text_path(font, text, size, x, y, tracking=0.0, skew=0.0):
    """Outline of `text` with its baseline starting at (x, y). Returns (path d, width)."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    s = size / font["head"].unitsPerEm
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}")
    cx = x
    for ch in text:
        name = cmap[ord(ch)]
        # y is flipped (font units go up, SVG goes down); skew leans the letters forward.
        gs[name].draw(TransformPen(pen, (s, 0, -skew * s, -s, cx, y)))
        cx += hmtx[name][0] * s + tracking
    return pen.getCommands(), cx - tracking - x


def text_width(font, text, size, tracking=0.0):
    return text_path(font, text, size, 0, 0, tracking)[1]


def sun(cx, cy, r_core, r_in, r_out, rays=8, half_width=0.2):
    """Eight-ray sun: a disc plus pointed rays (triangles) around it."""
    parts = []
    for i in range(rays):
        a = -math.pi / 2 + i * 2 * math.pi / rays
        tip = (cx + math.cos(a) * r_out, cy + math.sin(a) * r_out)
        l = (cx + math.cos(a - half_width) * r_in, cy + math.sin(a - half_width) * r_in)
        r = (cx + math.cos(a + half_width) * r_in, cy + math.sin(a + half_width) * r_in)
        parts.append(f"M{l[0]:.1f},{l[1]:.1f}L{tip[0]:.1f},{tip[1]:.1f}L{r[0]:.1f},{r[1]:.1f}Z")
    return "".join(parts), f'<circle cx="{cx}" cy="{cy}" r="{r_core}"/>'


def build_logo(font):
    W, H = 800, 380
    size1 = 120
    t1 = "BALIK BAYAN"
    w1 = text_width(font, t1, size1, 1.5)
    x1 = (W - w1) / 2
    y1 = 226
    d1, _ = text_path(font, t1, size1, x1 + 8, y1, 1.5, skew=0.08)

    size2 = 62
    t2 = "RUNNER"
    w2 = text_width(font, t2, size2, 9)
    x2 = (W - w2) / 2
    y2 = 318
    d2, _ = text_path(font, t2, size2, x2 + 6, y2, 9, skew=0.12)

    rays, core = sun(W / 2, 150, 66, 82, 142)
    # Ribbon behind RUNNER: a bar leaning forward, like the letters.
    rx0, rx1, ry0, ry1 = x2 - 40, x2 + w2 + 40, y2 - 56, y2 + 18
    lean = 10
    ribbon = f"M{rx0 + lean:.1f},{ry0}L{rx1 + lean:.1f},{ry0}L{rx1 - lean:.1f},{ry1}L{rx0 - lean:.1f},{ry1}Z"
    # Speed streaks trailing the ribbon.
    streaks = "".join(
        f'<rect x="{rx0 - 78 + i * 16}" y="{ry0 + 12 + i * 20}" width="{52 - i * 10}" height="7" rx="3.5"/>' for i in range(3)
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Balik Bayan Runner">
  <defs>
    <linearGradient id="bbr-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{GOLD_HI}"/><stop offset="0.55" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_DEEP}"/>
    </linearGradient>
    <linearGradient id="bbr-cream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="{CREAM}"/><stop offset="1" stop-color="#f3d9a4"/>
    </linearGradient>
    <linearGradient id="bbr-red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0303b"/><stop offset="1" stop-color="{RED}"/>
    </linearGradient>
  </defs>
  <g fill="url(#bbr-gold)" stroke="{NAVY}" stroke-width="7" stroke-linejoin="round" paint-order="stroke">
    <path d="{rays}"/>{core}
  </g>
  <g>
    <path d="{d1}" transform="translate(0 9)" fill="{NAVY}" stroke="{NAVY}" stroke-width="18" stroke-linejoin="round"/>
    <path d="{d1}" fill="url(#bbr-cream)" stroke="{NAVY_2}" stroke-width="12" stroke-linejoin="round" paint-order="stroke"/>
  </g>
  <g fill="{GOLD}" opacity="0.9">{streaks}</g>
  <path d="{ribbon}" transform="translate(0 6)" fill="{NAVY}"/>
  <path d="{ribbon}" fill="url(#bbr-red)" stroke="{NAVY}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"/>
  <path d="{d2}" transform="translate(0 4)" fill="{RED_DEEP}"/>
  <path d="{d2}" fill="{CREAM}"/>
</svg>
"""


def build_icon(font):
    S = 512
    rays, core = sun(S / 2, 236, 96, 122, 208, half_width=0.21)
    size = 150
    w = text_width(font, "BBR", size, 4)
    d, _ = text_path(font, "BBR", size, (S - w) / 2 + 8, 444, 4, skew=0.1)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.38" r="0.75">
      <stop offset="0" stop-color="#2b3d8f"/><stop offset="0.6" stop-color="{NAVY_2}"/><stop offset="1" stop-color="{NAVY}"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{GOLD_HI}"/><stop offset="0.55" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="{S}" height="{S}" rx="112" fill="url(#bg)"/>
  <g fill="url(#gold)" stroke="{NAVY}" stroke-width="12" stroke-linejoin="round" paint-order="stroke">
    <path d="{rays}"/>{core}
  </g>
  <path d="{d}" transform="translate(0 10)" fill="{NAVY}" stroke="{NAVY}" stroke-width="26" stroke-linejoin="round"/>
  <path d="{d}" fill="{CREAM}" stroke="{RED}" stroke-width="18" stroke-linejoin="round" paint-order="stroke"/>
</svg>
"""


def main():
    font = TTFont(sys.argv[1] if len(sys.argv) > 1 else "src/assets/fonts/baloo-2-latin-800-normal.woff2")
    Path("src/assets/brand").mkdir(parents=True, exist_ok=True)
    Path("src/assets/brand/logo.svg").write_text(build_logo(font), encoding="utf8")
    Path("public/icon.svg").write_text(build_icon(font), encoding="utf8")
    print("wrote src/assets/brand/logo.svg and public/icon.svg")


if __name__ == "__main__":
    main()
