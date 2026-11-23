import { SPECIES, SPECIES_ORDER } from './mushrooms.js';
import { UPGRADES, KNIVES } from './game.js';
import { PATH, HUT, heightAt, WORLD } from './world.js';

const $ = (s) => document.querySelector(s);

export class UI {
  constructor() {
    this.toastEl = $('#toasts'); this.promptEl = $('#prompt'); this.ringEl = $('#ring');
    this.ringArc = $('#ringZone'); this.ringNeedle = $('#ringNeedle');
    this.game = null;
  }
  bind(game) { this.game = game; this.updateHud(); }
  toast(text, kind = '') {
    const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
    this.toastEl.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3200);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
  }
  prompt(title, hint, danger, key = 'ЛКМ') {
    if (!title) { this.promptEl.hidden = true; return; }
    this.promptEl.hidden = false;
    this.promptEl.querySelector('.ptitle').textContent = title;
    const ph = this.promptEl.querySelector('.phint'); ph.textContent = hint; ph.dataset.key = key;
    this.promptEl.classList.toggle('danger', !!danger);
  }
  // Circular timing ring: needle 0..1 sweeps clockwise; zone = [start, start+len]
  ring(needle, zoneStart, zoneLen) {
    if (needle == null) { this.ringEl.setAttribute('hidden', ''); return; }
    this.ringEl.removeAttribute('hidden');
    const C = 2 * Math.PI * 42;
    this.ringArc.setAttribute('stroke-dasharray', `${zoneLen * C} ${C}`);
    this.ringArc.setAttribute('stroke-dashoffset', `${-zoneStart * C}`);
    const a = Math.min(1, needle) * 360;
    this.ringNeedle.setAttribute('transform', `rotate(${a} 50 50)`);
    const inZone = needle >= zoneStart && needle <= zoneStart + zoneLen;
    this.ringEl.classList.toggle('hot', inZone);
  }
  combo(n) { const el = $('#combo'); if (n < 2) { el.hidden = true; return; } el.hidden = false; el.textContent = `Серія ×${(1 + 0.1 * Math.min(n - 1, 10)).toFixed(1)}`; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  closeup(on) { $('#closeup').hidden = !on; }
  cutMeter(ky, ideal, tol) {
    const H = 0.16, y = (v) => `${100 - Math.max(0, Math.min(1, (v + 0.004) / (H + 0.004))) * 100}%`;
    $('#cmKnife').style.top = y(ky); $('#cmZone').style.top = y(ideal + tol); $('#cmZone').style.height = `${(2 * tol / (H + 0.004)) * 100}%`;
    $('#cmKnife').classList.toggle('ok', Math.abs(ky - ideal) <= tol);
  }
  bars(hp, st) { $('#hpBar').style.width = hp + '%'; $('#stBar').style.width = st + '%'; $('#bars').classList.toggle('low', hp < 35); }
  orders() {
    const o = this.game.save.orders; const el = $('#orders'); if (!o) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<b>Замовлення</b>' + o.list.map(x => `<div class="${x.done ? 'done' : ''}">${SPECIES[x.species].name} ×${x.n} · +${x.reward} ₴</div>`).join('');
  }
  debuffs(d, player) {
    const items = [];
    if (d.dirty) items.push(`<span class="db bad">Брудний ніж −${d.dirty * 10}% <kbd>R</kbd></span>`);
    if (d.bitten > 0) items.push(`<span class="db bad">Укус вовка: повільніше ${Math.ceil(d.bitten)} с</span>`);
    if (d.dizzy > 0) items.push(`<span class="db warn">Паморочиться ${Math.ceil(d.dizzy)} с</span>`);
    if (player.exhausted) items.push('<span class="db warn">Втома: руки тремтять</span>');
    const html = items.join(''); if (html !== this._db) { $('#debuffs').innerHTML = html; this._db = html; }
  }
  // ---------- map ----------
  buildMapBase() {
    const N = 480, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * WORLD, z = (j / N - 0.5) * WORLD, h = heightAt(x, z), hx = heightAt(x + 1, z) - h;
      const shade = 0.75 + hx * 0.5 + h * 0.01; const k = (j * N + i) * 4;
      img.data[k] = 196 * shade; img.data[k + 1] = 168 * shade; img.data[k + 2] = 120 * shade; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (x, z) => [(x / WORLD + 0.5) * N, (z / WORLD + 0.5) * N];
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 3.5; g.setLineDash([8, 5]); g.beginPath();
    PATH.samples.forEach((p, i) => { const [a, b] = toPx(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.stroke(); g.setLineDash([]);
    // trees as tiny dots
    g.fillStyle = 'rgba(70,60,30,0.35)'; for (const t of this.trees || []) { const [a, b] = toPx(t.x, t.z); g.beginPath(); g.arc(a, b, 1.6, 0, 6.28); g.fill(); }
    this.mapBase = c; this.toPx = toPx;
  }
  openMap(player, shopPos, onClose, story) {
    if (!this.mapBase) this.buildMapBase();
    const p = $('#map'); p.hidden = false; const cv = $('#mapCanvas'), g = cv.getContext('2d');
    g.drawImage(this.mapBase, 0, 0, cv.width, cv.height);
    const sc = cv.width / 480, P = (x, z) => this.toPx(x, z).map(v => v * sc);
    const mark = (x, z, label, col) => { const [a, b] = P(x, z); g.fillStyle = col; g.beginPath(); g.arc(a, b, 7, 0, 6.28); g.fill(); g.strokeStyle = '#2b1d12'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#2b1d12'; g.font = 'bold 15px Georgia, serif'; g.fillText(label, a + 11, b + 5); };
    mark(HUT.x, HUT.z, 'Хатина', '#b4521e'); mark(shopPos.x, shopPos.z, 'Скупка', '#e7ab3f');
    if (story && story.heart.visible) mark(story.heartPos.x, story.heartPos.z, 'Серце лісу', '#5fd8ff');
    const [a, b] = P(player.pos.x, player.pos.z);
    g.save(); g.translate(a, b); g.rotate(-player.yaw + Math.PI); g.fillStyle = '#1f6a3a'; g.beginPath(); g.moveTo(0, 11); g.lineTo(7, -7); g.lineTo(0, -3); g.lineTo(-7, -7); g.closePath(); g.fill(); g.restore();
    $('#mapClose').onclick = () => { p.hidden = true; onClose(); };
  }
  hurt() { const el = $('#hurt'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  updateHud() {
    const g = this.game; if (!g) return;
    $('#hudBasket').textContent = `${g.basketCount()}/${g.cap}`;
    $('#hudMoney').textContent = g.save.money;
    $('#hudDay').textContent = `День ${g.save.day}`;
    const db = $('#hudDebt'); if (db) { db.hidden = !(g.save.debt > 0); db.textContent = `Борг ${g.save.debt} ₴ · ${Math.max(0, 30 - g.save.day + 1)} дн.`; }
    this.orders();
  }
  clock(time) {
    const h = time * 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
    $('#hudTime').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  compass(show, angle) {
    const el = $('#compass'); el.hidden = !show;
    if (show) el.querySelector('.needle').style.transform = `rotate(${angle}rad)`;
  }

  // ---------- trading post panel ----------
  openShop(onClose, onEndDay, kind = 'sell') {
    const g = this.game; const p = $('#shop'); p.hidden = false;
    $('#shopTitle').textContent = kind === 'sell' ? 'Скупка грибів' : 'Майстерня в хатині';
    const render = (result) => {
      const counts = {};
      for (const b of g.basket) counts[b.species] = (counts[b.species] || 0) + b.count;
      const rows = SPECIES_ORDER.filter(k => counts[k]).map(k => {
        const known = g.save.up.guide || g.save.atlas[k];
        return `<li><span>${known ? SPECIES[k].name : 'Невідомий гриб'}</span><b>×${counts[k]}</b></li>`;
      }).join('');
      const res = result ? `<div class="result"><div class="big">+${result.total} ₴</div>${result.lines.map(l => `<div class="rline ${l.poison ? 'bad' : ''}"><span>${l.name} ×${l.n}</span><span>${l.poison ? 'не взяв, отруйний' : l.sum + ' ₴'}</span></div>`).join('')}</div>` : '';
      $('#shopBody').innerHTML = `
        <section class="col">
          <h3>Твій кошик</h3>${g.save.orders ? `<div class="olist">${g.save.orders.list.map(o => `<div class="${o.done ? 'done' : ''}">Замовлення: ${SPECIES[o.species].name} ×${o.n} <b>+${o.reward} ₴</b></div>`).join('')}</div>` : ''}
          ${g.basket.length ? `<ul class="blist">${rows}</ul><button id="sellBtn" class="btn primary">Продати все</button>` : `<p class="muted">Кошик порожній. Знайди гриби в лісі: під смереками ростуть білі, у моху лисички.</p>`}
          ${res}
          ${g.save.debt > 0 ? `<div class="debt"><div><b>Борг Гнатові: ${g.save.debt} ₴</b><p>Строк до дня 30. У тебе ${g.save.money} ₴.</p></div><button id="debtBtn" class="btn primary" ${g.save.money <= 0 ? 'disabled' : ''}>Віддати ${Math.min(g.save.money, g.save.debt)} ₴</button></div>` : '<p class="muted">Борг віддано. Хатина твоя.</p>'}
        </section>
        <section class="col">
          <h3>Що далі</h3>
          <p class="muted">Покращення й ножі купуй у хатині на столі. Спати лягай у ліжко там само.</p>
        </section>`;
      const work = `
        <section class="col">
          <h3>Ножі</h3>
          <div class="ups">${KNIVES.map(k => {
            const owned = g.save.knives.includes(k.id), eq = g.save.knife === k.id;
            return `<div class="up ${eq ? 'eq' : ''}"><div><b>${k.name}</b> <span class="lvl">точність ${'●'.repeat(Math.round(k.tol / 0.0019))} · удар ${k.dmg}</span><p>${k.desc}</p></div>
              ${eq ? '<span class="owned">У руці</span>' : `<button class="btn knife" data-id="${k.id}" ${!owned && g.save.money < k.cost ? 'disabled' : ''}>${owned ? 'Взяти' : k.cost + ' ₴'}</button>`}</div>`;
          }).join('')}</div>
        </section>
        <section class="col">
          <h3>Спорядження</h3>
          <div class="ups">${UPGRADES.map(u => {
            const lvl = g.save.up[u.id], next = u.levels[lvl + 1];
            const owned = !next;
            return `<div class="up"><div><b>${u.name}</b>${u.levels.length > 2 ? ` <span class="lvl">${lvl + 1}/${u.levels.length}</span>` : ''}<p>${u.desc}</p></div>
              ${owned ? '<span class="owned">Є</span>' : `<button class="btn buy" data-id="${u.id}" ${g.save.money < next.cost ? 'disabled' : ''}>${next.cost} ₴</button>`}</div>`;
          }).join('')}</div>
          <button id="sleepBtn" class="btn" style="margin-top:14px;width:100%">Лягти спати до ранку</button>
        </section>`;
      if (kind !== 'sell') $('#shopBody').innerHTML = work;
      $('#shopMoney').textContent = g.save.money;
      document.querySelectorAll('.knife').forEach(b => b.onclick = () => { if (g.buyKnife(b.dataset.id)) { this.toast('Тепер у руці: ' + KNIVES.find(k => k.id === b.dataset.id).name, 'good'); this.updateHud(); render(); } });
      const zb = $('#sleepBtn'); if (zb) zb.onclick = () => { p.hidden = true; onEndDay && onEndDay(); };
      const dbb = $('#debtBtn'); if (dbb) dbb.onclick = () => { if (g.payDebt && g.payDebt()) { this.toast('Частину боргу віддано', 'good'); render(); } };
      const sb = $('#sellBtn'); if (sb) sb.onclick = () => { const r = g.sell(); this.updateHud(); render(r); };
      document.querySelectorAll('.buy').forEach(b => b.onclick = () => { if (g.buy(b.dataset.id)) { this.toast('Куплено: ' + UPGRADES.find(u => u.id === b.dataset.id).name, 'good'); this.updateHud(); render(); } });
    };
    render();
    $('#shopClose').onclick = () => { p.hidden = true; onClose(); };
  }
  openAtlas(onClose) {
    const g = this.game; const p = $('#atlas'); p.hidden = false;
    $('#atlasBody').innerHTML = SPECIES_ORDER.map(k => {
      const n = g.save.atlas[k]; const sp = SPECIES[k];
      if (!n && !g.save.up.guide) return `<div class="card unknown"><div class="cimg ${k}"></div><h4>???</h4><p>Ще не знайдено. Продай невідомий гриб скупнику, і він розкаже, що це.</p></div>`;
      return `<div class="card ${sp.poison ? 'poison' : ''}"><div class="cimg ${k}"></div><h4>${sp.name}</h4><p>${sp.desc}</p><div class="meta">${sp.poison ? '<span class="tag bad">Отруйний</span>' : `<span class="tag">${sp.price} ₴ за шт.</span>`}<span class="tag">Знайдено: ${n || 0}</span></div></div>`;
    }).join('');
    $('#atlasClose').onclick = () => { p.hidden = true; onClose(); };
  }
}
