import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { heightAt, pathDist, WORLD } from './world.js';

// Wolves roam the deep forest by day and come closer at night. They chase the player off the path
// and bite; the player can fight back with the knife.
export class Wolves {
  constructor(scene, gltf, colliders, audio) {
    this.scene = scene; this.gltf = gltf; this.colliders = colliders; this.audio = audio;
    this.list = [];
    this.tmp = new THREE.Vector3();
  }
  spawn(px, pz, night) {
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 40;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (Math.abs(x) > WORLD / 2 - 15 || Math.abs(z) > WORLD / 2 - 15) continue;
      if (!night && pathDist(x, z) < 22) continue;
      const o = skClone(this.gltf.scene);
      o.scale.setScalar(0.2);
      const mats = [];
      o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; m.material = m.material.clone(); m.material.metalness = 0; m.material.roughness = 0.9; m.material.color.set('#7a6a58'); mats.push(m.material); } });
      o.position.set(x, heightAt(x, z), z);
      this.scene.add(o);
      const mixer = new THREE.AnimationMixer(o);
      const clip = n => this.gltf.animations.find(c => c.name.includes(n));
      const walk = mixer.clipAction(clip('Walking')), idle = mixer.clipAction(clip('Idle'));
      idle.play();
      this.list.push({ o, mixer, walk, idle, mats, hp: 3, state: 'wander', t: 0, heading: Math.random() * 6.28, atk: 0, flash: 0, dead: 0, knock: new THREE.Vector3(), growled: false });
      return;
    }
  }
  // returns damage dealt to the player this frame
  update(dt, player, night, onPath) {
    let dmg = 0;
    const want = night > 0.5 ? 4 : 2;
    const alive = this.list.filter(w => !w.dead).length;
    if (alive < want && Math.random() < dt * 0.2) this.spawn(player.pos.x, player.pos.z, night > 0.5);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i]; const o = w.o;
      w.mixer.update(dt);
      w.flash = Math.max(0, w.flash - dt * 4);
      for (const m of w.mats) m.emissive.setRGB(w.flash * 0.8, 0, 0);
      if (w.dead) {
        w.dead += dt;
        o.rotation.z = Math.min(Math.PI / 2, w.dead * 4);
        o.position.y = heightAt(o.position.x, o.position.z) - Math.max(0, w.dead - 6) * 0.1;
        if (w.dead > 9) { this.scene.remove(o); this.list.splice(i, 1); }
        continue;
      }
      const dx = player.pos.x - o.position.x, dz = player.pos.z - o.position.z, d = Math.hypot(dx, dz);
      if (d > 140) { this.scene.remove(o); this.list.splice(i, 1); continue; }
      // decide state
      const aggressive = night > 0.5 ? d < 26 : (d < 16 && !onPath);
      if (aggressive && w.state === 'wander') { w.state = 'chase'; if (!w.growled) { this.audio.growl(); w.growled = true; } }
      if (w.state === 'chase' && (d > 40 || (onPath && night < 0.5 && d > 6))) { w.state = 'wander'; w.growled = false; }
      let speed = 0;
      if (w.state === 'wander') {
        w.t -= dt; if (w.t < 0) { w.t = 2 + Math.random() * 4; w.heading += (Math.random() - 0.5) * 2; w.moving = Math.random() < 0.6; }
        speed = w.moving ? 1.3 : 0;
      } else {
        w.heading = Math.atan2(dx, dz);
        speed = d > 1.5 ? 6.2 : 0;
        w.atk -= dt;
        if (d < 1.9 && w.atk <= 0) { w.atk = 1.3; w.lunge = 0.25; dmg += 14; this.audio.bite(); }
      }
      if (w.lunge > 0) { w.lunge -= dt; speed = 9; }
      // movement + knockback
      const vx = Math.sin(w.heading) * speed + w.knock.x, vz = Math.cos(w.heading) * speed + w.knock.z;
      w.knock.multiplyScalar(Math.exp(-dt * 6));
      o.position.x += vx * dt; o.position.z += vz * dt;
      for (const c of this.colliders) { if (c.box) continue; const ex = o.position.x - c.x, ez = o.position.z - c.z, rr = c.r + 0.4, d2 = ex * ex + ez * ez; if (d2 < rr * rr && d2 > 1e-6) { const k = rr / Math.sqrt(d2); o.position.x = c.x + ex * k; o.position.z = c.z + ez * k; if (w.state === 'wander') w.heading += 1.5; } }
      o.position.y = heightAt(o.position.x, o.position.z);
      let diff = w.heading - o.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); o.rotation.y += diff * Math.min(1, dt * 8);
      const moving = speed > 0.1;
      if (moving && !w.walk.isRunning()) { w.walk.reset().play(); w.idle.crossFadeTo(w.walk, 0.2, false); }
      if (!moving && w.walk.isRunning() && !w.idle.isRunning()) { w.idle.reset().play(); w.walk.crossFadeTo(w.idle, 0.2, false); }
      w.walk.timeScale = speed / 1.3 * 0.7;
    }
    return dmg;
  }
  // knife swing: hits the first wolf in front of the camera
  hit(cam, damage) {
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
    for (const w of this.list) {
      if (w.dead) continue;
      const to = this.tmp.set(w.o.position.x - cam.position.x, 0, w.o.position.z - cam.position.z);
      const d = to.length(); if (d > 2.6) continue;
      if (to.normalize().dot(dir) < 0.55) continue;
      w.hp -= damage; w.flash = 1; w.knock.copy(dir).multiplyScalar(7); w.state = 'chase'; w.atk = Math.max(w.atk, 0.6);
      this.audio.yelp();
      if (w.hp <= 0) { w.dead = 0.001; w.idle.stop(); w.walk.stop(); return 'kill'; }
      return 'hit';
    }
    return null;
  }
}
