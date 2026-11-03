#!/usr/bin/env python3
"""Shrink a hero GLB for phones: re-encode its textures as WebP (max 1024 px).

Usage: python3 -I tools/optimize_glb.py in.glb out.glb [--size 1024] [--quality 88]
Geometry is left untouched; only image bufferViews are rewritten and the binary chunk repacked.
"""
import argparse
import io
import json
import struct

from PIL import Image


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, _ = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF' and version == 2, 'not a glTF 2.0 binary'
    off, gltf, binary = 12, None, b''
    while off < len(data):
        length, kind = struct.unpack('<I4s', data[off:off + 8])
        chunk = data[off + 8:off + 8 + length]
        if kind == b'JSON':
            gltf = json.loads(chunk)
        elif kind == b'BIN\x00':
            binary = chunk
        off += 8 + length
    return gltf, binary


def write_glb(path, gltf, binary):
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    binary += b'\x00' * (-len(binary) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(binary), b'BIN\x00') + binary)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--quality', type=int, default=88)
    a = ap.parse_args()
    gltf, binary = read_glb(a.src)
    views = gltf['bufferViews']
    blobs = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    for img in gltf.get('images', []):
        i = img['bufferView']
        im = Image.open(io.BytesIO(blobs[i])).convert('RGB')
        if max(im.size) > a.size:
            im.thumbnail((a.size, a.size), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, 'WEBP', quality=a.quality, method=6)
        blobs[i] = out.getvalue()
        img['mimeType'] = 'image/webp'
    packed = b''
    for v, blob in zip(views, blobs):
        packed += b'\x00' * (-len(packed) % 4)
        v['byteOffset'] = len(packed)
        v['byteLength'] = len(blob)
        packed += blob
    gltf['buffers'] = [{'byteLength': len(packed)}]
    write_glb(a.dst, gltf, packed)
    print(f'{a.src} -> {a.dst}: {len(packed) // 1024} KB binary')


if __name__ == '__main__':
    main()
