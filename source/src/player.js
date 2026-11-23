import * as THREE from 'three';
import { heightAt, WORLD } from './world.js';

export class Player {
  constructor(camera, dom, colliders) {
    this.cam = camera; this.dom = dom; this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.keys = {};
    this.sens = 0.0022;
    this.eye = 1.65; this.crouch = 0; this.crouchTarget = 0;
    this.bob = 0; this.bobAmt = 0; this.stepPhase = 0;
    this.onStep = null; this.enabled = false;
    this.moveInput = new THREE.Vector2(); // for touch joystick
    this.sprint = false; this.stamina = 100; this.exhausted = false; this.running = false;
    addEventListener('keydown', e => { this.keys[e.code] = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', e => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.look(e.movementX, e.movementY);
    });
  }
  look(dx, dy) {
    this.yaw -= dx * this.sens; this.pitch -= dy * this.sens;
    this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch));
  }
  setPose(x, z, yaw = 0, pitch = 0) {
    this.pos.set(x, heightAt(x, z), z); this.yaw = yaw; this.pitch = pitch; this.apply(0);
  }
  update(dt) {
    if (this.enabled) {
      const k = this.keys;
      let fx = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + this.moveInput.y;
      let sx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.moveInput.x;
      const len = Math.hypot(fx, sx); if (len > 1) { fx /= len; sx /= len; }
      let run = (k.ShiftLeft || k.ShiftRight || this.sprint) && fx > 0 && !this.exhausted;
      if (run) { this.stamina -= dt * 16; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; run = false; } }
      else this.stamina = Math.min(100, this.stamina + dt * (len > 0.1 ? 9 : 16));
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
      this.running = run;
      this.crouchTarget = (k.KeyC || k.ControlLeft) ? 1 : this.crouchTarget > 1 ? this.crouchTarget : 0;
      const speed = (run ? 5.8 : this.exhausted ? 2.2 : 2.9) * (this.crouch > 0.5 ? 0.5 : 1) * (this.slow || 1);
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const want = fwd.multiplyScalar(fx * speed).add(right.multiplyScalar(sx * speed));
      this.vel.lerp(want, 1 - Math.exp(-dt * 9));
    } else this.vel.multiplyScalar(Math.exp(-dt * 8));
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // slope check: walking up steep slopes is slower
    const h0 = heightAt(this.pos.x, this.pos.z), h1 = heightAt(nx, nz);
    const step = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    const slope = step > 0 ? (h1 - h0) / step : 0;
    const slowF = slope > 0.6 ? 0.25 : 1;
    this.pos.x += (nx - this.pos.x) * slowF; this.pos.z += (nz - this.pos.z) * slowF;
    // colliders (trees, rocks, hut)
    for (const c of this.colliders) {
      if (c.box) { // oriented box: transform into local space, push out along the shallow axis
        const wx = this.pos.x - c.x, wz = this.pos.z - c.z, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        const lx = wx * cs - wz * sn - c.cx, lz = wx * sn + wz * cs - c.cz;
        const ox = c.hw + 0.3 - Math.abs(lx), oz = c.hd + 0.3 - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          let nx = lx, nz = lz; if (ox < oz) nx = Math.sign(lx) * (c.hw + 0.3); else nz = Math.sign(lz) * (c.hd + 0.3);
          const ax = nx + c.cx, az = nz + c.cz;
          this.pos.x = c.x + ax * cs + az * sn; this.pos.z = c.z - ax * sn + az * cs;
        }
        continue;
      }
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, rr = c.r + 0.3;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); this.pos.x = c.x + dx / d * rr; this.pos.z = c.z + dz / d * rr; }
    }
    const lim = WORLD / 2 - 6;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x)); this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    const gy = heightAt(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-dt * 14));
    this.apply(dt);
  }
  apply(dt) {
    const hv = Math.hypot(this.vel.x, this.vel.z);
    this.crouch += (Math.min(1, this.crouchTarget) - this.crouch) * (1 - Math.exp(-dt * 10));
    this.bobAmt += ((hv > 0.3 ? 1 : 0) - this.bobAmt) * (1 - Math.exp(-dt * 6));
    const prev = this.stepPhase;
    this.stepPhase += hv * dt * 1.9;
    if (Math.floor(prev) !== Math.floor(this.stepPhase) && hv > 0.5 && this.onStep) this.onStep(hv);
    const bobY = Math.abs(Math.sin(this.stepPhase * Math.PI)) * (hv > 4 ? 0.08 : 0.05) * this.bobAmt * Math.min(1.6, hv / 2.9);
    const bobX = Math.sin(this.stepPhase * Math.PI) * 0.03 * this.bobAmt;
    const eye = this.eye - this.crouch * 0.75;
    this.cam.position.set(this.pos.x, this.pos.y + eye + bobY, this.pos.z);
    this.cam.rotation.set(0, 0, 0);
    this.cam.rotateY(this.yaw); this.cam.rotateX(this.pitch); this.cam.rotateZ(bobX * 0.15);
    this.cam.position.x += Math.cos(this.yaw) * bobX; this.cam.position.z -= Math.sin(this.yaw) * bobX;
    this.speed = hv;
  }
}
