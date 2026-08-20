import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createExplosionModel, createIceMistRing, createMuzzleFlashModel } from './assets.js';
import { animateExplosion } from './animation.js';

// ---------------------------------------------------------------------------
// VFX — transient world effects (Three.js) + DOM-projected overlays (damage
// numbers, per-zombie HP bars, base-hit vignette).
// ---------------------------------------------------------------------------
export class VFX {
  constructor({ scene, camera, uiRoot, labelsRoot }) {
    this.scene = scene;
    this.camera = camera;
    this.uiRoot = uiRoot;
    this.labelsRoot = labelsRoot;

    this.quality = "moyen";  // particules : low / moyen / max (Paramètres)
    this.effects = [];      // {obj, t0, dur, step}
    this.popups = [];       // {el, pos, t0, life, value, crit}
    this.hpBars = [];       // {z, root, fill}
    this.flame = null;
    this._v = new THREE.Vector3();

    // base-hit vignette
    this.vignette = document.createElement('div');
    this.vignette.className = 'vignette';
    this.vignette.style.display = 'none';
    document.body.appendChild(this.vignette);
  }

  // -- world-space transient effects -----------------------------------
  addEffect(obj, dur, step) {
    this.scene.add(obj);
    this.effects.push({ obj, t0: performance.now(), dur: dur * 1000, step: step || null });
  }

  muzzleFlash(pos) {
    const f = createMuzzleFlashModel();
    f.position.copy(pos);
    this.scene.add(f);
    this.effects.push({ obj: f, t0: performance.now(), dur: 90, step: (o, k) => o.scale.setScalar(1 + k * 1.5) });
  }

  setQuality(q) { this.quality = ['low', 'moyen', 'max'].includes(q) ? q : 'moyen'; }

  _emberCount() { return this.quality === 'low' ? 5 : this.quality === 'max' ? 18 : 10; }

  explosion(pos, size = 'normal') {
    const e = createExplosionModel(this._emberCount());
    e.position.copy(pos);
    if (size === 'small') e.scale.setScalar(0.55);
    else if (size === 'fire') e.scale.setScalar(1.1);
    this.addEffect(e, 0.6, (o, k) => animateExplosion(o, o.userData.t0));
    e.userData.t0 = performance.now();
  }

  iceRing(pos) {
    const r = createIceMistRing(1.6);
    r.position.set(pos.x, 0, pos.z);
    this.scene.add(r);
    this.effects.push({
      obj: r, t0: performance.now(), dur: 900,
      step: (o, k) => { o.scale.setScalar(0.4 + k * 1.6); o.material.opacity = 0.55 * (1 - k); },
    });
  }

  // Generic expanding colored ring (ability VFX: sprint, regen, phase, petrify).
  ring(pos, color, radius = 3) {
    const geo = new THREE.RingGeometry(radius * 0.9, radius, 40);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const r = new THREE.Mesh(geo, m);
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.06, pos.z);
    this.scene.add(r);
    this.effects.push({
      obj: r, t0: performance.now(), dur: 700,
      step: (o, k) => { o.scale.setScalar(0.3 + k * 1.4); o.material.opacity = 0.85 * (1 - k); },
    });
  }

  // Nécromant : le minion sort de sous terre — onde de choc terre + bourgeons de terre
  earthSpawn(pos) {
    const y = CONFIG.pathHeight ?? 0;
    const geo = new THREE.RingGeometry(0.9, 1.25, 28);
    const m = new THREE.MeshBasicMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const r = new THREE.Mesh(geo, m);
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, y + 0.05, pos.z);
    this.scene.add(r);
    this.effects.push({ obj: r, t0: performance.now(), dur: 650, step: (o, k) => { o.scale.setScalar(0.3 + k * 1.6); o.material.opacity = 0.9 * (1 - k); } });
    const N = this.quality === 'low' ? 8 : this.quality === 'max' ? 26 : 16;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      seeds.push({ a, up: 1.4 + Math.random() * 1.6, rad: 0.2 + Math.random() * 0.6 });
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pm = new THREE.PointsMaterial({ color: 0x9c7a44, size: 0.16, transparent: true, opacity: 0.95, depthWrite: false });
    const pts = new THREE.Points(g, pm);
    this.scene.add(pts);
    this.effects.push({
      obj: pts, t0: performance.now(), dur: 650,
      step: (o, k) => {
        const pa = o.geometry.attributes.position.array;
        for (let i = 0; i < N; i++) {
          const s = seeds[i];
          const rr = s.rad * (0.3 + k);
          pa[i * 3] = pos.x + Math.cos(s.a) * rr;
          pa[i * 3 + 1] = y + Math.sin(k * Math.PI) * s.up; // monte puis retombe
          pa[i * 3 + 2] = pos.z + Math.sin(s.a) * rr;
        }
        o.geometry.attributes.position.needsUpdate = true;
        pm.opacity = 0.95 * (1 - k);
      },
    });
  }

  // Persistent flame plume (repositioned / scaled each frame by towers).
  flameStream(pos, intensity, range) {
    if (!this.flame) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.scene.add(m);
      this.flame = m;
    }
    if (intensity <= 0) { this.flame.visible = false; return; }
    this.flame.visible = true;
    this.flame.position.copy(pos);
    const s = Math.min(1.8, 0.4 + intensity * 0.4);
    this.flame.scale.setScalar(s);
  }

  // -- DOM overlays -----------------------------------------------------
  // ⚡ Éclair d'Électro : polyline brisée avec décroissance de lueur
  zap(from, points = []) {
    if (!points.length) return;
    const pts = [];
    let a = from.clone();
    for (let i = 0; i < points.length; i++) {
      const b = new THREE.Vector3(points[i].x, Math.max(0.4, points[i].y), points[i].z);
      const segs = 7;
      if (i === 0) pts.push(a.clone());
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        const jit = (s < segs ? 0.4 : 0.12) * (Math.random() - 0.5);
        p.x += jit; p.z -= jit * 0.7;
        pts.push(p);
      }
      a = b.clone();
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const matl = new THREE.LineBasicMaterial({ color: 0xa8fff4, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, matl);
    this.scene.add(line);
    this.addEffect(line, 150, (o, k) => { o.material.opacity = Math.max(0, 0.95 * (1 - k)); o.scale.setScalar(1 + k * 0.5); });
  }

  // 🪙 flottant de la Ferme (+N pièces)
  coinBurst(pos, gain) {
    const el = document.createElement('div');
    el.className = 'dmg-popup coin';
    el.textContent = '+' + Math.round(gain) + ' 🪙';
    this.labelsRoot.appendChild(el);
    this.popups.push({ el, pos: pos.clone(), t0: performance.now(), life: 1100 });
  }

  damagePopup(pos, value, crit) {
    const el = document.createElement('div');
    el.className = 'dmg-popup' + (crit ? ' dmg-crit' : '');
    el.textContent = Math.round(value);
    this.labelsRoot.appendChild(el);
    this.popups.push({ el, pos: pos.clone(), t0: performance.now(), life: 800, value, crit });
  }

  addHpBar(z) {
    const root = document.createElement('div');
    root.className = 'z-hp';
    const fill = document.createElement('div');
    fill.className = 'z-hp-fill';
    root.appendChild(fill);
    this.labelsRoot.appendChild(root);
    this.hpBars.push({ z, root, fill });
  }

  removeHpBar(z) {
    const i = this.hpBars.findIndex((b) => b.z === z);
    if (i >= 0) {
      this.hpBars[i].root.remove();
      this.hpBars.splice(i, 1);
    }
  }

  baseHit() {
    const v = this.vignette;
    v.style.display = 'block';
    v.style.animation = 'none';
    void v.offsetWidth; // reflow to restart animation
    // last ~5s, fading out, then hidden (so it doesn't linger forever)
    v.style.animation = 'vignettePulse 5s ease-out forwards';
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => { v.style.display = 'none'; }, 5000);
  }

  // Per-frame: advance effects, project popups + HP bars.
  update() {
    const now = performance.now();

    // (transient world effects)
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const k = (now - e.t0) / e.dur;
      if (k >= 1) {
        this.scene.remove(e.obj);
        disposeObject(e.obj);
        this.effects.splice(i, 1);
        continue;
      }
      if (e.step) e.step(e.obj, k);
    }

    // damage popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      const age = now - p.t0;
      if (age > p.life) { p.el.remove(); this.popups.splice(i, 1); continue; }
      const a = 1 - age / p.life;
      const xy = this.project(p.pos, p.pos.y + (1 - a) * 1.4);
      if (xy) {
        p.el.style.left = xy.x + 'px';
        p.el.style.top = xy.y + 'px';
        p.el.style.opacity = String(a);
      }
    }

    // per-zombie HP bars
    for (const b of this.hpBars) {
      if (!b.z.alive && !b.z._dying) { b.root.style.display = 'none'; continue; }
      const pos = new THREE.Vector3();
      b.z.model.getWorldPosition(pos);
      const top = new THREE.Vector3(pos.x, pos.y + 2.1, pos.z);
      const xy = this.project(top);
      if (xy) {
        b.root.style.display = 'block';
        b.root.style.left = xy.x + 'px';
        b.root.style.top = xy.y + 'px';
      } else {
        b.root.style.display = 'none';
      }
      const pct = Math.max(0, b.z.hp / b.z.maxHp);
      b.fill.style.width = (pct * 100).toFixed(1) + '%';
      b.fill.style.background = pct > 0.5 ? '#67e06a' : pct > 0.25 ? '#e0c24a' : '#e0554a';
    }
  }

  project(worldPos) {
    this._v.copy(worldPos).project(this.camera);
    const behind = this._v.z > 1;
    if (behind || this._v.x < -1.05 || this._v.x > 1.05 || this._v.y < -1.05 || this._v.y > 1.05) return null;
    return {
      x: (this._v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this._v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  dispose() {
    for (const e of this.effects) this.scene.remove(e.obj);
    for (const p of this.popups) p.el.remove();
    for (const b of this.hpBars) b.root.remove();
    this.effects.length = 0;
    this.popups.length = 0;
    this.hpBars.length = 0;
    // keep vignette + flame for reuse across restarts
  }
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) m.dispose && m.dispose();
  });
}
