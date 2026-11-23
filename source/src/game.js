import * as THREE from 'three';
import { SPECIES, SPECIES_ORDER, buildMushroom, buildLeafPile } from './mushrooms.js';
import { heightAt, pathDist, mossAt, WORLD, PATH, HUT } from './world.js';
import { mulberry32 } from './noise.js';
import { makeHand, makeKnife } from './viewmodel.js';

export const KNIVES = [
  { id: 'folding', name: 'Складаний ніж', cost: 0, tol: 0.0045, dmg: 1, desc: 'Простий старий ніж. Ріже, але без запасу точності.', look: { blade: 'drop', handle: '#7a4a28', steel: 'plain' } },
  { id: 'hunter', name: 'Мисливський ніж', cost: 150, tol: 0.006, dmg: 2, desc: 'Важкий і гострий. Вовки його бояться.', look: { blade: 'clip', handle: '#3a2418', steel: 'satin' } },
  { id: 'forager', name: 'Ніж грибника з щіточкою', cost: 240, tol: 0.0085, dmg: 1, desc: 'Вигнуте лезо для точного зрізу ніжки та щіточка, щоб ніж не бруднився.', look: { blade: 'hook', handle: '#c8a060', steel: 'satin', brush: true } },
  { id: 'damascus', name: 'Дамаський ніж', cost: 520, tol: 0.0095, dmg: 3, desc: 'Сталь із візерунком. Найточніший і найсильніший.', look: { blade: 'drop', handle: '#5a1e14', steel: 'damascus' } },
];
export const UPGRADES = [
  { id: 'basket', name: 'Великий кошик', levels: [{ cap: 12, cost: 0 }, { cap: 20, cost: 120 }, { cap: 32, cost: 320 }], desc: 'Більше місця для грибів.' },
  { id: 'guide', name: 'Атлас-визначник', levels: [{ on: 0, cost: 0 }, { on: 1, cost: 60 }], desc: 'Показує назву гриба й попереджає про отруйні.' },
  { id: 'compass', name: 'Компас', levels: [{ on: 0, cost: 0 }, { on: 1, cost: 80 }], desc: 'Стрілка завжди вказує на хатинку скупника.' },
  { id: 'lamp', name: 'Ліхтарик', levels: [{ on: 0, cost: 0 }, { on: 1, cost: 140 }], desc: 'Світло в сутінках і вночі.' },
];

const SAVE_KEY = 'hrybnyk-save-v1';
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1) return s; } catch (e) { /* storage unavailable */ }
  return null;
}
export function newSave() { return { v: 1, day: 1, money: 0, orders: null, knives: ['folding'], knife: 'folding', up: { basket: 0, knife: 0, guide: 0, compass: 0, lamp: 0 }, atlas: {}, stats: { picked: 0, earned: 0, perfect: 0 } }; }
export function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

export class Game {
  constructor({ scene, camera, world, player, vm, audio, ui, leafTex, save }) {
    Object.assign(this, { scene, camera, world, player, vm, audio, ui, leafTex, save });
    this.mushrooms = []; // {group, species, x, z, pile, alive}
    this.basket = [];    // {species, quality}
    this.group = new THREE.Group(); scene.add(this.group);
    this.cutState = null; this.flying = []; this.particles = [];
    this.rnd = mulberry32(save.day * 977 + 13);
    this.effects = { dizzy: 0 };
    this.buildParticles();
    this.spawnAll();
    this.mouseDown = false;
    this.combo = 0;
    this.debuffs = { dirty: 0, bitten: 0, dizzy: 0 };
    if (!this.save.orders || this.save.orders.day !== this.save.day) this.makeOrders();
  }
  makeOrders() {
    const pool = ['porcini', 'birch', 'chanterelle', 'honey', 'russula', 'puffball'];
    const pick = () => pool[Math.floor(this.rnd() * pool.length)];
    const a = pick(); let b = pick(); while (b === a) b = pick();
    const mk = (sp) => { const base = { porcini: [2, 90], birch: [3, 70], chanterelle: [8, 60], honey: [12, 55], russula: [5, 40], puffball: [4, 35] }[sp]; return { species: sp, n: base[0], reward: base[1], done: false }; };
    this.save.orders = { day: this.save.day, list: [mk(a), mk(b)] };
  }
  get cap() { return UPGRADES[0].levels[this.save.up.basket].cap; }
  get knife() { if (!this.save.knives) { this.save.knives = ['folding']; this.save.knife = 'folding'; } return KNIVES.find(k => k.id === this.save.knife) || KNIVES[0]; }
  get zone() { return this.knife.tol; }
  basketCount() { return this.basket.reduce((a, b) => a + b.slots, 0); }

  // ---------- spawning ----------
  pickSpecies(x, z) {
    // habitat weighting from nearby trees
    let pine = 0, decid = 0, dead = 0;
    for (const t of this.world.trees) { const d2 = (t.x - x) ** 2 + (t.z - z) ** 2; if (d2 < 64) { if (t.kind === 'pine') pine++; else if (t.kind === 'dead') dead++; else decid++; } }
    const moss = mossAt(x, z);
    const w = {
      porcini: 0.6 + pine * 0.9, birch: 0.5 + decid * 0.8, chanterelle: 0.4 + moss * 3, honey: 0.3 + dead * 6,
      russula: 1.6, puffball: 0.6, flyagaric: 0.5 + pine * 0.3 + decid * 0.2, deathcap: 0.25 + decid * 0.15,
    };
    let sum = 0; for (const k in w) sum += w[k];
    let r = this.rnd() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'russula';
  }
  spawnOne(nearPlayer = false) {
    for (let tries = 0; tries < 40; tries++) {
      let x, z;
      if (nearPlayer) { const a = this.rnd() * Math.PI * 2, d = 45 + this.rnd() * 40; x = this.player.pos.x + Math.cos(a) * d; z = this.player.pos.z + Math.sin(a) * d; }
      else if (this.rnd() < 0.3) { const s = PATH.samples[Math.floor(this.rnd() * PATH.samples.length)]; x = s.x + (this.rnd() - 0.5) * 22; z = s.z + (this.rnd() - 0.5) * 22; }
      else { x = (this.rnd() - 0.5) * (WORLD - 30); z = (this.rnd() - 0.5) * (WORLD - 30); }
      if (Math.abs(x) > WORLD / 2 - 15 || Math.abs(z) > WORLD / 2 - 15) continue;
      const pd = pathDist(x, z);
      if (pd < 1.6) continue;
      if (Math.hypot(x - HUT.x, z - HUT.z) < 7) continue;
      const golden = pd > (this.save.story?.choice === 'protect' ? 15 : 30) && this.rnd() < (this.save.story?.choice === 'protect' ? 0.09 : 0.025);
      if (this.world.colliders.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.2) ** 2)) continue;
      if (this.mushrooms.some(m => m.alive && (m.x - x) ** 2 + (m.z - z) ** 2 < 4)) continue;
      // further from the path → more valuable finds
      let species = golden ? 'golden' : this.pickSpecies(x, z);
      if (pd < 6 && (species === 'porcini') && this.rnd() < 0.6) species = 'russula';
      const g = buildMushroom(species, Math.floor(this.rnd() * 1e9));
      const y = heightAt(x, z);
      g.position.set(x, y - 0.01, z); g.rotation.y = this.rnd() * 6.28;
      // tilt to the terrain
      const nx = heightAt(x + 0.3, z) - heightAt(x - 0.3, z), nz = heightAt(x, z + 0.3) - heightAt(x, z - 0.3);
      g.rotation.x = nz * 0.6; g.rotation.z = -nx * 0.6;
      this.group.add(g);
      let pile = null;
      if (this.rnd() < 0.22 && species !== 'honey' && species !== 'golden') {
        pile = buildLeafPile(this.leafTex, this.rnd);
        pile.position.set(x, y - 0.02, z); pile.rotation.y = this.rnd() * 6.28; this.group.add(pile);
        g.visible = false;
      }
      this.mushrooms.push({ group: g, species, x, z, pile, alive: true, born: performance.now() });
      return;
    }
  }
  spawnAll() {
    for (const m of this.mushrooms) { this.group.remove(m.group); if (m.pile) this.group.remove(m.pile); }
    this.mushrooms = [];
    const sick = this.save.story?.choice === 'sell';
    for (let i = 0; i < (sick ? 110 : 230); i++) this.spawnOne();
    // a guaranteed few right near the start so the first minute has finds
    const s = PATH.samples[4];
    for (const [dx, dz, sp] of [[3.2, 1.5, 'russula'], [-3.5, 2.5, 'chanterelle'], [4.5, -2, 'flyagaric']]) {
      const x = s.x + dx, z = s.z + dz; const g = buildMushroom(sp, Math.floor(this.rnd() * 1e9)); g.position.set(x, heightAt(x, z) - 0.01, z); this.group.add(g);
      this.mushrooms.push({ group: g, species: sp, x, z, pile: null, alive: true });
    }
  }

  // ---------- particles ----------
  buildParticles() {
    const N = 300;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 3); this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.scene.add(this.points);
    this.pNext = 0;
  }
  emit(pos, n, color, speed = 1.5, up = 2) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const k = this.pNext = (this.pNext + 1) % this.pLife.length;
      this.pPos.set([pos.x, pos.y, pos.z], k * 3);
      const cc = c.clone().multiplyScalar(0.7 + Math.random() * 0.5);
      this.pCol.set([cc.r, cc.g, cc.b], k * 3);
      this.pVel.set([(Math.random() - 0.5) * speed, Math.random() * up, (Math.random() - 0.5) * speed], k * 3);
      this.pLife[k] = 0.6 + Math.random() * 0.6;
    }
  }
  updateParticles(dt) {
    for (let k = 0; k < this.pLife.length; k++) {
      if (this.pLife[k] <= 0) { this.pPos[k * 3 + 1] = -999; continue; }
      this.pLife[k] -= dt;
      this.pVel[k * 3 + 1] -= 6 * dt;
      this.pPos[k * 3] += this.pVel[k * 3] * dt; this.pPos[k * 3 + 1] += this.pVel[k * 3 + 1] * dt; this.pPos[k * 3 + 2] += this.pVel[k * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- targeting ----------
  findTarget() {
    const cam = this.camera, dir = new THREE.Vector3(); cam.updateMatrixWorld(); cam.getWorldDirection(dir);
    let best = null, bestScore = 1e9;
    for (const m of this.mushrooms) {
      if (!m.alive) continue;
      const tx = m.x, ty = heightAt(m.x, m.z) + 0.06, tz = m.z;
      const to = new THREE.Vector3(tx - cam.position.x, ty - cam.position.y, tz - cam.position.z);
      const d = to.length(); if (d > 2.6) continue;
      to.normalize(); const dot = to.dot(dir);
      if (dot < 0.9) continue;
      const score = d * (1.6 - dot);
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ---------- close-up cutting ----------
  // Click a mushroom → the camera kneels down next to it. Move the knife with the mouse to the green
  // line near the ground, hold the button and drag the blade through the stem.
  buildCutRig() {
    const rig = new THREE.Group();
    const hand = makeHand(1, false, true);
    const knife = makeKnife(undefined, this.knife.look); knife.rotation.set(-Math.PI / 2 + 0.45, 0, 0.3); knife.position.set(0.002, -0.012, -0.03); knife.scale.setScalar(1.25);
    hand.add(knife);
    // orient so the blade lies flat and points across the stem (local -X)
    hand.rotation.set(0, -Math.PI / 2, 0);
    const pivot = new THREE.Group(); pivot.rotation.z = -0.3; pivot.add(hand);
    hand.position.set(0.0, 0.0, 0.0);
    pivot.position.set(-0.2, 0.02, 0.02);
    rig.add(pivot);
    rig.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const guide = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: '#9bd24f', transparent: true, opacity: 0.85, depthTest: false }));
    guide.rotation.x = Math.PI / 2; guide.renderOrder = 20;
    this.cutRig = rig; this.cutGuide = guide;
    this.scene.add(rig, guide); rig.visible = guide.visible = false;
  }
  press() {
    const c = this.cutState;
    if (c && c.phase === 'closeup') { c.down = true; c.startSide = Math.sign(c.kx) || -1; return; }
    if (c || !this.target) return;
    const m = this.target;
    if (m.pile) { this.clearPile(m); return; }
    if (!this.cutRig) this.buildCutRig();
    const base = new THREE.Vector3(m.x, heightAt(m.x, m.z), m.z);
    const toP = new THREE.Vector3(this.player.pos.x - m.x, 0, this.player.pos.z - m.z).normalize();
    const side = new THREE.Vector3(-toP.z, 0, toP.x);
    const s = m.group.userData.size || 1;
    const stemR = (m.group.userData.count > 1 ? 0.05 : 0.026) * s + 0.01;
    const ideal = 0.008 + this.rnd() * 0.022;
    this.vm.knifeDirt?.(this.debuffs.dirty);
    this.cutState = { m, phase: 'closeup', t: 0, blend: 0, base, toP, side, stemR, ideal, tol: this.zone, ideal0: ideal, kx: -0.16, ky: 0.09, down: false, startSide: -1,
      fromPos: this.camera.position.clone(), fromQ: this.camera.quaternion.clone() };
    this.ui.prompt(null); this.ui.closeup(true);
    this.player.enabled = false; this.vm.root.visible = false;
    this.cutRig.visible = this.cutGuide.visible = true;
    this.cutGuide.scale.setScalar(stemR + 0.012);
  }
  release() { const c = this.cutState; if (c && c.phase === 'closeup') c.down = false; }
  knifeMove(dx, dy) {
    const c = this.cutState; if (!c || c.phase !== 'closeup') return;
    c.kx = Math.max(-0.2, Math.min(0.2, c.kx + dx * 0.00045));
    c.ky = Math.max(-0.004, Math.min(0.16, c.ky - dy * 0.00035));
    if (c.down && Math.abs(c.kx) < c.stemR) c.maxPush = Math.max(c.maxPush || 0, Math.abs(dx));
    if (c.down && Math.sign(c.kx) !== c.startSide && Math.abs(c.kx) > c.stemR) this.slice(c);
  }
  cancelCut() { const c = this.cutState; if (c && c.phase === 'closeup') { c.phase = 'leave'; c.t = 0; this.ui.closeup(false); } }
  slice(c) {
    const err = c.ky - c.ideal;
    let quality, label;
    if (Math.abs(err) <= c.tol) { this.combo++; const mult = 1 + 0.1 * Math.min(this.combo - 1, 10); quality = 1.25 * mult; label = this.combo > 1 ? `Ідеальний зріз! Серія ×${mult.toFixed(1)}` : 'Ідеальний зріз!'; }
    else if (err > 0) { this.combo = 0; quality = err > 0.05 ? 0.7 : 0.95; label = err > 0.05 ? 'Зрізав надто високо, зіпсував гриб' : 'Залишив високий пеньок'; }
    else { this.combo = 0; quality = 0.8; label = 'Зачепив землю ножем'; this.emit(c.base.clone().setY(c.base.y + 0.02), 30, '#4a3018', 1, 1.2); }
    if ((c.maxPush || 0) > 38) { this.combo = 0; quality *= 0.75; label = 'Рвонув ножем, розірвав ніжку'; }
    if (err < -c.tol) { this.debuffs.dirty = Math.min(3, this.debuffs.dirty + 1); if (!this.knife.look.brush) setTimeout(() => this.ui.toast('Ніж у землі. Брудний ніж псує зріз: натисни R, щоб витерти', 'warn'), 600); else this.debuffs.dirty = 0; }
    if (this.debuffs.dirty > 0 && err >= -c.tol) { quality *= 1 - 0.1 * this.debuffs.dirty; label += ' · брудний ніж'; }
    if (this.debuffs.dizzy > 0) quality *= 0.9;
    this.ui.combo(this.combo);
    c.phase = 'falling'; c.t = 0; c.quality = quality; c.label = label;
    this.ui.closeup(false);
    this.audio.crunch(quality > 1.1);
    this.emit(c.base.clone().setY(c.base.y + Math.max(0.01, c.ky)), 22, '#e8dcc0', 0.6, 0.8);
    c.fallAxis = c.side.clone(); c.fallSign = -c.startSide;
  }
  clearPile(m) {
    const p = m.pile; m.pile = null;
    for (const l of p.userData.leaves) this.flying.push({ obj: l, parent: p, kind: 'leaf', v: new THREE.Vector3((Math.random() - 0.5) * 2.2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2.2), spin: Math.random() * 10, t: 0 });
    this.flying.push({ obj: p.userData.base, parent: p, kind: 'sink', t: 0 });
    m.group.visible = true;
    this.audio.rustle();
    this.emit(new THREE.Vector3(m.x, heightAt(m.x, m.z) + 0.1, m.z), 30, '#9a5a28', 1.8, 1.8);
    setTimeout(() => this.group.remove(p), 1600);
  }
  finishCut(m, quality, label) {
    const sp = SPECIES[m.species];
    const slots = m.species === 'porcini' || m.species === 'flyagaric' || m.species === 'golden' ? 2 : 1;
    if (m.species === 'golden') setTimeout(() => this.ui.toast('ЗОЛОТИЙ ГРИБ! Неймовірна знахідка!', 'good'), 400);
    if (this.basketCount() + slots > this.cap) { this.ui.toast('Кошик повний. Віднеси гриби до скупки.', 'warn'); m.alive = true; m.group.rotation.set(0, m.group.rotation.y, 0); m.group.position.y = heightAt(m.x, m.z) - 0.01; return; }
    m.alive = false;
    const base = new THREE.Vector3(m.x, heightAt(m.x, m.z) + 0.02, m.z);
    {
      if (m.species === 'puffball') this.emit(base.clone().setY(base.y + 0.1), 60, '#d8cfa8', 0.8, 0.8);
      // fly into basket
      this.flying.push({ obj: m.group, kind: 'mushroom', t: 0, from: m.group.position.clone(), rot0: m.group.rotation.clone(), m });
      this.basket.push({ species: m.species, quality, slots, count: m.group.userData.count || 1 });
      this.save.stats.picked++;
      if (quality > 1.1) this.save.stats.perfect++;
      const known = this.save.up.guide || this.save.atlas[m.species];
      const name = known ? sp.name : 'Невідомий гриб';
      this.ui.toast(`${label} · ${name}${(m.group.userData.count || 1) > 1 ? ' ×' + m.group.userData.count : ''}`, quality > 1.1 ? 'good' : quality < 0.9 ? 'warn' : '');
      if (m.species === 'flyagaric') { this.effects.dizzy = 14; setTimeout(() => this.ui.toast('Від мухомора паморочиться в голові…', 'warn'), 900); }
      if (this.save.up.guide && sp.poison) setTimeout(() => this.ui.toast(`Увага: ${sp.name} отруйний. Скупник його не візьме.`, 'bad'), 1200);
      this.ui.updateHud();
    }
  }

  // ---------- selling ----------
  sell() {
    let total = 0, rejected = 0, lines = [];
    const by = {};
    for (const b of this.basket) {
      const sp = SPECIES[b.species];
      this.save.atlas[b.species] = (this.save.atlas[b.species] || 0) + b.count;
      if (sp.poison) { rejected += b.count; by[b.species] = by[b.species] || { n: 0, sum: 0 }; by[b.species].n += b.count; continue; }
      const v = Math.round(sp.price * b.quality * b.count * (b.species === 'chanterelle' || b.species === 'honey' ? 0.6 : 1));
      total += v; by[b.species] = by[b.species] || { n: 0, sum: 0 }; by[b.species].n += b.count; by[b.species].sum += v;
    }
    if (this.fangs) { const v = this.fangs * 35; total += v; lines.push({ species: 'fang', name: 'Вовчі ікла', n: this.fangs, sum: v }); this.fangs = 0; }
    for (const o of (this.save.orders?.list || [])) {
      if (o.done) continue;
      const have = this.basket.filter(b => b.species === o.species).reduce((a, b) => a + b.count, 0);
      if (have >= o.n) { o.done = true; total += o.reward; lines.push({ species: 'order', name: `Замовлення: ${SPECIES[o.species].name} ×${o.n}`, n: '', sum: o.reward }); }
    }
    for (const k of SPECIES_ORDER) if (by[k]) lines.push({ species: k, name: SPECIES[k].name, n: by[k].n, sum: by[k].sum, poison: SPECIES[k].poison });
    this.save.money += total; this.save.stats.earned += total;
    this.basket = []; this.vm.clearBasket();
    writeSave(this.save);
    if (total > 0) this.audio.coins(Math.min(12, 3 + Math.floor(total / 20)));
    return { total, rejected, lines };
  }
  wipe() { if (this.debuffs.dirty > 0) { this.debuffs.dirty = 0; this.audio.wipe(); this.ui.toast('Витер ніж об траву', ''); } }
  buyKnife(id) {
    const k = KNIVES.find(x => x.id === id); const owned = this.save.knives.includes(id);
    if (!owned) { if (this.save.money < k.cost) return false; this.save.money -= k.cost; this.save.knives.push(id); this.audio.coins(5); }
    this.save.knife = id; writeSave(this.save); this.onKnife?.(k); return true;
  }
  buy(id) {
    const u = UPGRADES.find(x => x.id === id); const lvl = this.save.up[id];
    const next = u.levels[lvl + 1]; if (!next || this.save.money < next.cost) return false;
    this.save.money -= next.cost; this.save.up[id] = lvl + 1; writeSave(this.save); this.audio.coins(4); return true;
  }

  // ---------- per-frame ----------
  update(dt, t) {
    // target + prompt
    if (!this.cutState) {
      this.target = this.findTarget();
      if (this.target) {
        const sp = SPECIES[this.target.species];
        const known = this.save.up.guide || this.save.atlas[this.target.species];
        if (this.target.pile) this.ui.prompt('Купка листя', 'Розгорнути листя', false);
        else this.ui.prompt(known ? sp.name : 'Невідомий гриб', 'Присісти й зрізати', known && sp.poison && this.save.up.guide);
      } else this.ui.prompt(null);
    }
    // close-up cutting
    const c = this.cutState;
    if (c) {
      c.t += dt;
      const cam = this.camera;
      const closePos = c.base.clone().addScaledVector(c.toP, 0.36).add(new THREE.Vector3(0, 0.2, 0));
      const look = c.base.clone().add(new THREE.Vector3(0, 0.04, 0));
      const target = { quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(closePos, look, new THREE.Vector3(0, 1, 0))) };
      if (c.phase === 'closeup' || c.phase === 'falling') c.blend = Math.min(1, c.blend + dt * 3.5);
      else c.blend = Math.max(0, c.blend - dt * 3.5);
      const e = c.blend * c.blend * (3 - 2 * c.blend);
      cam.position.lerpVectors(this.camera.position.clone(), closePos, 0).copy(cam.position).lerp(closePos, e);
      cam.quaternion.slerp(target.quaternion, e);
      // knife rig follows kx/ky
      const kp = c.base.clone().addScaledVector(c.side, c.kx).add(new THREE.Vector3(0, c.ky, 0)).addScaledVector(c.toP, 0.025);
      this.cutRig.position.copy(kp);
      this.cutRig.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), c.toP.clone().negate(), new THREE.Vector3(0, 1, 0)));
      this.cutGuide.position.set(c.base.x, c.base.y + c.ideal, c.base.z);
      const near = Math.abs(c.ky - c.ideal) <= c.tol;
      this.cutGuide.material.color.set(near ? '#d8ff7a' : '#9bd24f'); this.cutGuide.material.opacity = 0.5 + Math.sin(t * 8) * 0.3;
      if (c.phase === 'closeup') {
        // the mushroom sways in the wind and a tired hand trembles: the target band drifts
        const drift = Math.sin(t * 1.7) * 0.004 + Math.sin(t * 3.1) * 0.002;
        c.ideal = Math.max(0.006, c.ideal0 + drift);
        if (this.player.stamina < 30 || this.player.exhausted) { c.ky += (Math.random() - 0.5) * 0.004; c.kx += (Math.random() - 0.5) * 0.004; }
        if (this.debuffs.dizzy > 0) c.ky += Math.sin(t * 5) * 0.0015;
        c.m.group.rotation.z = Math.sin(t * 1.7) * 0.05;
        this.ui.cutMeter(c.ky, c.ideal, c.tol);
      }
      if (c.phase === 'falling') {
        this.cutGuide.visible = false;
        const k = Math.min(1, c.t / 0.45);
        c.m.group.rotateOnWorldAxis(c.fallAxis, c.fallSign * dt * 2.6 * (1 - k * 0.5));
        c.m.group.position.y = c.base.y + c.ky * (1 - k) + Math.sin(k * Math.PI) * 0.03;
        if (c.t > 0.5) { this.finishCut(c.m, c.quality, c.label); c.phase = 'leave'; c.t = 0; }
      }
      if (c.phase === 'leave') {
        this.cutRig.visible = this.cutGuide.visible = false;
        if (c.blend <= 0) { this.cutState = null; this.player.enabled = true; this.vm.root.visible = true; this.ui.closeup(false); }
      }
    }
    // flying things
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]; f.t += dt;
      if (f.kind === 'leaf') {
        f.v.y -= 4 * dt; f.obj.position.addScaledVector(f.v, dt); f.obj.rotation.x += f.spin * dt; f.obj.rotation.z += f.spin * 0.7 * dt;
        if (f.t > 1.5) this.flying.splice(i, 1);
      } else if (f.kind === 'sink') {
        f.obj.scale.y = Math.max(0.01, 1 - f.t * 1.5); if (f.t > 0.7) { f.obj.visible = false; this.flying.splice(i, 1); }
      } else if (f.kind === 'mushroom') {
        const k = Math.min(1, f.t / 0.55);
        const target = new THREE.Vector3(); this.vm.basket.getWorldPosition(target);
        const e = k * k * (3 - 2 * k);
        f.obj.position.lerpVectors(f.from, target, e); f.obj.position.y += Math.sin(k * Math.PI) * 0.45;
        f.obj.rotation.x = f.rot0.x + k * 5; f.obj.rotation.z = f.rot0.z + k * 3;
        f.obj.scale.setScalar(1 - k * 0.6);
        if (k >= 1) {
          this.group.remove(f.obj); f.obj.scale.setScalar(1); f.obj.position.set(0, 0, 0); f.obj.rotation.set(0, 0, 0);
          this.vm.addToBasket(f.obj); this.audio.plop(); this.flying.splice(i, 1);
        }
      }
    }
    this.updateParticles(dt);
    // gentle wobble of nearby mushrooms (alive), hide far ones
    for (const m of this.mushrooms) {
      if (!m.alive) continue;
      const d2 = (m.x - this.player.pos.x) ** 2 + (m.z - this.player.pos.z) ** 2;
      m.group.visible = !m.pile && d2 < 70 * 70;
      if (m.pile) m.pile.visible = d2 < 70 * 70;
      if (m === this.target && !m.pile) { m.group.scale.setScalar(1 + Math.sin(t * 8) * 0.03); }
      else m.group.scale.setScalar(1);
    }
    // occasional regrowth out of sight
    this._regrow = (this._regrow || 0) + dt;
    if (this._regrow > 6) { this._regrow = 0; if (this.mushrooms.filter(m => m.alive).length < 230) this.spawnOne(true); }
    this.mushrooms = this.mushrooms.filter(m => m.alive || this.flying.some(f => f.m === m));
    // effects
    this.effects.dizzy = Math.max(0, this.effects.dizzy - dt);
    this.debuffs.dizzy = this.effects.dizzy;
    this.debuffs.bitten = Math.max(0, this.debuffs.bitten - dt);
    this.player.slow = this.debuffs.bitten > 0 ? 0.7 : 1;
    this.ui.debuffs(this.debuffs, this.player);
  }
}
