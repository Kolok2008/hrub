import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// ---------- species ----------
export const SPECIES = {
  porcini:    { name: 'Білий гриб',      price: 42, poison: 0, rarity: 0.10, size: 1.0, desc: 'Король лісу. Бура щільна шапка, товста світла ніжка з сіточкою, знизу трубочки замість пластинок. Росте під соснами й смереками.' },
  birch:      { name: 'Підберезник',     price: 18, poison: 0, rarity: 0.14, size: 0.95, desc: 'Сіро-бура шапка, висока тонка ніжка з темними лусочками. Шукай під листяними деревами.' },
  chanterelle:{ name: 'Лисичка',         price: 7,  poison: 0, rarity: 0.20, size: 0.55, cluster: [3, 7], desc: 'Яскраво-жовтогаряча, у формі лійки з хвилястим краєм. Росте гуртом у моху.' },
  honey:      { name: 'Опеньки',         price: 4,  poison: 0, rarity: 0.16, size: 0.45, cluster: [5, 11], desc: 'Медово-бурі маленькі шапки на тонких ніжках. Ростуть родинами на сухих деревах і біля коріння.' },
  russula:    { name: 'Сироїжка',        price: 5,  poison: 0, rarity: 0.20, size: 0.7, desc: 'Плоска яскрава шапка: червона, зелена чи жовта. Біла крихка ніжка. Найчастіший гриб у лісі.' },
  puffball:   { name: 'Дощовик',         price: 3,  poison: 0, rarity: 0.08, size: 0.6, cluster: [1, 3], desc: 'Білий круглий гриб без ніжки. Старий випускає хмару спор.' },
  flyagaric:  { name: 'Мухомор червоний',price: 0,  poison: 1, rarity: 0.08, size: 1.0, desc: 'Червона шапка з білими цятками, кільце на ніжці. Отруйний! Скупник його не візьме.' },
  golden:     { name: 'Золотий гриб',    price: 260, poison: 0, rarity: 0.005, size: 1.1, desc: 'Легендарний гриб, що світиться. Трапляється дуже рідко й лише глибоко в хащах, далеко від стежки.' },
  deathcap:   { name: 'Бліда поганка',   price: 0,  poison: 2, rarity: 0.04, size: 0.9, desc: 'Блідо-зеленкувата шапка, білі пластинки, кільце й «мішечок» біля основи. Смертельно отруйна! У житті ніколи не їж грибів, яких не знаєш.' },
};
export const SPECIES_ORDER = ['golden', 'porcini', 'birch', 'chanterelle', 'honey', 'russula', 'puffball', 'flyagaric', 'deathcap'];

// ---------- procedural textures ----------
function capTexture(base, spots, streaks, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const rnd = mulberry32(seed);
  const col = new THREE.Color(base);
  // radial: centre (v=0 top of lathe) darker or lighter
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#' + col.clone().multiplyScalar(0.78).getHexString());
  grad.addColorStop(0.6, '#' + col.getHexString());
  grad.addColorStop(1, '#' + col.clone().lerp(new THREE.Color('#f0e0c0'), 0.25).getHexString());
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { // mottling
    const x = rnd() * 256, y = rnd() * 256, r = 1 + rnd() * 5, a = 0.05 + rnd() * 0.08;
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,240,220,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  if (streaks) for (let i = 0; i < 90; i++) { const x = rnd() * 256; g.strokeStyle = `rgba(60,30,10,${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 10, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
function underTexture(kind, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  if (kind === 'gills') {
    for (let i = 0; i < 140; i++) { const a = i / 140 * Math.PI * 2; g.strokeStyle = 'rgba(80,60,40,0.28)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 18, 128 + Math.sin(a) * 18); g.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); g.stroke(); }
  } else {
    for (let y = 0; y < 256; y += 5) for (let x = 0; x < 256; x += 5) { g.fillStyle = 'rgba(90,80,20,0.22)'; g.beginPath(); g.arc(x + (y % 10 ? 2.5 : 0), y, 1.4, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = color; g.beginPath(); g.arc(128, 128, 18, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stemTexture(base, pattern) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const rnd = mulberry32(pattern.length * 7 + 3);
  if (pattern === 'scales') for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(30,25,20,${0.4 + rnd() * 0.4})`; g.fillRect(rnd() * 128, rnd() * 256, 2 + rnd() * 3, 1 + rnd() * 2); }
  if (pattern === 'net') { g.strokeStyle = 'rgba(150,120,80,0.35)'; for (let y = 0; y < 120; y += 7) for (let x = 0; x < 128; x += 9) { g.strokeRect(x + (y % 14 ? 4 : 0), y, 8, 6); } }
  if (pattern === 'fibre') for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(120,90,60,0.12)'; const x = rnd() * 128; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`; g.fillRect(rnd() * 128, rnd() * 256, 2, 2); }
  // dirt at the base (bottom of texture = v 0 → base)
  const gr = g.createLinearGradient(0, 256, 0, 200); gr.addColorStop(0, 'rgba(70,50,30,0.7)'); gr.addColorStop(1, 'rgba(70,50,30,0)');
  g.fillStyle = gr; g.fillRect(0, 200, 128, 56);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- geometry builders ----------
function lathe(profile, seg = 28) {
  // LatheGeometry faces outward when the profile runs bottom → top; caps are written top → bottom, so flip those.
  const pts = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); g.computeVertexNormals(); return g;
}
function wobble(geo, amt, seed) {
  const rnd = mulberry32(seed), p = geo.attributes.position, ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + (Math.sin(a * 3 + ph[0]) * 0.5 + Math.sin(a * 5 + ph[1]) * 0.3 + Math.sin(a * 9 + ph[2]) * 0.2) * amt;
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
}

const MAT_CACHE = {};
function mats(key, make) { return MAT_CACHE[key] || (MAT_CACHE[key] = make()); }
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, ...o });

// Each builder returns a Group with userData.cut = the part that gets picked (cap+stem) and base y=0.
function buildPorcini(rnd, s) {
  const g = new THREE.Group();
  const capCol = ['#7a4a24', '#8c5a2c', '#6a3c1e'][Math.floor(rnd() * 3)];
  const r = 0.085 * s, h = 0.11 * s;
  const stem = new THREE.Mesh(lathe([[0, 0], [r * 0.55, 0], [r * 0.72, h * 0.25], [r * 0.6, h * 0.7], [r * 0.45, h], [0, h]], 18),
    mats('porciniStem', () => std({ map: stemTexture('#e6dcc4', 'net') })));
  const cap = new THREE.Mesh(lathe([[0, r * 0.62], [r * 0.5, r * 0.58], [r * 0.85, r * 0.42], [r * 1.02, r * 0.2], [r * 1.0, r * 0.05], [r * 0.9, 0]], 28),
    mats('porciniCap' + capCol, () => std({ map: capTexture(capCol, false, false, 4), roughness: 0.55 })));
  wobble(cap.geometry, 0.04, Math.floor(rnd() * 1e6));
  cap.position.y = h;
  const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 24).rotateX(Math.PI / 2), mats('porciniUnder', () => std({ map: underTexture('pores', '#d8d098'), side: THREE.DoubleSide })));
  under.position.y = h + 0.002;
  const part = new THREE.Group(); part.add(stem, cap, under); g.add(part); g.userData.cut = part; g.userData.height = h + r * 0.62;
  return g;
}
function buildBirch(rnd, s) {
  const g = new THREE.Group();
  const r = 0.07 * s, h = 0.15 * s;
  const stem = new THREE.Mesh(lathe([[0, 0], [r * 0.38, 0], [r * 0.34, h * 0.5], [r * 0.28, h], [0, h]], 14), mats('birchStem', () => std({ map: stemTexture('#e8e2d6', 'scales') })));
  const cap = new THREE.Mesh(lathe([[0, r * 0.66], [r * 0.6, r * 0.6], [r * 0.95, r * 0.35], [r * 1.0, r * 0.1], [r * 0.85, 0]], 26), mats('birchCap', () => std({ map: capTexture('#8a6a48', false, false, 9), roughness: 0.6 })));
  wobble(cap.geometry, 0.05, Math.floor(rnd() * 1e6)); cap.position.y = h;
  const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 22).rotateX(Math.PI / 2), mats('birchUnder', () => std({ map: underTexture('pores', '#d6ccb8') })));
  under.position.y = h + 0.002;
  const part = new THREE.Group(); part.add(stem, cap, under); g.add(part); g.userData.cut = part; g.userData.height = h + r * 0.66;
  return g;
}
function buildChanterelle(rnd, s, cluster) {
  const g = new THREE.Group(); const part = new THREE.Group();
  const capMat = mats('chantCap', () => std({ color: '#e49a2a', roughness: 0.6, side: THREE.DoubleSide, emissive: '#5a2a00', emissiveIntensity: 0.15 }));
  for (let i = 0; i < cluster; i++) {
    const k = s * (0.6 + rnd() * 0.6), r = 0.04 * k, h = 0.05 * k;
    const m = new THREE.Mesh(lathe([[0, 0], [r * 0.25, 0], [r * 0.3, h * 0.5], [r * 0.6, h * 0.9], [r * 1.0, h * 1.12], [r * 1.12, h * 1.05], [r * 0.9, h * 1.0], [r * 0.5, h * 0.98], [0, h * 0.85]], 20), capMat);
    wobble(m.geometry, 0.14, Math.floor(rnd() * 1e6));
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : 0.03 + rnd() * 0.06;
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4);
    part.add(m);
  }
  g.add(part); g.userData.cut = part; g.userData.height = 0.07 * s; return g;
}
function buildHoney(rnd, s, cluster) {
  const g = new THREE.Group(); const part = new THREE.Group();
  const capMat = mats('honeyCap', () => std({ map: capTexture('#b07a3a', false, false, 21), roughness: 0.55 }));
  const stemMat = mats('honeyStem', () => std({ map: stemTexture('#d8c4a0', 'fibre') }));
  for (let i = 0; i < cluster; i++) {
    const k = s * (0.55 + rnd() * 0.6), r = 0.03 * k, h = (0.06 + rnd() * 0.05) * k * 1.4;
    const lean = new THREE.Group();
    const stem = new THREE.Mesh(lathe([[0, 0], [r * 0.22, 0], [r * 0.18, h], [0, h]], 8), stemMat);
    const cap = new THREE.Mesh(lathe([[0, r * 0.7], [r * 0.6, r * 0.55], [r * 1.0, r * 0.15], [r * 0.85, 0]], 16), capMat);
    cap.position.y = h;
    lean.add(stem, cap);
    const a = rnd() * Math.PI * 2, d = 0.01 + rnd() * 0.05;
    lean.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    lean.rotation.set(Math.sin(a) * 0.35 * rnd(), 0, -Math.cos(a) * 0.35 * rnd());
    part.add(lean);
  }
  g.add(part); g.userData.cut = part; g.userData.height = 0.1 * s; return g;
}
function buildRussula(rnd, s) {
  const g = new THREE.Group();
  const col = ['#c0302a', '#c0302a', '#6f8a3a', '#d6a83a', '#9a3a5a'][Math.floor(rnd() * 5)];
  const r = 0.07 * s, h = 0.07 * s;
  const stem = new THREE.Mesh(lathe([[0, 0], [r * 0.36, 0], [r * 0.34, h], [0, h]], 14), mats('russStem', () => std({ color: '#f2eee6' })));
  const cap = new THREE.Mesh(lathe([[0, r * 0.32], [r * 0.6, r * 0.34], [r * 0.95, r * 0.22], [r * 1.02, r * 0.08], [r * 0.95, 0]], 26), mats('russCap' + col, () => std({ map: capTexture(col, false, false, 31), roughness: 0.4 })));
  wobble(cap.geometry, 0.05, Math.floor(rnd() * 1e6)); cap.position.y = h;
  const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 24).rotateX(Math.PI / 2), mats('russUnder', () => std({ map: underTexture('gills', '#f2ecdc') })));
  under.position.y = h + 0.002;
  const part = new THREE.Group(); part.add(stem, cap, under); g.add(part); g.userData.cut = part; g.userData.height = h + r * 0.34;
  return g;
}
function buildPuffball(rnd, s, cluster) {
  const g = new THREE.Group(); const part = new THREE.Group();
  const mat = mats('puff', () => std({ map: capTexture('#f2ece0', false, false, 41), roughness: 0.85 }));
  for (let i = 0; i < cluster; i++) {
    const k = s * (0.6 + rnd() * 0.5), r = 0.045 * k;
    const m = new THREE.Mesh(lathe([[0, 0], [r * 0.5, 0], [r * 0.95, r * 0.5], [r * 1.0, r * 1.0], [r * 0.7, r * 1.5], [0, r * 1.62]], 20), mat);
    const a = rnd() * 6.28, d = i ? 0.06 + rnd() * 0.04 : 0;
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); part.add(m);
  }
  g.add(part); g.userData.cut = part; g.userData.height = 0.07 * s; return g;
}
function buildAmanita(rnd, s, deadly) {
  const g = new THREE.Group();
  const r = (deadly ? 0.075 : 0.09) * s, h = (deadly ? 0.13 : 0.15) * s;
  const stemMat = mats('amaStem', () => std({ color: '#f3efe2', roughness: 0.7 }));
  const stem = new THREE.Mesh(lathe([[0, 0], [r * 0.5, 0], [r * 0.55, r * 0.15], [r * 0.38, r * 0.3], [r * 0.3, h], [0, h]], 16), stemMat);
  const ring = new THREE.Mesh(lathe([[r * 0.3, h * 0.82], [r * 0.6, h * 0.72], [r * 0.55, h * 0.7], [r * 0.3, h * 0.78]], 16), stemMat);
  const col = deadly ? '#c8c89a' : '#d0281c';
  const cap = new THREE.Mesh(lathe([[0, r * 0.55], [r * 0.55, r * 0.5], [r * 0.9, r * 0.3], [r * 1.02, r * 0.1], [r * 0.95, 0]], 28),
    mats('amaCap' + col, () => std({ map: capTexture(col, false, deadly, deadly ? 51 : 52), roughness: deadly ? 0.6 : 0.35 })));
  wobble(cap.geometry, 0.03, Math.floor(rnd() * 1e6)); cap.position.y = h;
  const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 24).rotateX(Math.PI / 2), mats('amaUnder', () => std({ map: underTexture('gills', '#f6f2e6') })));
  under.position.y = h + 0.002;
  const part = new THREE.Group(); part.add(stem, ring, cap, under);
  if (!deadly) { // white warts
    const wartMat = mats('wart', () => std({ color: '#f6f0e2', roughness: 0.9 }));
    const wg = new THREE.IcosahedronGeometry(r * 0.07, 0);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, t = Math.sqrt(rnd()) * 0.92;
      const w = new THREE.Mesh(wg, wartMat);
      const yy = h + r * 0.55 * (1 - t * t * 0.95);
      w.position.set(Math.cos(a) * r * t, yy, Math.sin(a) * r * t); w.scale.setScalar(0.6 + rnd() * 0.8);
      part.add(w);
    }
  }
  g.add(part); g.userData.cut = part; g.userData.height = h + r * 0.55;
  return g;
}

export function buildMushroom(species, seed) {
  const rnd = mulberry32(seed);
  const sp = SPECIES[species];
  const s = sp.size * (0.8 + rnd() * 0.5);
  const cl = sp.cluster ? sp.cluster[0] + Math.floor(rnd() * (sp.cluster[1] - sp.cluster[0] + 1)) : 1;
  let g;
  switch (species) {
    case 'porcini': g = buildPorcini(rnd, s); break;
    case 'golden': {
      g = buildPorcini(rnd, s);
      g.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: '#f2c040', emissive: '#c88a10', emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }); } });
      const glow = new THREE.PointLight('#ffcc55', 1.2, 4); glow.position.y = 0.25; g.add(glow);
      break;
    }
    case 'birch': g = buildBirch(rnd, s); break;
    case 'chanterelle': g = buildChanterelle(rnd, s, cl); break;
    case 'honey': g = buildHoney(rnd, s, cl); break;
    case 'russula': g = buildRussula(rnd, s); break;
    case 'puffball': g = buildPuffball(rnd, s, cl); break;
    case 'flyagaric': g = buildAmanita(rnd, s, false); break;
    case 'deathcap': g = buildAmanita(rnd, s, true); break;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.species = species; g.userData.count = cl; g.userData.size = s;
  return g;
}

// A mound of leaves that can hide a mushroom
let pileGeo, pileMat;
export function buildLeafPile(leafTex, rnd) {
  if (!pileGeo) {
    pileGeo = new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = pileGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * 0.45); }
    pileGeo.computeVertexNormals();
    pileMat = new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 1 });
  }
  const g = new THREE.Group();
  const base = new THREE.Mesh(pileGeo, pileMat); base.receiveShadow = true; base.castShadow = true; g.add(base);
  const lg = new THREE.PlaneGeometry(0.14, 0.14);
  const lm = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  const leaves = [];
  for (let i = 0; i < 46; i++) {
    const m = new THREE.Mesh(lg, lm);
    const a = rnd() * Math.PI * 2, t = Math.sqrt(rnd());
    const x = Math.cos(a) * t * 0.33, z = Math.sin(a) * t * 0.33, y = 0.145 * (1 - t * t) + 0.01;
    m.position.set(x, y, z); m.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.9, 0, rnd() * 6.28);
    // pick an atlas quadrant via uv offset per mesh
    const q = Math.floor(rnd() * 4);
    m.onBeforeRender = () => {}; m.userData.q = q;
    g.add(m); leaves.push(m);
  }
  g.userData.leaves = leaves; g.userData.base = base;
  return g;
}
