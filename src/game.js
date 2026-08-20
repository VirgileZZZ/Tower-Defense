import * as THREE from 'three';
import { CONFIG, DIFFICULTIES, MODES, WAVES_BY_MODE, buildInfiniteWave, terrainHeight } from './config.js';
import { Path } from './path.js';
import { Zombie, Tower, Projectile } from './entities.js';
import { createBaseModel, createProp, createVolcano, createRangeCircle, applySkin } from './assets.js';
import { loadSave, persistSave, resetSave, SHOP } from './save.js';
import { SFX } from './sound.js';

// ---------------------------------------------------------------------------
// Game — state machine, wave spawner, economy, master update loop.
// ---------------------------------------------------------------------------
export class Game {
  constructor({ scene, camera, renderer, path, pathLength, basePos, ui, vfx }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.path = path;
    this.pathLength = pathLength;
    this.basePos = basePos;

    this.ui = ui;
    this.vfx = vfx;
    this.input = null;

    this.state = 'MENU';
    this._screenMode = 'menu'; // menu | pause | gameover|win — drives onScreenButton
    this.saveData = loadSave(); // coins, owned towers/skins (localStorage)
    if (!this.saveData.settings) this.saveData.settings = { ...CONFIG.settingsDefault };
    this.sfx = new SFX();
    this.applySettings(true);
    this.speed = 1;
    this.money = CONFIG.startMoney;
    this.baseHP = CONFIG.baseHP;
    this.currentWave = null;      // wave config object
    this.waveIndex = 0;           // 0-based index of next wave to run
    this.autoWaveT0 = 0;          // timestamp auto-start begins
    this.autoWaveReady = false;
    this.autoWave = false;        // ⚡ mode Auto : pas de délai entre les vagues
    this.shakeAmp = 0;
    this.kills = 0;
    this.earned = 0;
    this.elapsed = 0;
    // Point 10 : horloge de JEUX (ms) — avance de dt (déjà scalé par this.speed).
    // Tous les timers de gameplay (cooldown de tir, gel/ralenti/petrify, cooldown boss,
    // vol de projectile) vivent dessus. Le temps RÉEL (performance.now()) reste réservé
    // aux animations cosmétiques (recoil, slam, mort), caméra, shake et UI.
    this.gameTime = 0;
    this._lastCardMoney = -1; // last money value used to sync build-card affordability

    this.zombies = [];
    this.towers = [];
    this.projectiles = [];
    this.selectedType = null;
    this.selectedTower = null;
    this.occupied = new Set();
    this.propBlocks = [];
    this.propMeshes = [];
    this._themeIdx = -1;
    this._selRing = null;      // range ring for the selected tower
    this._volcano = null;

    this.spawner = null;
    this.lastFrame = performance.now();
  }

  // Scatter scenery props for a given theme's prop list.
  // Towers + path are untouched; only the scattered decoration changes.
  scatterProps(list, snow = false) {
    // Per-prop footprint radius (for spacing / build-blocking).
    const RADIUS = { tree: 1.2, rock: 0.8, bush: 0.6, tombstone: 0.6, lamp: 0.5, fence: 1.6, sign: 0.6, grass: 0.3, flower: 0.3,
      stump: 0.5, log: 0.9, crate: 0.5, cart: 1.0, well: 0.9, hedge: 0.8, mushroom: 0.4, snowpile: 0.8,
      skull: 0.4, deadtree: 1.0, barrel: 0.5,
      rockspire: 1.0, lavapool: 1.0, cinder: 0.5 };
    // Min distance from the path center, per prop kind (small decor can sit closer).
    const PATH_CLEAR = { grass: 1.4, flower: 1.4, mushroom: 1.6, grass2: 1.4 };
    for (const m of this.propMeshes) this.scene.remove(m);
    this.propMeshes = [];
    this.propBlocks = [];
    const b = CONFIG.mapBounds;
    const gs = CONFIG.groundSize;
    const gsize = typeof gs === 'number' ? gs : Math.max(gs.x, gs.z);
    const span = Math.min(gsize - 4, (b.maxX - b.minX) - 4);
    const half = span / 2;
    const end = this.basePos || new THREE.Vector3(26, 0, 2);
    const placed = []; // { x, z, r }
    const propClear = (x, z, r) => placed.some((p) => Math.hypot(x - p.x, z - p.z) < (r + p.r) * 1.25);
    for (const kind of list) {
      const r = RADIUS[kind] || 0.8;
      const pathMin = PATH_CLEAR[kind] ?? 2.8;
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 80 && !ok; tries++) {
        x = (Math.random() * 2 - 1) * half;
        z = (Math.random() * 2 - 1) * half;
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        const nearPath = this.path.distanceToPath(x, z) < pathMin;
        const nearBase = Math.hypot(x - end.x, z - end.z) < 4;
        const nearProp = propClear(x, z, r);
        ok = !nearPath && !nearBase && !nearProp;
      }
      if (!ok) continue;
      const prop = createProp(kind);
      prop.position.set(x, terrainHeight(x, z), z);
      this.scene.add(prop);
      this.propMeshes.push(prop);
      this.propBlocks.push({ x, z, r });
      placed.push({ x, z, r });
    }
    // Winter: dust the trees + bushes with snow
    if (snow) this._applySnowToProps();
    if (this.input) this.input.hideGhost();
  }

  // Retint foliage to a wintry blue-white and cap it with snow.
  _applySnowToProps() {
    for (const m of this.propMeshes) {
      if (m.name === 'prop-tree' || m.name === 'prop-bush' || m.name === 'prop-hedge') {
        m.traverse((o) => {
          if (o.isMesh && o.material && o.material.color && o.material.color.getHex() !== 0x5a4232) {
            // only re-tint greenish foliage
            const hex = o.material.color.getHex();
            const isGreen = (hex & 0xff) < 0x80 && ((hex >> 8) & 0xff) > 0x30;
            if (isGreen) {
              o.material.color.setHex(0xa8c8d8);
              o.material.emissive = new THREE.Color(0x2a3a4a);
              o.material.emissiveIntensity = 0.2;
            }
          }
        });
        // add a snow cap on top
        const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0),
          new THREE.MeshStandardMaterial({ color: 0xf0f6fc, roughness: 0.5, emissive: 0x2a3a4a, emissiveIntensity: 0.15 }));
        cap.position.y = (m.name === 'prop-tree' ? 2.4 : 0.5) * m.scale.x;
        cap.scale.setScalar(m.name === 'prop-tree' ? 0.8 : 0.6);
        m.add(cap);
      }
    }
  }

  // -- lifecycle ----------------------------------------------------------
  init() {
    this.state = 'MENU';
    this._screenMode = 'menu';
    this.ui.showMenu(this._ctlHint());
  }

  _ctlHint() {
    return `<b>1–6</b> select tower &nbsp;·&nbsp; <b>Click</b> place &nbsp;·&nbsp; <b>Click tower</b> inspect<br/>
      <b>U</b> upgrade &nbsp;·&nbsp; <b>S</b> sell &nbsp;·&nbsp; <b>Space</b> start wave early<br/>
      <b>P</b> pause &nbsp;·&nbsp; <b>Esc / Right-click</b> cancel`;
  }

  // -- menu / shop / inventory navigation --------------------------------
  openMenu() {
    this._screenMode = 'menu';
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.lastFrame = performance.now(); }
    if (this.state !== 'MENU') this.state = 'MENU';
    this.vfx.dispose(); // on ne laisse pas des particules/traînées sur le fond du menu
    this.ui.showMenu(this._ctlHint());
  }

  openShop() {
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.lastFrame = performance.now(); }
    this._screenMode = 'shop';
    this.ui.showShop(this.saveData);
  }

  openInventory() {
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.lastFrame = performance.now(); }
    this._screenMode = 'inventory';
    this.ui.showInventory(this.saveData);
  }

  // Écran dédié « Difficulté » (cartes illustrées + récompenses + verrouillages)
  openModes() {
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.lastFrame = performance.now(); }
    this._screenMode = 'modes';
    this.ui.showModes(this.saveData);
  }

  // Écran dédié « Paramètres » (particules / cadavres / son / reset)
  openSettings() {
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; this.lastFrame = performance.now(); }
    this._screenMode = 'settings';
    this.ui.showSettings(this.saveData);
  }

  // Shop purchases -------------------------------------------------------
  buyTower(id) {
    const item = SHOP.towers.find((t) => t.id === id);
    if (!item || this.saveData.ownedTowers.includes(id) || this.saveData.coins < item.price) return false;
    this.saveData.coins -= item.price;
    this.saveData.ownedTowers.push(id);
    // Point 6 : une tour achetée n'est PAS équipée par défaut — le joueur la
    // choisit dans l'équipage (Inventaire → tour → « Équiper »).
    if (this.sfx) this.sfx.buy();
    persistSave(this.saveData);
    if (this.ui && typeof this.ui._buildCards === 'function') { this.ui._buildCards(); this.ui.refreshCards(); }
    return true;
  }

  // ---- Point 6 : équipage (max 5 tours jouables à la fois) -------------
  isEquipped(key) {
    return Array.isArray(this.saveData.equippedTowers) && this.saveData.equippedTowers.includes(key);
  }

  // Équipe une tour possédée. Retourne true si OK, false si équipée déjà / plein / non possédée.
  equipTower(key) {
    if (!this.saveData.ownedTowers.includes(key)) return false;
    if (this.isEquipped(key)) return true;
    if ((this.saveData.equippedTowers || []).length >= 5) return false; // équipage plein
    this.saveData.equippedTowers.push(key);
    persistSave(this.saveData);
    if (this.ui && typeof this.ui._buildCards === 'function') { this.ui._buildCards(); this.ui.refreshCards(); }
    return true;
  }

  unequipTower(key) {
    if (!Array.isArray(this.saveData.equippedTowers)) return true;
    this.saveData.equippedTowers = this.saveData.equippedTowers.filter((k) => k !== key);
    // si la tour sélectionnée/déployée est déséquipée, on relâche la sélection
    if (this.selectedType === key) this.selectedType = null;
    if (this.selectedTower && this.selectedTower.type === key) {
      this.selectedTower = null; this.hideTowerRange();
      if (this.ui && this.ui.hideTowerPanel) this.ui.hideTowerPanel();
    }
    persistSave(this.saveData);
    if (this.ui && typeof this.ui._buildCards === 'function') { this.ui._buildCards(); this.ui.refreshCards(); }
    return true;
  }

  toggleEquip(key) { return this.isEquipped(key) ? this.unequipTower(key) : this.equipTower(key); }

  /** Buy "Niveau N" for a tower type in the shop — raises its upgrade cap. */
  buyTowerLevel(towerKey, level) {
    const item = (SHOP.upgrades || []).find((u) => u.tower === towerKey && u.level === level);
    if (!item) return false;
    const capNow = this.saveData.towerCaps[towerKey] ?? 2;
    if (capNow >= level) return true; // already unlocked
    if (capNow < level - 1) return false; // keep the tiers sequential
    if (this.saveData.coins < item.price) return false;
    this.saveData.coins -= item.price;
    this.saveData.towerCaps[towerKey] = level;
    persistSave(this.saveData);
    // refresh any open tower panel for caps display
    if (this.ui && typeof this.ui.refreshTowerPanel === 'function') this.ui.refreshTowerPanel();
    return true;
  }

  buySkin(id) {
    const item = SHOP.skins.find((s) => s.id === id);
    if (!item || this.saveData.ownedSkins.includes(item.id) || this.saveData.coins < item.price) return false;
    this.saveData.coins -= item.price;
    this.saveData.ownedSkins.push(id);
    persistSave(this.saveData);
    // auto-equip a freshly bought skin
    this.equipSkin(item.cat, id);
    return true;
  }

  // ⟳ Réinitialise toute la progression (pièces, tours, niveaux, skins, vitesses, mode auto)
  // Applique les réglages du menu Paramètres : qualité de particules, nombre de
  // cadavres visibles simultanément, son on/off.
  applySettings(save = false) {
    const s = (this.saveData && this.saveData.settings) || CONFIG.settingsDefault;
    if (!this.saveData.settings) { this.saveData.settings = { ...CONFIG.settingsDefault }; }
    this.corpsCap = Math.max(0, Math.min(200, s.corpses | 0));
    if (this.vfx && typeof this.vfx.setQuality === 'function') this.vfx.setQuality(s.particles || 'moyen');
    if (this.sfx) this.sfx.setEnabled(!!s.sound);
    if (save) persistSave(this.saveData);
  }

  resetProgress() {
    this.saveData = resetSave();
    persistSave(this.saveData);
    if (this.ui) {
      this.ui.syncAutoWaveBtn();
      this.openMenu(); // re-rend le menu propre avec l'état par défaut
    }
  }

  buyAutoWave() {
    const item = (SHOP.skins || []).find((s) => s.id === 'auto_wave');
    if (!item) return false;
    if (this.saveData.autoWaveOwned) return true; // déjà possédé
    if (this.saveData.coins < item.price) return false;
    this.saveData.coins -= item.price;
    this.saveData.autoWaveOwned = true;
    persistSave(this.saveData);
    this.ui.syncAutoWaveBtn();
    return true;
  }

  buySpeed(mult) {
    const item = (SHOP.skins || []).find((s) => s.cat === 'vitesse' && s.mult === mult);
    if (!item) return false;
    if (!this.saveData.unlockedSpeeds) this.saveData.unlockedSpeeds = [1, 2];
    if (this.saveData.unlockedSpeeds.includes(mult)) return true; // déjà actif
    if (this.saveData.coins < item.price) return false;
    this.saveData.coins -= item.price;
    this.saveData.unlockedSpeeds.push(mult);
    persistSave(this.saveData);
    return true;
  }

  // Equip a cosmetic skin and apply it to every existing tower / the base.
  equipSkin(cat, id) {
    if (cat === 'tower') this.saveData.towerSkin = id; else this.saveData.baseSkin = id;
    persistSave(this.saveData);
    const tintId = cat === 'tower' ? this.saveData.towerSkin : this.saveData.baseSkin;
    if (tintId === 'classic') {
      for (const t of this.towers) applySkin(t.model, 'classic');
      const b = this.scene && this.scene.getObjectByName('base');
      if (b) applySkin(b, 'classic');
      return;
    }
    if (cat === 'tower') {
      for (const t of this.towers) applySkin(t.model, tintId);
    } else {
      const b = this.scene && this.scene.getObjectByName('base');
      if (b) applySkin(b, tintId);
    }
  }

  onScreenButton(action) { // action : undefined|'restart'|'menu'
    // The big button(s) only exist on pause / gameover / win screens now
    // (the menu has its own buttons), so state is a reliable discriminator.
    if (action === 'menu') {
      this._bankCoins(); persistSave(this.saveData); // pièces conservées au menu
      this.openMenu();
      return;
    }
    if (this.state === 'PAUSED' && action !== 'restart') {
      this.state = 'PLAYING';
      this.ui.hideScreen();
      this.lastFrame = performance.now();
    } else if (this.state === 'GAMEOVER' || this.state === 'WIN' || action === 'restart') {
      this.restart();
    }
  }

  // ✕ Quitter : quitte la partie EN COURS sans tout effacer — les pièces
  // gagnées pendant le run sont banked puis on retourne au menu principal.
  quitToMenu() {
    if (this.state !== 'MENU') this._bankCoins();
    persistSave(this.saveData);
    this.openMenu();
  }

  startNewGame() {
    this._resetState();
    this.state = 'PLAYING';
    this.ui.hideScreen();
    this.ui.startGame();
    this.autoWaveReady = true;
    this.autoWaveT0 = performance.now();
    this.ui.refreshHUD();
  }

  restart() {
    this._resetState();
    this.state = 'PLAYING';
    this.ui.hideScreen();
    this.autoWaveReady = true;
    this.autoWaveT0 = performance.now();
    this.applyTheme(1);
    this.ui.refreshHUD();
  }

  // Le plus haut mode fini débloqué (chaîne : Débutant → Moyen → Avancé → Impossible)
  _highestUnlockedMode() {
    let best = DIFFICULTIES.debutant;
    for (const k of MODES) {
      const d = DIFFICULTIES[k];
      if (!d.unlock || (this.saveData && this.saveData.completed && this.saveData.completed[d.unlock])) best = d;
    }
    return best;
  }

  // Résout le mode de difficulté courant (menu principal → saveData.lastMode)
  activeMode() {
    const wanted = (this.saveData && this.saveData.lastMode) || 'debutant';
    let def = DIFFICULTIES[wanted] || DIFFICULTIES.debutant;
    // verrouillage progressif : on ne peut jouer un mode qu'après avoir gagné le précédent
    if (def.unlock && !(this.saveData && this.saveData.completed && this.saveData.completed[def.unlock])) {
      def = this._highestUnlockedMode();
    }
    return def;
  }

  _resetState() {
    // -- mode de difficulté : carte + vagues + économie spécifiques --------
    let wanted = (this.saveData && this.saveData.lastMode) || 'debutant';
    if (!(DIFFICULTIES[wanted] && DIFFICULTIES[wanted].key === wanted)) wanted = 'debutant';
    const def = this.activeMode(); // gère aussi le verrouillage progressif
    if (def.key !== wanted) {
      wanted = def.key;
      if (this.saveData) this.saveData.lastMode = def.key; // le mode était verrouillé → on retombe sur le plus haut mode débloqué
    }
    this.modeKey = def.key;
    this.modeDef = def;
    const list = WAVES_BY_MODE[def.key];
    this.waveList = Array.isArray(list) ? list : [];
    this.infiniteMode = (this.saveData && this.saveData.lastMode === 'infini') || (!list.length);
    if (this.infiniteMode) { this.waveList = []; }
    // Point 9 : nombre max de tours posées en même temps pour ce mode
    this.maxTowers = def.maxTowers ?? 30;

    // clear entities
    for (const z of this.zombies) this.scene.remove(z.model);
    for (const t of this.towers) this.scene.remove(t.model);
    for (const p of this.projectiles) this.scene.remove(p.model);
    this.zombies = [];
    this.towers = [];
    this.projectiles = [];
    this.spawner = null;
    this.selectedType = null;
    this.selectedTower = null;
    // Point 7 : on retire vraiment le cercle de portée + le panneau de tour à chaque
    // reset (rejouer / nouvelle partie), sinon le _selRing restait affiché.
    this.hideTowerRange();
    if (this.ui && typeof this.ui.hideTowerPanel === 'function') this.ui.hideTowerPanel();
    this.occupied = new Set();
    this.kills = 0;
    this.earned = 0;
    this.shakeAmp = 0;
    this.money = (this.modeDef && this.modeDef.startMoney) || CONFIG.startMoney;
    this.baseHP = (this.modeDef && this.modeDef.baseHP) || CONFIG.baseHP; // PV de base par mode
    this.currentWave = null;
    this.waveIndex = 0;
    this._themeIdx = -1;
    this.ui.hideTowerPanel();
    this.ui.refreshCards();
    this.vfx.dispose();
    // reset the visual map to the first theme (props + ground + sky)
    // Carte du mode : le run reste sur SA map (débutant=dirt, moyen=neige,
    // avancé=volcan, impossible=radioactive) ; l'Infini tourne en boucle.
    const fixed = this.modeDef && !this.infiniteMode;
    if (fixed && typeof this.setTheme === 'function') {
      try { this.setTheme(this.modeDef.themeIdx ?? 0); } catch (_) { /* noop */ }
    } else {
      this.applyTheme(1);
    }
    if (this.input) this.input.hideGhost();
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.ui.showScreen({ title: 'Paused', sub: '', btn: 'Resume' });
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.ui.hideScreen();
      this.lastFrame = performance.now();
    }
  }

  _speedOpts() {
    const un = new Set(this.saveData.unlockedSpeeds || [1, 2]);
    const opts = [1, 2];
    if (un.has(4)) opts.push(4);
    if (un.has(6)) opts.push(6);
    return [...new Set(opts)].sort((a, b) => a - b);
  }

  toggleSpeed() {
    const opts = this._speedOpts();
    let i = opts.indexOf(this.speed); if (i < 0) i = 0;
    i = (i + 1) % opts.length;
    this.speed = opts[i];
  }

  // -- placement / selection --------------------------------------------
  canPlace(type, x, z) {
    // Point 6 : seule une tour ÉQUIPÉE (et possédée) est placeable
    if (!this.isEquipped(type)) return false; // non équipée / non possédée
    const def = CONFIG.towers[type];
    if (this.money < def.cost) return false;
    // Point 9 : limite globale du mode (ex. 30 en Débutant)
    if (this.towers.length >= (this.maxTowers ?? 30)) return false;
    // Point 9 : limite par type (ex. 3 Farm, 5 Sniper, 15 Gunner)
    const typeMax = CONFIG.towerTypeMax[type];
    if (typeMax && this.towers.filter((t) => t.type === type).length >= typeMax) return false;
    return this.path.isBuildable(x, z, type, this.occupied, this.propBlocks);
  }

  // Point 9 : infos de remplissage pour l'HUD / le panneau de placement
  towerCountInfo() {
    const byType = {};
    for (const t of this.towers) byType[t.type] = (byType[t.type] || 0) + 1;
    return { total: this.towers.length, max: (this.maxTowers ?? 30), byType };
  }

  towerRangeForType(type) {
    const d = CONFIG.towers[type];
    if (type === 'mine') return d.radius;
    return d.range ?? d.radius ?? d.range;
  }

  selectType(key) {
    if (key && !this.isEquipped(key)) return; // non équipée : d'abord l'équiper (Inventaire)
    this.selectedType = (this.selectedType === key) ? null : key;
    this.selectedTower = null;
    this.ui.hideTowerPanel();
    this.ui.refreshCards();
    if (this.input) this.input.updateGhost();
  }

  placeTower(type, x, z) {
    if (!this.canPlace(type, x, z)) {
      this.vfx && (this.shakeAmp = Math.max(this.shakeAmp, 0.05));
      return;
    }
    const def = CONFIG.towers[type];
    this.money -= def.cost;
    // Point 6 : seule une tour équipée peut être construite
    if (!this.isEquipped(type)) { this.money += def.cost; return; }
    const t = new Tower(type, x, z, this);
    if (this.saveData.towerSkin && this.saveData.towerSkin !== 'classic') applySkin(t.model, this.saveData.towerSkin);
    this.towers.push(t);
    if (this.sfx) this.sfx.place();
    const [gx, gz] = this.path.snap(x, z);
    this.occupied.add(gx + '|' + gz);
    this.ui.refreshHUD();
    this.ui.refreshCards();
    // keep placing the same type for convenience
    this.selectTypeKeep(type);
    return t;
  }

  selectTypeKeep(type) {
    this.selectedType = type;
    this.ui.refreshCards();
    if (this.input) this.input.updateGhost();
  }

  showTowerRange(tower) {
    this.hideTowerRange();
    if (!tower) return;
    const ring = createRangeCircle(tower.range);
    const _tx = tower.model.position.x, _tz = tower.model.position.z;
    // Guarantee the flat ring is always above any terrain bump (max ~0.42)
    // so it is never partially buried / invisible on rolling ground.
    const ringY = Math.max(terrainHeight(_tx, _tz) + 0.06, 0.46);
    ring.position.set(_tx, ringY, _tz);
    this.scene.add(ring);
    this._selRing = ring;
  }

  hideTowerRange() {
    if (this._selRing) { this.scene.remove(this._selRing); this._selRing = null; }
  }

  selectTower(tower) {
    this.selectedTower = tower;
    this.selectedType = null;
    this.ui.showTowerPanel(tower);
    this.ui.refreshCards();
    this.showTowerRange(tower);
    if (this.input) this.input.hideGhost();
  }

  deselect() {
    this.selectedTower = null;
    this.selectedType = null;
    this.hideTowerRange();
    this.ui.hideTowerPanel();
    this.ui.refreshCards();
  }

  cancelAction() {
    this.selectedType = null;
    this.selectedTower = null;
    this.hideTowerRange();
    this.ui.hideTowerPanel();
    this.ui.refreshCards();
    if (this.input) this.input.hideGhost();
  }

  upgradeSelected() {
    const t = this.selectedTower;
    if (!t) return false;
    const ok = t.upgrade(this);
    if (ok) {
      if (this.sfx) this.sfx.upgrade();
      this.ui.refreshTowerPanel();
      this.showTowerRange(t); // range may have grown
    }
    this.ui.refreshHUD();
    return ok;
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;
    this.money += t.sellValue();
    const [gx, gz] = this.path.snap(t.model.position.x, t.model.position.z);
    this.occupied.delete(gx + '|' + gz);
    this.hideTowerRange();
    this.removeTower(t);
    this.selectedTower = null;
    this.ui.hideTowerPanel();
    this.ui.refreshHUD();
  }

  removeTower(t) {
    const i = this.towers.indexOf(t);
    if (i >= 0) this.towers.splice(i, 1);
    // If the removed tower was the selected one (e.g. a mine that just
    // detonated), clear the selection, range ring and tower panel so the UI
    // doesn't stay stuck on a tower that no longer exists.
    if (this.selectedTower === t) {
      this.selectedTower = null;
      this.selectedType = null;
      this.hideTowerRange();
      this.ui.hideTowerPanel();
      this.ui.refreshCards();
      if (this.input) this.input.hideGhost();
    }
    t.dispose(this);
  }

  // -- spawning ---------------------------------------------------------
  startWaveEarly() {
    if (!this.autoWaveReady || this.state !== 'PLAYING') return;
    const delay = this.autoWave ? 0 : CONFIG.autoWaveDelay; // Auto ON : départ immédiat
    const remaining = Math.max(0, (this.autoWaveT0 + delay * 1000) - performance.now()) / 1000;
    const bonus = Math.floor(remaining * CONFIG.earlyBonusPerSec);
    if (bonus > 0) this.money += bonus;
    this._beginWave();
  }

  // Nombre de vagues du mode courant (0 en Infini).
  totalWavesNow() { return (!this.infiniteMode && this.modeDef) ? (this.waveList.length || 1) : 0; }

  _beginWave() {
    if (!this.infiniteMode && this.waveIndex >= this.totalWavesNow()) return;
    const n = this.waveIndex + 1; // numéro de la vague à jouer (1-indexed)
    this.currentWave = this.infiniteMode ? buildInfiniteWave(n) : this.waveList[this.waveIndex];
    if (!this.currentWave) return;
    this.waveIndex++;
    if (this.sfx) { this.sfx.unlock(); this.sfx.waveStart(); }
    this.autoWaveReady = false;
    this._buildSpawner(this.currentWave);
    this.applyTheme(this.currentWave.w);
    this.ui.showBanner('WAVE ' + this.currentWave.w);
    this.ui.refreshHUD();
  }

  _buildSpawner(wave) {
    const entries = [];
    for (const [type, skin, count, flags] of wave.list) {
      for (let i = 0; i < count; i++) entries.push({ type, skin, ...(flags || {}) });
    }
    // interleave: shuffle but keep bosses last
    const normal = entries.filter((e) => e.type !== 'boss');
    const bosses = entries.filter((e) => e.type === 'boss');
    this._shuffle(normal);
    const queue = [...normal, ...bosses];
    const interval = Math.max(0.35, 1.0 - wave.w * 0.04);
    this.spawner = { queue, interval, nextAt: 0, remaining: queue.length };
  }

  _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  _spawnZombie(e = { type: 'walker', skin: 'default' }) {
    let z;
    if (e.type === 'boss') {
      const bossKey = e.skin;
      z = new Zombie({ isBoss: true, bossKey, hpScale: this.currentWave.hp, spScale: this.currentWave.sp });
      // Pyro Lord : 5 s de préparation après le spawn avant la 1re boule
      // (horloge de jeu — le délai est scalé par le speed comme tout le reste)
      if (bossKey === 'pyrolord') z._atkT = this.gameTime;
      // Mini-boss : ne oneshotte PAS la maison — il inflige 1/2 des PV de base
      if (e.mini) z.baseDamage = Math.max(5, Math.round((this.modeDef ? this.modeDef.baseHP : 40) / 2));
      // Boss FINAL (sans le flag mini) : insensible au gel d'attaque du Frost
      z.isFinalBoss = !e.mini;
    } else {
      z = new Zombie({ type: e.type, skin: e.skin, hpScale: this.currentWave.hp, spScale: this.currentWave.sp });
    }
    z._game = this;
    this._addZombie(z);
    return z;
  }

  _addZombie(z) {
    z.game = this;
    this.zombies.push(z);
    this.scene.add(z.model);
    this.vfx.addHpBar(z);
    this.ui.refreshHUD();
  }

  spawnMinion(pos, knownProgress) {
    // Le minion sort de la TERRE juste derrière le boss. Le progress exact du
    // boss est préféré : la recherche « plus proche point du chemin » peut
    // attraper un AUTRE segment (le chemin zigzague et se croise) — bug «
    // minion au milieu de la map ».
    let prog;
    if (Number.isFinite(knownProgress)) prog = knownProgress;
    else if (this.path && this.path.nearestProgress) prog = this.path.nearestProgress(pos.x, pos.z);
    else prog = 0.9;
    // juste un cran derrière le boss pour l'effet « émerge du sol »
    prog = Math.min(0.98, Math.max(0.01, prog - 0.012));
    const z = new Zombie({ type: 'walker', skin: 'default', hpScale: this.currentWave ? this.currentWave.hp : 1, spScale: 1 });
    z._game = this;
    z.progress = prog;
    z._riseT0 = this.gameTime; // animation « sort de terre » (horloge de jeu)
    z._riseDur = 600;
    this._addZombie(z);
    if (this.vfx) this.vfx.earthSpawn(this.path.pointAt(prog));
  }

  // Un monstre meurt. (Le Nécromant ne « grasse » plus toutes les morts :
  // seuls les coups de grâce de SES PROPRES ÂMES ressuscitent — géré par le
  // hook onKill des projectiles, Tower.onSoulKill.)
  onMonsterKilled() {
    // hook conservé pour l'avenir (stats, achievements…)
  }

  // Squelette (troupe du Nécromant) : sort près de la BASE et marche en SENS
  // INVERSE pour aller au-devant des ennemis. Se sacrifie (dégâts = PV).
  spawnSkeleton({ maxHp = 30, srcType = 'walker', pct = 0.2 } = {}) {
    const z = new Zombie({ type: 'skeleton', skin: 'default', hpScale: 1, spScale: 1 });
    z._game = this;
    z.skeleton = true;
    z.reverse = true;
    // PV = % des PV du monstre source (pct fourni par la tour, selon son niveau)
    z.maxHp = Math.max(8, Math.round(maxHp * pct));
    z.hp = z.maxHp;
    z.baseSpeed = 2.0;    // plus rapide qu'un walker : il doit rattraper la horde
    z.reward = 0;         // troupe : aucun récompense à sa mort
    z.baseDamage = 0;     // n'inflige rien à la base (et ne oneshotte pas)
    z.progress = 0.985;   // juste devant la base, sens inverse vers le spawn
    z._riseT0 = this.gameTime; // animation « sort de terre » (horloge de jeu)
    z._riseDur = 500;
    this._addZombie(z);
    if (this.vfx) this.vfx.earthSpawn(this.path.pointAt(0.98));
  }

  // -- wave / spawner update --------------------------------------------
  updateSpawner(now, dt) {
    if (!this.spawner) return;
    const s = this.spawner;
    while (s.queue.length && now >= (s.nextAt || 0)) {
      const e = s.queue.shift();
      this._spawnZombie(e);
      s.remaining = s.queue.length;
      if (s.queue.length) s.nextAt = now + s.interval * 1000;
      this.ui.refreshHUD();
    }
    if (s.queue.length === 0) this.spawner = null;
  }

  // -- master update ----------------------------------------------------
  update(rawDt, now) {
    const dt = Math.min(0.05, Math.max(0, rawDt)) * this.speed;
    this.elapsed += dt;
    // Point 10 : l'horloge de jeu avance au rythme du speed (dt déjà scalé).
    this.gameTime += dt * 1000;

    // Cap visible corpses (Paramètres, défaut 20) pour éviter un à-coup de
    // performance : les plus vieux cadavres terminent leur mort instantanément.
    {
      const cap = Math.max(0, this.corpsCap | 0); // Paramètres → cadavres visibles
      let dying = 0;
      for (const z of this.zombies) if (z.dead && !z._deathDone) dying++;
      if (dying > cap) {
        let excess = dying - cap;
        for (const z of this.zombies) {
          if (excess <= 0) break;
          if (z.dead && !z._deathDone) { z._deathDone = true; excess--; }
        }
      }
    }

    // screen shake decay
    if (this.shakeAmp > 0) {
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * 2.2);
      if (this.shakeAmp > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shakeAmp;
        this.camera.position.z += (Math.random() - 0.5) * this.shakeAmp;
      }
    }

    // 1. spawn — cadence des spawns scalée par le speed (gameTime)
    this.updateSpawner(this.gameTime, dt);

    // 2. zombies — `now` de gameplay = gameTime (scalé) ; `now` réel en 4e arg pour les anims
    for (const z of this.zombies) z.update(dt, this, this.gameTime, now);

    // 3. tours — idem : gameTime pour cooldown/gel, now réel pour recoil
    for (const t of this.towers) t.update(dt, this, this.gameTime, now);

    // 3b. remove one-shot towers that have detonated (mines)
    const deadTowers = this.towers.filter((t) => t.dead);
    for (const t of deadTowers) {
      const [gx, gz] = this.path.snap(t.model.position.x, t.model.position.z);
      this.occupied.delete(gx + '|' + gz);
      this.removeTower(t);
    }

    // 4. projectiles
    for (const p of this.projectiles) p.update(dt, this);

    // 5. cleanup deaths / arrived base
    this._reapZombies();

    // 6. base HP check
    if (this.baseHP <= 0) { this._gameOver(); }

    // 7. wave complete check
    this._checkWaveComplete(now);

    // auto-advance waves
    this.updateAutoWave(now);

    // UI
    this.vfx.update();
    this.ui.refreshHUD();
    // Keep build-card affordability in sync as money changes (kills grant gold,
    // so a card can become affordable mid-wave without any user click).
    const mNow = Math.floor(this.money);
    if (mNow !== this._lastCardMoney) {
      this._lastCardMoney = mNow;
      this.ui.refreshCards();
    }
  }

  _reapZombies() {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z._deathDone) {
        this.zombies.splice(i, 1);
        this.vfx.removeHpBar(z);
        z.dispose(this);
      } else if (z.dead && !z._deathDone) {
        // grant reward once when death animation finishes; do it at startDeath
      } else if (z.reachedBase || z.reachedStart) {
        this.zombies.splice(i, 1);
        this.vfx.removeHpBar(z);
        z.dispose(this);
      }
    }
  }

  // Reward granted when a zombie dies (not when it leaks).
  grantKillReward(z) {
    this.money += z.reward;
    this.earned += z.reward;
    this.kills++;
  }

  onZombieReachedBase(z) {
    this.baseHP -= z.baseDamage;
    // 🛡️ Un BOSS qui atteint la base = mort immédiate : il enfonce toute la
    // structure d'un seul coup (game over sur le champ, même à 20/20 PV).
    if (z.isBoss) {
      this.baseHP = 0;
      this.shake(0.9);
      if (this.ui && this.ui.showBanner) this.ui.showBanner('⚠️ LE BOSS A ENFONCÉ LA BASE');
    }
    this.vfx.baseHit();
    if (this.sfx) this.sfx.baseHit();
    this.shake(0.4);
    this.ui.flashBase();
    // small death effect at base
    const p = this.path.pointAt(1);
    this.vfx.explosion(new THREE.Vector3(p.x, 0.3, p.z), 'small');
  }

  // -- projectiles / fireballs -----------------------------------------
  spawnProjectile(opts) {
    const p = new Projectile(opts);
    this.scene.add(p.model);
    this.projectiles.push(p);
  }

  removeProjectile(p) {
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
    p.dispose(this);
  }

  spawnFireball(from, to, damage) {
    this.spawnProjectile({
      kind: 'fireball', from, to, target: null, damage,
      duration: 0.7, fireball: true,
    });
  }

  // -- damage / death ---------------------------------------------------
  soundBaseHit() {
    if (this.sfx && this.saveData.settings && this.saveData.settings.sound !== false) this.sfx.baseHit();
  }

  damageBase(amount) {
    this.baseHP -= amount;
    this.vfx.baseHit();
    if (this.sfx) this.sfx.baseHit();
    this.ui.flashBase();
  }

  shake(amp) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  // -- win / lose -------------------------------------------------------
  _gameOver() {
    if (this.state === 'GAMEOVER') return;
    if (this.sfx) this.sfx.lose();
    // La boucle de jeu s'arrête ici : vfx.update() ne tourne plus, donc les
    // effets en cours (éclairs Électro, explosions, particules…) seraient
    // GELÉS à l'écran. On nettoie tout derrière l'écran de fin.
    this.vfx.dispose();
    this.state = 'GAMEOVER';
    this._bankCoins();
    this.ui.showScreen({
      title: 'Base Destroyed',
      sub: 'The undead broke through on wave ' + (this.currentWave ? this.currentWave.w : this.waveIndex) + '.',
      body: this._statsBody(),
      buttons: [
        { key: 'restart', label: 'Rejouer', primary: true },
        { key: 'menu',    label: 'Menu' },
      ],
    });
  }

  _win() {
    if (this.state === 'WIN') return;
    this.vfx.dispose(); // idem : pas d'effets gelés derrière l'écran de victoire
    this.state = 'WIN';
    // Débloque progressif : gagner un mode débloque le suivant
    const mk = this.modeKey && this.modeDef ? this.modeDef.key : null;
    if (mk && this.saveData) {
      this.saveData.completed = Object.assign({}, this.saveData.completed, { [mk]: true });
      persistSave(this.saveData);
    }
    this._bankCoins();
    // Bonus de mode : plus la difficulté est élevée, plus la victoire rapporte
    const mRew = (this.modeDef && this.modeDef.reward) || 0;
    if (mRew > 0 && this.saveData) { this.saveData.coins += mRew; persistSave(this.saveData); }
    this._lastModeReward = mRew;
    this.ui.showScreen({
      title: 'Victory!',
      sub: mRew > 0
        ? `Mode ${(this.modeDef || {}).name || ''} terminé — bonus de difficulté : +${mRew.toLocaleString('fr-FR')} 🪙` + (this._lastCoinGain ? ' (avec ' + this._lastCoinGain + ' 🪙 gagnés en partie)' : '')
        : 'All waves repelled. The base stands.',
      body: this._statsBody(),
      buttons: [
        { key: 'restart', label: 'Rejouer', primary: true },
        { key: 'menu',    label: 'Menu' },
      ],
    });
  }

  // Bank the gold earned this run as permanent coins (used in the shop).
  _bankCoins() {
    const gained = Math.floor(this.earned);
    if (gained > 0) { this.saveData.coins += gained; persistSave(this.saveData); }
    this._lastCoinGain = gained;
  }

  _statsBody() {
    return `<div>
      <div class="stat"><span>Zombies killed</span><b>${this.kills}</b></div>
      <div class="stat"><span>Gold earned</span><b>${Math.floor(this.earned)}</b></div>
      <div class="stat"><span>Coin reward</span><b>+${this._lastCoinGain || 0} 🪙</b></div>
      <div class="stat"><span>Base HP left</span><b>${Math.max(0, this.baseHP)} / ${CONFIG.baseHP}</b></div>
    </div>`;
  }

  _checkWaveComplete(now) {
    if (this.state !== 'PLAYING') return;
    // all waves done and nothing alive -> win
    if (!this.infiniteMode && this.waveIndex >= this.totalWavesNow()) {
      const anyAlive = this.zombies.some((z) => z.alive) || (this.spawner && this.spawner.queue.length > 0);
      if (!anyAlive) { this._win(); return; }
    }
    // current wave cleared -> open next (auto timer)
    if (this.currentWave && this.spawner === null) {
      const anyAlive = this.zombies.some((z) => z.alive);
      if (!anyAlive) {
        if (!this.infiniteMode && this.waveIndex >= this.totalWavesNow()) {
          if (this.sfx) this.sfx.win(); this._win();
        } else if (!this.autoWaveReady) {
          // Mode fini : vague suivante dans la liste. Mode Infini : même mécanisme
          // (autoWaveReady) — _beginWave() fabrique alors une vague infinie (n° croissant).
          this.autoWaveReady = true;
          this.autoWaveT0 = now;
        }
      }
    }
  }

  // auto-advance waves after the configured delay
  updateAutoWave(now) {
    if (this.autoWaveReady && this.state === 'PLAYING') {
      const delay = this.autoWave ? 0 : CONFIG.autoWaveDelay; // ⚡ Auto ON : départ immédiat
      if (now - this.autoWaveT0 >= delay * 1000) this._beginWave();
    }
  }

  applyTheme(wave) {
    // Modes finis (Débutant/Moyen/Avancé/Impossible) : le run reste sur SA
    // carte dédiée. En mode Infini la map tourne en boucle toutes les 5 vagues.
    if (this.modeDef && !this.infiniteMode) {
      const idx = this.modeDef.themeIdx ?? 0;
      // BUG CORRIGÉ : sans ce check, les décors étaient RE-SCATTERÉS (positions
      // aléatoires) à CHAQUE nouvelle vague → « la map rebouge ». On ne
      // réapplique que si le thème a vraiment changé.
      if (idx === this._themeIdx && !this._forceTheme) return;
      this._forceTheme = false;
      return this._applyThemeIdx ? this._applyThemeIdx(idx) : null;
    }
    // (Infini) : the visual theme rotates every 5 waves and KEEPS cycling forever
    const idx = Math.floor((wave - 1) / 5) % CONFIG.themes.length;
    if (idx === this._themeIdx && !this._forceTheme) return;
    this._forceTheme = false;
    return this._applyThemeIdx(idx);
  }

  _applyThemeIdx(idx) {
    const th = CONFIG.themes[idx];
    if (!th) return;
    this._themeIdx = idx;
    this.scene.background = new THREE.Color(th.sky);
    this.scene.fog = new THREE.Fog(th.sky, th.fog[0], th.fog[1]);
    const ground = this.scene.getObjectByName('ground');
    if (ground && ground.material) ground.material.color.setHex(th.ground);
    // path is a group (curb base + raised top); re-tint the top-face gradient
    const pathGroup = this.scene.getObjectByName('path');
    if (pathGroup) {
      if (typeof pathGroup.userData.setColors === 'function') {
        pathGroup.userData.setColors(th.path, th.ground);
      } else {
        const top = pathGroup.children.find((c) => c.name === 'path' && c.material);
        if (top && top.material) top.material.color.setHex(th.path);
      }
    }
    // volcano centerpiece (volcanic map) — remove on theme change
    this._removeVolcano();
    // new scenery for the new map
    this.scatterProps(th.props || CONFIG.defaultProps, !!th.snow);
    if (th.volcano) this._placeVolcano();
    if (this.ui) this.ui.showBanner('NEW MAP: ' + th.name.toUpperCase());
  }

  // Test / manual theme switching (UI buttons) — force a specific theme index.
  setTheme(idx) {
    if (!CONFIG.themes[idx]) return 'map';
    this._themeIdx = -1; // force re-apply even if same
    this._applyThemeIdx(Math.max(0, idx) | 0);
    return CONFIG.themes[idx].name;
  }

  // Cycle to the next map theme; returns the new theme's name for the HUD label.
  nextTheme() {
    const n = CONFIG.themes.length;
    const cur = Math.max(0, this._themeIdx);
    const next = (cur + 1) % n;
    return this.setTheme(next);
  }

  _placeVolcano() {
    const v = createVolcano(1);
    // park the volcano in a clear corner away from the path + base
    v.position.set(-20, 0, 12);
    v.rotation.y = 0.5;
    this.scene.add(v);
    this._volcano = v;
  }

  _removeVolcano() {
    if (this._volcano) { this.scene.remove(this._volcano); this._volcano = null; }
  }
}

// ---------------------------------------------------------------------------
// Damage application hook: when a zombie dies, grant reward + death VFX.
// (wired into Zombie.startDeath via Game)
// ---------------------------------------------------------------------------
Game.prototype._onZombieDeath = function (z) {
  if (z.isBoss) this.vfx.explosion(z.model.position, 'big');
  else this.vfx.explosion(z.model.position, 'small');
  this.grantKillReward(z);
  // death animation kind: explode for tanks/bosses, collapse otherwise
  z.startDeath(z.isBoss || z.type === 'tank' ? 'explode' : 'collapse');
};
