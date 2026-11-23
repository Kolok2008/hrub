import * as THREE from 'three';
import { mulberry32, makeNoise2D, fbm } from './noise.js';


// Tileable fbm value noise sampled on an integer lattice (wraps seamlessly).
function tileFbm(size, baseCells, seed, octaves = 5) {
  const out = new Float32Array(size * size);
  const rnd = mulberry32(seed);
  let amp = 1, cells = baseCells, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(cells * cells).map(() => rnd());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * cells, fy = y / size * cells;
      const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
      const i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = lat[j0 * cells + i0], b = lat[j0 * cells + i1], c = lat[j1 * cells + i0], d = lat[j1 * cells + i1];
      out[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
    }
    norm += amp; amp *= 0.5; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const LEAF_COLS = ['#b8541c', '#d0782a', '#e09a32', '#a33b1c', '#8a4a22', '#c9a13b', '#7a3418', '#d46a1e', '#9c6a2c'];

// Draw a single leaf shape (maple-ish or oval) centered at 0,0
export function drawLeaf(g, size, color, kind = 0) {
  g.fillStyle = color;
  g.beginPath();
  if (kind === 0) { // oval beech/birch
    g.ellipse(0, 0, size * 0.32, size * 0.5, 0, 0, Math.PI * 2);
  } else { // lobed maple
    const n = 5;
    for (let i = 0; i <= n * 2; i++) {
      const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
      const r = (i % 2 === 0 ? 0.5 : 0.24) * size;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
  g.fill();
  g.strokeStyle = 'rgba(60,25,10,0.45)';
  g.lineWidth = Math.max(1, size * 0.04);
  g.beginPath(); g.moveTo(0, -size * 0.45); g.lineTo(0, size * 0.62); g.stroke();
}

// Seamless forest-floor leaf litter
export function leafLitterTexture(size = 1024) {
  const [c, g] = canvas(size);
  const rnd = mulberry32(7);
  const N = tileFbm(size, 4, 3, 5);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = N[y * size + x];
    const i = (y * size + x) * 4;
    img.data[i] = 70 + k * 40; img.data[i + 1] = 44 + k * 25; img.data[i + 2] = 26 + k * 12; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const drawWrapped = (fn, x, y, r) => {
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      g.save(); g.translate(x + ox, y + oy); fn(); g.restore();
    }
  };
  // twigs
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size, y = rnd() * size, l = 20 + rnd() * 60, a = rnd() * Math.PI;
    drawWrapped(() => { g.rotate(a); g.strokeStyle = `rgba(${50 + rnd() * 30},${32 + rnd() * 15},18,0.9)`; g.lineWidth = 2 + rnd() * 3; g.beginPath(); g.moveTo(-l / 2, 0); g.lineTo(l / 2, rnd() * 6 - 3); g.stroke(); }, x, y, l);
  }
  // leaves, several layers, darker below
  for (let layer = 0; layer < 3; layer++) {
    const count = [1400, 1100, 700][layer];
    for (let i = 0; i < count; i++) {
      const x = rnd() * size, y = rnd() * size, s = 14 + rnd() * 26;
      const col = new THREE.Color(LEAF_COLS[Math.floor(rnd() * LEAF_COLS.length)]);
      const dark = [0.45, 0.7, 1.0][layer] * (0.8 + rnd() * 0.3);
      col.multiplyScalar(dark);
      const rot = rnd() * Math.PI * 2, kind = rnd() < 0.55 ? 0 : 1;
      drawWrapped(() => { g.rotate(rot); g.shadowColor = 'rgba(20,10,4,0.5)'; g.shadowBlur = 4; drawLeaf(g, s, '#' + col.getHexString(), kind); }, x, y, s);
    }
  }
  return toTex(c, 1);
}

export function dirtTexture(size = 512) {
  const [c, g] = canvas(size);
  const rnd = mulberry32(12);
  const N = tileFbm(size, 6, 11, 6);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = N[y * size + x];
    const i = (y * size + x) * 4;
    img.data[i] = 120 + k * 70; img.data[i + 1] = 92 + k * 52; img.data[i + 2] = 64 + k * 34; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, r = 1 + rnd() * 3.5, v = 90 + rnd() * 70;
    g.fillStyle = `rgba(${v},${v * 0.85},${v * 0.7},0.8)`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 60; i++) { // a few fallen leaves on the path
    const x = rnd() * size, y = rnd() * size, s = 8 + rnd() * 12;
    g.save(); g.translate(x, y); g.rotate(rnd() * 6.3); drawLeaf(g, s, LEAF_COLS[Math.floor(rnd() * LEAF_COLS.length)], rnd() < 0.5 ? 0 : 1); g.restore();
  }
  return toTex(c, 1);
}

export function mossTexture(size = 512) {
  const [c, g] = canvas(size);
  const N = tileFbm(size, 8, 21, 6);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = N[y * size + x];
    const i = (y * size + x) * 4;
    img.data[i] = 62 + k * 40; img.data[i + 1] = 78 + k * 50; img.data[i + 2] = 30 + k * 16; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, 1);
}

// Single leaf sprite with alpha for 3D fallen/falling leaves (atlas of 4)
export function leafSpriteAtlas() {
  const [c, g] = canvas(256);
  const cols = ['#d0782a', '#b8541c', '#e0a838', '#9a3a1a'];
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate((i % 2) * 128 + 64, Math.floor(i / 2) * 128 + 64);
    drawLeaf(g, 110, cols[i], i % 2); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Recolor a green foliage texture into autumn colors (keeps alpha).
export function autumnize(srcTex, palette) {
  const img = srcTex.image;
  const w = img.width, h = img.height;
  const [c, g] = canvas(Math.max(w, h));
  c.width = w; c.height = h;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h);
  const cols = palette.map(p => new THREE.Color(p));
  const noise = makeNoise2D(palette.length * 13 + 5);
  const tmp = new THREE.Color();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d.data[i + 3] === 0) continue;
    const r = d.data[i] / 255, gg = d.data[i + 1] / 255, b = d.data[i + 2] / 255;
    const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
    const n = 0.5 + 0.5 * noise(x / 90, y / 90);
    const f = Math.min(cols.length - 1.001, n * (cols.length - 1));
    const i0 = Math.floor(f);
    tmp.copy(cols[i0]).lerp(cols[i0 + 1], f - i0);
    const shade = 0.35 + lum * 1.5;
    d.data[i] = Math.min(255, tmp.r * shade * 255);
    d.data[i + 1] = Math.min(255, tmp.g * shade * 255);
    d.data[i + 2] = Math.min(255, tmp.b * shade * 255);
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = srcTex.flipY;
  t.wrapS = srcTex.wrapS; t.wrapT = srcTex.wrapT;
  t.anisotropy = 4;
  return t;
}
