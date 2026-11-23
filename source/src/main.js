import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildWorld, heightAt, pathDist, PATH, HUT } from './world.js';
import { Player } from './player.js';
import { makeComposer } from './post.js';
import { ViewModel } from './viewmodel.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Game, loadSave, newSave, writeSave } from './game.js';
import { leafSpriteAtlas } from './textures.js';
import { buildMushroom, SPECIES_ORDER } from './mushrooms.js';
import { mulberry32 } from './noise.js';
import { Wolves } from './wolves.js';
import { Story, DEBT, DAYS } from './story.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const TOUCH = matchMedia('(pointer: coarse)').matches;

// ---------- settings ----------
const SET_KEY = 'hrybnyk-settings';
let settings = { quality: TOUCH ? 'low' : 'medium', sens: 1, vol: 0.8, music: 0.5 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch (e) { /* no storage */ }
const quality = params.get('q') || settings.quality;
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 420);
scene.add(camera);

const MODEL_LIST = [
  'nature/Pine_1', 'nature/Pine_2', 'nature/Pine_3', 'nature/Pine_4', 'nature/Pine_5',
  'nature/CommonTree_1', 'nature/CommonTree_2', 'nature/CommonTree_3', 'nature/TwistedTree_1', 'nature/TwistedTree_2', 'nature/DeadTree_1',
  'nature/Bush_Common', 'nature/Fern_1', 'nature/Clover_1',
  'nature/Grass_Wispy_Tall', 'nature/Grass_Wispy_Short', 'nature/Grass_Common_Short',
  'nature/Rock_Medium_1', 'nature/Rock_Medium_2', 'nature/Rock_Medium_3', 'nature/Pebble_Round_1', 'nature/Pebble_Round_2',
  'village/Hut', 'village/Prop_Crate', 'village/Prop_Wagon', 'village/Prop_WoodenFence_Single',
  'animals/Wolf',
];
// Artifact pages block fetch() of data: URIs, so turn an embedded .gltf JSON into a GLB in memory.
function b64ToBytes(uri) { const b = atob(uri.slice(uri.indexOf(',') + 1)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function gltfJsonToGlb(json) {
  const chunks = []; let len = 0;
  const push = (bytes) => { const off = len; chunks.push(bytes); len += bytes.length; const pad = (4 - (len % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); len += pad; } return off; };
  const bufOff = (json.buffers || []).map(b => push(b64ToBytes(b.uri)));
  for (const bv of json.bufferViews || []) { bv.byteOffset = (bv.byteOffset || 0) + bufOff[bv.buffer]; bv.buffer = 0; }
  for (const img of json.images || []) {
    if (img.uri && img.uri.startsWith('data:')) {
      const mime = img.uri.slice(5, img.uri.indexOf(';')); const bytes = b64ToBytes(img.uri);
      const off = push(bytes); json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length });
      img.bufferView = json.bufferViews.length - 1; img.mimeType = mime; delete img.uri;
    }
  }
  json.buffers = [{ byteLength: len }];
  const bin = new Uint8Array(len); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4;
  if (jp) { const t = new Uint8Array(js.length + jp).fill(32); t.set(js); js = t; }
  const total = 12 + 8 + js.length + 8 + bin.length; const out = new ArrayBuffer(total); const dv = new DataView(out); const u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(js, 20);
  const bo = 20 + js.length; dv.setUint32(bo, bin.length, true); dv.setUint32(bo + 4, 0x004E4942, true); u8.set(bin, bo + 8);
  return out;
}
async function loadModels() {
  const loader = new GLTFLoader();
  const out = {}; let done = 0;
  await Promise.all(MODEL_LIST.map(async p => {
    const json = await (await fetch(`./models/${p}.json`)).json();
    out[p.split('/')[1]] = await loader.parseAsync(gltfJsonToGlb(json), './');
    done++; $('#loadbar').style.width = `${Math.round(done / MODEL_LIST.length * 90)}%`;
  }));
  return out;
}

// ---------- time of day ----------
const DAY_START = 7 / 24, DAY_END = 21 / 24;
const state = { time: parseFloat(params.get('t') || String(DAY_START)), mode: 'loading', warned: 0 };
const DAY_SPEED = (DAY_END - DAY_START) / (18 * 60); // 18 real minutes per day

function applyTimeOfDay(world, t) {
  const sunAng = (t - 0.25) * Math.PI;
  const elev = Math.sin(sunAng);
  const dir = new THREE.Vector3(Math.cos(sunAng) * 0.8, Math.max(0.04, elev), 0.45).normalize();
  world.sky.material.uniforms.sunDir.value.copy(dir);
  const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.35);
  const golden = 1 - THREE.MathUtils.smoothstep(elev, 0.05, 0.5);
  world.sky.material.uniforms.top.value.set('#141a30').lerp(new THREE.Color('#7fa6c9'), day);
  world.sky.material.uniforms.horizon.value.set('#20202e').lerp(new THREE.Color('#e9c79c').lerp(new THREE.Color('#f09a58'), golden * 0.65), day);
  world.sun.color.set('#ffe9c8').lerp(new THREE.Color('#ff9a50'), golden * 0.7);
  world.sun.intensity = 2.8 * day;
  world.hemi.intensity = 0.18 + 0.82 * day;
  world.hemi.color.set('#cfe0f2').lerp(new THREE.Color('#4a5a8a'), 1 - day);
  scene.fog.color.set('#c9b79a').lerp(new THREE.Color('#e0a070'), golden * 0.35).lerp(new THREE.Color('#141824'), 1 - day);
  scene.fog.density = 0.012 + (1 - day) * 0.014;
  world.sunDir = dir; world.daylight = day;
}

// ---------- atlas thumbnails ----------
function makeThumbs() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(240, 150); r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#fff6e6', '#806040', 1.4));
  const dl = new THREE.DirectionalLight('#fff', 2.2); dl.position.set(1, 2, 1.5); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 240 / 150, 0.01, 10);
  const css = [];
  for (const k of SPECIES_ORDER) {
    const g = buildMushroom(k, 12345);
    sc.add(g);
    const box = new THREE.Box3().setFromObject(g); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
    const d = Math.max(s.x, s.y * 1.4, s.z) * 1.85;
    cam.position.set(c.x + d * 0.55, c.y + d * 0.35, c.z + d * 0.8); cam.lookAt(c);
    r.render(sc, cam);
    css.push(`.cimg.${k}{background-image:url(${r.domElement.toDataURL()})}`);
    sc.remove(g);
  }
  const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
  r.dispose();
}

// ---------- mushroom shop kiosk at the trailhead ----------
function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#6a4424'; g.fillRect(0, 0, 512, 160);
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + (i % 2) * 0.06})`; g.fillRect(0, i * 27, 512, 2); }
  g.fillStyle = '#f1e2bd'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('СКУПКА ГРИБІВ', 256, 82);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function setupShop(world) {
  const start = world.start, dir = world.startDir, side = new THREE.Vector3(-dir.z, 0, dir.x);
  const x = start.x - side.x * 4.5 + dir.x * 1.5, z = start.z - side.z * 4.5 + dir.z * 1.5;
  const y = heightAt(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(side.x, side.z);
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5030', roughness: 0.9 });
  for (const px of [-0.9, 0.9]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), wood); post.position.set(px, 1.15, 0); g.add(post); }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 0.06), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8 }), wood]);
  sign.position.set(0, 2.05, 0.04); g.add(sign);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 0.55), new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.85 }));
  counter.position.set(0, 0.45, 0.1); g.add(counter);
  const scale = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20), new THREE.MeshStandardMaterial({ color: '#b8a070', metalness: 0.7, roughness: 0.35 }));
  scale.position.set(-0.5, 0.95, 0.1); g.add(scale);
  for (const [bx, sp] of [[0.1, 'chanterelle'], [0.55, 'porcini']]) { const m = buildMushroom(sp, 5); m.position.set(bx, 0.9, 0.1); m.scale.setScalar(1.6); g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  world.colliders.push({ x, z, r: 1.1 });
  const lantern = new THREE.PointLight('#ffb060', 0, 9); lantern.position.set(0.9, 1.9, 0.4); g.add(lantern);
  return { pos: g.position, lantern, update(p) { return Math.hypot(p.x - x, p.z - z); } };
}

// ---------- main ----------
async function start() {
  const models = await loadModels();
  $('#loadmsg').textContent = 'Розкладаємо листя…';
  await new Promise(r => setTimeout(r, 30));
  const world = buildWorld(scene, models, quality);
  $('#loadbar').style.width = '96%';
  const audio = new Audio(); audio.vol = settings.vol; audio.musicVol = settings.music;
  const player = new Player(camera, renderer.domElement, world.colliders);
  player.sens = 0.0022 * settings.sens;
  const vm = new ViewModel(camera);
  const ui = new UI();
  const leafTex = leafSpriteAtlas();
  let save = loadSave() || newSave();
  let game = new Game({ scene, camera, world, player, vm, audio, ui, leafTex, save });
  const story = new Story(scene, save);
  ui.story = story;
  ui.bind(game); ui.trees = world.trees;
  // ---------- story cards ----------
  const card = (title, html, buttons) => new Promise(res => {
    state.panel = 'story'; player.enabled = false; show('#hud', false); show('#touch', false);
    if (document.pointerLockElement) document.exitPointerLock();
    $('#storyTitle').textContent = title; $('#storyBody').innerHTML = html;
    const bb = $('#storyBtns'); bb.innerHTML = '';
    buttons.forEach(b => { const el = document.createElement('button'); el.className = 'btn' + (b.primary ? ' primary' : ''); el.textContent = b.label; el.onclick = () => { show('#story', false); state.panel = null; res(b.id); }; bb.appendChild(el); });
    show('#story', true);
  });
  const stats = () => `<p class="muted">Днів у лісі: ${save.day}. Зібрано грибів: ${save.stats.picked}, з них ідеальних зрізів: ${save.stats.perfect}. Зароблено: ${save.stats.earned} ₴.</p>`;
  async function ending(kind) {
    save.story.ended = kind; writeSave(save);
    const T = {
      good: ['Ліс живе', `<p>Ти віддав останню гривню Гнатові. Хатина тепер справді твоя, а Серце лісу світиться так само, як за діда.</p><p>Вовки повернулися в глибину лісу. Золоті гриби з'являються частіше, ніж будь-коли. Дід би пишався.</p>`],
      bad: ['Гроші й тиша', `<p>Гнат заплатив щедро й закрив борг. Через тиждень у лісі завили пилки.</p><p>Серце лісу згасло. Грибів стає все менше, а птахи замовкли. Хатина твоя, але ліс уже не той.</p>`],
      lost: ['Хатину забрали', `<p>Минуло ${DAYS} днів, а борг так і не віддано. Гнат забрав ключі.</p><p>Можна спробувати ще раз: тепер ти знаєш ліс краще.</p>`],
    }[kind];
    const r = await card(T[0], T[1] + stats(), kind === 'lost' ? [{ id: 'new', label: 'Почати заново', primary: true }] : [{ id: 'free', label: 'Грати далі', primary: true }, { id: 'new', label: 'Нова гра' }]);
    if (r === 'new') newGame(); else play();
  }
  const payDebt = () => {
    const pay = Math.min(save.money, save.debt); if (pay <= 0) return false;
    save.money -= pay; save.debt -= pay; writeSave(save); audio.coins(8); ui.updateHud();
    if (save.debt <= 0) setTimeout(() => ending(save.story.choice === 'sell' ? 'bad' : 'good'), 400);
    return true;
  };
  game.payDebt = payDebt;
  const usePage = async (id) => {
    const pg = story.takePage(id); writeSave(save); audio.wipe();
    await card(`${pg.title}`, `<p class="page">${pg.text}</p><p class="muted">Сторінка ${pg.n} з ${pg.total}${pg.n === pg.total ? '. Серце лісу тепер на карті (M).' : ''}</p>`, [{ id: 'ok', label: 'Сховати в щоденник', primary: true }]);
    play();
  };
  const useHeart = async () => {
    const r = await card('Серце лісу', `<p>Величезна грибниця світиться блакитним. Земля під ногами тепла, а довкола ростуть золоті гриби.</p><p>Гнат дасть за це місце стільки, що весь борг (${save.debt} ₴) закриється одразу. Але тоді ліс помре.</p>`,
      [{ id: 'protect', label: 'Зберегти ліс', primary: true }, { id: 'sell', label: `Продати таємницю Гнатові` }]);
    save.story.choice = r; writeSave(save);
    if (r === 'sell') { save.debt = 0; writeSave(save); ending('bad'); }
    else { ui.toast('Ти зберіг таємницю. Золоті гриби тепер трапляються частіше.', 'good'); play(); }
  };
  game.onKnife = (k) => { vm.setKnife(k.look); if (game.cutRig) { scene.remove(game.cutRig, game.cutGuide); game.cutRig = null; } };
  vm.setKnife(game.knife.look);
  const near = () => {
    const sn = story.near(player.pos); if (sn) return sn.type === 'page' ? 'page:' + sn.id : 'heart';
    if (buyerDist < 4.5) return 'sell';
    if (HUT.bench && Math.hypot(player.pos.x - HUT.bench.x, player.pos.z - HUT.bench.z) < 1.5) return 'workshop';
    if (HUT.bed && Math.hypot(player.pos.x - HUT.bed.x, player.pos.z - HUT.bed.z) < 1.7) return 'bed';
    return null;
  };
  const sleepInBed = () => { if (state.time * 24 < 15) { ui.toast('Ще рано спати. Лягай після 15:00.', 'warn'); return; } audio.sleep(); endDay(true); };
  const buyer = setupShop(world);
  const wolves = new Wolves(scene, models.Wolf, world.colliders, audio);
  let health = 100, swingCd = 0;
  try { makeThumbs(); } catch (e) { /* thumbnails are optional */ }

  const lamp = new THREE.SpotLight('#ffe2b0', 0, 30, 0.55, 0.5, 1.4);
  lamp.position.set(0.15, -0.1, 0); camera.add(lamp); lamp.target.position.set(0, -0.6, -5); camera.add(lamp.target);

  const spawnAtTrailhead = () => {
    const s0 = PATH.samples[1];
    const yaw0 = Math.atan2(-(PATH.samples[10].x - s0.x), -(PATH.samples[10].z - s0.z));
    player.setPose(s0.x, s0.z, yaw0, -0.05);
  };
  spawnAtTrailhead();
  if (params.has('x')) player.setPose(+params.get('x'), +params.get('z'), +(params.get('yaw') || 0), +(params.get('pitch') || 0));

  const { composer, grade } = makeComposer(renderer, scene, camera, quality);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  // ---------- flow ----------
  const show = (id, on) => { $(id).hidden = !on; };
  const setMode = (m) => {
    state.mode = m;
    show('#menu', m === 'menu'); show('#hud', m === 'play'); show('#pause', m === 'pause');
    show('#touch', m === 'play' && TOUCH);
    player.enabled = m === 'play' && (TOUCH || document.pointerLockElement === renderer.domElement);
    if (m !== 'play' && document.pointerLockElement) document.exitPointerLock();
  };
  const lock = () => { if (!TOUCH) renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); };
  const play = () => { audio.start(); audio.setVolume(settings.vol); audio.setMusic(settings.music); setMode('play'); lock(); ui.updateHud(); };

  $('#mContinueDay').textContent = `день ${save.day}, ${save.money} ₴`;
  $('#mContinue').hidden = !loadSave();
  $('#mContinue').onclick = () => { audio.start(); audio.ui(); play(); };
  function newGame() { audio.start(); writeSave(newSave()); try { sessionStorage.setItem('hr-autostart', '1'); } catch (e) { /* ignore */ } location.reload(); }
  const intro = async () => {
    save.story.intro = true; writeSave(save);
    await card('Лист', `<p class="page">Шановний пане!</p><p class="page">Ваш дід, лісовий грибник, залишив Вам у спадок хатину на краю лісу Голлоу. На жаль, разом із боргом у ${DEBT} ₴ власникові скупки грибів, панові Гнату.</p><p class="page">Борг треба віддати за ${DAYS} днів, інакше хатина перейде до кредитора. У хатині Ви знайдете ніж, кошик і дідів щоденник. Кілька сторінок із нього вирвано.</p>`,
      [{ id: 'go', label: 'Іти до хатини', primary: true }]);
    play();
    ui.toast('Збирай гриби, продавай у скупці й віддавай борг там само. Шукай сторінки щоденника в лісі. M — карта.');
  };
  $('#mNew').onclick = () => { audio.ui(); newGame(); };
  const openSettings = (back) => {
    $('#sQuality').value = quality; $('#sSens').value = settings.sens; $('#sVol').value = settings.vol; $('#sMus').value = settings.music;
    const upd = () => { $('#sSensV').textContent = (+$('#sSens').value).toFixed(1); $('#sVolV').textContent = Math.round($('#sVol').value * 100) + '%'; $('#sMusV').textContent = Math.round($('#sMus').value * 100) + '%'; };
    upd(); ['#sSens', '#sVol', '#sMus'].forEach(s => $(s).oninput = upd);
    show('#settings', true);
    $('#sDone').onclick = () => {
      settings.sens = +$('#sSens').value; settings.vol = +$('#sVol').value; settings.music = +$('#sMus').value;
      player.sens = 0.0022 * settings.sens; audio.setVolume(settings.vol); audio.setMusic(settings.music);
      const q = $('#sQuality').value; const reload = q !== quality; settings.quality = q; saveSettings();
      show('#settings', false);
      if (reload) { writeSave(save); const u = new URL(location.href); u.searchParams.delete('q'); location.replace(u.toString()); return; }
      back();
    };
  };
  $('#mSettings').onclick = () => { audio.ui(); openSettings(() => {}); };
  $('#mHow').onclick = () => { show('#howto', true); };
  $('#hDone').onclick = () => { show('#howto', false); };
  $('#pResume').onclick = () => play();
  $('#pAtlas').onclick = () => { show('#pause', false); ui.openAtlas(() => show('#pause', true)); };
  $('#pSettings').onclick = () => { show('#pause', false); openSettings(() => show('#pause', true)); };
  $('#pMenu').onclick = () => { writeSave(save); setMode('menu'); $('#mContinue').hidden = false; $('#mContinueDay').textContent = `день ${save.day}, ${save.money} ₴`; };

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (state.mode === 'play') { player.enabled = locked; if (!locked && !TOUCH && !state.panel) setMode('pause'); }
  });
  const swing = () => {
    if (swingCd > 0 || game.cutState) return; swingCd = 0.55; vm.swing = 1; audio.whoosh();
    setTimeout(() => {
      const r = wolves.hit(camera, game.knife.dmg);
      if (r === 'kill') { game.fangs = (game.fangs || 0) + 1; ui.toast('Ти відбився від вовка! +вовче ікло (35 ₴ у скупці)', 'good'); }
      else if (r === 'hit') ui.toast('Влучив!', '');
    }, 140);
  };
  document.addEventListener('mousemove', (e) => { if (game.cutState && document.pointerLockElement === renderer.domElement) game.knifeMove(e.movementX, e.movementY); });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (state.mode !== 'play') return;
    if (document.pointerLockElement !== renderer.domElement) { lock(); return; }
    if (e.button === 2) { if (game.cutState) game.cancelCut(); else swing(); return; }
    if (e.button === 0) game.press();
  });
  addEventListener('mouseup', (e) => { if (e.button === 0 && state.mode === 'play') game.release(); });
  addEventListener('keydown', (e) => {
    if (state.mode !== 'play') { if (e.code === 'Escape' && state.panel) closePanel(); return; }
    if (e.code === 'KeyE') {
      const n = near();
      if (n === 'sell') openPanel('shop'); else if (n === 'workshop') openPanel('workshop'); else if (n === 'bed') sleepInBed();
      else if (n && n.startsWith('page:')) usePage(+n.slice(5)); else if (n === 'heart') useHeart();
      else if (!e.repeat) game.press();
    }
    if (e.code === 'KeyM') openPanel('map');
    if (e.code === 'KeyR') { game.wipe(); vm.wipe = 1; vm.knifeDirt(0); }
    if (e.code === 'Tab') { e.preventDefault(); openPanel('atlas'); }
    if (e.code === 'KeyF') swing();
  });
  addEventListener('keyup', (e) => { if (e.code === 'KeyE' && state.mode === 'play') game.release(); });

  const openPanel = (which) => {
    state.panel = which; player.enabled = false; show('#hud', false); show('#touch', false);
    if (document.pointerLockElement) document.exitPointerLock();
    const done = () => { state.panel = null; play(); };
    if (which === 'shop') ui.openShop(done, () => endDay(true), 'sell');
    else if (which === 'workshop') ui.openShop(done, () => { audio.sleep(); endDay(true); }, 'workshop');
    else if (which === 'map') ui.openMap(player, buyer.pos, done, story);
    else ui.openAtlas(done);
  };
  const closePanel = () => { if (state.panel === 'map') $('#mapClose').click(); else if (state.panel === 'shop' || state.panel === 'workshop') $('#shopClose').click(); else if (state.panel === 'atlas') $('#atlasClose').click(); };

  // ---------- day end ----------
  const fade = (msg, ms) => new Promise(res => { $('#fadeMsg').textContent = msg; $('#fade').classList.add('on'); setTimeout(() => res(), ms); });
  const unfade = () => $('#fade').classList.remove('on');
  async function endDay(atHut, reason) {
    state.mode = 'sleep'; player.enabled = false; show('#hud', false);
    if (document.pointerLockElement) document.exitPointerLock();
    let msg = `День ${save.day} позаду.`;
    if (!atHut) {
      const lost = Math.ceil(game.basket.length / 2);
      game.basket.splice(0, lost); vm.clearBasket();
      for (const b of game.basket) vm.addToBasket(buildMushroom(b.species, Math.floor(Math.random() * 1e6)));
      msg = reason || 'Ти заблукав у темряві… Ледве вибрався до скупки, але половина грибів розсипалась.';
    }
    await fade(msg, 2600);
    save.day++; writeSave(save);
    if (save.day > DAYS && save.debt > 0 && !save.story.ended) { unfade(); ending('lost'); return; }
    state.time = DAY_START; state.warned = 0;
    game.rnd = mulberry32(save.day * 977 + 13);
    game.makeOrders(); game.spawnAll(); spawnAtTrailhead(); ui.updateHud();
    const left = DAYS - save.day + 1;
    setTimeout(() => { unfade(); state.panel = null; play(); ui.toast(save.debt > 0 && !save.story.ended ? `Ранок. День ${save.day}. До сплати боргу ${left} дн., лишилось ${save.debt} ₴.` : `Ранок. День ${save.day}.`); }, 900);
  }

  // ---------- touch controls ----------
  if (TOUCH) {
    const stick = $('#stick'), knob = $('#stickKnob'); let sid = null, cx = 0, cy = 0;
    stick.addEventListener('pointerdown', e => { sid = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(sid); });
    stick.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > 45) { dx *= 45 / l; dy *= 45 / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; player.moveInput.set(dx / 45, -dy / 45); });
    const endStick = e => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; player.moveInput.set(0, 0); };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    let lid = null, lx = 0, ly = 0;
    renderer.domElement.addEventListener('pointerdown', e => { if (state.mode !== 'play' || lid !== null) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    renderer.domElement.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; player.look((e.clientX - lx) * 1.6, (e.clientY - ly) * 1.6); lx = e.clientX; ly = e.clientY; });
    const endLook = e => { if (e.pointerId === lid) lid = null; };
    renderer.domElement.addEventListener('pointerup', endLook); renderer.domElement.addEventListener('pointercancel', endLook);
    $('#tCut').addEventListener('pointerdown', () => { const n = near(); if (n && n.startsWith && n.startsWith('page:')) usePage(+n.slice(5)); else if (n === 'heart') useHeart(); else if (n === 'sell') openPanel('shop'); else if (n === 'workshop') openPanel('workshop'); else if (n === 'bed') sleepInBed(); else game.press(); });
    $('#tCut').addEventListener('pointerup', () => game.release());
    renderer.domElement.addEventListener('pointermove', e => { if (game.cutState && e.pointerId === lid) game.knifeMove((e.movementX || 0) * 1.5, (e.movementY || 0) * 1.5); });
    $('#tRun').addEventListener('pointerdown', () => { player.sprint = !player.sprint; $('#tRun').style.background = player.sprint ? 'rgba(180,82,30,.7)' : ''; });
    $('#tMenu').addEventListener('click', () => setMode('pause'));
    $('#tAtlas').addEventListener('click', () => openPanel('atlas'));
  }

  // ---------- loop ----------
  let buyerDist = 99;
  const clock = new THREE.Clock();
  let menuT = 0;
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    if (state.mode === 'play' && !SHOT) state.time += dt * DAY_SPEED;
    applyTimeOfDay(world, state.time);
    if (state.mode === 'menu' && !SHOT) {
      // slow drift along the path behind the menu
      menuT += dt * 0.004;
      const p = PATH.curve.getPointAt(menuT % 1), q = PATH.curve.getPointAt((menuT + 0.01) % 1);
      camera.position.set(p.x, heightAt(p.x, p.z) + 2.1, p.z); camera.lookAt(q.x, heightAt(q.x, q.z) + 1.8, q.z);
      vm.root.visible = false;
    } else {
      if (!game.cutState) vm.root.visible = true;
      player.update(dt);
      vm.update(dt, player.speed || 0, player.crouch, player.stepPhase, player.running);
      if (state.mode === 'play') {
        game.update(dt, t);
        story.update(t);
        swingCd = Math.max(0, swingCd - dt);
        const night = 1 - (world.daylight ?? 1);
        const onPath = pathDist(player.pos.x, player.pos.z) < 2.5;
        const dmg = wolves.update(dt, player, night, onPath);
        if (dmg > 0) { health -= dmg; ui.hurt(); audio.hurt(); game.debuffs.bitten = 15; if (game.cutState) game.cancelCut(); }
        health = Math.min(100, health + dt * 1.2);
        if (health <= 0) { health = 100; endDay(false, 'Вовки загнали тебе… Ти ледве втік до скупки й розгубив половину грибів.'); }
        ui.bars(health, player.stamina);
        if (player.exhausted && Math.random() < dt * 1.5) audio.breath();
        const fovT = player.running ? 80 : 72; camera.fov += (fovT - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix();
      }
    }
    buyerDist = buyer.update(player.pos);
    buyer.lantern.intensity = (1 - (world.daylight ?? 1)) * 6;
    if (state.mode === 'play' && !game.cutState && !game.target) {
      const n = near(), key = TOUCH ? 'Зрізати' : 'E';
      if (n === 'sell') ui.prompt('Скупка грибів', 'продати гриби', false, key);
      else if (n === 'workshop') ui.prompt('Майстерня', 'ножі й спорядження', false, key);
      else if (n === 'bed') ui.prompt('Ліжко', 'лягти спати до ранку', false, key);
      else if (n && n.startsWith('page:')) ui.prompt('Сторінка щоденника', 'підібрати', false, key);
      else if (n === 'heart') ui.prompt('Серце лісу', 'вирішити його долю', false, key);
    }
    // HUD bits
    ui.clock(state.time);
    if (state.mode === 'play') {
      const hut = buyer.pos; const dx = hut.x - player.pos.x, dz = hut.z - player.pos.z;
      const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw), rX = Math.cos(player.yaw), rZ = -Math.sin(player.yaw);
      ui.compass(!!save.up.compass, Math.atan2(dx * rX + dz * rZ, dx * fwdX + dz * fwdZ));
      const hour = state.time * 24;
      if (hour > 19 && state.warned < 1) { state.warned = 1; ui.toast('Сонце сідає. Час повертатися до хатинки.', 'warn'); }
      if (hour > 20.3 && state.warned < 2) { state.warned = 2; ui.toast('Темніє! До 21:00 треба бути біля хатинки.', 'bad'); }
      if (state.time >= DAY_END) endDay(buyerDist < 15);
    }
    // footsteps
    player.onStep = (v) => audio.step(pathDist(player.pos.x, player.pos.z) < 1.4, v);
    // lamp
    lamp.intensity = save.up.lamp ? (1 - (world.daylight ?? 1)) * 18 : 0;
    // shadow camera follows the player
    const sd = world.sunDir; const c = camera.position;
    const texel = 90 / world.sun.shadow.mapSize.x;
    const cx = Math.round(c.x / texel) * texel, cz = Math.round(c.z / texel) * texel;
    world.sun.target.position.set(cx, c.y, cz);
    world.sun.position.set(cx + sd.x * 90, c.y + sd.y * 90, cz + sd.z * 90);
    world.sky.position.copy(camera.position);
    world.windUniform.value = t;
    world.falling.userData.update(t, dt, camera);
    world.updateCulling(camera);
    audio.tick(dt, 1 - (world.daylight ?? 1));
    grade.uniforms.uTime.value = t;
    grade.uniforms.uBlur.value = Math.min(1, game.effects.dizzy / 4);
    composer.render(dt);
  }

  $('#loadbar').style.width = '100%';
  $('#loading').hidden = true;
  window.__game = game;
  if (SHOT) {
    setMode(params.get('mode') || 'play');
    if (params.has('basket')) { for (const sp of ['porcini', 'chanterelle', 'russula', 'birch']) { const g = buildMushroom(sp, 7); vm.addToBasket(g); } }
    if (params.has('target')) {
      // place a mushroom right in front of the camera to show the prompt/ring
      const sp = params.get('target'); const fx = player.pos.x - Math.sin(player.yaw) * 1.3, fz = player.pos.z - Math.cos(player.yaw) * 1.3;
      const g = buildMushroom(sp, 99); g.position.set(fx, heightAt(fx, fz), fz); game.group.add(g);
      game.mushrooms.push({ group: g, species: sp, x: fx, z: fz, pile: null, alive: true });
      if (params.has('cut')) { game.update(0.016, 0); game.press(); game.cutState.ky = 0.02; game.cutState.kx = -0.05; for (let i = 0; i < 20; i++) { player.update(0.05); game.update(0.05, i * 0.05); } }
    }
    if (params.has('guide')) save.up.guide = 1;
    if (params.has('intro')) intro();
    if (params.has('page')) usePage(+params.get('page'));
    if (params.has('hut')) {
      const fx = Math.sin(HUT.rot), fz = Math.cos(HUT.rot), d = params.get('hut') === 'in' ? 0.6 : 9;
      const x = HUT.x + fx * d + (params.get('hut') === 'in' ? -Math.cos(HUT.rot) * 0.5 : Math.cos(HUT.rot) * 3), z = HUT.z + fz * d;
      player.setPose(x, z, Math.atan2(fx, fz) + (params.get('hut') === 'in' ? -0.5 : 0.25), params.get('hut') === 'in' ? -0.3 : 0.05);
    }
    if (params.has('wolf')) { wolves.spawn(player.pos.x, player.pos.z, true); const w = wolves.list[0]; const fx = player.pos.x - Math.sin(player.yaw) * 4, fz = player.pos.z - Math.cos(player.yaw) * 4; w.o.position.set(fx, heightAt(fx, fz), fz); w.o.rotation.y = player.yaw; w.mixer.update(0.3); }
    if (params.has('shop')) openPanel('shop');
    if (params.has('atlasp')) openPanel('atlas');
    for (let i = 0; i < 3; i++) frame();
    if (params.get('cut') === 'done') { game.release(); game.update(0.1, 1); }
    frame();
    window.done = true;
    return;
  }
  setMode('menu');
  if (!loadSave()) $('#mContinue').hidden = true;
  let auto = false; try { auto = sessionStorage.getItem('hr-autostart') === '1'; sessionStorage.removeItem('hr-autostart'); } catch (e) { /* ignore */ }
  if (auto || (loadSave() && !save.story.intro)) { state.mode = 'menu'; show('#menu', false); intro(); }
  renderer.setAnimationLoop(frame);
}

start().catch(e => { console.error(e); $('#loadmsg').textContent = 'Не вдалося завантажити гру: ' + e.message; });
