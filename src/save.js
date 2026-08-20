// ---------------------------------------------------------------------------
// Save / progression — coins, owned towers & skins
//   • Brouillon : localStorage `ztd_save_v1` (rapide, synchrone, toujours dispo)
//   • Définitif : un fichier progress.json lié via la File System Access API
//     (handle stocké en IndexedDB). Auto-save silencieux, jamais effacé sauf
//     bouton Reset. Fallback : boutons Exporter / Importer progress.json.
// ---------------------------------------------------------------------------

const KEY = 'ztd_save_v1';

export const DEFAULT_SAVE = {
  coins: 0,
  // Towers available without purchase. The rest are bought in the shop.
  ownedTowers: ['gunner', 'sniper', 'mine', 'barricade'],
  // Point 6 : le « équipage » — les tours réellement jouables (max 5).
  // Une tour achetée en boutique n'est PAS équipée par défaut.
  equippedTowers: ['gunner', 'sniper', 'mine', 'barricade'],
  ownedSkins: [],           // ids of purchased skin packs (tower or base)
  towerSkin: 'classic',     // equipped tower skin
  baseSkin: 'classic',      // equipped base/house skin
  // Upgrade ceiling per tower type. Levels 3..5 must be unlocked in the shop.
  towerCaps: { gunner: 2, frost: 2, flame: 2, sniper: 2, mortar: 2, mine: 2, shock: 2, gatling: 2, farm: 2, barricade: 2, necro: 2 },
  unlockedSpeeds: [1, 2], // vitesses de jeu disponibles — x4 (5000) et x6 (20000) s'achètent en Boutique
  autoWaveOwned: false,    // ⚡ bouton Auto-Wave : visible uniquement après achat (10000)
  lastMode: 'debutant',   // dernier mode de difficulté choisi (débutant/moyen/avance/impossible/infini)
  completed: {},          // modes gagnés au moins une fois → débloque les suivants
  settings: { particles: 'moyen', corpses: 20, sound: true }, // Paramètres du menu
};

function _migrate(d) {
  const merged = Object.assign(structuredClone(DEFAULT_SAVE), d || {});
  if (!Array.isArray(merged.ownedTowers)) merged.ownedTowers = ['gunner','sniper','mine','barricade'];
  if (!Array.isArray(merged.ownedSkins)) merged.ownedSkins = [];
  if (!Array.isArray(merged.equippedTowers)) merged.equippedTowers = merged.ownedTowers.slice(0, 5);
  merged.equippedTowers = merged.equippedTowers.filter((k) => merged.ownedTowers.includes(k));
  const defaults = structuredClone(DEFAULT_SAVE);
  for (const k of Object.keys(defaults.towerCaps)) {
    if (!(k in merged.towerCaps) || typeof merged.towerCaps[k] !== 'number') merged.towerCaps[k] = defaults.towerCaps[k];
  }
  return merged;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    return _migrate(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function persistSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  // Définitif : miroir silencieux dans progress.json (si lié). Debounce + best-effort.
  writeProgressFile(data);
}

// Vider la sauvegarde (menu principal → Réinitialiser la progression)
export function resetSave() {
  try { localStorage.removeItem(KEY); } catch {}
  _pendingFile = null;
  // On réécrit le fichier avec l'état par défaut (le Reset est LE seul bouton
  // censé le remettre à zéro) ; s'il est introuvable on le retire de l'index.
  _flushFile(structuredClone(DEFAULT_SAVE)).catch(() => {});
  return structuredClone(DEFAULT_SAVE);
}

// ---------------------------------------------------------------------------
// progress.json — couche fichier (File System Access API + IndexedDB)
// ---------------------------------------------------------------------------

const IDB_NAME = 'ztd_fs';
const IDB_STORE = 'handles';
const FS_KEY = 'progress.json';
let _pendingFile = null;   // dernières données à écrire
let _fileTimer = 0;
let _fileBusy = false;

export function fsSupported() {
  return typeof window !== 'undefined'
    && 'showSaveFilePicker' in window
    && 'showOpenFilePicker' in window
    && 'indexedDB' in window;
}

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { try { r.result.createObjectStore(IDB_STORE); } catch {} };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('idb'));
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getLinkedHandle() {
  if (!('indexedDB' in window)) return null;
  try { return (await idbGet(FS_KEY)) || null; } catch { return null; }
}

// Statut lisible pour l'UI : { supported, linked, name }
export async function getProgressStatus() {
  const supported = fsSupported();
  let linked = false, name = null;
  if (supported) {
    const h = await getLinkedHandle();
    if (h) { linked = true; name = h.name; }
  }
  return { supported, linked, name };
}

async function _writeToHandle(handle, data) {
  const w = await handle.createWritable();
  await w.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  await w.close();
}

// Écrit (debouncée) les dernières données dans le fichier lié, si autorisé.
function writeProgressFile(data) {
  _pendingFile = data;
  if (!fsSupported() || _fileTimer) return;
  _fileTimer = setTimeout(async () => {
    _fileTimer = 0;
    if (!_fileBusy) _flushFile().catch(() => {});
  }, 350);
}

async function _flushFile(forceData) {
  if (_fileBusy) return;
  _fileBusy = true;
  try {
    const h = await getLinkedHandle();
    if (!h) return;
    const perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return; // non autorisé en fond : on garde le brouillon LS
    await _writeToHandle(h, forceData || _pendingFile);
    _pendingFile = null;
  } catch {
    // fichier verrouillé / retiré : on garde le brouillon localStorage
  } finally {
    _fileBusy = false;
  }
}

// Lien : l'utilisateur choisit/créé progress.json (geste requis, 1 seule fois).
export async function linkProgressFile(currentData) {
  if (!fsSupported()) return { ok: false, err: 'unsupported' };
  try {
    const handle = await window.showSaveFilePicker({
      id: 'ztd-progress',
      suggestedName: 'progress.json',
      types: [{ description: 'Sauvegarde JSON', accept: { 'application/json': ['.json'] } }],
    });
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return { ok: false, err: 'permission' };
    await idbSet(FS_KEY, handle);
    if (currentData) await _writeToHandle(handle, currentData);
    _pendingFile = null;
    return { ok: true, name: handle.name };
  } catch (e) {
    return { ok: false, err: (e && e.name === 'AbortError') ? 'cancel' : (e && e.name) || 'error' };
  }
}

// Délie le fichier (la progression reste dans le brouillon localStorage).
export async function unlinkProgressFile() {
  try { await idbDel(FS_KEY); } catch {}
  _pendingFile = null;
  return true;
}

// À l'allumage : si un fichier est lié et lisible, il est la source de vérité.
export async function loadProgressFromFile() {
  const h = await getLinkedHandle();
  if (!h) return null;
  try {
    const perm = await h.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return null;
    const f = await h.getFile();
    const txt = await f.text();
    if (!txt || !txt.trim()) return null;
    return _migrate(JSON.parse(txt));
  } catch { return null; }
}

// Export manuel (tous navigateurs) : télécharge progress.json.
export function exportProgressFile(data) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'progress.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch { return false; }
}

// Import manuel : lit un fichier progress.json choisi par l'utilisateur.
export function importProgressFile() {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return resolve({ ok: false, err: 'cancel' });
        try {
          const txt = await file.text();
          const data = _migrate(JSON.parse(txt));
          resolve({ ok: true, data });
        } catch (e) { resolve({ ok: false, err: 'invalid' }); }
      };
      // Si l'utilisateur annule, on ne reçoit pas d'event : on résout au clic.
      const onKey = (e) => { if (e.key === 'Escape') { input.remove(); resolve({ ok: false, err: 'cancel' }); } };
      window.addEventListener('keydown', onKey);
      setTimeout(() => { input.click(); }, 0);
      setTimeout(() => window.removeEventListener('keydown', onKey), 60000);
    } catch (e) { resolve({ ok: false, err: 'error' }); }
  });
}

// ---------------------------------------------------------------------------
// Shop catalog
// ---------------------------------------------------------------------------

export const SHOP = {
  towers: [
    { id: 'frost',  price: 5000 },
    { id: 'flame',  price: 5000 },
    { id: 'mortar', price: 3000 },
    // ---- Nouvelles tours (inspiration TDS) ----------------------------
    { id: 'shock',   price: 6000 },
    { id: 'gatling', price: 4500 },
    { id: 'farm',    price: 7000 },
    { id: 'barricade', price: 2000, desc: 'Palisade posée sur le chemin : les zombies la grignotent (dégâts = leurs PV/s).' },
    { id: 'necro',   price: 8000, desc: 'Ressuscite les morts en squelettes barrières. 3 max posés.' },
  ],
  // ---- Advanced levels (unlock higher tower caps, per tower type) ------
  upgrades: [
    ...['gunner','frost','flame','sniper','mortar','mine','shock','gatling','farm','barricade','necro'].flatMap((t) => [
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
