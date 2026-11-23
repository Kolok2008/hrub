import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './noise.js';

// Viewmodel meshes are pushed toward the near plane in clip space so they never clip into the world.
function frontify(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position.z = gl_Position.z * 0.08 - 0.9 * gl_Position.w;');
  };
  return mat;
}

function flannelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#5a2a22'; g.fillRect(0, 0, 256, 256);
  const band = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let i = 0; i < 256; i += 64) {
    band(i, 0, 22, 256, 'rgba(30,25,25,0.55)'); band(0, i, 256, 22, 'rgba(30,25,25,0.55)');
    band(i + 34, 0, 6, 256, 'rgba(210,170,90,0.35)'); band(0, i + 34, 256, 6, 'rgba(210,170,90,0.35)');
  }
  const rnd = mulberry32(3);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(rnd() * 256, rnd() * 256, 1, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function woodTexture(base = '#8a5a34') {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 256); const rnd = mulberry32(8);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(40,20,8,${0.1 + rnd() * 0.2})`; g.lineWidth = 1 + rnd() * 2; const x = rnd() * 64; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, 80, x - 6, 160, x + 3, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function leatherTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#8a5a36'; g.fillRect(0, 0, 128, 128); const rnd = mulberry32(17);
  for (let i = 0; i < 1500; i++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(40,20,10,${rnd() * 0.12})` : `rgba(255,220,180,${rnd() * 0.08})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  for (let i = 0; i < 20; i++) { g.strokeStyle = 'rgba(50,28,14,0.18)'; g.beginPath(); const x = rnd() * 128, y = rnd() * 128; g.moveTo(x, y); g.lineTo(x + rnd() * 30 - 15, y + rnd() * 30 - 15); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function clothTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); g.fillStyle = 'rgba(255,255,255,0.0)';
  for (let i = 0; i < 128; i += 32) { g.fillStyle = 'rgba(240,230,210,0.9)'; g.fillRect(i, 0, 12, 128); g.fillRect(0, i, 128, 12); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}
function wickerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#5a3a1a'; g.fillRect(0, 0, 256, 256);
  const rows = 12, cols = 16;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = k * 256 / cols, y = r * 256 / rows, w = 256 / cols, h = 256 / rows;
    const over = (r + k) % 2 === 0;
    const gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, over ? '#c8955a' : '#9a6a38'); gr.addColorStop(0.5, over ? '#e2b47a' : '#b07c44'); gr.addColorStop(1, over ? '#a8763e' : '#7a5028');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w * 0.56, h * 0.44, 0, 0, Math.PI * 2); g.fill();
  }
  for (let k = 0; k <= cols; k++) { g.fillStyle = 'rgba(60,36,14,0.8)'; g.fillRect(k * 256 / cols - 1.5, 0, 3, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
}

// ---------- shared builders (also used for the close-up cutting hand) ----------
function gloveTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.drawImage(leatherTexture().image, 0, 0, 256, 256);
  g.strokeStyle = 'rgba(235,210,170,0.55)'; g.lineWidth = 2; g.setLineDash([6, 5]);
  for (const y of [40, 216]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    glove: new THREE.MeshStandardMaterial({ map: gloveTexture(), roughness: 0.7 }),
    gloveDark: new THREE.MeshStandardMaterial({ color: '#3e2818', roughness: 0.85 }),
    sleeve: new THREE.MeshStandardMaterial({ map: flannelTexture(), roughness: 0.92 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture('#7a4a28'), roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c8a868', metalness: 0.85, roughness: 0.3 }),
  };
  return SHARED;
}
const STEEL_CACHE = {};
function steelTexture(kind = 'plain') {
  if (STEEL_CACHE[kind]) return STEEL_CACHE[kind];
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
  // u runs across the blade (0 = spine, 1 = edge), v along it
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, '#7a8088'); gr.addColorStop(0.5, '#c8cdd2'); gr.addColorStop(0.78, '#e2e6ea'); gr.addColorStop(0.86, '#ffffff'); gr.addColorStop(1, '#a8aeb6');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 512);
  if (kind === 'damascus') {
    for (let y = 0; y < 512; y += 3) { g.strokeStyle = y % 6 ? 'rgba(40,44,52,0.35)' : 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5; g.beginPath(); for (let x = 0; x <= 128; x += 4) { const yy = y + Math.sin(x * 0.09 + y * 0.05) * 9 + Math.sin(x * 0.21) * 4; x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
  } else {
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * (kind === 'satin' ? 0.05 : 0.1)})`; g.fillRect(Math.random() * 128, Math.random() * 512, 1, 10 + Math.random() * 20); }
  }
  if (kind !== 'plain') { g.fillStyle = 'rgba(30,34,40,0.35)'; g.fillRect(26, 40, 10, 360); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(36, 40, 2, 360); } // fuller groove
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(108, 0, 3, 512); // honed edge
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; STEEL_CACHE[kind] = t; return t;
}
// Gloved hand. curl: 0 = open, 1 = tight fist. Forearm/sleeve extends toward +Z.
export function makeHand(curl = 1, mirror = false, withSleeve = true, wrap = (m) => m) {
  const S = shared(), m = mirror ? -1 : 1;
  const glove = wrap(S.glove.clone()), dark = wrap(S.gloveDark.clone()), sleeveM = wrap(S.sleeve.clone());
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.078, 0.03, 0.082, 4, 0.013), glove); palm.position.z = 0.012; hand.add(palm);
  const fingerLen = [[0.03, 0.022, 0.018], [0.033, 0.025, 0.019], [0.031, 0.023, 0.018], [0.025, 0.018, 0.015]];
  const xs = [-0.027, -0.009, 0.009, 0.026];
  for (let i = 0; i < 4; i++) {
    let parent = new THREE.Group(); parent.position.set(xs[i] * m, 0.002, -0.028); hand.add(parent);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8), glove); parent.add(knuckle);
    const r = i === 3 ? 0.0088 : 0.0098;
    fingerLen[i].forEach((len, k) => {
      const joint = new THREE.Group();
      joint.rotation.x = -curl * [1.15, 1.35, 1.0][k] - (1 - curl) * 0.1;
      parent.add(joint);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - k * 0.07), len, 4, 10), glove);
      seg.rotation.x = Math.PI / 2; seg.position.z = -len / 2; joint.add(seg);
      const next = new THREE.Group(); next.position.z = -len; joint.add(next); parent = next;
    });
  }
  const thumb = new THREE.Group(); thumb.position.set(0.038 * m, -0.006, -0.004); thumb.rotation.set(-0.3 - curl * 0.5, 0.9 * m * (0.5 + curl * 0.5), 0.4 * m); hand.add(thumb);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.03, 4, 10), glove); t1.rotation.x = Math.PI / 2; t1.position.z = -0.018; thumb.add(t1);
  const tj = new THREE.Group(); tj.position.z = -0.034; tj.rotation.x = -curl * 0.6; thumb.add(tj);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.022, 4, 10), glove); t2.rotation.x = Math.PI / 2; t2.position.z = -0.012; tj.add(t2);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.06, 16), glove); wrist.rotation.x = Math.PI / 2; wrist.position.z = 0.075; wrist.scale.set(1.25, 0.8, 1); hand.add(wrist);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 8, 20), dark); cuff.position.z = 0.1; cuff.scale.set(1.2, 0.85, 1); hand.add(cuff);
  if (withSleeve) {
    const prof = []; for (let i = 0; i <= 14; i++) { const y = i / 14; prof.push(new THREE.Vector2(0.046 + y * 0.022 + Math.sin(y * 19) * 0.0025 + (i === 0 ? -0.004 : 0), y * 0.5)); }
    const sl = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), sleeveM); sl.rotation.x = Math.PI / 2; sl.position.z = 0.105; sl.scale.set(1.15, 1, 0.85); hand.add(sl);
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 8, 20), sleeveM); roll.position.z = 0.115; roll.scale.set(1.15, 0.85, 1); hand.add(roll);
  }
  return hand;
}
export function makeKnife(wrap = (m) => m, look = { blade: 'drop', handle: '#7a4a28', steel: 'plain' }) {
  const S = shared();
  const knife = new THREE.Group();
  const prof = [[0, 0], [0.013, 0.002], [0.016, 0.03], [0.015, 0.07], [0.017, 0.105], [0.014, 0.11], [0, 0.11]].map(p => new THREE.Vector2(p[0], p[1]));
  const hm = new THREE.MeshStandardMaterial({ map: woodTexture(look.handle), roughness: 0.45 });
  const handle = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), wrap(hm)); handle.scale.z = 0.75; knife.add(handle);
  for (const y of [0.03, 0.07]) { const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.026, 8), wrap(S.brass.clone())); rv.rotation.x = Math.PI / 2; rv.position.y = y; knife.add(rv); }
  const guard = new THREE.Mesh(new THREE.BoxGeometry(look.blade === 'clip' ? 0.05 : 0.036, 0.008, 0.02), wrap(S.brass.clone())); guard.position.y = 0.114; knife.add(guard);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 8), wrap(S.brass.clone())); pommel.scale.y = 0.6; knife.add(pommel);
  const bs = new THREE.Shape();
  if (look.blade === 'clip') { bs.moveTo(-0.014, 0); bs.lineTo(0.013, 0); bs.lineTo(0.014, 0.1); bs.lineTo(0.004, 0.12); bs.quadraticCurveTo(-0.004, 0.15, -0.002, 0.165); bs.quadraticCurveTo(-0.012, 0.1, -0.014, 0); }
  else if (look.blade === 'hook') { bs.moveTo(-0.012, 0); bs.lineTo(0.011, 0); bs.quadraticCurveTo(0.016, 0.06, 0.004, 0.1); bs.quadraticCurveTo(-0.01, 0.11, -0.014, 0.095); bs.quadraticCurveTo(-0.004, 0.09, 0.0, 0.07); bs.quadraticCurveTo(-0.01, 0.03, -0.012, 0); }
  else { bs.moveTo(-0.012, 0); bs.lineTo(0.011, 0); bs.lineTo(0.012, 0.08); bs.quadraticCurveTo(0.011, 0.11, -0.001, 0.13); bs.quadraticCurveTo(-0.008, 0.09, -0.012, 0); }
  const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.001, bevelSegments: 2 });
  const p = bg.attributes.position, uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (0.014 - p.getX(i)) / 0.028, p.getY(i) / 0.17);
  bg.computeVertexNormals();
  const steel = new THREE.MeshStandardMaterial({ map: steelTexture(look.steel), metalness: 0.75, roughness: look.steel === 'satin' ? 0.32 : 0.22, emissive: '#30343a' });
  const blade = new THREE.Mesh(bg, wrap(steel)); blade.position.set(0, 0.118, -0.0008); knife.add(blade);
  knife.userData.steel = steel;
  if (look.brush) { // little brush on the pommel end
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), wrap(S.brass.clone())); ferrule.position.y = -0.012; knife.add(ferrule);
    const bristles = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.007, 0.028, 10), wrap(new THREE.MeshStandardMaterial({ color: '#d8c8a0', roughness: 1 }))); bristles.position.y = -0.03; knife.add(bristles);
  }
  return knife;
}

export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    // ---- right hand: fist with the knife, blade forward ----
    this.right = new THREE.Group();
    const rh = makeHand(1, false, true, frontify);
    this.right.add(rh);
    this.rh = rh; this.setKnife({ blade: 'drop', handle: '#7a4a28', steel: 'plain' });
    this.rightRest = new THREE.Vector3(0.2, -0.17, -0.36);
    this.root.add(this.right);

    // ---- left hand: holding the basket by its handle ----
    this.left = new THREE.Group();
    const basket = new THREE.Group();
    const wick = frontify(new THREE.MeshStandardMaterial({ map: wickerTexture(), roughness: 0.85, side: THREE.DoubleSide }));
    const R = 0.17;
    const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [R * 0.62, 0.0], [R * 0.85, 0.03], [R * 0.97, 0.08], [R, 0.12]].map(p => new THREE.Vector2(p[0], p[1])), 28), wick);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.013, 8, 36), frontify(new THREE.MeshStandardMaterial({ map: woodTexture('#8a5a2c'), roughness: 0.8 })));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.12;
    const handleArc = new THREE.Mesh(new THREE.TorusGeometry(R * 0.96, 0.011, 8, 28, Math.PI), frontify(new THREE.MeshStandardMaterial({ map: woodTexture('#9a6a3a'), roughness: 0.7 })));
    handleArc.position.y = 0.12;
    const cloth = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 24).rotateX(-Math.PI / 2), frontify(new THREE.MeshStandardMaterial({ color: '#b84a3a', roughness: 1, map: clothTexture() })));
    cloth.position.y = 0.025;
    basket.add(bowl, rim, handleArc, cloth);
    this.contents = new THREE.Group(); this.contents.position.y = 0.03; basket.add(this.contents);
    basket.position.set(0, -(0.12 + R * 0.96) - 0.01, 0);
    this.left.add(basket);
    const lh = makeHand(1, true, true, frontify);
    this.left.add(lh);
    this.basket = basket;
    this.leftRest = new THREE.Vector3(-0.23, -0.13, -0.56);
    this.root.add(this.left);

    this.t = 0; this.cut = 0; this.shake = 0; this.swing = 0;
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 10; } });
  }
  setKnife(look) {
    if (this.knife) this.rh.remove(this.knife);
    const knife = makeKnife(frontify, look);
    knife.rotation.set(-Math.PI / 2 + 0.45, 0, 0.3); knife.position.set(0.002, -0.012, -0.03); knife.scale.setScalar(1.25);
    knife.traverse(o => { if (o.isMesh) { o.renderOrder = 10; o.frustumCulled = false; } });
    this.rh.add(knife); this.knife = knife;
  }
  knifeDirt(n) { const m = this.knife?.userData.steel; if (m) m.color.set('#ffffff').lerp(new THREE.Color('#5a4028'), Math.min(1, n * 0.3)); }
  // Add a small copy of a picked mushroom into the basket
  addToBasket(model, capacity) {
    const m = model.clone(true);
    m.traverse(o => { if (o.isMesh) { const mm = o.material.clone(); frontify(mm); o.material = mm; o.renderOrder = 11; o.castShadow = false; o.frustumCulled = false; } });
    const i = this.contents.children.length;
    const a = i * 2.39996, r = 0.03 + 0.11 * Math.sqrt((i % 14) / 14);
    m.position.set(Math.cos(a) * r, Math.floor(i / 14) * 0.035, Math.sin(a) * r);
    m.rotation.set((Math.random() - 0.5) * 1.4, Math.random() * 6, (Math.random() - 0.5) * 1.4);
    const sc = 0.62 / Math.max(0.6, model.userData.size || 1);
    m.scale.setScalar(Math.min(0.85, sc));
    this.contents.add(m);
    this.shake = 1;
  }
  clearBasket() { while (this.contents.children.length) this.contents.remove(this.contents.children[0]); }
  update(dt, speed, crouch, step = 0, running = false) {
    this.t += dt;
    const k = Math.min(1, speed / 3);
    this.runK = (this.runK || 0) + ((running ? 1 : 0) - (this.runK || 0)) * Math.min(1, dt * 6);
    const R = this.runK, ph = step * Math.PI;
    // arms swing with the footsteps: opposite phase, bigger and lower while running
    const swingR = Math.sin(ph) * k * (0.018 + R * 0.05), swingL = -swingR * 0.6;
    const bob = Math.abs(Math.cos(ph)) * k * (0.01 + R * 0.02);
    const breathe = Math.sin(this.t * (1.6 + R * 2)) * (0.004 + R * 0.003);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    const sw = Math.sin((1 - this.swing) * Math.PI) * (this.swing > 0 ? 1 : 0);
    this.wipe = Math.max(0, (this.wipe || 0) - dt * 2);
    const wp = Math.sin(this.wipe * Math.PI);
    this.right.position.set(this.rightRest.x - sw * 0.25 - R * 0.03 + wp * -0.12, this.rightRest.y - bob + breathe + sw * 0.06 - R * 0.06 + wp * -0.08, this.rightRest.z + swingR - sw * 0.12);
    this.right.rotation.set(0.05 - sw * 0.3 + swingR * 2 - R * 0.25, -0.15 + sw * 1.4, -0.1 - sw * 0.9 + R * 0.2 + wp * 0.8);
    this.left.position.set(this.leftRest.x + R * 0.02, this.leftRest.y - bob * 0.8 + breathe - crouch * 0.05 - R * 0.05, this.leftRest.z + swingL);
    this.left.rotation.set(0.3 + swingL * 1.5, -0.75, 0.15 + Math.sin(this.t * 25) * this.shake * 0.05);
    this.basket.rotation.y = 0.75; this.basket.rotation.z = Math.sin(ph) * k * (0.06 + R * 0.12) + Math.sin(this.t * 2.1) * 0.02;
    this.basket.rotation.x = Math.cos(ph) * k * R * 0.08;
  }
}
