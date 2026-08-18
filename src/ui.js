import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SHOP } from './save.js';
import { createZombieModel, createBossModel, createTowerModel, createBaseModel, applySkin } from './assets.js';

// ---------------------------------------------------------------------------
// UI — DOM overlay: HUD, build panel, selected-tower panel, screens, banner.
// ---------------------------------------------------------------------------

const TOWER_COLORS = {
  gunner: 0x6a7a6a, frost: 0x6a89a8, flame: 0x8a4a3a,
  sniper: 0x4a5560, mortar: 0x4a5a44, mine: 0x6a6a4a,
};
// Clean, non-emoji SVG icons (stroke = currentColor so they inherit the card's text color)
const svgAttrs = 'viewBox="0 0 24 24" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const TOWER_ICONS = {
  // Gunner: crosshair with a center dot
  gunner: `<svg ${svgAttrs}><circle cx="12" cy="12" r="6.5"/><line x1="12" y1="2.5" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21.5" y2="12"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>`,
  // Frost: six-armed snowflake
  frost: `<svg ${svgAttrs}><line x1="12" y1="2.5" x2="12" y2="21.5"/><line x1="3.8" y1="7.2" x2="20.2" y2="16.8"/><line x1="20.2" y1="7.2" x2="3.8" y2="16.8"/><path d="M12 2.5 l-2 2.2 M12 2.5 l2 2.2 M12 21.5 l-2 -2.2 M12 21.5 l2 -2.2"/><path d="M3.8 7.2 l2.6 1 M20.2 16.8 l-2.6 -1 M20.2 7.2 l-2.6 1 M3.8 16.8 l2.6 -1"/></svg>`,
  // Flame: stylised fire
  flame: `<svg ${svgAttrs}><path d="M12 2.5 C 10 7 15.5 8 13.2 12 C 11.5 15 16 15.5 14 19.5 C 12.5 22.5 9.5 20.5 10.5 17 C 7.5 18.5 7.5 13.5 10 11.5 C 7.8 9 11 6 12 2.5 Z"/><path d="M12.5 12.5 C 11.5 15 13.5 15.5 12.8 18"/></svg>`,
  // Sniper: bullseye with long crosshair
  sniper: `<svg ${svgAttrs}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><line x1="12" y1="1" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="23"/><line x1="1" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="23" y2="12"/></svg>`,
  // Mortar: arcing shell
  mortar: `<svg ${svgAttrs}><path d="M5 19 C 7 11 14 7.5 20.5 5.5" stroke-dasharray="2.5 2.5"/><circle cx="5" cy="19" r="2.4" fill="currentColor" stroke="none"/><path d="M20.5 5.5 l-3 0.4 M20.5 5.5 l-0.6 3"/></svg>`,
  // Mine: spiky sphere
  mine: `<svg ${svgAttrs}><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="7" y2="7"/><line x1="17" y1="17" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="7" y2="17"/><line x1="17" y1="7" x2="19.1" y2="4.9"/></svg>`,
};

export class UI {
  constructor({ game }) {
    this.game = game;
    this.moneyEl = document.getElementById('hud-money');
    this.waveEl = document.getElementById('hud-wave');
    this.zombiesEl = document.getElementById('hud-zombies');
    this.basebar = document.getElementById('hud-basebar');
    this.basefill = document.getElementById('hud-basefill');
    this.hud = document.getElementById('hud');
    this.buildpanel = document.getElementById('buildpanel');
    this.towerpanel = document.getElementById('towerpanel');
    this.tpName = document.getElementById('tp-name');
    this.tpStats = document.getElementById('tp-stats');
    this.tpTargeting = document.getElementById('tp-targeting');
    this.tpUpgrade = document.getElementById('tp-upgrade');
    this.tpSell = document.getElementById('tp-sell');
    this.screen = document.getElementById('screen');
    this.screenTitle = document.getElementById('screen-title');
    this.screenSub = document.getElementById('screen-sub');
    this.screenBody = document.getElementById('screen-body');
    this.screenBtn = document.getElementById('screen-btn');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnAutoWave = document.getElementById('btn-autowave');
    this.btnPause = document.getElementById('btn-pause');

    this.banner = document.createElement('div');
    this.banner.id = 'wave-banner';
    document.body.appendChild(this.banner);

    this.cards = {};
    this._buildCards();
    this._wireButtons();
    this.syncAutoWaveBtn();
  }

  // Build panel only shows towers the player actually owns (locked ones
  // appear in the shop / inventory instead).
  _ownedTowerKeys() {
    const owned = this.game.saveData ? this.game.saveData.ownedTowers : CONFIG.towerOrder;
    return CONFIG.towerOrder.filter((k) => owned.includes(k));
  }

  _buildCards() {
    this.buildpanel.innerHTML = '';
    this._ownedTowerKeys().forEach((key, i) => {
      const def = CONFIG.towers[key];
      const card = document.createElement('div');
      card.className = 'tower-card';
      card.dataset.type = key;
      const sw = document.createElement('div');
      sw.className = 'tc-swatch';
      sw.style.background = hexToCss(TOWER_COLORS[key]);
      sw.innerHTML = TOWER_ICONS[key] || '';
      sw.style.display = 'flex'; sw.style.alignItems = 'center'; sw.style.justifyContent = 'center';
      sw.style.color = '#f2f6ff'; // SVG icons draw with currentColor (crisp, not emoji)
      const name = document.createElement('div');
      name.className = 'tc-name';
      name.textContent = def.name;
      const cost = document.createElement('div');
      cost.className = 'tc-cost';
      cost.textContent = def.cost + 'g';
      const k = document.createElement('span');
      k.className = 'tc-key';
      k.textContent = String(i + 1);
      card.append(sw, name, cost, k);
      card.addEventListener('click', () => this.game.selectType(key));
      this.buildpanel.appendChild(card);
      this.cards[key] = card;
    });
  }

  _wireButtons() {
    this.screenBtn.addEventListener('click', () => this.game.onScreenButton());
    this.btnSpeed.addEventListener('click', () => {
      this.game.toggleSpeed();
      this.btnSpeed.textContent = this.game.speed + 'x';
    });
    if (this.btnAutoWave) {
      const syncAutoBtn = () => {
        this.btnAutoWave.classList.toggle('on', !!this.game.autoWave);
        this.btnAutoWave.textContent = this.game.autoWave ? '⚡ Auto ON' : '⚡ Auto';
      };
      syncAutoBtn();
      this.btnAutoWave.addEventListener('click', () => {
        this.game.autoWave = !this.game.autoWave;
        syncAutoBtn();
      });
    }
    this.btnPause.addEventListener('click', () => this.game.togglePause());
    this.tpUpgrade.addEventListener('click', () => {
      const ok = this.game.upgradeSelected();
      if (ok) this.refreshTowerPanel();
    });
    this.tpSell.addEventListener('click', () => this.game.sellSelected());
  }

  // -- HUD --------------------------------------------------------------
  refreshHUD() {
    const g = this.game;
    this.moneyEl.textContent = Math.floor(g.money);
    const cur = g.currentWave;
    this.waveEl.textContent = (cur ? cur.w : 0) + ' / ' + CONFIG.totalWaves;
    const alive = g.zombies.filter((z) => z.alive).length;
    const pending = g.spawner ? g.spawner.remaining : 0;
    this.zombiesEl.textContent = alive + (pending ? '+' + pending : '');
    const pct = Math.max(0, g.baseHP / CONFIG.baseHP);
    this.basefill.style.width = (pct * 100).toFixed(1) + '%';
    this.basefill.style.background = pct > 0.5
      ? 'linear-gradient(90deg,#4ad06a,#7ae08a)'
      : pct > 0.25
        ? 'linear-gradient(90deg,#e0a54a,#e8c25a)'
        : 'linear-gradient(90deg,#e0554a,#e87a6a)';
  }

  flashBase() {
    const f = this.basefill;
    f.classList.remove('hit');
    void f.offsetWidth;
    f.classList.add('hit');
  }

  refreshCards() {
    const g = this.game;
    for (const key of Object.keys(this.cards)) {
      const def = CONFIG.towers[key];
      const card = this.cards[key];
      const afford = g.money >= def.cost;
      card.classList.toggle('disabled', !afford);
      card.classList.toggle('selected', g.selectedType === key);
    }
  }

  selectType(key) {
    this.game.selectType(key);
  }

  // -- selected tower panel --------------------------------------------
  showTowerPanel(tower) {
    this.towerpanel.classList.remove('hidden');
    this._fillTower(tower);
  }

  // Targeting priorities available on single-target towers
  _targetModes() {
    return [
      ['first', 'First'], ['strongest', 'Strongest'],
      ['weakest', 'Weakest'], ['random', 'Random'],
    ];
  }

  _fillTower(tower) {
    const d = tower.def;
    this.tpName.textContent = d.name + '  ·  Lv ' + tower.level;
    const rows = [];
    if (d.kind === 'continuous') rows.push(['Damage/s', tower.statDamage().toFixed(0)]);
    else if (d.kind === 'slow') rows.push(['Slow', (tower.statSlowPct() * 100).toFixed(0) + '%', 'for ' + tower.statSlowDur().toFixed(1) + 's']);
    else rows.push(['Damage', tower.statDamage().toFixed(0)]);
    if (d.range) rows.push(['Range', tower.range.toFixed(1)]);
    if (d.cooldown) rows.push(['Rate', (1 / Math.max(0.01, tower.statCooldown())).toFixed(1) + '/s']);
    if (d.kind === 'mine') rows.push(['Blast radius', tower.range.toFixed(1)]);
    const up = tower.upgradeCost();
    rows.push(['Sell value', tower.sellValue() + 'g']);
    rows.push(['Niveau max', `${tower.level} / ${(tower.levelCap ? tower.levelCap() : 5)}${(tower.levelCap && tower.levelCap() < CONFIG.towerMaxLevel) ? ' (Boutique pour +)' : ''}`]);
    this.tpStats.innerHTML = rows
      .map((r) => `<div class="row"><span>${r[0]}</span><span>${r[1]}${r[2] ? ' ' + r[2] : ''}</span></div>`)
      .join('');
    const capNow = tower.levelCap ? tower.levelCap() : CONFIG.towerMaxLevel;
    if (up == null) {
      this.tpUpgrade.disabled = true;
      this.tpUpgrade.textContent = capNow >= CONFIG.towerMaxLevel
        ? 'Niveau maximum atteint'
        : `Plafond niv. ${capNow} — débloquer en Boutique`;
    } else {
      this.tpUpgrade.disabled = false;
      this.tpUpgrade.textContent = 'Upgrade (' + up + 'g)';
    }

    // Targeting priority selector (single-target + frost towers)
    if (d.kind === 'single' || d.kind === 'slow') {
      const tg = this.tpTargeting;
      if (tg) {
        tg.classList.remove('hidden');
        tg.innerHTML = '<div class="tp-tg-label">TARGETS</div>' + this._targetModes().map(([m, label]) =>
          `<button class="tp-tg${tower.targetMode === m ? ' active' : ''}" data-mode="${m}">${label}</button>`
        ).join('');
        tg.querySelectorAll('button[data-mode]').forEach((btn) => {
          btn.addEventListener('click', () => {
            tower.targetMode = btn.dataset.mode;
            this._fillTower(tower);
          });
        });
      }
    } else if (this.tpTargeting) {
      this.tpTargeting.classList.add('hidden');
    }
  }

  refreshTowerPanel() {
    if (this.game.selectedTower) this._fillTower(this.game.selectedTower);
  }

  hideTowerPanel() {
    this.towerpanel.classList.add('hidden');
  }

  // -- screens ----------------------------------------------------------
  showScreen({ title, sub, body, btn }) {
    this._setScreenMode('classic');
    this.screen.classList.remove('hidden');
    this.screenTitle.textContent = title;
    this.screenSub.textContent = sub || '';
    this.screenBody.innerHTML = body || '';
    if (btn) { this.screenBtn.classList.remove('hidden'); this.screenBtn.textContent = btn; }
  }

  _setScreenMode(mode) {
    // 'classic' keeps the single bottom button; menu/shop/inventory hide it.
    const wide = mode !== 'classic'; // menu / shop / inventory all get the wide, scrollable card
    this.screen.classList.toggle('wide', wide);
    if (mode === 'menu') { this.screenSub.style.display = 'none'; this.screenTitle.classList.add('title-menu'); }
    else { this.screenSub.style.display = ''; this.screenTitle.classList.remove('title-menu'); }
  }

  // -- Main menu --------------------------------------------------------
  showMenu(hintHtml) {
    this._setScreenMode('menu');
    this.screen.classList.remove('hidden');
    const coins = (this.game.saveData && this.game.saveData.coins) || 0;
    this.screenSub.textContent = '';
    this.screenBtn.classList.add('hidden');
    this.screenTitle.textContent = 'Zombie Tower Defense';
    this.screenBody.innerHTML = `
      <div class="menu-wrap">
        <div class="menu-coins"><span class="hud-coin"></span> ${coins.toLocaleString('fr-FR')} pièces</div>
        <nav class="menu-nav">
          <button id="menu-play" class="menu-btn primary">Jouer</button>
          <button id="menu-shop" class="menu-btn">Boutique</button>
          <button id="menu-inv"  class="menu-btn">Inventaire</button>
          <button id="menu-reset" class="menu-btn" title="Efface pièces, tours achetées, niveaux, skins et modes (retour à zéro)">⟳ Réinitialiser la progression</button>
        </nav>
        ${hintHtml ? `<div class="ctl-hint menu-hint">${hintHtml}</div>` : ''}
      </div>`;
    this.screenBody.querySelector('#menu-play').addEventListener('click', () => this.game.startNewGame());
    this.screenBody.querySelector('#menu-shop').addEventListener('click', () => this.game.openShop());
    this.screenBody.querySelector('#menu-inv').addEventListener('click', () => this.game.openInventory());
    const resetBtn = this.screenBody.querySelector('#menu-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Réinitialiser toute la progression ? (pièces, tours, niveaux, skins… tout repart de zéro)')) {
          this.game.resetProgress();
        }
      });
    }
  }

  // -- Shop ---------------------------------------------------------------
  showShop() {
    this._setScreenMode('shop');
    const g = this.game, d = g.saveData;
    this.screen.classList.remove('hidden');
    this.screenBtn.classList.add('hidden');
    this.screenTitle.textContent = 'Boutique';
    this.screenSub.textContent = 'Dépensez vos pièces pour débloquer des tours et des skins.';

    const towerRows = SHOP.towers.map((t) => {
      const def = CONFIG.towers[t.id];
      const owned = d.ownedTowers.includes(t.id);
      return `<div class="shop-item">${this._pvImg('t:' + t.id, 160)}
        <div class="si-body">
          <b>${def.name}</b>
          <span class="si-desc">${SHOP_TOWER_DESC[t.id]}</span>
        </div>
        ${owned
          ? '<button class="shop-own" disabled>Acquis ✓</button>'
          : `<button class="shop-buy" data-tower="${t.id}">${t.price.toLocaleString('fr-FR')} 🪙</button>`}
      </div>`;
    }).join('');

    const speedItems = (SHOP.skins || []).filter((s) => s.cat === 'vitesse');
    const modeItems = (SHOP.skins || []).filter((s) => s.cat === 'mode');
    const modeRows = modeItems.map((s) => {
      const owned = !!d.autoWaveOwned;
      return `<div class="shop-item" style="display:flex;align-items:center;gap:14px;padding:10px 14px">
        <b style="font-size:15px">⚡ ${s.name.replace('⚡ ', '')}</b>
        <span class="si-desc">${s.desc} — <b>${s.price.toLocaleString('fr-FR')} 🪙</b></span>
        ${owned ? '<button class="shop-own" disabled>Débloqué ✓</button>'
                : `<button class="shop-buy buy" data-mode="${s.id}">${s.price.toLocaleString('fr-FR')} 🪙</button>`}
      </div>`;
    }).join('');

    const speedRows = speedItems.map((s) => {
      const unlocked = (d.unlockedSpeeds || [1, 2]).includes(s.mult);
      return `<div class="shop-item" style="display:flex;align-items:center;gap:14px;padding:10px 14px">
        <b style="font-size:15px">⚡ ${s.name}</b>
        <span class="si-desc">${s.desc} — <b>${s.price.toLocaleString('fr-FR')} 🪙</b></span>
        ${unlocked ? '<button class="shop-own" disabled>Activé ✓</button>'
                   : `<button class="shop-buy buy" data-speed="${s.mult}">${s.price.toLocaleString('fr-FR')} 🪙</button>`}
      </div>`;
    }).join('');

    // Les vitesses et modes ont leurs propres sections ci-dessous : on les exclut ici
    const skinRows = (SHOP.skins || []).filter((s) => s.cat === 'tower' || s.cat === 'base').map((s) => {
      const owned = d.ownedSkins.includes(s.id);
      const equipped = (s.cat === 'tower' ? d.towerSkin : d.baseSkin) === s.id;
      const skinKey = s.cat === 'base' ? ('h:' + s.id) : ('sk:' + s.id);
      return `<div class="shop-item">${this._pvImg(skinKey, 170)}
        <div class="si-body">
          <b>${s.name}</b>
          <span class="si-desc">${s.desc}</span>
        </div>
        ${owned
          ? (equipped
              ? '<button class="shop-own" disabled>Équipé ✓</button>'
              : `<button class="shop-buy equip" data-skin="${s.id}">Équiper</button>`)
          : `<button class="shop-buy buy" data-skin="${s.id}">${s.price.toLocaleString('fr-FR')} 🪙</button>`}
      </div>`;
    }).join('');

    this.screenBody.innerHTML = `
      <div class="shop-wrap">
        <button class="shop-back">← Retour au menu</button>
        <div class="shop-section"><h4>Tours</h4><div class="shop-grid">${towerRows}</div></div>
        <div class="shop-section"><h4>Skins</h4><div class="shop-grid skins">${skinRows}</div></div>
        ${(() => {
          const price = (tk, lv) => ((SHOP.upgrades || []).find((u) => u.tower === tk && u.level === lv)?.price ?? 0).toLocaleString('fr-FR');
          // On n'affiche les niveaux que pour les tours déjà achetées
          const ownedKeys = CONFIG.towerOrder.filter((k) => d.ownedTowers.includes(k));
          const blocks = ownedKeys.map((k) => {
            const capNow = d.towerCaps[k] ?? 2;
            let boxes = '';
            for (let i = 1; i <= 5; i++) {
              const st = i <= capNow ? 'filled' : i === capNow + 1 ? 'next' : 'locked';
              const pr = price(k, i);
              boxes += `<button class="star ${st}" data-lv="${i}" title="Niveau ${i} — ${pr !== '0' && pr ? `${pr} pièces` : ''}"></button>`;
            }
            return `<div class="lvl-star-row" data-tower="${k}">
              <div class="lsr-left">
                <div class="lsr-head"><b>${CONFIG.towers[k].name}</b> ${capNow >= 5 ? '<span class="lsr-max-inline">MAX ✦</span>' : ''} — ${capNow} / 5</div>
                <div class="stars">${boxes}</div>
              </div>
              <div class="lsr-model">${this._pvImg('t:' + k, 130)}</div>
            </div>`;
          }).join('');
          return `<div class="shop-section"><h4>Niveaux avancés <span class="lsr-hint">clique sur la case à gagner pour remonter le niveau</span></h4><div class="lvl-stars">${blocks}</div></div>`;
        })()}
        <div class="shop-section"><h4>⚡ Vitesses & modes</h4>
          ${modeItems.length ? `<div class="shop-grid" style="margin-bottom:8px">${modeRows}</div>` : ''}
          ${speedItems.length ? `<div class="shop-grid">${speedRows}</div>` : ''}
        </div>
      </div>`;

    this.screenBody.querySelectorAll('button[data-tower]').forEach((b) => {
      b.addEventListener('click', () => { if (g.buyTower(b.dataset.tower)) g.openShop(); });
    });
    this.screenBody.querySelectorAll('button.star.next').forEach((b) => {
      b.addEventListener('click', () => {
        const row = b.closest('.lvl-star-row');
        g.buyTowerLevel(row.dataset.tower, +b.dataset.lv);
        g.openShop(); // re-render stars with new state
      });
    });
    this.screenBody.querySelectorAll('button[data-skin]').forEach((b) => {
      b.addEventListener('click', () => {
        const ok = g.buySkin(b.dataset.skin);
        if (!ok && (d.ownedSkins.includes(b.dataset.skin))) g.equipSkin(this._skinCatOf(b.dataset.skin), b.dataset.skin);
        g.openShop();
      });
    });

    // ⚡ Vitesse de jeu : achat du multiplicateur, puis re-rendu + label speed à jour
    this.screenBody.querySelectorAll('button[data-speed]').forEach((b) => {
      b.addEventListener('click', () => { if (g.buySpeed(+b.dataset.speed)) g.openShop(); });
    });

    // ⚡ Mode Auto-Wave : débloque le bouton Auto du HUD, puis re-rendu boutique
    this.screenBody.querySelectorAll('button[data-mode]').forEach((b) => {
      b.addEventListener('click', () => { if (g.buyAutoWave()) g.openShop(); });
    });
    this.screenBody.querySelector('.shop-back')?.addEventListener('click', () => g.openMenu());
  }

  _skinCatOf(id) {
    const s = SHOP.skins.find((x) => x.id === id);
    return (s && s.cat === 'tower') ? 'tower' : 'base';
  }

  // -- Inventory ----------------------------------------------------------
  // ==========================================================================
  // 3D preview helpers — render any model to a data-URL PNG (offscreen canvas)
  // ==========================================================================
  _shot(obj, px = 240) {
    const r = this._previewRenderer();
    if (!r) return '';
    try {
      const W = Math.max(120, Math.round(px));
      const H = Math.round(W * 0.72);
      r.setSize(W, H);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a4636, 1.15));
      const dl = new THREE.DirectionalLight(0xffffff, 1.5);
      dl.position.set(3, 5, 2);
      scene.add(dl);
      const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 60);
      const bb = new THREE.Box3().setFromObject(obj);
      if (bb.isEmpty()) return '';
      const size = new THREE.Vector3(); bb.getSize(size);
      const ctr = new THREE.Vector3(); bb.getCenter(ctr);
      obj.position.sub(ctr); // center at origin
      const dist = Math.max(size.x, size.y, size.z) * 2.4 + 1.4;
      cam.position.set(-ctr.x + dist * 0.62, -ctr.y + dist * 0.48, -ctr.z + dist * 0.8);
      cam.lookAt(0, 0, 0);
      scene.add(obj);
      r.render(scene, cam);
      return r.domElement.toDataURL('image/png');
    } catch { return ''; }
  }

  // ⚡ Le bouton Auto n'apparaît dans l'HUD que si le mode a été acheté en Boutique
  syncAutoWaveBtn() {
    const b = this.btnAutoWave; if (!b) return;
    const owned = !!(this.game && this.game.saveData.autoWaveOwned);
    b.classList.toggle('hidden', !owned);
  }

  // Robust ✕ binding : survives les re-renders de #inv-detail (bouton recréé à chaque innerHTML)
  _bindInvDetClose() {
    const det = this.screenBody?.querySelector('#inv-detail'); if (!det) return;
    det.querySelectorAll('[data-act="close"]').forEach((b) => {
      if (b.dataset._cbBound === '1') return; b.dataset._cbBound = '1';
      b.addEventListener('click', () => {
        det.classList.add('hidden');
        const grid = this.screenBody.querySelector('#inv-grid'); if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  _modelFor(key) {
    const [cat, a] = key.split(':');
    if (cat === 'z') return createZombieModel(a || 'walker', (key.split(':')[2]) || 'default');
    if (cat === 'b') return createBossModel(a);
    if (cat === 's' || cat === 'h' || cat === 'hb') { const b = createBaseModel(); if (cat !== 'hb') { try { applySkin(b, a); } catch {} } return b; }
    if (cat === 'sk') { const m = createTowerModel('gunner'); try { applySkin(m, a); } catch {} return m; }
    // tower — preview wearing the currently equipped skin
    const m = createTowerModel(a);
    const sk = this.game.saveData && this.game.saveData.towerSkin;
    if (sk && sk !== 'classic') { try { applySkin(m, sk); } catch {} }
    return m;
  }

  _pvImg(key, px = 240) {
    let url = '';
    try { url = this._shot(this._modelFor(key), px); } catch {}
    if (!url) return '<div class="mon-card empty">aperçu indisponible</div>';
    return `<img src="${url}" style="width:100%;height:auto;display:block;" alt="3D"/ >`;
  }

  /** Stat lines for a tower at an arbitrary level (default: its base value + start cap). */
  _towerStatLines(key, lv) {
    const def = CONFIG.towers[key];
    if (!def) return [];
    const u = def.upgrade || {};
    const n = Math.max(0, (lv || 1) - 1);
    const rows = [];
    // Formules identiques à la partie : dégâts ×1,32/niveau (entiers), petites lignes fixes
    const mul = Math.pow(CONFIG.damageGrowth ?? 1.32, n);
    if (def.kind === 'continuous') {
      rows.push(`DPS : <b>${Math.round((def.dps ?? 0) * mul)}</b>`);
    } else if (def.kind === 'mine') {
      const dmg = Math.round((def.damage ?? 0) * mul);
      const rad = (def.radius ?? 0) + n * (u.radius ?? 0);
      rows.push(`Dégâts d'explosion : <b>${dmg}</b>`);
      rows.push(`Rayon d'activation : ${rad.toFixed(1)}`);
    } else {
      const dmg = Math.round((def.damage ?? 0) * mul);
      const rate = def.cooldown ? ` · Cadence : ${(1 / Math.max(0.01, def.cooldown)).toFixed(1)}/s` : '';
      rows.push(`Dégâts : <b>${dmg}</b>${rate}`);
    }
    if (def.range) rows.push(`Portée : ${((def.range ?? 0) + n * (u.range ?? 0)).toFixed(1)} m`);
    if (def.splash) rows.push(`Éclat de zone : ${(def.splash + n * (u.splash ?? 0)).toFixed(1)} m`);
    if (def.kind === 'slow') {
      const pct = Math.min(68, def.slowPct * 100 + n * ((u.slowPct ?? 0) * 100));
      rows.push(`Ralentit de ${pct.toFixed(0)} %`);
    }
    return rows;
  }

  showInventory() {
    this._setScreenMode('inventory');
    const g = this.game, d = g.saveData;
    this.screen.classList.remove('hidden');
    this.screenBtn.classList.add('hidden');
    this.screenTitle.textContent = 'Inventaire';
    this.screenSub.textContent = '';

    // Your towers (owned only): 3D model + name. Click => detail.
    const towerCards = CONFIG.towerOrder.filter((k) => d.ownedTowers.includes(k)).map((key) => `
      <button class="pv-card" data-inv="t:${key}">
        ${this._pvImg('t:' + key, 150)}
        <span class="pv-name">${CONFIG.towers[key].name}</span>
      </button>`).join('');

    // La maison de base — détail avec son bouton Skins (mêmes mini-rectangles)
    const houseCard = `
      <div class="inv-lbl2">La maison</div>
      <button class="pv-card" data-inv="h:base">
        ${this._pvImg('hb', 150)}
        <span class="pv-name">Maison de base${d.baseSkin && d.baseSkin !== 'classic' ? ` · skin : ${(SHOP.skins || []).find((s) => s.id === d.baseSkin)?.name || ''}`.trim() : ''}</span>
      </button>`;

    // Base / house skins live here too — click => detail with Équiper.
    const baseCards = (SHOP.skins || []).filter((s) => s.cat === 'base').map((s) => `
      <button class="pv-card" data-inv="h:${s.id}">
        ${this._pvImg('h:' + s.id, 150)}
        <span class="pv-name">${s.name}${d.ownedSkins.includes(s.id) ? ' ✓' : ''}</span>
      </button>`).join('');

    // Right column — monsters behind a small "Catalogue" button.
    const Z = CONFIG.zombies, SK = CONFIG.skins;
    const monsters = [
      { key: 'z:walker', name: 'Walker', stats: `PV ${Z.walker.hp} · Vitesse ${Z.walker.speed}`, note: 'Le mort des champs. Lent mais têtu.' },
      { key: 'z:fast', name: 'Fast', stats: `PV ${Z.fast.hp} · Vitesse ${Z.fast.speed}`, note: "Se précipite vers la base sans réfléchir." },
      { key: 'z:tank', name: 'Tank', stats: `PV ${Z.tank.hp} · Vitesse ${Z.tank.speed} · Armure ${(Z.tank.armor * 100).toFixed(0)}%`, note: 'Encaisse tout, avance lentement.' },
      { key: 'z:walker:snowy', name: 'Givré', stats: `PV ×${SK.snowy.hp.toFixed(2)} · Vitesse ×${SK.snowy.speed}`, note: `${Math.round(SK.snowy.armor * 100)}% d'armure, résiste à ${Math.round(SK.snowy.slowResist * 100)}% des ralentissements.` },
      { key: 'z:tank:lava', name: 'Brûlant', stats: `PV ×${SK.lava.hp.toFixed(2)} · Vitesse ×${SK.lava.speed}`, note: 'Peleur incandescente — un peu plus résistant.' },
      { key: 'z:walker:water', name: 'Aquatique', stats: `Résiste à ${Math.round(SK.water.slowResist * 100)}% des ralentissements`, note: 'Immunisé aux dégâts de glace… presque !' },
    ];
    const bossKeys = Object.keys(CONFIG.bosses);
    const allMons = [
      ...monsters.map((m) => ({ key: m.key, name: m.name, stats: m.stats, note: m.note })),
      ...bossKeys.map((k) => {
        const b = CONFIG.bosses[k];
        return { key: 'b:' + k, name: b.name,
          stats: `PV ${b.hp} · Vitesse ${b.speed}${b.damage != null ? ' · Atq ' + b.damage : ''}`,
          note: BOSS_ABILITY[k] || 'Boss.' };
      }),
    ];

    const monCards = allMons.map((m) => `
      <button class="pv-card mon" data-inv="${m.key}">
        ${this._pvImg(m.key, 160)}
        <span class="pv-name">${m.name}</span>
      </button>`).join('');

    const infoByKey = {};
    allMons.forEach((m) => { infoByKey[m.key] = m; });

    this.screenBody.innerHTML = `
      <div class="inv-wrap">
        <button class="shop-back" data-act="back">← Retour au menu</button>
        <div class="mons-head">
          <h4 id="inv-view-title">Vos tours</h4>
          <button id="btn-catalogue" type="button">📖 Catalogue des monstres</button>
        </div>
        <div id="inv-detail" class="hidden"></div>
        <div id="inv-grid" class="pv-grid">
          ${towerCards}${houseCard}
        </div>
        <p class="inv-note">Cliquez sur un élément pour voir ses détails.</p>
      </div>`;

    // toggle: towers view  <->  monster catalogue (same grid, cards swap)
    const invGrid = this.screenBody.querySelector('#inv-grid');
    const viewTitle = this.screenBody.querySelector('#inv-view-title');
    let monsRendered = false, inCatalogue = false;
    this.screenBody.querySelector('#btn-catalogue').addEventListener('click', () => {
      inCatalogue = !inCatalogue;
      if (inCatalogue) {
        viewTitle.textContent = 'Catalogue des monstres';
        // render monster cards lazily on first open (expensive previews)
        if (!monsRendered && invGrid.children.length === 0) { monsRendered = true; }
        invGrid.innerHTML = monsRendered ? (this._monCardsHtml || monCards) : (monCards);
        this._monCardsHtml = monCards;
        viewTitle.classList.remove('hidden');
        const det1 = this.screenBody.querySelector('#inv-detail'); if (det1) det1.classList.add('hidden');
      } else {
        viewTitle.textContent = 'Vos tours';
        invGrid.innerHTML = towerCards;
        const det2 = this.screenBody.querySelector('#inv-detail'); if (det2) det2.classList.add('hidden');
      }
    });

    this.screenBody.querySelector('[data-act="back"]').addEventListener('click', () => g.openMenu());

    // Item click -> detail panel (bigger model + stats + description)
    this.screenBody.addEventListener('click', (e) => {
      const card = e.target.closest('[data-inv]');
      if (!card) return;
      this._selectCard(card);
      const key = card.dataset.inv;
      const det = this.screenBody.querySelector('#inv-detail');

      /** Build (and re-render) the detail for a tower at a given level. */
      const renderTowerDetail = (k2, lv) => {
        const def = CONFIG.towers[k2];
        const capsSrc = d.towerCaps || {};
        const cap = Math.max(1, Math.min(capsSrc[k2] ?? 2, 5));
        this._invTowerKey = k2; this._invLv = lv;
        const rows = this._towerStatLines(k2, lv).map((r) => '<div>' + r + '</div>').join('');
        // Your tower skins — compact mini-rectangles behind a small toggle button
        const towerSkins = (SHOP.skins || []).filter((s) => s.cat === 'tower');
        let ownedCount = 0;
        let chipsHtml = '';
        for (const s of towerSkins) {
          const owned = d.ownedSkins.includes(s.id);
          if (owned) ownedCount++;
          const equipped = d.towerSkin === s.id;
          chipsHtml += owned
            ? `<button class="sk-chip${equipped ? ' on' : ''}" data-skinid="${s.id}">
                 <span class="sk-cimg">${this._pvImg('sk:' + s.id, 120)}</span>
                 <span class="skc-name">${s.name}</span>
                 <span class="skc-state">${equipped ? 'Équipée ✓' : 'Cliquez pour équiper'}</span>
               </button>`
            : `<div class="sk-chip locked">
                 <span class="sk-cimg">${this._pvImg('sk:' + s.id, 120)}</span>
                 <span class="skc-name">${s.name}</span>
                 <span class="skc-state">Boutique · ${s.price.toLocaleString('fr-FR')} 🪙</span>
               </div>`;
        }
        let chips = '';
        for (let i = 1; i <= cap; i++) {
          const cur = i === lv ? 'sel' : '';
          const lock = (i > 2 && capsSrc[k2] < i) ? ' lock' : ''; // shouldn't happen: i<=cap
          chips += `<button class="lv-chip ${cur}${lock}" data-lv="${i}">Lv ${i}</button>`;
        }
        det.innerHTML = `
          <button class="shop-back" data-act="close">✕</button>
          <div class="det-cols">
            ${this._pvImg('t:' + k2, 300)}
            <div class="det-info">
              <h3>${def.name} <span class="lv-current">Niveau actuel : ${lv}</span></h3>
              <p class="det-desc">${TOWER_DESC[k2] || ''}</p>
              <div class="lv-row" role="group" aria-label="Niveaux">${chips}
                ${cap < 5 ? '<span class="lv-hint">Niveaux supérieurs : Boutique</span>' : ''}
              </div>
              <div class="det-stats">${rows}</div>
              <button type="button" id="skin-toggle" class="skin-toggle-btn">🎨 Skins (${ownedCount}/${towerSkins.length} acquis) ▾</button>
              <div id="inv-skmini" class="sk-mini hidden">${chipsHtml}</div>
              <p class="det-note">Coût de construction : ${def.cost}g — ${d.ownedTowers.includes(k2) ? '<b style="color:#8fe0a8">Débloquée ✓</b>' : ''}</p>
            </div>
          </div>`;
        det.querySelectorAll('button[data-lv]').forEach((b) => {
          b.addEventListener('click', () => renderTowerDetail(k2, +b.dataset.lv));
        });
        this._bindInvDetClose();
      };

      let html = '';
      if (key.startsWith('t:')) {
        const k2 = key.slice(2);
        const startLv = Math.min(this._invTowerKey === k2 ? this._invLv : 1, Math.max(1, Math.min((d.towerCaps || {})[k2] ?? 2, 5)));
        renderTowerDetail(k2, startLv);
      } else if (key === 'h:base') {
        const baseSkins = (SHOP.skins || []).filter((s) => s.cat === 'base');
        let bChips = '';
        for (const s of baseSkins) {
          const owned = d.ownedSkins.includes(s.id);
          const equipped = d.baseSkin === s.id;
          bChips += owned
            ? `<button class="sk-chip${equipped ? ' on' : ''}" data-skinid="${s.id}">
                 <span class="sk-cimg">${this._pvImg('h:' + s.id, 120)}</span>
                 <span class="skc-name">${s.name}</span>
                 <span class="skc-state">${equipped ? 'Équipée ✓' : 'Cliquez pour équiper'}</span>
               </button>`
            : `<div class="sk-chip locked">
                 <span class="sk-cimg">${this._pvImg('h:' + s.id, 120)}</span>
                 <span class="skc-name">${s.name}</span>
                 <span class="skc-state">Boutique · ${s.price.toLocaleString('fr-FR')} 🪙</span>
               </div>`;
        }
        html = `
          <button class="shop-back" data-act="close">✕</button>
          <div class="det-cols">
            ${this._pvImg('hb', 300)}
            <div class="det-info">
              <h3>Maison de base</h3>
              <p class="det-desc">Le cœur de votre défense — les zombies marchent tous vers elle. Chaque point de structure perdue se fait sentir&nbsp;!</p>
              <button type="button" id="skin-toggle" class="skin-toggle-btn">🎨 Skins (${baseSkins.filter((s) => d.ownedSkins.includes(s.id)).length}/${baseSkins.length} acquis) ▾</button>
              <div id="inv-skmini" class="sk-mini hidden">${bChips}</div>
            </div>
          </div>`;
      } else if (key.startsWith('h:')) {
        const s = (SHOP.skins || []).find((x) => x.id === key.slice(2));
        const owned = d.ownedSkins.includes(s?.id);
        html = `
          <button class="shop-back" data-act="close">✕</button>
          <div class="det-cols">
            ${this._pvImg(key, 300)}
            <div class="det-info">
              <h3>${s ? s.name : 'Skin'}</h3>
              <p class="det-desc">${(s && s.desc) || ''} — appliquée à votre maison sur le terrain.</p>
              ${owned ? `<button class="skin-eq" data-skinid="${s?.id}">Équiper cette maison</button>` : '<span class="det-note">Non acquis — disponible en Boutique.</span>'}
            </div>
          </div>`;
      } else {
        const m = infoByKey[key];
        html = `
          <button class="shop-back" data-act="close">✕</button>
          <div class="det-cols">
            ${this._pvImg(key, 300)}
            <div class="det-info">
              <h3>${m.name}</h3>
              <p class="det-desc">${m.note || ''}</p>
              <div class="det-stats"><div>${m.stats}</div></div>
            </div>
          </div>`;
      }
      if (html) det.innerHTML = html; // monster branch sets it; tower branch already did
      det.classList.remove('hidden');
      requestAnimationFrame(() => { try { det.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {} });
      this._bindInvDetClose();

      const stg = this.screenBody.querySelector('#skin-toggle');
      if (stg) stg.addEventListener('click', () => {
        const mini = this.screenBody.querySelector('#inv-skmini');
        if (mini) mini.classList.toggle('hidden');
      });

      // Skin equip (tower or house) — then reopen the same card's detail
      det.querySelectorAll('button[data-skinid]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = b.dataset.skinid;
          g.equipSkin(key.startsWith('h:') || key === 'h:base' ? 'base' : 'tower', id);
          this.showInventory();
          requestAnimationFrame(() => {
            const card2 = this.screenBody.querySelector(`[data-inv="${key}"]`);
            if (card2) card2.click();
          });
        });
      });
    });
  }

  /** Highlight the selected preview card. */
  _selectCard(card) {
    if (!card) return;
    const scope = (card.closest('#inv-detail')) || this.screenBody;
    scope.querySelectorAll('.pv-card.sel, .mon-card.sel').forEach((c) => c.classList.remove('sel'));
    card.classList.add('sel');
  }

  // Render a 3D model to an image for the monster catalog cards.
  _previewRenderer() {
    if (!this._prevR && !this._prevFailed) {
      try { this._prevR = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
      catch { this._prevFailed = true; }
    }
    return this._prevR;
  }

  /** Render any model to a <img> (data-URL) for catalog cards. */
  _renderMonster(model) {
    const r = this._previewRenderer();
    if (!r) return '<div class="mon-card empty">aperçu indisponible</div>';
    try {
      const W = 240, H = 180;
      r.setSize(W, H);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a4636, 1.15));
      const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(3, 5, 2); scene.add(dl);
      const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 60);
      const bb = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); bb.getSize(size);
      const ctr = new THREE.Vector3(); bb.getCenter(ctr);
      model.position.sub(ctr); // center the model at origin
      const dist = Math.max(size.x, size.y, size.z) * 2.1 + 1.4;
      cam.position.set(-ctr.x + dist * 0.62, -ctr.y + dist * 0.5, -ctr.z + dist * 0.78);
      cam.lookAt(0, 0, 0);
      scene.add(model);
      r.render(scene, cam);
      const url = r.domElement.toDataURL('image/png');
      return `<div class="mon-card"><img src="${url}" style="width:100%;height:auto;display:block;" alt="3D"/></div>`;
    } catch {
      return '<div class="mon-card empty">aperçu indisponible</div>';
    }
  }

  _swatchIcon(key) {
    const color = TOWER_COLORS[key] ? '#' + (TOWER_COLORS[key]).toString(16).padStart(6, '0') : '#888';
    return `<div class="shop-swatch" style="background:${color}">${TOWER_ICONS[key] || ''}</div>`;
  }

  _skinSwatch(s) {
    const hues = { auric: '#e8c04a', phantom: '#9fd8ff', magma: '#ff6a2a', enchanted: '#b07aff', crystal: '#8ae0ff', haunted: '#4aff8a' };
    return `<div class="shop-swatch skin" style="background:${hues[s.id] || '#888'}"></div>`;
  }



  hideScreen() {
    this.screen.classList.add('hidden');
  }

  startGame() {
    this.hud.classList.remove('hidden');
    this.buildpanel.classList.remove('hidden');
    this.refreshCards();
  }

  showBanner(text) {
    this.banner.textContent = text;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }
}

// Descriptions boutique / inventaire -------------------------------------
const SHOP_TOWER_DESC = {
  frost:  'Gèle les zombies : ralentit leurs déplacements de 40% et inflige des dégâts de glace.',
  flame:  'Jet de flammes continu — fond tout ce qui s\u2019approche sur très courte portée.',
  mortar: 'Tirs en cloche avec dégâts d\u2019éclat : idéal pour les groupes serrés.',
};

const TOWER_DESC = {
  gunner: 'Fusil à répétition fiable. Tire sur une cible toutes les 0,5s — le couteau suisse du début de partie.',
  sniper: 'Longue portée, dégâts lourds mais cadence lente. Parfait pour cueillir les unités blindées.',
  mine:   'S\u2019active au passage des zombies et explose en un nuage d\u2019éclats. Déplacée après usage.',
  frost:  'Boule de glace ralentissante — étend la durée d\u2019action de vos autres tours.',
  flame:  'Concussion thermique continue sur très courte portée, dévastatrice en impasse.',
  mortar: 'Mortier à dégâts d\u2019éclat qui frappe des zones entières de la voie.',
};

const BOSS_ABILITY = {
  brute:       'Fige vos tours à proximité pendant 3s (aucun dégât, seulement une longue torpeur).',
  stalker:     'Se téléporte en avant et paralyse une tour au hasard pendant 2s.',
  frostking:   'Aura glaciale : engourdit toutes les tours proches pendant 3s.',
  pyrolord:    'Lance des boules de feu directes vers votre base — des dégâts garantis !',
  abomination: 'Crache un petit zombie à chaque attaque. Plus il avance, plus l\u2019horde grossit.',
  golem:       'Piétrifie vos tours environnantes pendant 4s sous une coque de pierre.',
  runner:      'Déclenche des rafales de sprint (vitesse ×2) en avançant plus vite le long du chemin.',
  regenerator: 'Se régénère : récupère 5% de ses PV à chaque attaque. Tirez-le vite et fort.',
  titan:       'Onde de choc qui fige les tours proches, et il possède une deuxième vie (revient à 50% de PV).',
  wraith:      'Devenu semi-intangible par phases : vos projectiles le traversent parfois !',
};

function hexToCss(h) {
  return '#' + h.toString(16).padStart(6, '0');
}
