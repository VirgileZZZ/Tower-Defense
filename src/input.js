import * as THREE from 'three';
import { CONFIG, terrainHeight } from './config.js';
import { createRangeCircle, rangeCircleGeo } from './assets.js';

// ---------------------------------------------------------------------------
// Input — mouse (raycast → ghost placement / tower selection) + keyboard.
// ---------------------------------------------------------------------------
export class Input {
  constructor({ game, camera, domElement }) {
    this.game = game;
    this.camera = camera;
    this.el = domElement;

    this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.mouseNDC = new THREE.Vector2();
    this.downPos = null;

    // ghost preview
    this.ghost = null;
    this.ghostRing = null;
    this.ghostPos = new THREE.Vector3();
    this._lastClick = 0;

    domElement.addEventListener('mousemove', (e) => this.onMove(e));
    domElement.addEventListener('mousedown', (e) => this.onDown(e));
    domElement.addEventListener('mouseup', (e) => this.onUp(e));
    domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.game.cancelAction();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  _ndc(e) {
    const r = this.el.getBoundingClientRect();
    this.mouseNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.mouseNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  _groundPoint() {
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    const p = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.groundPlane, p)) return p;
    return null;
  }

  onMove(e) {
    this._ndc(e);
    this.updateGhost();
  }

  updateGhost() {
    const g = this.game;
    if (g.state !== 'PLAYING' || !g.selectedType) { this.hideGhost(); return; }
    const p = this._groundPoint();
    if (!p) { this.hideGhost(); return; }
    const [x, z] = g.path.snap(p.x, p.z);
    this.ghostPos.set(x, 0, z);
    const ok = g.canPlace(g.selectedType, x, z);
    if (!this.ghost) {
      this.ghostRing = createRangeCircle(1, ok ? 0x5a5 : 0x555);
      this.game.scene.add(this.ghostRing);
      this.ghost = { marker: this._marker(), ring: this.ghostRing };
      this.game.scene.add(this.ghost.marker);
    }
    const color = ok ? 0x4ad06a : 0xd04a4a;
    this.ghost.marker.material.color.setHex(color);
    this.ghost.marker.position.set(x, terrainHeight(x, z) + 0.06, z);
    this.ghostRing.material.color.setHex(color);
    const r = g.towerRangeForType(g.selectedType);
    if (this._ghostR !== r) {
      this._ghostR = r;
      // géométries en cache partagé : on change la référence, on ne dispose rien
      this.ghostRing.geometry = rangeCircleGeo(r);
    }
    this.ghostRing.position.set(x, terrainHeight(x, z) + 0.05, z);
    this.ghost.marker.visible = true;
    this.ghostRing.visible = true;
  }

  _marker() {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16),
      new THREE.MeshBasicMaterial({ color: 0x4ad06a, transparent: true, opacity: 0.6 })
    );
    return m;
  }

  hideGhost() {
    if (this.ghost) {
      this.ghost.marker.visible = false;
      this.ghost.ring.visible = false;
    }
  }

  onDown(e) {
    if (e.button === 0) this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  onUp(e) {
    if (e.button !== 0) return;
    const g = this.game;
    // treat as a click (not a drag) for placement / selection
    const moved = this.downPos && (Math.abs(e.clientX - this.downPos.x) > 6 || Math.abs(e.clientY - this.downPos.y) > 6);
    this.downPos = null;
    if (g.state !== 'PLAYING') return;
    this._ndc(e);

    if (g.selectedType) {
      const p = this._groundPoint();
      if (p && !moved) {
        const [x, z] = g.path.snap(p.x, p.z);
        g.placeTower(g.selectedType, x, z);
      }
      return;
    }
    // select a tower under the cursor
    if (!moved) {
      const tower = this.pickTower();
      if (tower) g.selectTower(tower);
      else g.deselect();
    }
  }

  pickTower() {
    const g = this.game;
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    const meshes = [];
    for (const t of g.towers) {
      t.model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    }
    const hits = this.ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.tower) obj = obj.parent;
    return obj ? obj.userData.tower : null;
  }

  onKey(e) {
    const g = this.game;
    if (g.state === 'MENU') {
      if (e.key === 'Enter' || e.key === ' ') g.onScreenButton();
      return;
    }
    if (g.state === 'GAMEOVER' || g.state === 'WIN') {
      if (e.key === 'Enter' || e.key === ' ') g.onScreenButton();
      return;
    }
    if (g.state !== 'PLAYING' && g.state !== 'PAUSED') return;

    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '6') {
      const i = parseInt(k, 10) - 1;
      const order = CONFIG.towerOrder;
      if (order[i]) g.selectType(order[i]);
    } else if (e.key === ' ') {
      e.preventDefault();
      g.startWaveEarly();
    } else if (e.key === 'Escape') {
      g.cancelAction();
    } else if (k === 'u') {
      g.upgradeSelected();
    } else if (k === 's') {
      g.sellSelected();
    } else if (k === 'p') {
      g.togglePause();
    }
  }

  dispose() {
    // (listeners removed implicitly on page teardown for this app)
  }
}
