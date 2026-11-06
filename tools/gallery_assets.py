#!/usr/bin/env python3
"""
Future Heroes Gallery asset converter.

Turns the class's raw submissions (the "FT26 Babasahin Finals Submission" folder from the
shared Drive) into phone-friendly files under public/gallery/<slug>/:
  - every PDF page and every image -> WebP, long side <= 1600 px (plus a small thumb.webp)
  - videos -> H.264 MP4, <= 1280 px wide, with a poster frame

Which file belongs to which classmate, and the page order, is the SOURCES table below; the
gallery's text (names, titles) lives in src/data/gallery.ts.

Usage: python3 tools/gallery_assets.py "<path to FT26 Babasahin Finals Submission>"
Needs pdftoppm (poppler), ffmpeg and Pillow with WebP.
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'gallery')
LONG_SIDE = 1600
THUMB = 480
QUALITY = 80

# slug -> ordered list of source files (relative to the submission folder). PDFs expand to all their pages.
SOURCES = {
    'acuna': ['Acuña_Babasahin_Finals.pdf'],  # sent in the project chat 2026-11-06
    'amargo': ['Amargo_Babasahin Finals.pdf'],  # sent in the project chat 2026-11-06
    'casantusan': ['CASANTUSAN_babasahin_finals.pdf'],
    'diaz': ['Diaz_Babasahin_Finals/JEEPNEY PHASEOUT.png', 'Diaz_Babasahin_Finals/PALIWANAG.png'],
    'esguerra': ['ESGUERRA_Nathaniel Angela/ESGUERRA_Ambag_Banga ng pagbabago.png', 'ESGUERRA_Nathaniel Angela/ESGUERRA_Ambag.pdf'],
    'factor': ['FACTOR_Babasahin_Finals/FACTOR_Babasahin_Finals1.png', 'FACTOR_Babasahin_Finals/FACTOR_Babasahin_Finals2.png'],
    'ignacio': ['IGNACIO_FINALS/WHAT-THE-PAX.png', 'IGNACIO_FINALS/SHUT-THE-PAX-DOWN.png', 'IGNACIO_FINALS/IGNACIO_REPLEKSYON.pdf'],
    'jacinto': ['JACINTO_Babasahin_Finals.pdf'],
    'kabaki': ['KABAKI_babasahin_finals.pdf'],
    'minerva': ['Minerva_Babasahin_Finals.pdf'],
    'munoz': ['MUNOZ_babasahin_finals.png'],
    'rodriguez': ['RODRIGUEZ_babasahin_finals.pdf'],
    'santos': ['Santos_Gabriel_Babasahin_Finals.pdf'],
    'sinfuego': ['SINFUEGO_babasahin_finals.pdf'],
    'stolk': ['STOLK_babasahin_finals.png'],
    'uy': ['UY_Babasahin_Finals.pdf'],
    'vargas': [
        'Vargas_Dunhill_Porsche/Ano ang ambag mo_ - Porsche Vargas.pdf',
        "Vargas_Dunhill_Porsche/May Confidential Funds uli ako sa 2027, _di ba_.png",
        'Vargas_Dunhill_Porsche/download (2).png',
        'Vargas_Dunhill_Porsche/download (3).png',
        'Vargas_Dunhill_Porsche/download (4).png',
        'Vargas_Dunhill_Porsche/A Katipunera during PH independence declration 1946.mp4',
    ],
    'vera-perez': ['VERA-PEREZ_babasahin_finals.jpg'],
}

# Tall pages to cut into separate book pages, as fractions of the page height (owner, 2026-11-06:
# Esguerra's explanation was too small to read under the drawing, so it gets its own page; the drawing
# above it repeats page 1, so only the text part is kept).
SPLITS = {
    ('esguerra', 2): [(0.359, 0.966)],
}


def split(slug, n, im):
    """The PDF/image page `n` (1-based) of `slug`, cut into parts when SPLITS says so."""
    parts = SPLITS.get((slug, n))
    if not parts:
        return [im]
    return [im.crop((0, round(a * im.height), im.width, round(b * im.height))) for a, b in parts]


def fit(im, side):
    s = min(1.0, side / max(im.size))
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im


def save_page(im, path):
    im = fit(im.convert('RGB'), LONG_SIDE)
    im.save(path, 'WEBP', quality=QUALITY, method=6)
    return {'type': 'image', 'src': os.path.basename(path), 'w': im.width, 'h': im.height}


def pdf_pages(pdf):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-r', '150', '-png', '-scale-to', str(LONG_SIDE), pdf, os.path.join(tmp, 'p')], check=True)
        for f in sorted(os.listdir(tmp)):
            with Image.open(os.path.join(tmp, f)) as im:
                yield im.copy()


def video(src, dst_dir, n):
    mp4 = os.path.join(dst_dir, f'p{n:02d}.mp4')
    poster = os.path.join(dst_dir, f'p{n:02d}-poster.webp')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'slow',
                    '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4], check=True)
    png = poster + '.png'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', '1', '-i', src, '-frames:v', '1', png], check=True)
    with Image.open(png) as im:
        page = save_page(im, poster)
    os.remove(png)
    return {'type': 'video', 'src': os.path.basename(mp4), 'poster': page['src'], 'w': page['w'], 'h': page['h']}


def main(root):
    manifest = {}
    for slug, files in SOURCES.items():
        d = os.path.join(OUT, slug)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
        pages = []
        n = 0  # source page counter (before splits)
        for rel in files:
            src = os.path.join(root, rel)
            if rel.lower().endswith('.pdf'):
                for im in pdf_pages(src):
                    n += 1
                    for part in split(slug, n, im):
                        pages.append(save_page(part, os.path.join(d, f'p{len(pages) + 1:02d}.webp')))
            elif rel.lower().endswith('.mp4'):
                pages.append(video(src, d, len(pages) + 1))
            else:
                n += 1
                with Image.open(src) as im:
                    for part in split(slug, n, im):
                        pages.append(save_page(part, os.path.join(d, f'p{len(pages) + 1:02d}.webp')))
        first = pages[0]['src'] if pages[0]['type'] == 'image' else pages[0]['poster']
        with Image.open(os.path.join(d, first)) as im:
            fit(im.convert('RGB'), THUMB).save(os.path.join(d, 'thumb.webp'), 'WEBP', quality=75, method=6)
        manifest[slug] = pages
        size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
        print(f'{slug:12s} {len(pages):2d} pages  {size / 1e6:5.1f} MB')
    # Generated page lists, read by src/data/gallery.ts (names/titles are written by hand there).
    ts = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'galleryPages.ts')
    with open(ts, 'w') as fh:
        fh.write('// Generated by tools/gallery_assets.py — do not edit by hand.\n')
        fh.write("import type { GalleryPage } from './gallery';\n\n")
        fh.write('export const GALLERY_PAGES: Record<string, GalleryPage[]> = ')
        fh.write(json.dumps(manifest, indent=2))
        fh.write(';\n')


if __name__ == '__main__':
    main(sys.argv[1])
