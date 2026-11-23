import * as THREE from 'three';
import { makeNoise2D, fbm, mulberry32 } from './noise.js';
import { leafLitterTexture, dirtTexture, mossTexture, leafSpriteAtlas, autumnize } from './textures.js';

export const WORLD = 280;          // world size in metres (square, centred on 0)
const HALF = WORLD / 2;
const SEG = 224;                   // terrain segments
const CHUNKS = 8;                  // chunk grid for culling
const CHUNK = WORLD / CHUNKS;

const hNoise = makeNoise2D(42);
const mNoise = makeNoise2D(77);

// ---------- path (a winding loop through the forest) ----------
function buildPath() {
  const rnd = mulberry32(5);
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 70 + (rnd() - 0.5) * 50;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.85));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const samples = curve.getSpacedPoints(900);
  return { curve, samples };
}
export const PATH = buildPath();

// distance-to-path field on a grid for fast lookup
const DF_RES = 256;
const distField = new Float32Array(DF_RES * DF_RES);
(function computeDF() {
  const s = PATH.samples;
  for (let j = 0; j < DF_RES; j++) for (let i = 0; i < DF_RES; i++) {
    const x = -HALF + (i + 0.5) / DF_RES * WORLD, z = -HALF + (j + 0.5) / DF_RES * WORLD;
    let best = 1e9;
    for (let k = 0; k < s.length; k += 2) { const dx = s[k].x - x, dz = s[k].z - z; const d = dx * dx + dz * dz; if (d < best) best = d; }
    distField[j * DF_RES + i] = Math.sqrt(best);
  }
})();
export function pathDist(x, z) {
  const fx = (x + HALF) / WORLD * DF_RES - 0.5, fz = (z + HALF) / WORLD * DF_RES - 0.5;
  const i = Math.max(0, Math.min(DF_RES - 2, Math.floor(fx))), j = Math.max(0, Math.min(DF_RES - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
  const a = distField[j * DF_RES + i], b = distField[j * DF_RES + i + 1], c = distField[(j + 1) * DF_RES + i], d = distField[(j + 1) * DF_RES + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// ---------- height ----------
function rawHeight(x, z) {
  let h = fbm(hNoise, x * 0.008, z * 0.008, 4) * 9;
  h += fbm(hNoise, x * 0.03 + 50, z * 0.03, 3) * 1.6;
  // raise edges of the world into hills so the map feels enclosed
  const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  h += Math.pow(Math.max(0, e - 0.78) / 0.22, 2) * 16;
  return h;
}
// The hut sits on a levelled pad beside the trailhead.
const _s0 = PATH.samples[0], _dir = PATH.samples[6].clone().sub(_s0).normalize(), _side = new THREE.Vector3(-_dir.z, 0, _dir.x);
export const HUT = { x: _s0.x + _side.x * 10 - _dir.x * 2, z: _s0.z + _side.z * 10 - _dir.z * 2, rot: Math.atan2(-_side.x, -_side.z) };
HUT.y = rawHeight(HUT.x, HUT.z);
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  const hd = Math.hypot(x - HUT.x, z - HUT.z);
  if (hd < 10) h = THREE.MathUtils.lerp(HUT.y, h, THREE.MathUtils.smoothstep(hd, 4.2, 10));
  const d = pathDist(x, z);
  const k = THREE.MathUtils.smoothstep(d, 1.5, 5); // flatten path a little
  return h * (0.85 + 0.15 * k) - (1 - k) * 0.12;
}
export function mossAt(x, z) { return THREE.MathUtils.smoothstep(fbm(mNoise, x * 0.04, z * 0.04, 3), 0.05, 0.45); }

// ---------- terrain ----------
function buildTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const blend = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const d = pathDist(x, z);
    blend[i * 2] = 1 - THREE.MathUtils.smoothstep(d, 0.9, 2.3); // path
    blend[i * 2 + 1] = mossAt(x, z) * (1 - blend[i * 2]);       // moss
  }
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 2));
  geo.computeVertexNormals();

  const litter = leafLitterTexture(1024), dirt = dirtTexture(512), moss = mossTexture(512);
  const mat = new THREE.MeshStandardMaterial({ map: litter, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tDirt = { value: dirt }; sh.uniforms.tMoss = { value: moss };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 blend; varying vec2 vBlend; varying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend; vWorldXZ = (modelMatrix * vec4(position,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDirt; uniform sampler2D tMoss; varying vec2 vBlend; varying vec2 vWorldXZ;')
      .replace('#include <map_fragment>', `
        vec2 uvL = vWorldXZ / 5.5;
        vec4 cL = texture2D(map, uvL);
        vec4 cL2 = texture2D(map, vWorldXZ / 13.0 + 0.37);
        cL = mix(cL, cL2, 0.35);
        vec4 cD = texture2D(tDirt, vWorldXZ / 3.0);
        vec4 cM = texture2D(tMoss, vWorldXZ / 4.0);
        vec4 col = mix(cL, cM, vBlend.y * 0.5);
        float edge = smoothstep(0.15, 0.75, vBlend.x + (cL.r - 0.3) * 0.6);
        col = mix(col, cD, edge);
        diffuseColor *= col;
      `);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- sky ----------
function buildSky() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#7fa6c9') }, horizon: { value: new THREE.Color('#e8c9a0') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#ffd9a0') } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 c = mix(horizon, top, pow(max(h,0.0), 0.55));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

// ---------- instancing helpers ----------
// Foliage cards look dark when lit by their real normals; point normals outward from the plant's
// centre and upward so the canopy reads as a soft, lit volume.
function foliageNormals(g) {
  g.computeBoundingBox();
  const bb = g.boundingBox, cy = (bb.min.y + bb.max.y) * 0.5;
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), (p.getY(i) - cy) * 0.8 + (bb.max.y - bb.min.y) * 0.35, p.getZ(i)).normalize();
    v.y = v.y * 0.6 + 0.4; v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}
// Takes a loaded gltf scene, returns list of {geometry, material} with node transforms baked.
function extractParts(scene) {
  const parts = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (o.isMesh) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (/Leaves|Leaf|Grass/i.test(o.material.name)) foliageNormals(g);
      parts.push({ geometry: g, material: o.material });
    }
  });
  return parts;
}

class ChunkedInstances {
  constructor(scene, parts, opts = {}) {
    this.scene = scene; this.parts = parts; this.opts = opts;
    this.buckets = new Map(); // chunk index -> matrices[]
  }
  add(matrix, x, z) {
    const ci = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + HALF) / CHUNK)));
    const cj = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + HALF) / CHUNK)));
    const key = cj * CHUNKS + ci;
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(matrix.clone());
  }
  build(chunkGroups) {
    for (const [key, mats] of this.buckets) {
      for (const p of this.parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = !!this.opts.castShadow; im.receiveShadow = this.opts.receiveShadow !== false;
        im.computeBoundingSphere();
        chunkGroups[key].add(im);
      }
    }
  }
}

// ---------- falling leaves ----------
function buildFallingLeaves(tex) {
  const N = 420;
  const geo = new THREE.PlaneGeometry(0.16, 0.16);
  const uvs = geo.attributes.uv;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.frustumCulled = false;
  const atlasAttr = new Float32Array(N);
  const st = [];
  const rnd = mulberry32(99);
  for (let i = 0; i < N; i++) {
    atlasAttr[i] = Math.floor(rnd() * 4);
    st.push({ p: new THREE.Vector3((rnd() - 0.5) * 50, rnd() * 14, (rnd() - 0.5) * 50), ph: rnd() * 10, sp: 0.4 + rnd() * 0.5, spin: new THREE.Vector3(rnd() * 3, rnd() * 3, rnd() * 3) });
  }
  geo.setAttribute('atlas', new THREE.InstancedBufferAttribute(atlasAttr, 1));
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float atlas;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * 0.5 + vec2(mod(atlas,2.0)*0.5, step(1.5, atlas)*0.5);\n#endif');
  };
  const dummy = new THREE.Object3D();
  im.userData.update = (t, dt, cam) => {
    for (let i = 0; i < N; i++) {
      const s = st[i];
      s.p.y -= s.sp * dt;
      s.p.x += Math.sin(t * 0.9 + s.ph) * 0.4 * dt + 0.25 * dt;
      s.p.z += Math.cos(t * 0.7 + s.ph) * 0.3 * dt;
      const wx = cam.position.x + s.p.x, wz = cam.position.z + s.p.z;
      const ground = heightAt(wx, wz);
      let wy = cam.position.y - 1.6 + s.p.y;
      if (wy < ground + 0.02 || s.p.x > 25) { s.p.set((Math.random() - 0.5) * 50, 10 + Math.random() * 5, (Math.random() - 0.5) * 50); }
      dummy.position.set(cam.position.x + s.p.x, cam.position.y - 1.6 + s.p.y, cam.position.z + s.p.z);
      dummy.rotation.set(t * s.spin.x + s.ph, t * s.spin.y, t * s.spin.z);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  return im;
}

// ---------- world assembly ----------
export function buildWorld(scene, models, quality = 'medium') {
  const root = new THREE.Group();
  scene.add(root);
  const chunkGroups = [];
  for (let k = 0; k < CHUNKS * CHUNKS; k++) {
    const g = new THREE.Group();
    const ci = k % CHUNKS, cj = Math.floor(k / CHUNKS);
    g.userData.center = new THREE.Vector3(-HALF + (ci + 0.5) * CHUNK, 0, -HALF + (cj + 0.5) * CHUNK);
    chunkGroups.push(g); root.add(g);
  }

  const terrain = buildTerrain();
  root.add(terrain);
  const sky = buildSky();
  scene.add(sky);

  // --- prepare autumn variants of deciduous foliage ---
  const palettes = [
    ['#7a2c10', '#c4521a', '#e88a2a', '#f2b640'],   // orange
    ['#8c6a12', '#c99a22', '#e9c443', '#f5dc70'],   // golden
    ['#5c1a10', '#9c2e18', '#c94a20', '#e07a30'],   // red
    ['#6a3a14', '#a8642a', '#c98a3c', '#d9a650'],   // fern brown
    ['#4a5a22', '#6e7a30', '#9a9040', '#b8a050'],   // olive green
    ['#8a7440', '#b89a58', '#d6bc78', '#e8d496'],   // dry straw
  ];
  const autumnTexCache = new Map();
  function autumnVariant(parts, pal) {
    return parts.map(p => {
      const m = p.material;
      if (/Leaves|Leaf|Grass/i.test(m.name) && !/Pine/i.test(m.name) && m.map) {
        const key = m.map.uuid + pal;
        if (!autumnTexCache.has(key)) autumnTexCache.set(key, autumnize(m.map, palettes[pal]));
        const nm = m.clone(); nm.map = autumnTexCache.get(key); nm.roughness = 0.85;
        if (/Grass|^Leaves$/i.test(m.name)) { nm.emissiveMap = nm.map; nm.emissive = new THREE.Color(0.32, 0.3, 0.28); }
        return { geometry: p.geometry, material: nm };
      }
      const nm = m.clone(); nm.roughness = 0.9; nm.metalness = 0;
      return { geometry: p.geometry, material: nm };
    });
  }
  const tint = (parts, color) => parts.map(p => { const nm = p.material.clone(); nm.color = new THREE.Color(color); nm.roughness = 0.9; return { geometry: p.geometry, material: nm }; });

  const P = (name) => extractParts(models[name].scene);
  const kinds = {
    pine: [1, 2, 3, 4, 5].map(i => ({ parts: P('Pine_' + i), r: 0.45 })),
    decid: [],
    dead: [{ parts: P('DeadTree_1'), r: 0.4 }],
  };
  for (const name of ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'TwistedTree_1', 'TwistedTree_2'])
    for (let pal = 0; pal < 3; pal++) kinds.decid.push({ parts: autumnVariant(P(name), pal), r: 0.4 });

  const colliders = []; // {x,z,r}
  const trees = [];
  const rnd = mulberry32(2024);
  const counts = { low: 520, medium: 760, high: 980 };
  const treeCount = counts[quality] || 760;
  const instancers = new Map();
  const getInst = (variant, castShadow = true) => {
    if (!instancers.has(variant)) instancers.set(variant, new ChunkedInstances(scene, variant.parts, { castShadow }));
    return instancers.get(variant);
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  let placed = 0, guard = 0;
  while (placed < treeCount && guard++ < treeCount * 20) {
    const x = (rnd() - 0.5) * (WORLD - 8), z = (rnd() - 0.5) * (WORLD - 8);
    const d = pathDist(x, z);
    if (d < 3.2) continue;
    if (Math.hypot(x - HUT.x, z - HUT.z) < 9) continue;
    if (Math.hypot(x - PATH.samples[0].x, z - PATH.samples[0].z) < 14) continue; // clearing at trailhead
    // cluster: spruce on higher ground / one side, mixed elsewhere
    const zone = fbm(mNoise, x * 0.012 + 9, z * 0.012, 2);
    let ok = true;
    for (const c of colliders) { if ((c.x - x) ** 2 + (c.z - z) ** 2 < 9) { ok = false; break; } }
    if (!ok) continue;
    let variant, kind;
    const roll = rnd();
    if (roll < 0.03) { variant = kinds.dead[0]; kind = 'dead'; }
    else if (zone > 0.1 ? roll < 0.65 : roll < 0.25) { variant = kinds.pine[Math.floor(rnd() * 5)]; kind = 'pine'; }
    else { variant = kinds.decid[Math.floor(rnd() * kinds.decid.length)]; kind = 'decid'; }
    const sc = (kind === 'pine' ? 1.0 : 1.15) * (0.8 + rnd() * 0.55);
    const y = heightAt(x, z) - 0.1;
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    m4.compose(p3.set(x, y, z), q, s3.set(sc, sc * (0.9 + rnd() * 0.2), sc));
    getInst(variant).add(m4, x, z);
    colliders.push({ x, z, r: variant.r * sc + 0.15 });
    trees.push({ x, z, kind, s: sc });
    placed++;
  }

  // ---------- undergrowth ----------
  const under = [
    { parts: autumnVariant(P('Fern_1'), 3), n: 900, s: [0.6, 1.1], shadow: false },
    { parts: autumnVariant(P('Fern_1'), 4), n: 500, s: [0.6, 1.0], shadow: false },
    { parts: autumnVariant(P('Bush_Common'), 0), n: 260, s: [0.7, 1.2], shadow: true },
    { parts: autumnVariant(P('Bush_Common'), 2), n: 200, s: [0.7, 1.2], shadow: true },
    { parts: autumnVariant(P('Grass_Wispy_Tall'), 5), n: 4200, s: [0.35, 0.6], shadow: false, wind: true },
    { parts: autumnVariant(P('Grass_Wispy_Short'), 5), n: 4200, s: [0.4, 0.7], shadow: false, wind: true },
    { parts: autumnVariant(P('Grass_Common_Short'), 4), n: 1600, s: [0.4, 0.7], shadow: false, wind: true },
    { parts: tint(P('Rock_Medium_1'), '#b8aa98'), n: 70, s: [0.5, 1.4], shadow: true, rock: true },
    { parts: tint(P('Rock_Medium_2'), '#a89c8c'), n: 70, s: [0.5, 1.4], shadow: true, rock: true },
    { parts: tint(P('Rock_Medium_3'), '#b0a490'), n: 60, s: [0.5, 1.2], shadow: true, rock: true },
    { parts: tint(P('Pebble_Round_1'), '#c8b8a0'), n: 260, s: [0.5, 1.0], shadow: false, path: true },
    { parts: tint(P('Pebble_Round_2'), '#bfae96'), n: 260, s: [0.5, 1.0], shadow: false, path: true },
    { parts: P('Clover_1'), n: 400, s: [0.6, 1.0], shadow: false },
  ];
  const qMul = { low: 0.5, medium: 1, high: 1.5 }[quality] || 1;
  const windMats = new Set();
  for (const u of under) {
    if (u.wind) u.parts.forEach(p => windMats.add(p.material));
    const inst = new ChunkedInstances(scene, u.parts, { castShadow: u.shadow });
    const n = Math.round(u.n * (u.rock ? 1 : qMul));
    for (let i = 0; i < n; i++) {
      let x, z, d, tries = 0;
      do {
        x = (rnd() - 0.5) * (WORLD - 10); z = (rnd() - 0.5) * (WORLD - 10); d = pathDist(x, z); tries++;
      } while (tries < 20 && (u.path ? (d > 2.0 || d < 0.6) : d < 1.8));
      const sc = u.s[0] + rnd() * (u.s[1] - u.s[0]);
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      m4.compose(p3.set(x, heightAt(x, z) - (u.rock ? 0.25 * sc : 0.02), z), q, s3.set(sc, sc, sc));
      if (Math.hypot(x - HUT.x, z - HUT.z) < 5.5 && !u.wind) continue;
      if (Math.hypot(x - HUT.x, z - HUT.z) < 3.2) continue;
      inst.add(m4, x, z);
      if (u.rock && sc > 0.9) colliders.push({ x, z, r: 0.9 * sc });
    }
    inst.build(chunkGroups);
  }
  for (const inst of instancers.values()) inst.build(chunkGroups);

  // wind sway for grass
  const windUniform = { value: 0 };
  for (const m of windMats) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = windUniform;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          float sway = sin(uWind * 1.7 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uWind * 3.1 + wp.x * 0.9) * 0.2;
          transformed.x += sway * position.y * 0.18;
          transformed.z += sway * position.y * 0.10;`);
    };
  }

  // ---------- fallen leaves layer (3D quads on the ground) ----------
  const leafTex = leafSpriteAtlas();
  {
    const N = Math.round(9000 * qMul);
    const geo = new THREE.PlaneGeometry(0.22, 0.22); geo.rotateX(-Math.PI / 2);
    const atlas = new Float32Array(N);
    const mat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float atlas;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * 0.5 + vec2(mod(atlas,2.0)*0.5, step(1.5, atlas)*0.5);\n#endif');
    };
    // put them mostly on and near the path where the camera looks most
    const perChunk = new Map();
    for (let i = 0; i < N; i++) {
      let x, z;
      if (i % 3 === 0) { const s = PATH.samples[Math.floor(rnd() * PATH.samples.length)]; x = s.x + (rnd() - 0.5) * 6; z = s.z + (rnd() - 0.5) * 6; }
      else { x = (rnd() - 0.5) * WORLD; z = (rnd() - 0.5) * WORLD; }
      const y = heightAt(x, z) + 0.03;
      const e = new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5);
      q.setFromEuler(e); const sc = 0.7 + rnd() * 0.8;
      m4.compose(p3.set(x, y, z), q, s3.set(sc, sc, sc));
      const ci = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + HALF) / CHUNK))), cj = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + HALF) / CHUNK)));
      const key = cj * CHUNKS + ci;
      if (!perChunk.has(key)) perChunk.set(key, []);
      perChunk.get(key).push([m4.clone(), Math.floor(rnd() * 4)]);
    }
    for (const [key, arr] of perChunk) {
      const g = geo.clone();
      g.setAttribute('atlas', new THREE.InstancedBufferAttribute(new Float32Array(arr.map(a => a[1])), 1));
      const im = new THREE.InstancedMesh(g, mat, arr.length);
      arr.forEach((a, i) => im.setMatrixAt(i, a[0]));
      im.receiveShadow = true; im.computeBoundingSphere();
      chunkGroups[key].add(im);
    }
  }

  const falling = buildFallingLeaves(leafTex);
  scene.add(falling);

  // ---------- trailhead: hut, bench-ish crates, fence, wagon ----------
  const start = PATH.samples[0];
  const startDir = PATH.samples[6].clone().sub(start).normalize();
  const side = new THREE.Vector3(-startDir.z, 0, startDir.x);
  const place = (name, offSide, offFwd, rotY, s = 1, shadow = true) => {
    const o = models[name].scene.clone(true);
    const x = start.x + side.x * offSide + startDir.x * offFwd, z = start.z + side.z * offSide + startDir.z * offFwd;
    o.position.set(x, heightAt(x, z) - 0.05, z);
    o.rotation.y = Math.atan2(startDir.x, startDir.z) + rotY;
    o.scale.setScalar(s);
    o.traverse(m => { if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; } });
    root.add(o);
    return o;
  };
  const hut = models.Hut.scene.clone(true);
  hut.position.set(HUT.x, HUT.y, HUT.z); hut.rotation.y = HUT.rot;
  hut.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  root.add(hut);
  hut.updateMatrixWorld(true);
  const door = hut.getObjectByName('Door_1_Flat'); if (door) door.rotation.y = 1.35; // door stands open
  // walls as box colliders in hut-local space (door gap at x -1.55..-0.45 on the front, z = +2)
  for (const [cx, cz, hw, hd] of [[0, -2, 2.1, 0.2], [-2, 0, 0.2, 2.1], [2, 0, 0.2, 2.1], [0.8, 2, 1.3, 0.2], [-1.85, 2, 0.25, 0.2]])
    colliders.push({ box: true, x: HUT.x, z: HUT.z, rot: HUT.rot, cx, cz, hw, hd, r: 0 });
  // interior: bed + workbench + lamp
  const local = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), HUT.rot).add(new THREE.Vector3(HUT.x, HUT.y, HUT.z));
  const wood = new THREE.MeshStandardMaterial({ color: '#6e4526', roughness: 0.85 });
  const inner = new THREE.Group(); inner.position.set(HUT.x, HUT.y, HUT.z); inner.rotation.y = HUT.rot; root.add(inner);
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; inner.add(m); return m; };
  box(1.0, 0.32, 2.0, wood, 1.35, 0.16, -0.75);
  box(0.92, 0.12, 1.9, new THREE.MeshStandardMaterial({ color: '#e8e0cc', roughness: 1 }), 1.35, 0.38, -0.75);
  box(0.94, 0.08, 1.25, new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 1 }), 1.35, 0.46, -0.42);
  box(0.6, 0.1, 0.35, new THREE.MeshStandardMaterial({ color: '#f2ecdc', roughness: 1 }), 1.35, 0.48, -1.5);
  box(1.4, 0.08, 0.7, wood, -1.2, 0.85, -1.5); for (const [lx, lz] of [[-1.8, -1.75], [-0.6, -1.75], [-1.8, -1.25], [-0.6, -1.25]]) box(0.07, 0.85, 0.07, wood, lx, 0.42, lz);
  const lamp = new THREE.PointLight('#ffc070', 5, 7, 1.6); lamp.position.set(0, 2.3, 0); inner.add(lamp);
  colliders.push({ box: true, x: HUT.x, z: HUT.z, rot: HUT.rot, cx: 1.35, cz: -0.75, hw: 0.5, hd: 1.0, r: 0 });
  colliders.push({ box: true, x: HUT.x, z: HUT.z, rot: HUT.rot, cx: -1.2, cz: -1.5, hw: 0.7, hd: 0.35, r: 0 });
  HUT.bed = local(1.35, 0.4); HUT.bench = local(-1.2, -0.9); HUT.inner = inner;
  place('Prop_Crate', 4.5, 1.5, 0.3); place('Prop_Crate', 4.6, 2.7, -0.2, 0.8);
  place('Prop_Wagon', -5.5, -1, 0.4);
  colliders.push({ x: start.x - side.x * 5.5, z: start.z - side.z * 5.5, r: 1.8 });

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#cfe0f2', '#5a4026', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b8', 2.6);
  sun.castShadow = true;
  const shadowSize = { low: 1024, medium: 2048, high: 4096 }[quality] || 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  scene.fog = new THREE.FogExp2('#c9b79a', 0.016);

  return {
    hutLamp: lamp, terrain, sky, sun, hemi, chunkGroups, colliders, trees, falling, windUniform, start, startDir, hut,
    updateCulling(cam) {
      const far = 125;
      for (const g of chunkGroups) {
        const c = g.userData.center;
        const dx = Math.max(0, Math.abs(cam.position.x - c.x) - CHUNK / 2), dz = Math.max(0, Math.abs(cam.position.z - c.z) - CHUNK / 2);
        g.visible = dx * dx + dz * dz < far * far;
      }
    },
  };
}
