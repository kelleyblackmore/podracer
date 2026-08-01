import * as THREE from 'three';

/**
 * Every texture here is drawn into an offscreen canvas at load time. That keeps
 * the published site a single self-contained bundle — no image requests, no CDN,
 * and nothing to 404 on GitHub Pages.
 */

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [element, ctx];
}

/** Deterministic value noise so a track looks the same on every load. */
function hashNoise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Road surface: base colour, speckled aggregate, and a dashed centre line.
 * `u` runs along the track (repeating), `v` across it.
 */
export function createRoadTexture(base: string, line: string): THREE.CanvasTexture {
  const size = 256;
  const [element, ctx] = canvas(size, size);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Aggregate speckle.
  for (let i = 0; i < 2600; i++) {
    const x = hashNoise(i, 1, 3) * size;
    const y = hashNoise(i, 2, 7) * size;
    const shade = hashNoise(i, 3, 11);
    const alpha = 0.05 + shade * 0.12;
    ctx.fillStyle = shade > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.6})`;
    ctx.fillRect(x, y, 1 + shade * 2, 1 + shade * 2);
  }

  // Faint longitudinal wear where the racing line sits.
  const wear = ctx.createLinearGradient(0, 0, 0, size);
  wear.addColorStop(0, 'rgba(0,0,0,0)');
  wear.addColorStop(0.5, 'rgba(0,0,0,0.16)');
  wear.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, size, size);

  // Dashed centre line. The texture tiles along u, so one dash per tile reads
  // as an evenly spaced dashed line all the way around the circuit.
  ctx.fillStyle = line;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, size / 2 - 2, size * 0.45, 4);
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Alternating curb blocks, running across the strip. */
export function createCurbTexture(color: string): THREE.CanvasTexture {
  const [element, ctx] = canvas(64, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 32, 16);

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Chequered start/finish band. */
export function createCheckerTexture(): THREE.CanvasTexture {
  const size = 128;
  const cells = 8;
  const [element, ctx] = canvas(size, size);
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Loose surface beyond the white line — coarser and more mottled than the road. */
export function createRunoffTexture(base: string): THREE.CanvasTexture {
  const size = 128;
  const [element, ctx] = canvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i++) {
    const x = hashNoise(i, 5, 17) * size;
    const y = hashNoise(i, 6, 23) * size;
    const shade = hashNoise(i, 7, 29);
    ctx.fillStyle =
      shade > 0.55 ? `rgba(255,240,200,${shade * 0.16})` : `rgba(0,0,0,${shade * 0.22})`;
    ctx.fillRect(x, y, 2 + shade * 3, 2 + shade * 3);
  }
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Barrier panelling: repeating segments with an accent band along the top. */
export function createWallTexture(base: string, accent: string): THREE.CanvasTexture {
  const [element, ctx] = canvas(64, 64);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);

  // Panel seams (vertical in texture space = across the wall's length).
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, 3, 64);
  ctx.fillRect(61, 0, 3, 64);

  // v = 0 is the bottom of the wall, v = 1 the top.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 64, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, 34, 64, 30);

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function disposeTextures(textures: (THREE.Texture | null | undefined)[]): void {
  for (const texture of textures) texture?.dispose();
}
