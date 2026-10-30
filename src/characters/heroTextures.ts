import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import { applyRim } from '../world/materials';

/**
 * Canvas-painted textures for the heroes: anime-style faces and cloth patterns.
 *
 * UV facts (verified with a probe render, Babylon 9):
 * - Sphere: u = 0.75 faces local +z (the hero's front); the canvas maps upside-down AND mirrored,
 *   so the face is painted on a 512² sub-canvas and stamped rotated 180°.
 * - Cylinder: u = 0.75 faces +z; canvas top = cylinder top, mirrored horizontally.
 */

export interface FaceSpec {
  skin: string;
  brow: string;
  iris: string;
  lash: string;
  /** 'frown' = determined, 'flat' = calm. */
  mouth: 'frown' | 'flat' | 'smirk';
  /** Longer lashes + softer brows. */
  feminine?: boolean;
  /** Brow angle in radians (inner end lower = determined). */
  browTilt: number;
}

const cache = new WeakMap<Scene, Map<string, StandardMaterial>>();

function cached(scene: Scene, key: string, make: () => StandardMaterial): StandardMaterial {
  let c = cache.get(scene);
  if (!c) cache.set(scene, (c = new Map()));
  let m = c.get(key);
  if (!m) c.set(key, (m = make()));
  return m;
}

function texMaterial(scene: Scene, name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, rim = 0.35): StandardMaterial {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx);
  t.update(true);
  t.anisotropicFilteringLevel = 4;
  const m = new StandardMaterial(`${name}_mat`, scene);
  m.diffuseTexture = t;
  m.specularColor = new Color3(0.04, 0.04, 0.04);
  m.emissiveColor = new Color3(0.13, 0.12, 0.12);
  if (rim) applyRim(m, rim);
  m.freeze();
  return m;
}

/** Head material: skin + painted face on the +z side. */
export function faceMaterial(scene: Scene, id: string, f: FaceSpec): StandardMaterial {
  return cached(scene, `face_${id}`, () =>
    texMaterial(scene, `face_${id}`, 1024, 512, (ctx) => {
      ctx.fillStyle = f.skin;
      ctx.fillRect(0, 0, 1024, 512);
      const face = document.createElement('canvas');
      face.width = face.height = 512;
      paintFace(face.getContext('2d')!, f);
      ctx.save();
      ctx.translate(768, 256);
      ctx.rotate(Math.PI);
      ctx.drawImage(face, -256, -256);
      ctx.restore();
    }),
  );
}

/** Draws an upright face centred at (256, 256); the head's equator is y = 256. */
function paintFace(ctx: CanvasRenderingContext2D, f: FaceSpec): void {
  // Blush
  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(256 + side * 92, 318, 2, 256 + side * 92, 318, 34);
    g.addColorStop(0, 'rgba(235,120,105,0.55)');
    g.addColorStop(1, 'rgba(235,120,105,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(256 + side * 92, 318, 36, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const side of [-1, 1]) {
    const cx = 256 + side * 58;
    const cy = 276;
    // Sclera
    ctx.fillStyle = '#fffaf4';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 30, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    // Iris with vertical gradient
    const ig = ctx.createLinearGradient(cx, cy - 34, cx, cy + 34);
    ig.addColorStop(0, '#1a0f08');
    ig.addColorStop(0.55, f.iris);
    ig.addColorStop(1, lighten(f.iris, 0.35));
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.ellipse(cx + side * -2, cy + 3, 24, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#120a06';
    ctx.beginPath();
    ctx.ellipse(cx + side * -2, cy + 2, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 9, cy - 10, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 9, cy + 15, 4, 0, Math.PI * 2);
    ctx.fill();
    // Upper lid: thick dark line, flattened and angled down toward the nose (determined look)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(side * -0.2);
    ctx.fillStyle = f.lash;
    ctx.beginPath();
    ctx.moveTo(-36, -12);
    ctx.quadraticCurveTo(0, -46, 36, -14);
    ctx.lineTo(side > 0 ? 44 : 38, side > 0 ? -20 : -8);
    ctx.quadraticCurveTo(0, -36, -36, -2);
    ctx.closePath();
    ctx.fill();
    // Outer-corner flick
    ctx.beginPath();
    const ox = side * 34;
    ctx.moveTo(ox, -14);
    ctx.lineTo(ox + side * (f.feminine ? 16 : 9), f.feminine ? -24 : -18);
    ctx.lineTo(ox - side * 2, -4);
    ctx.fill();
    // Lower lid hint
    ctx.strokeStyle = 'rgba(90,50,35,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 2, 30, 0.35 * Math.PI, 0.65 * Math.PI);
    ctx.stroke();
    ctx.restore();
    // Brow: thick tapered stroke, inner end lower
    ctx.save();
    ctx.translate(cx + side * 2, cy - 56);
    ctx.rotate(-side * f.browTilt);
    ctx.fillStyle = f.brow;
    ctx.beginPath();
    const bw = f.feminine ? 34 : 40;
    const bt = f.feminine ? 9 : 14;
    ctx.moveTo(-side * bw, bt * 0.6);
    ctx.quadraticCurveTo(0, -bt * 1.4, side * bw, -bt * 0.2);
    ctx.quadraticCurveTo(0, bt * 0.4, -side * bw, bt * 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Nose: tiny shaded tip
  ctx.fillStyle = darken(f.skin, 0.18);
  ctx.beginPath();
  ctx.ellipse(256, 322, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#6e2d22';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (f.mouth === 'frown') {
    ctx.moveTo(244, 358);
    ctx.quadraticCurveTo(256, 354, 268, 358);
  } else if (f.mouth === 'smirk') {
    ctx.moveTo(240, 356);
    ctx.quadraticCurveTo(258, 362, 274, 352);
  } else {
    ctx.moveTo(242, 357);
    ctx.lineTo(270, 357);
  }
  ctx.stroke();
}

/** Lapu-Lapu's tattooed torso (cylinder UVs; tattoos centred on the chest at u = 0.75). */
export function tattooTorso(scene: Scene, skin: string): StandardMaterial {
  return cached(scene, 'tattooTorso', () =>
    texMaterial(scene, 'tattooTorso', 512, 256, (ctx) => {
      ctx.fillStyle = skin;
      ctx.fillRect(0, 0, 512, 256);
      const ink = '#3b2418';
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = 7;
      const cx = 384;
      // Chest arcs (pectoral tattoo bands)
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(cx + side * 34, 30 + i * 16, 40, side > 0 ? 0.2 * Math.PI : 0.45 * Math.PI, side > 0 ? 0.55 * Math.PI : 0.8 * Math.PI);
          ctx.stroke();
        }
        // Zigzag down the side
        ctx.beginPath();
        for (let k = 0; k < 6; k++) ctx.lineTo(cx + side * (70 + (k % 2) * 12), 20 + k * 24);
        ctx.stroke();
        // Triangles row on shoulder band
        for (let k = 0; k < 4; k++) {
          const x = cx + side * (40 + k * 14);
          ctx.beginPath();
          ctx.moveTo(x - 6, 8);
          ctx.lineTo(x + 6, 8);
          ctx.lineTo(x, 22);
          ctx.fill();
        }
      }
      // Sternum diamond chain
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(cx, 70 + k * 30);
        ctx.lineTo(cx + 9, 82 + k * 30);
        ctx.lineTo(cx, 94 + k * 30);
        ctx.lineTo(cx - 9, 82 + k * 30);
        ctx.fill();
      }
      // Ab definition (soft shading)
      ctx.strokeStyle = 'rgba(110,60,35,0.35)';
      ctx.lineWidth = 4;
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.moveTo(cx - 26, 150 + r * 30);
        ctx.lineTo(cx + 26, 150 + r * 30);
        ctx.stroke();
      }
      // Back tattoo band
      ctx.strokeStyle = ink;
      ctx.lineWidth = 6;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) ctx.lineTo(64 + k * 14, 40 + i * 26 + (k % 2) * 12);
        ctx.stroke();
      }
    }),
  );
}

/** Woven/ikat-inspired cloth for skirts, bahag and headbands. */
export function patternCloth(scene: Scene, key: string, base: string, accent: string, dark: string, style: 'tapis' | 'bahag' | 'band'): StandardMaterial {
  return cached(scene, `cloth_${key}`, () =>
    texMaterial(
      scene,
      `cloth_${key}`,
      512,
      256,
      (ctx) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 512, 256);
        if (style === 'tapis') {
          // Horizontal stripes with a diamond band, like a woven tapis skirt.
          const bands = [24, 70, 150, 210];
          for (const y of bands) {
            ctx.fillStyle = dark;
            ctx.fillRect(0, y, 512, 10);
            ctx.fillStyle = accent;
            ctx.fillRect(0, y + 12, 512, 4);
          }
          ctx.fillStyle = accent;
          for (let x = 0; x < 512; x += 32) {
            ctx.beginPath();
            ctx.moveTo(x + 16, 92);
            ctx.lineTo(x + 30, 110);
            ctx.lineTo(x + 16, 128);
            ctx.lineTo(x + 2, 110);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = dark;
            ctx.fillRect(x + 13, 107, 6, 6);
            ctx.fillStyle = accent;
          }
          // Fine vertical weave lines
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          for (let x = 0; x < 512; x += 6) ctx.fillRect(x, 0, 2, 256);
        } else if (style === 'bahag') {
          ctx.fillStyle = accent;
          ctx.fillRect(0, 0, 512, 18);
          ctx.fillRect(0, 238, 512, 18);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 6;
          for (let x = 0; x < 512; x += 64) {
            ctx.beginPath();
            ctx.moveTo(x + 8, 60);
            ctx.lineTo(x + 32, 120);
            ctx.lineTo(x + 56, 60);
            ctx.moveTo(x + 8, 200);
            ctx.lineTo(x + 32, 140);
            ctx.lineTo(x + 56, 200);
            ctx.stroke();
          }
          ctx.fillStyle = dark;
          for (let x = 0; x < 512; x += 64) ctx.fillRect(x + 28, 124, 8, 8);
        } else {
          // Headband: stripes + small diamonds
          ctx.fillStyle = dark;
          ctx.fillRect(0, 30, 512, 16);
          ctx.fillRect(0, 210, 512, 16);
          ctx.fillStyle = accent;
          for (let x = 0; x < 512; x += 28) {
            ctx.beginPath();
            ctx.moveTo(x + 14, 90);
            ctx.lineTo(x + 26, 128);
            ctx.lineTo(x + 14, 166);
            ctx.lineTo(x + 2, 128);
            ctx.closePath();
            ctx.fill();
          }
        }
      },
      0.3,
    ),
  );
}

/** Embroidered trim strip (blouse neckline / cuffs). */
export function embroideryTrim(scene: Scene): StandardMaterial {
  return cached(scene, 'trim', () =>
    texMaterial(
      scene,
      'trim',
      512,
      64,
      (ctx) => {
        ctx.fillStyle = '#f6efe2';
        ctx.fillRect(0, 0, 512, 64);
        ctx.fillStyle = '#b8402c';
        ctx.fillRect(0, 26, 512, 4);
        for (let x = 0; x < 512; x += 20) {
          ctx.beginPath();
          ctx.moveTo(x + 10, 10);
          ctx.lineTo(x + 18, 28);
          ctx.lineTo(x + 10, 46);
          ctx.lineTo(x + 2, 28);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillRect(0, 54, 512, 4);
      },
      0.3,
    ),
  );
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `rgb(${ch.join(',')})`;
}
const lighten = (hex: string, a: number): string => shade(hex, a);
const darken = (hex: string, a: number): string => shade(hex, -a);
