// ---------------------------------------------------------------------------
// Save / progression — localStorage persistence for coins, owned towers & skins
// ---------------------------------------------------------------------------

const KEY = 'ztd_save_v1';

export const DEFAULT_SAVE = {
  coins: 0,
  // Towers available without purchase. The rest are bought in the shop.
  ownedTowers: ['gunner', 'sniper', 'mine'],
  ownedSkins: [],           // ids of purchased skin packs (tower or base)
  towerSkin: 'classic',     // equipped tower skin
  baseSkin: 'classic',      // equipped base/house skin
  // Upgrade ceiling per tower type. Levels 3..5 must be unlocked in the shop.
  towerCaps: { gunner: 2, frost: 2, flame: 2, sniper: 2, mortar: 2, mine: 2 },
  unlockedSpeeds: [1, 2], // vitesses de jeu disponibles — x4 (5000) et x6 (20000) s'achètent en Boutique
  autoWaveOwned: false,    // ⚡ bouton Auto-Wave : visible uniquement après achat (10000)
  lastMode: 'debutant',   // dernier mode de difficulté choisi (débutant/moyen/avance/impossible/infini)
  completed: {},          // modes gagnés au moins une fois → débloque les suivants
  settings: { particles: 'moyen', corpses: 20, sound: true }, // Paramètres du menu
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const d = JSON.parse(raw);
    const merged = Object.assign(structuredClone(DEFAULT_SAVE), d || {});
    // ensure owned arrays stay sane
    if (!Array.isArray(merged.ownedTowers)) merged.ownedTowers = ['gunner','sniper','mine'];
    if (!Array.isArray(merged.ownedSkins)) merged.ownedSkins = [];
    const defaults = structuredClone(DEFAULT_SAVE);
    for (const k of Object.keys(defaults.towerCaps)) {
      if (!(k in merged.towerCaps) || typeof merged.towerCaps[k] !== 'number') merged.towerCaps[k] = defaults.towerCaps[k];
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

// Vider la sauvegarde (menu principal → Réinitialiser la progression)
export function resetSave() {
  try { localStorage.removeItem(KEY); } catch {}
  return structuredClone(DEFAULT_SAVE);
}

export function persistSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

// ---------------------------------------------------------------------------
// Shop catalog
// ---------------------------------------------------------------------------

// Les thèmes par ordre d'apparition (la boucle tourne en continu sur toute les vagues)
// exportée ici pour référence — config.js est la source de vérité.

export const SHOP = {
  towers: [
    { id: 'frost',  price: 5000 },
    { id: 'flame',  price: 5000 },
    { id: 'mortar', price: 3000 },
    // ---- Nouvelles tours (inspiration TDS) ----------------------------
    { id: 'shock',   price: 6000 },
    { id: 'gatling', price: 4500 },
    { id: 'farm',    price: 7000 },
  ],
  // ---- Advanced levels (unlock higher tower caps, per tower type) ------
  upgrades: [
    ...['gunner','frost','flame','sniper','mortar','mine','shock','gatling','farm'].flatMap((t) => [
      { id: `lv:${t}:3`, tower: t, level: 3, price: 1200 },
      { id: `lv:${t}:4`, tower: t, level: 4, price: 3000 },
      { id: `lv:${t}:5`, tower: t, level: 5, price: 7000 },
    ]),
  ],
  skins: [
    // ---- Tower skins (restyle every placed tower) -----------------------
    { id: 'auric',     cat: 'tower', name: 'Or Sacré',        price: 1200, desc: 'Un éclat doré sacré gaine toutes vos tours.' },
    { id: 'phantom',   cat: 'tower', name: 'Acier Fantôme',   price: 1500, desc: 'Une teinte froide de spectre, presque translucide.' },
    { id: 'magma',     cat: 'tower', name: 'Cœur de Magma',   price: 1800, desc: 'Vos tours pulsent d\u2019une chaleur volcanique.' },
    // ---- Base / house skins (fantasy) ----------------------------------
    { id: 'enchanted', cat: 'base', name: 'Maison Enchantée', price: 2500, desc: 'Un cercle de menhirs runiques et un sigile lumineux gravé au sol entourent la demeure, un cristal arcanique trône sur le toit.' },
    { id: 'crystal',   cat: 'base', name: 'Château de Cristal', price: 3000, desc: 'La maison jaillit d’une plateforme de glace, murée de pics de cristal et couronnée d’un géant bleu pâle.' },
    { id: 'haunted',   cat: 'base', name: 'Manoir Hanté',     price: 2000, desc: 'Tombeaux penchés, arbre mort, brume verte et spectres flottants veillent sur le manoir.' },
    // ---- Vitesses de jeu : achat = ajout à unlockedSpeeds (cycle du bouton speed) -- 
    { id: 'speed_x4', cat: 'vitesse', mult: 4, name: 'Vitesse ×4', price: 5000, desc: 'Ajoute la vitesse x4 au bouton speed de l' + '\u2019' + 'HUD.' },
    { id: 'speed_x6', cat: 'vitesse', mult: 6, name: 'Vitesse ×6', price: 20000, desc: 'Ajoute la vitesse x6 : terminez les 100 vagues en un éclair.' },
    // ---- Mode Auto-Wave : le bouton ⚡ Auto n'apparaît dans l'HUD qu'après cet achat -- 
    { id: 'auto_wave', cat: 'mode', name: '⚡ Mode Auto-Wave', price: 10000, desc: 'Débloque le bouton Auto de l\u2019HUD : chaque vague se lance immédiatement à la fin de la précédente.' },
  ],
};

export function shopTower(id) { return SHOP.towers.find((t) => t.id === id); }
export function shopSkin(id) { return SHOP.skins.find((s) => s.id === id); }
