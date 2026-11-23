import * as THREE from 'three';
import { heightAt, pathDist, WORLD, PATH } from './world.js';
import { mulberry32 } from './noise.js';
import { buildMushroom } from './mushrooms.js';

export const DEBT = 1500, DAYS = 30;

const PAGES = [
  ['Перша сторінка', 'Якщо ти це читаєш, хатина тепер твоя. Пробач, що лишив тобі і борг. Гнат зі скупки чесний, але грошей не пробачає. Збирай гриби: ліс годує того, хто його поважає.'],
  ['Про білі гриби', 'Білий любить старі смереки й тінь. Біля стежки його давно вибрали. Сходь у хащі, там їх більше, тільки пам\'ятай дорогу назад.'],
  ['Про ніж', 'Ріж низько, біля самої землі, але землю не чіпай. Брудний ніж псує гриб. Я витирав свій об мох.'],
  ['Про вовків', 'Вовки в цьому лісі не злі. Їх щось жене з глибини. Раніше вони не підходили до стежки. Тепер підходять щоночі.'],
  ['Про Золотий гриб', 'Я бачив його тричі за життя. Він світиться, як ліхтарик, і росте лише там, де ліс найздоровіший. Далеко від людей.'],
  ['Записка без дати', 'Гнат питав, де я знаходжу золоті. Я не сказав. Він довго дивився мені вслід. Наступного дня хтось ходив біля хатини.'],
  ['Про грибницю', 'Гриби не ростуть самі по собі. Під землею вони всі з\'єднані, як жили. Десь у глибині лісу має бути серце. Я його шукаю.'],
  ['Карта, перша половина', 'Від старої мертвої сосни йди туди, де ввечері сідає сонце. Там земля м\'яка й тепла навіть узимку.'],
  ['Карта, друга половина', 'Знайшов. Воно світиться вночі блакитним. Якщо Гнат дізнається, він його вирубає й продасть золоті гриби до останнього. Ліс помре.'],
  ['Остання сторінка', 'Я лишаю вибір тобі. Можна продати таємницю й закрити борг одним днем. А можна зберегти ліс і заробити чесно. Я свій вибір зробив. Серце лісу позначене на твоїй карті.'],
];

function pageTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#efe2c2'; g.fillRect(0, 0, 128, 160);
  g.strokeStyle = 'rgba(60,40,20,0.55)'; g.lineWidth = 2;
  for (let y = 22; y < 150; y += 12) { g.beginPath(); g.moveTo(12, y); for (let x = 12; x < 116; x += 6) g.lineTo(x, y + Math.sin(x * 0.7 + y) * 1.5); g.stroke(); }
  g.fillStyle = 'rgba(120,80,40,0.25)'; g.beginPath(); g.arc(96, 130, 14, 0, 6.28); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Story {
  constructor(scene, save) {
    this.scene = scene; this.save = save;
    if (!save.story) save.story = { pages: [], choice: null, ended: null, intro: false };
    if (save.debt == null) save.debt = DEBT;
    const rnd = mulberry32(777);
    // pages spread from near the trailhead to deep forest
    this.pagePos = [];
    for (let i = 0; i < PAGES.length; i++) {
      for (let tries = 0; tries < 200; tries++) {
        const a = rnd() * Math.PI * 2, r = 25 + i * 9 + rnd() * 10;
        const x = PATH.samples[0].x * (1 - i / 12) + Math.cos(a) * r * 0.9, z = PATH.samples[0].z * (1 - i / 12) + Math.sin(a) * r * 0.9;
        if (Math.abs(x) > WORLD / 2 - 20 || Math.abs(z) > WORLD / 2 - 20) continue;
        const pd = pathDist(x, z); if (pd < 4 + i * 2.5 || pd > 8 + i * 5) continue;
        this.pagePos.push(new THREE.Vector3(x, heightAt(x, z), z)); break;
      }
      if (!this.pagePos[i]) this.pagePos.push(new THREE.Vector3(PATH.samples[i * 40].x + 6, 0, PATH.samples[i * 40].z + 6).setY(heightAt(PATH.samples[i * 40].x + 6, PATH.samples[i * 40].z + 6)));
    }
    // heart of the forest: the spot furthest from the path in the western half
    let best = null, bd = -1;
    for (let i = 0; i < 400; i++) { const x = -WORLD / 2 + 25 + rnd() * (WORLD / 2 - 30), z = (rnd() - 0.5) * (WORLD - 50); const d = pathDist(x, z); if (d > bd) { bd = d; best = new THREE.Vector3(x, heightAt(x, z), z); } }
    this.heartPos = best;
    this.buildPages(); this.buildHeart();
  }
  buildPages() {
    const tex = pageTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: '#3a2a10', emissiveIntensity: 0.4 });
    this.pageObjs = this.pagePos.map((p, i) => {
      const g = new THREE.Group(); g.position.copy(p);
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: '#8a8070', roughness: 1 })); stone.scale.y = 0.5; stone.position.y = 0.06; g.add(stone);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), mat); paper.position.y = 0.2; paper.rotation.x = -0.9; g.add(paper);
      const light = new THREE.PointLight('#ffd890', 0.6, 3); light.position.y = 0.5; g.add(light);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.userData.paper = paper; g.visible = !this.save.story.pages.includes(i);
      this.scene.add(g); return g;
    });
  }
  buildHeart() {
    const g = new THREE.Group(); g.position.copy(this.heartPos);
    const glow = new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: '#2ac8e8', emissiveIntensity: 1.4, roughness: 0.4 });
    const rnd = mulberry32(31);
    for (let i = 0; i < 14; i++) {
      const m = buildMushroom(i % 3 ? 'russula' : 'porcini', 100 + i);
      m.traverse(o => { if (o.isMesh) o.material = glow; });
      const a = rnd() * 6.28, d = i === 0 ? 0 : 0.6 + rnd() * 2.2, s = i === 0 ? 9 : 2 + rnd() * 4;
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.scale.setScalar(s); g.add(m);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.05, 6, 60), new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.5 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const light = new THREE.PointLight('#5fd8ff', 6, 18); light.position.y = 1.5; g.add(light);
    g.visible = this.save.story.pages.length >= PAGES.length;
    this.heart = g; this.scene.add(g);
  }
  // nearest story object the player can use
  near(p) {
    for (let i = 0; i < this.pageObjs.length; i++) if (this.pageObjs[i].visible && this.pageObjs[i].position.distanceTo(p) < 1.9) return { type: 'page', id: i };
    if (this.heart.visible && !this.save.story.choice && Math.hypot(p.x - this.heartPos.x, p.z - this.heartPos.z) < 4.5) return { type: 'heart' };
    return null;
  }
  takePage(i) {
    this.save.story.pages.push(i); this.pageObjs[i].visible = false;
    if (this.save.story.pages.length >= PAGES.length) this.heart.visible = true;
    return { title: PAGES[i][0], text: PAGES[i][1], n: this.save.story.pages.length, total: PAGES.length };
  }
  readPage(i) { return { title: PAGES[i][0], text: PAGES[i][1] }; }
  update(t) {
    for (const g of this.pageObjs) if (g.visible) { g.userData.paper.position.y = 0.2 + Math.sin(t * 2 + g.position.x) * 0.02; }
    if (this.heart.visible) this.heart.rotation.y = Math.sin(t * 0.2) * 0.05;
  }
}
export { PAGES };
