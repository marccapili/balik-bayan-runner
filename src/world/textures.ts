import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';

/** Procedurally painted canvas textures — no external image files needed. */

function tex(scene: Scene, name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, alpha = false): DynamicTexture {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx);
  t.hasAlpha = alpha;
  t.update(true);
  t.wrapU = Texture.WRAP_ADDRESSMODE;
  t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 4;
  return t;
}

/** Seeded RNG so procedural textures look identical every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 2×2 tile repeat with grout and subtle per-tile colour variation. */
export function floorTiles(scene: Scene, base: string, line: string, seed: number, pattern: 'tile' | 'wood' | 'banig' = 'tile'): DynamicTexture {
  return tex(scene, `floor_${base}`, 256, 256, (ctx) => {
    const r = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    if (pattern === 'wood') {
      for (let y = 0; y < 256; y += 32) {
        const off = (y / 32) % 2 ? 0 : 96;
        for (let x = -off; x < 256; x += 192) {
          ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.08})`;
          ctx.fillRect(x, y, 192, 32);
          ctx.strokeStyle = line;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, 192, 32);
        }
      }
      return;
    }
    if (pattern === 'banig') {
      // Woven-mat inspired diagonal checker (banig motif).
      const s = 32;
      for (let y = 0; y < 256; y += s) {
        for (let x = 0; x < 256; x += s) {
          const odd = ((x + y) / s) % 2 === 0;
          ctx.fillStyle = odd ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
          ctx.fillRect(x, y, s, s);
          ctx.strokeStyle = 'rgba(120,70,30,0.18)';
          ctx.lineWidth = 2;
          for (let k = 6; k < s; k += 8) {
            ctx.beginPath();
            if (odd) {
              ctx.moveTo(x + k, y);
              ctx.lineTo(x + k, y + s);
            } else {
              ctx.moveTo(x, y + k);
              ctx.lineTo(x + s, y + k);
            }
            ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = line;
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, 253, 253);
      return;
    }
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.06})`;
        ctx.fillRect(x * 128, y * 128, 128, 128);
      }
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, 256);
      ctx.moveTo(0, i * 128);
      ctx.lineTo(256, i * 128);
      ctx.stroke();
    }
  });
}

/** Eight-rayed sun medallion (Philippine-flag-inspired) for the main hall floor. */
export function sunMedallion(scene: Scene): DynamicTexture {
  return tex(
    scene,
    'sunMedallion',
    512,
    512,
    (ctx) => {
      ctx.clearRect(0, 0, 512, 512);
      ctx.translate(256, 256);
      ctx.fillStyle = '#1f2d6b';
      ctx.beginPath();
      ctx.arc(0, 0, 250, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 236, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(-26, -70);
        ctx.lineTo(0, -200);
        ctx.lineTo(26, -70);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 78, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        star(ctx, Math.cos(a) * 205, Math.sin(a) * 205, 16);
      }
    },
    true,
  );
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Gallery name sign. */
export function signTexture(scene: Scene, title: string, subtitle: string, bg: string, accent: string): DynamicTexture {
  return tex(scene, `sign_${title}`, 512, 160, (ctx) => {
    ctx.fillStyle = bg;
    roundRect(ctx, 4, 4, 504, 152, 24);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    roundRect(ctx, 10, 10, 492, 140, 20);
    ctx.stroke();
    ctx.fillStyle = '#fff6df';
    ctx.textAlign = 'center';
    ctx.font = '900 58px system-ui, "Segoe UI", sans-serif';
    ctx.fillText(title, 256, 86);
    ctx.fillStyle = accent;
    ctx.font = 'italic 600 28px system-ui, "Segoe UI", sans-serif';
    ctx.fillText(subtitle, 256, 128);
  });
}

/** Flag-inspired vertical banner. */
export function bannerTexture(scene: Scene, variant: number): DynamicTexture {
  return tex(scene, `banner_${variant}`, 128, 256, (ctx) => {
    const flip = variant % 2 === 1;
    ctx.fillStyle = flip ? '#c8202b' : '#1f3c9e';
    ctx.fillRect(0, 0, 64, 230);
    ctx.fillStyle = flip ? '#1f3c9e' : '#c8202b';
    ctx.fillRect(64, 0, 64, 230);
    ctx.fillStyle = '#fbf6ea';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(128, 0);
    ctx.lineTo(64, 110);
    ctx.fill();
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.arc(64, 40, 16, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillRect(64 + Math.cos(a) * 22 - 3, 40 + Math.sin(a) * 22 - 3, 6, 6);
    }
    // Swallow-tail bottom
    ctx.clearRect(0, 230, 128, 26);
    ctx.fillStyle = flip ? '#c8202b' : '#1f3c9e';
    ctx.beginPath();
    ctx.moveTo(0, 230);
    ctx.lineTo(64, 230);
    ctx.lineTo(32, 256);
    ctx.fill();
    ctx.fillStyle = flip ? '#1f3c9e' : '#c8202b';
    ctx.beginPath();
    ctx.moveTo(64, 230);
    ctx.lineTo(128, 230);
    ctx.lineTo(96, 256);
    ctx.fill();
  }, true);
}

/** Generic stylised bust silhouettes — intentionally not likenesses of real people. */
export function portraitTexture(scene: Scene, variant: number): DynamicTexture {
  const bgs = ['#2f4a8a', '#7a2f2f', '#3d6b4a', '#6b4a8a'];
  return tex(scene, `portrait_${variant}`, 128, 160, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, bgs[variant % 4] ?? '#2f4a8a');
    g.addColorStop(1, '#1a1a26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = 'rgba(255,230,190,0.85)';
    ctx.beginPath();
    ctx.arc(64, 62, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(64, 150, 46, 50, 0, Math.PI, 0);
    ctx.fill();
  });
}

/**
 * Big dark history-painting canvas for the Spoliarium exhibit: a loose, original impression
 * (torchlit arena chamber, pale figures) — deliberately not a copy of Luna's composition.
 */
export function paintingTexture(scene: Scene): DynamicTexture {
  return tex(scene, 'painting', 256, 134, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#2a1610');
    g.addColorStop(0.55, '#4a2a1a');
    g.addColorStop(1, '#1c0f0b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 134);
    const light = ctx.createRadialGradient(150, 50, 4, 150, 50, 90);
    light.addColorStop(0, 'rgba(255,190,110,0.55)');
    light.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 256, 134);
    ctx.fillStyle = 'rgba(230,200,160,0.8)';
    ctx.beginPath();
    ctx.ellipse(120, 100, 52, 9, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(196, 104, 30, 7, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,10,8,0.85)';
    for (const [x, h] of [
      [40, 70],
      [62, 60],
      [228, 66],
    ] as const)
      ctx.fillRect(x, 118 - h, 12, h);
  });
}

/** Translucent capiz-shell window grid. */
export function capizTexture(scene: Scene): DynamicTexture {
  return tex(scene, 'capiz', 128, 128, (ctx) => {
    ctx.fillStyle = '#6b3d1f';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const g = ctx.createRadialGradient(10 + x * 20 + 9, 10 + y * 20 + 9, 1, 10 + x * 20 + 9, 10 + y * 20 + 9, 12);
        g.addColorStop(0, '#fffaf0');
        g.addColorStop(1, '#e8dcc0');
        ctx.fillStyle = g;
        ctx.fillRect(6 + x * 20, 6 + y * 20, 16, 16);
      }
    }
  });
}

/** Soft round blob shadow used under characters (cheap, readable on every device). */
export function blobShadow(scene: Scene): DynamicTexture {
  return tex(
    scene,
    'blobShadow',
    128,
    128,
    (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    },
    true,
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
