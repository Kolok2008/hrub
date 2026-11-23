// Procedural forest audio: wind, birds, footsteps on leaves, crunchy cut, coins, soft music.
export class Audio {
  constructor() { this.ctx = null; this.vol = 0.8; this.musicVol = 0.5; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = this.vol; this.master.connect(C.destination);
    // noise buffer
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    let b0 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + 0.03 * w; d[i] = w * 0.5 + b0 * 2; }
    this.noise = buf;
    // wind bed
    const src = C.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const wg = C.createGain(); wg.gain.value = 0.12;
    const lfo = C.createOscillator(); lfo.frequency.value = 0.08; const lfoG = C.createGain(); lfoG.gain.value = 250; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    src.connect(lp); lp.connect(wg); wg.connect(this.master); src.start();
    this.windGain = wg;
    // leaves rustle layer (higher band)
    const src2 = C.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 1.3;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 0.6;
    const rg = C.createGain(); rg.gain.value = 0.025; src2.connect(bp); bp.connect(rg); rg.connect(this.master); src2.start();
    const lfo2 = C.createOscillator(); lfo2.frequency.value = 0.13; const l2g = C.createGain(); l2g.gain.value = 0.02; lfo2.connect(l2g); l2g.connect(rg.gain); lfo2.start();
    this.music = C.createGain(); this.music.gain.value = this.musicVol * 0.22; this.music.connect(this.master);
    this.night = 0;
    this._birdTimer = 2; this._musicTimer = 3; this._owlTimer = 15; this._peckTimer = 20; this._gustTimer = 8; this._howlTimer = 30;
    // reverb for music: a short generated impulse
    const ir = C.createBuffer(2, C.sampleRate * 2.5, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d2 = ir.getChannelData(ch); for (let i = 0; i < d2.length; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d2.length, 3); }
    this.verb = C.createConvolver(); this.verb.buffer = ir; const vg = C.createGain(); vg.gain.value = 0.45; this.verb.connect(vg); vg.connect(this.master);
    this.music.connect(this.verb);
    this.chord = 0;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.music) this.music.gain.value = v * 0.22; }
  tick(dt, night) {
    if (!this.ctx) return;
    this.night = night;
    this._birdTimer -= dt; this._musicTimer -= dt; this._owlTimer -= dt;
    if (this._birdTimer < 0 && night < 0.5) { this.bird(); this._birdTimer = 2 + Math.random() * 7; }
    if (this._owlTimer < 0 && night > 0.6) { this.owl(); this._owlTimer = 14 + Math.random() * 20; }
    this._peckTimer -= dt; this._gustTimer -= dt; this._howlTimer -= dt;
    if (this._musicTimer < 0) { this.phrase(); this._musicTimer = night > 0.5 ? 14 : 10; }
    if (this._peckTimer < 0 && night < 0.5) { this.woodpecker(); this._peckTimer = 25 + Math.random() * 40; }
    if (this._gustTimer < 0) { this.gust(); this._gustTimer = 12 + Math.random() * 20; }
    if (this._howlTimer < 0 && night > 0.6) { this.howl(); this._howlTimer = 40 + Math.random() * 50; }
  }
  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  bird() {
    const C = this.ctx, t = C.currentTime, pan = C.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1; pan.connect(this.master);
    const kind = Math.random();
    const notes = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < notes; i++) {
      const o = C.createOscillator(), g = C.createGain(); o.type = 'sine';
      const st = t + i * (0.09 + Math.random() * 0.06), base = kind < 0.5 ? 3200 + Math.random() * 1500 : 2200 + Math.random() * 900;
      o.frequency.setValueAtTime(base, st); o.frequency.exponentialRampToValueAtTime(base * (kind < 0.5 ? 1.5 : 0.7), st + 0.07);
      this.env(g, st, 0.01, 0.04 + Math.random() * 0.03, 0.08);
      o.connect(g); g.connect(pan); o.start(st); o.stop(st + 0.2);
    }
  }
  owl() {
    const C = this.ctx, t = C.currentTime;
    for (const [dt, f] of [[0, 420], [0.5, 400], [0.8, 390]]) {
      const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t + dt); o.frequency.linearRampToValueAtTime(f * 0.92, t + dt + 0.35);
      this.env(g, t + dt, 0.05, 0.05, 0.4); o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.6);
    }
  }
  burst(freq, q, dur, gain, type = 'bandpass', rate = 1) {
    const C = this.ctx, t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = C.createGain(); this.env(g, t, 0.004, gain, dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  step(onPath, speed) {
    if (!this.ctx) return;
    if (onPath) { this.burst(900, 0.8, 0.09, 0.12); this.burst(250, 1, 0.07, 0.1, 'lowpass'); }
    else { // crunchy dry leaves: several tiny crackles
      for (let i = 0; i < 4; i++) setTimeout(() => this.burst(2500 + Math.random() * 3000, 1.5, 0.04, 0.05 + Math.random() * 0.05), i * 18 + Math.random() * 10);
      this.burst(500, 0.7, 0.1, 0.08, 'lowpass');
    }
  }
  rustle() { if (!this.ctx) return; for (let i = 0; i < 10; i++) setTimeout(() => this.burst(2000 + Math.random() * 4000, 1.2, 0.06, 0.07), i * 25); }
  crunch(perfect) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    // snap of the stem
    this.burst(1800, 2, 0.05, 0.35, 'bandpass', 1.6);
    for (let i = 0; i < 6; i++) setTimeout(() => this.burst(1200 + Math.random() * 2500, 2, 0.035, 0.18), 15 + i * 14);
    this.burst(220, 1, 0.14, 0.25, 'lowpass');
    if (perfect) {
      const o = C.createOscillator(), g = C.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(880, t + 0.05); o.frequency.setValueAtTime(1320, t + 0.13);
      this.env(g, t + 0.05, 0.01, 0.07, 0.3); o.connect(g); g.connect(this.master); o.start(t + 0.05); o.stop(t + 0.5);
    }
  }
  plop() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.12); this.env(g, t, 0.005, 0.15, 0.15); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3); this.burst(400, 1, 0.08, 0.1, 'lowpass'); }
  coins(n = 5) {
    if (!this.ctx) return; const C = this.ctx;
    for (let i = 0; i < n; i++) { const t = C.currentTime + i * 0.07; const o = C.createOscillator(), g = C.createGain(); o.type = 'square'; o.frequency.value = 1800 + Math.random() * 900; this.env(g, t, 0.003, 0.03, 0.12); const f = C.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2); }
  }
  growl() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(75, t); o.frequency.linearRampToValueAtTime(60, t + 1.1); const l = C.createOscillator(), lg = C.createGain(); l.frequency.value = 18; lg.gain.value = 12; l.connect(lg); lg.connect(o.frequency); f.type = 'lowpass'; f.frequency.value = 500; this.env(g, t, 0.15, 0.25, 1.0); o.connect(f); f.connect(g); g.connect(this.master); o.start(t); l.start(t); o.stop(t + 1.4); l.stop(t + 1.4); }
  bite() { if (!this.ctx) return; this.burst(700, 1, 0.12, 0.35, 'lowpass', 1.5); this.burst(2500, 2, 0.05, 0.2); }
  yelp() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const o = C.createOscillator(), g = C.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.25); this.env(g, t, 0.01, 0.2, 0.25); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35); this.burst(300, 1, 0.1, 0.3, 'lowpass'); }
  whoosh() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const s = C.createBufferSource(); s.buffer = this.noise; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.15); const g = C.createGain(); this.env(g, t, 0.02, 0.18, 0.15); s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.25); }
  breath() { if (!this.ctx) return; this.burst(900, 0.6, 0.45, 0.06, 'bandpass', 0.6); }
  hurt() { if (!this.ctx) return; this.burst(200, 1, 0.2, 0.4, 'lowpass'); }
  ui() { if (!this.ctx) return; this.burst(3000, 3, 0.03, 0.06); }
  woodpecker() { const n = 8 + Math.floor(Math.random() * 8); for (let i = 0; i < n; i++) setTimeout(() => this.burst(1400, 4, 0.025, 0.12, 'bandpass', 1), i * 55); }
  gust() { if (!this.ctx) return; const g = this.windGain.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.32, t + 2.5); g.linearRampToValueAtTime(0.12, t + 6); }
  howl() { if (!this.ctx) return; const C = this.ctx, t = C.currentTime; const o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(620, t + 0.8); o.frequency.linearRampToValueAtTime(560, t + 2.4); o.frequency.linearRampToValueAtTime(330, t + 3.2); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 3.3); o.connect(f); f.connect(g); g.connect(this.verb || this.master); o.start(t); o.stop(t + 3.4); }
  wipe() { if (!this.ctx) return; this.burst(5000, 1, 0.15, 0.12, 'highpass', 0.8); setTimeout(() => this.burst(4000, 1, 0.12, 0.1, 'highpass', 0.8), 160); }
  sleep() { if (!this.ctx) return; const C = this.ctx; [523, 659, 784, 1047].forEach((f, i) => { const t = C.currentTime + i * 0.25, o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = f; this.env(g, t, 0.02, 0.12, 1.2); o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 1.4); }); }
  // Karplus-Strong pluck (guitar-like)
  pluck(f, t, vol = 0.25) {
    const C = this.ctx, len = Math.floor(C.sampleRate / f), dur = 2.2, buf = C.createBuffer(1, C.sampleRate * dur, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    for (let i = len; i < d.length; i++) d[i] = (d[i - len] + d[i - len + 1]) * 0.497;
    const s = C.createBufferSource(); s.buffer = buf; const g = C.createGain(); g.gain.value = vol; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    s.connect(lp); lp.connect(g); g.connect(this.music); s.start(t);
  }
  pad(freqs, t, dur) {
    const C = this.ctx;
    for (const f of freqs) for (const det of [-4, 4]) {
      const o = C.createOscillator(), g = C.createGain(), lp = C.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  // Generative acoustic folk: soft pad chord + fingerpicked guitar arpeggio, minor & slower at night.
  phrase() {
    const C = this.ctx, t0 = C.currentTime + 0.1, night = this.night > 0.5;
    const day = [[146.8, 220, 293.7, 370], [130.8, 196, 261.6, 329.6], [110, 164.8, 220, 277.2], [123.5, 185, 246.9, 293.7]];   // D  C  A  Bm-ish
    const nightP = [[110, 164.8, 220, 261.6], [98, 146.8, 196, 233.1], [87.3, 130.8, 174.6, 220], [82.4, 123.5, 164.8, 207.7]]; // Am Gm F E
    const prog = night ? nightP : day;
    const ch = prog[this.chord % 4]; this.chord++;
    const beat = night ? 0.42 : 0.3, bars = 2, dur = beat * 8 * bars;
    this.pad(ch.map(f => f * 2), t0, dur + 1.5);
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    for (let b = 0; b < bars; b++) for (let i = 0; i < 8; i++) {
      if (night && Math.random() < 0.3) continue;
      const f = ch[pattern[i]] * (i === 0 ? 1 : 2);
      this.pluck(f, t0 + (b * 8 + i) * beat + (Math.random() - 0.5) * 0.02, i === 0 ? 0.3 : 0.18);
    }
    if (!night && Math.random() < 0.5) { const top = ch[3] * 4; [0, 1.5, 2, 3].forEach((s2, i) => this.pluck(top * [1, 1.125, 1.25, 1.125][i], t0 + 4 * beat + s2 * beat, 0.1)); }
  }
}
