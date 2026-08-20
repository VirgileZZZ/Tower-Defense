// ---------------------------------------------------------------------------
// Zombie Tower Defense — all balance data lives here (single source of truth).
// Edit these numbers to retune the game without touching logic.
// ---------------------------------------------------------------------------

// Distinct visual maps. Each segment also carries its zombie skin + props.
const THEMES = [
  {
    name: 'suburb', skin: 'default',
    sky: 0x10151f, fog: [45, 130], ground: 0x3d4a36, path: 0xd2a560,
    props: ['tree','tree','tree','tree','tree','tree','tree','tree',
            'tree','tree','tree','tree',
            'lamp','lamp','lamp','lamp','fence','fence','fence','fence','fence','fence','sign','sign','sign','sign',
            'tombstone','tombstone','bush','bush','bush','bush','bush','bush',
            'stump','stump','log','log','crate','crate','crate','cart','cart','well','well','hedge','hedge','mushroom',
            'rock','rock','rock','barrel','barrel','skull',
            // 5x more grass for a lush base map
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'flower','flower','flower','flower','flower','flower','flower','flower','flower',
            'flower','flower','flower','flower','flower','flower','flower','flower','flower',
            'flower','flower','flower','flower','flower','flower','flower','flower','flower',
            'flower','flower','flower','flower','flower','flower'],
  },
  {
    name: 'winter', skin: 'snowy',
    sky: 0x1a2436, fog: [30, 90], ground: 0xdce8f2, path: 0x9fb4cc,
    snow: true,
    props: ['tree','tree','tree','tree','tree','tree','tree','tree','tree','tree','tree',
            'rock','rock','rock','rock','rock','rock','lamp','lamp','lamp',
            'tombstone','fence','fence','bush','bush','bush','snowpile','snowpile','snowpile','snowpile','snowpile','snowpile',
            'stump','stump','crate','well','hedge','mushroom','log','log','deadtree','deadtree','barrel',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'flower','flower','flower','flower','flower','flower'],
  },
  {
    name: 'volcanic', skin: 'lava',
    sky: 0x241512, fog: [26, 80], ground: 0x2a1a16, path: 0xb87a4a,
    volcano: true,
    // no bushes in the volcanic zone — extra rock spikes + cinders + lava pools
    props: ['rock','rock','rock','rock','rock','rock','rock','rock','rock',
            'rock','rock','rock','rock','rock',
            'rockspire','rockspire','rockspire','rockspire','rockspire','rockspire',
            'rockspire','rockspire','rockspire','rockspire','rockspire',
            'lavapool','lavapool','lavapool','lavapool','lavapool','lavapool','lavapool','lavapool',
            'cinder','cinder','cinder','cinder','cinder','cinder','cinder','cinder','cinder','cinder','cinder','cinder',
            'boulder','boulder','boulder','boulder',
            'sign','stump','log','crate','cart','mushroom',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'flower','flower','flower'],
  },
  {
    name: 'ashlands', skin: 'dirty',
    sky: 0x191614, fog: [38, 92], ground: 0x574f45, path: 0xc9bfa4,
    // Post-apocalyptic wasteland : panneaux cassés, ruines, cendres, crânes
    props: ['sign','sign','sign','sign','sign','tombstone','tombstone','tombstone','tombstone',
            'stump','stump','stump','fence','fence','fence','fence','fence',
            'crate','crate','cart','lamp','rock','rock','rock','cinder','cinder','cinder',
            'deadtree','deadtree','deadtree','deadtree','skull','skull','skull','skull',
            'barrel','barrel','barrel','barrel',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass'],
  },
  {
    name: 'haunted', skin: 'water',
    sky: 0x16233a, fog: [40, 85], ground: 0x33506b, path: 0xa9c7e0,
    // Brumeux et spectral : champignons bioluminescents, ruines, crânes, arbres morts
    props: ['tree','tree','tree','lamp','lamp','mushroom','mushroom','mushroom','mushroom','mushroom','mushroom',
            'sign','tombstone','tombstone','tombstone','well',
            'stump','log','hedge','hedge','bush','bush','flower','flower','flower','flower',
            'radplant','radplant','radplant','reeds','reeds','reeds','reeds',
            'deadtree','deadtree','deadtree','skull','skull','skull','barrel',
            'grass','grass','grass','grass','grass','grass','grass','grass'],
  },
  {
    name: 'radio', skin: 'radiant',
    sky: 0x11210f, fog: [18, 64], ground: 0x3e4a2e, path: 0xb7cf85,
    // Zone radioactive : dôme de confinement fêlé, barils de déchet, flore mutante
    props: ['reactor','reactor','reactor','rbarrel','rbarrel','rbarrel','rbarrel','rbarrel','rbarrel','rbarrel','rbarrel',
            'hstripes','hstripes','hstripes','hstripes','hstripes',
            'radplant','radplant','radplant','radplant','radplant','radplant','radplant','radplant','radplant','radplant',
            'boulder','boulder','boulder','boulder','stump','stump','lamp','rock','rock','rock','cinder','cinder','cinder',
            'sign','crate','log','mushroom','mushroom','skull','skull','deadtree','deadtree','barrel','barrel',
            'grass','grass','grass','grass','grass','grass','grass','grass'],
  },
];

// ---------------------------------------------------------------------------
// Gentle terrain relief (small rolling hills). The corridor around the
// monster path is kept flat so zombies / the walkway stay level.
// ---------------------------------------------------------------------------
function _distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-6;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}
export function terrainHeight(x, z, waypoints = CONFIG.waypoints) {
  // base rolling hills
  const base =
    Math.sin(x * 0.33) * Math.cos(z * 0.29) * 0.14 +
    Math.sin(x * 0.11 + 1.7) * Math.sin(z * 0.15 + 0.4) * 0.18 +
    Math.cos(x * 0.05 - z * 0.07) * 0.10;
  // distance to the (straight-segment) path polyline -> flatten nearby
  let d = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    d = Math.min(d, _distToSegment(x, z, waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]));
  }
  const flat = Math.min(1, Math.max(0, (d - 2.0) / 3.0)); // 0 inside 2.0 of path, 1 beyond 5.0
  return base * flat;
}

// ---------------------------------------------------------------------------
// DIFFICULTÉ — 4 modes + mode Infini (style TDS)
// - Débutant : 25 vagues, facile à gagner. Mini-boss toutes les 5 vagues
//   (= un boss classique qui ne oneshotte PAS la maison : il fait 1/2 des PV,
//   i.e. damage = baseHP/2). Grand final : le boss « débutant ».
// - Moyen     : 30 vagues, à peu près pareil mais avec plus de zombies et
//   une mini-boss à la vague 25 (le final reste réservé à la vague 30).
// - Avancé    : 35 vagues, encore plus dense.
// - Impossible: 40 vagues, vagues lourdes + boss coriaces, gros challenge.
// Chaque mode a SA map dédiée (débutant = dirt/ashlands, moyen = neige,
// avancé = volcan, impossible = acide/radioactive) — les autres cartes
// restent vivantes grâce au mode Infini qui tourne en boucle sur toutes.
// ---------------------------------------------------------------------------
const BOSS_ORDER = ['brute','stalker','frostking','pyrolord','abomination','golem','runner','regenerator','titan','wraith'];

export const DIFFICULTIES = {
  debutant: { key: 'debutant', name: 'Débutant',   waves: 25, baseHP: 40, startMoney: 350, maxTowers: 30,
              hpK: [0.08, 0.0016], spK: 0.006, scale: { walker: 0.7, fast: 0.7, tank: 0.6 },
              themeIdx: 3, finalBoss: 'brute',       // boss « débutant » : le plus simple de la série
              reward: 500, unlock: null },            // +500 pièces à la victoire (bonus mode)
  moyen:    { key: 'moyen', name: 'Moyen', waves: 30, baseHP: 40, startMoney: 280, maxTowers: 25,
              hpK: [0.105, 0.0026], spK: 0.009, scale: { walker: 0.85, fast: 0.85, tank: 0.75 },
              themeIdx: 1, finalBoss: 'abomination', // boss moyen : grosse brute régénératrice
              reward: 1000, unlock: 'debutant' },     // +1000 pièces — débloqué quand Débutant est gagné
  avance:   { key: 'avance', name: 'Avancé', waves: 35, baseHP: 40, startMoney: 220, maxTowers: 20,
              hpK: [0.135, 0.004], spK: 0.012, scale: { walker: 1.0, fast: 1.0, tank: 1.0 },
              themeIdx: 2, finalBoss: 'titan',         // boss avancé : le gros titan à 2 vies
              reward: 2500, unlock: 'moyen' },         // +2500 pièces — débloqué quand Moyen est gagné
  impossible:{ key: 'impossible', name: 'Impossible', waves: 40, baseHP: 35, startMoney: 180, maxTowers: 15,
              hpK: [0.17, 0.006], spK: 0.016, scale: { walker: 1.25, fast: 1.2, tank: 1.4 },
              themeIdx: 5, finalBoss: 'wraith',        // boss impossible : le fantôme qui phase
              reward: 5000, unlock: 'avance' },        // +5000 pièces
};
// Mode Infini : pas de fin de partie → pas de récompense de mode (les pièces viennent des kills)
DIFFICULTIES.infini = { key: 'infini', name: 'Infini', waves: 0, baseHP: 40, startMoney: 200, maxTowers: 30,
                        reward: 0, unlock: null, infinite: true };
export const MODES = ['debutant', 'moyen', 'avance', 'impossible'];
export const MODES_ORDER = ['debutant', 'moyen', 'avance', 'impossible', 'infini'];

// mini-boss (toutes les 5 vagues) : ne oneshotte pas la maison — il inflige
// la MOITIÉ des PV de la base, mais n'assure pas le game over.
const MINI_BOSSES = {
  debutant: ['stalker', 'frostking'],      // vagues 5/10/15/20 → final : brute (v25)
  moyen:    ['pyrolord', 'abomination', 'golem'],   // vagues 5..30 → final : abomination (v30)
  avance:   ['runner', 'regenerator', 'titan'],     // → final : titan (v35)
  impossible:['wraith', 'titan', 'regenerator', 'golem'], // → final : wraith (v40)
};

// Génération des vagues d'un mode. `skinFn` fournit la skin zombie de la vague.
function buildModeWaves(diff, themes) {
  const total = diff.waves;
  const finalBoss = diff.finalBoss;
  const waves = [];
  for (let w = 1; w <= total; w++) {
    // HP : courbe douce linéaire + légère courbure quadratique.
    const hp = +(1 + diff.hpK[0] * (w - 1) + diff.hpK[1] * (w - 1) * (w - 1)).toFixed(2);
    const sp = +Math.min(1.8, 1 + diff.spK * (w - 1)).toFixed(2);
    const skin = 'default'; // remplacé au spawn par la skin du thème actif
    const list = [];
    const s = diff.scale || {};
    list.push(['walker', skin, Math.max(2, Math.round(Math.min(40, (3 + w) * (s.walker ?? 1))))]);
    if (w >= 3) list.push(['fast', skin, Math.max(1, Math.round(Math.floor(w * 0.6) * (s.fast ?? 1)))]);
    if (w >= 5) list.push(['tank', skin, Math.max(1, Math.round(Math.floor(w * 0.35) * (s.tank ?? 1)))]);

    // BOSS / MINI-BOSS des multiples de 5 :
    const isFinal = w === total;
    if (isFinal) {
      list.push(['boss', finalBoss, 1]);
    } else if (w % 5 === 0) {
      // mini-boss : modèle d'un boss classique mais « mini » — il fait 1/2
      // des PV de la base à l'arrivée sans tuer instantanément.
      const pool = MINI_BOSSES[diff.key] || ['stalker'];
      const step = w / 5;                       // 1..(total/5 - 1)
      const boss = pool[(step - 1) % pool.length];
      list.push(['boss', boss, 1, { mini: true }]); // flag mini -> damage = baseHP/2
    }
    waves.push({ w, hp, sp, list });
  }
  return waves;
}

// vagues par mode + mode Infini (on-demand — voir game.js)
export const WAVES_BY_MODE = {
  debutant: buildModeWaves(DIFFICULTIES.debutant, THEMES),
  moyen:    buildModeWaves(DIFFICULTIES.moyen, THEMES),
  avance:   buildModeWaves(DIFFICULTIES.avance, THEMES),
  impossible:buildModeWaves(DIFFICULTIES.impossible, THEMES),
};

// Mode Infini : vagues générées à la volée dans game.js (thèmes tournant,
// boss cyclique). Cette fonction sert de « base » pour les premières vagues.
export function buildInfiniteWave(w) {
  const skin = 'default'; // remplacé au spawn par la skin du thème actif
  const hp = +(1 + 0.13 * (w - 1) + 0.0028 * (w - 1) * (w - 1)).toFixed(2);
  const sp = +Math.min(1.9, 1 + 0.01 * (w - 1)).toFixed(2);
  const list = [];
  list.push(['walker', skin, Math.max(4, Math.round(Math.min(60, 3 + w * 1.5)))]);
  if (w >= 3) list.push(['fast', skin, Math.max(2, Math.floor(w * 0.8))]);
  if (w >= 5) list.push(['tank', skin, Math.max(1, Math.floor(w * 0.4))]);
  if (w % 10 === 0) {
    const idx = (w / 10 - 1) % BOSS_ORDER.length;
    list.push(['boss', BOSS_ORDER[idx], 1]);
  }
  return { w, hp, sp, list };
}

export const CONFIG = {
  startMoney: 280,     // (défaut mode « moyen » ; ajusté au choix de difficulté)
  baseHP: 40,
  totalWaves: 30,      // valeur par défaut (mode Moyen) — écrasée par le mode choisi
  autoWaveDelay: 5,         // seconds of auto-start countdown between waves,
  autoWaveDelay: 5,         // seconds of auto-start countdown between waves
  earlyBonusPerSec: 2,      // money per remaining second when starting early
  speedOptions: [1, 2, 4],
  sellRefund: 0.5,
  pathHeight: 0.05,         // natural low walkway (now visible from above thanks to DoubleSide)

  // Map ---------------------------------------------------------------
  // Carte PLUS GRANDE et étendue (le terrain déborde au-delà de la zone
  // constructible — réalisme visuel sans laisser construire à l'infini).
  groundSize: { x: 68, z: 52 },        // le sol visible est plus large que la zone de build
  mapBounds: { minX: -24, maxX: 26, minZ: -14, maxZ: 14 },
  waypoints: [
    [-30, -16],   // spawn à l'ouest
    [-21, -16],
    [-17, -7],    // virage au sud
    [-24, 2],     // zigzag vers l'ouest
    [-15, 8],     // bascule est-sud-est
    [-6, 2],      // remontée (zigzag)
    [2, 7],       // virage nord-est
    [9, 0],
    [3, -7],      // retour sud-ouest
    [10, -11],    // poussette est
    [16, -4],     // virage net au nord
    [25, -9],     // arrivée — la base (angle sud-est étendu)
  ],
  pathWidth: 3.0,
  pathClearance: 1.2,       // min distance from path center to place non-mine towers
  minePathMax: 4.5,         // mines must be this close to the path to be useful
  barricadePathMax: 1.5,    // barricades sit ON the path (within this of center)
  gridCell: 1.0,

  // Camera / lighting / fog -------------------------------------------
  camera: { pos: [16, 17, 22], target: [-1, 0.8, -1], fov: 52, near: 0.1, far: 400 },
  fog: { near: 45, far: 130 },

  // Economy -----------------------------------------------------------
  rewards: { walker: 8, fast: 10, tank: 18 },

  // Zombie base stats (before per-wave scaling) -----------------------
  zombies: {
    walker: { hp: 40,  speed: 1.6, reward: 8,  damage: 2, armor: 0,   radius: 0.5, label: 'Walker' },
    fast:   { hp: 30,  speed: 2.6, reward: 10, damage: 2, armor: 0,   radius: 0.45, label: 'Fast' },
    tank:   { hp: 120, speed: 1.0, reward: 18, damage: 5, armor: 0.15, radius: 0.7, label: 'Tank' },
    // Squelette (troupe du Nécromant) : valeurs de base — écrasées au spawn
    // (PV = % des PV du monstre source, dégâts = PV, marche en sens inverse).
    skeleton: { hp: 30, speed: 1.4, reward: 0, damage: 0, armor: 0, radius: 0.45, label: 'Squelette' },
  },

  // Elemental variant modifiers (applied on top of base type) ---------
  skins: {
    default: { hp: 1.0,  speed: 1.0,  armor: 0.00, slowResist: 0.00, color: 0x8a9a78 },
    snowy:   { hp: 1.15, speed: 0.9,  armor: 0.10, slowResist: 0.10, color: 0xbcd2ea },
    lava:    { hp: 1.10, speed: 0.95, armor: 0.05, slowResist: 0.00, color: 0xff6a2a },
    dirty:   { hp: 0.95, speed: 1.05, armor: 0.00, slowResist: 0.00, color: 0x6a6a42 },
    water:   { hp: 1.05, speed: 1.10, armor: 0.00, slowResist: 0.50, color: 0x4a8ae8 },
    radiant: { hp: 1.12, speed: 1.05, armor: 0.08, slowResist: 0.05, color: 0xa4e07c },
  },

  // Towers ------------------------------------------------------------
  towers: {
    gunner: {
      key: 'gunner', name: 'Gunner', cost: 50, kind: 'single',
      range: 6, cooldown: 0.5, damage: 10, projectile: 'bullet', projectileSpeed: 26,
      // Damage/DPS scales multiplicatively per level (CONFIG.damageGrowth). These stay small linear bonuses.
  upgrade: { range: 0.4, cooldown: -0.04 },
    },
    sniper: {
      key: 'sniper', name: 'Sniper', cost: 100, kind: 'single',
      range: 14, cooldown: 1.8, damage: 55, projectile: 'tracer', projectileSpeed: 90,
      upgrade: { range: 0.8, cooldown: -0.12 },
    },
    mine: {
      key: 'mine', name: 'Mine', cost: 30, kind: 'mine',
      radius: 2.2, damage: 45,
      upgrade: { radius: 0.25 },
    },
    frost: {
      key: 'frost', name: 'Frost', cost: 70, kind: 'slow',
      // single-target: fires an ice bolt that deals damage + a 1s slow (fires every 2s).
      range: 7, cooldown: 2.0, damage: 10, slowPct: 0.4, slowDuration: 3.0,
      projectile: 'frost', projectileSpeed: 32,
      upgrade: { slowPct: 0.06, range: 0.7 }, // lvl2: 15dmg 60% | lvl3: 20dmg 80%
    },
    flame: {
      key: 'flame', name: 'Flame', cost: 90, kind: 'continuous',
      range: 3.5, dps: 30,
      upgrade: { range: 0.3 },
    },
    mortar: {
      key: 'mortar', name: 'Mortar', cost: 80, kind: 'splash',
      range: 11, cooldown: 1.6, damage: 40, splash: 2.5, projectileSpeed: 12,
      upgrade: { splash: 0.3, range: 0.8 },
    },

    // ---- Nouvelles tours inspirées de TDS (Tower Defense Simulator) ------
    // Électro (≈ Electroshocker/Tesla) : coup d'éclair instantané qui SAUTE
    // sur les 2 cibles les plus proches (chaîne, dégâts décroissants).
    shock: {
      key: 'shock', name: 'Électro', cost: 130, kind: 'zap',
      range: 6.5, cooldown: 1.15, damage: 42, chains: 2,
      upgrade: { cooldown: -0.08, range: 0.4 },
    },
    // Minigun (≈ Gatling Gun / Minigunner) : rafales d'impacts très rapides.
    gatling: {
      key: 'gatling', name: 'Minigun', cost: 110, kind: 'single',
      range: 7.5, cooldown: 0.085, damage: 3.2, projectile: 'bullet', projectileSpeed: 55,
    },
    // Ferme (≈ Farm) : génère des pièces toutes les ~6 s (plus à haut niveau).
    farm: {
      key: 'farm', name: 'Ferme', cost: 120, kind: 'economy',
      incomeBase: 7, tickEvery: 6,
      upgrade: { income: 4 }, // + pieces / cycle par niveau
    },
    // Barricade (≈ Spikes/Barrel de TDS) : posée SUR le chemin, elle encaisse les
    // zombies. Un zombie bloqué « grignote » la barricade en infligeant un montant
    // = ses PV / seconde. Elle retarde la horde le temps de la détruire.
    barricade: {
      key: 'barricade', name: 'Barricade', cost: 40, kind: 'barricade',
      hp: 500,          // PV de base (Lv1)
      block: 2.4,       // distance (monde) à laquelle un zombie se cale + attaque
      radius: 1.3,      // empreinte (pour l'anneau fantôme)
      upgrade: { hp: 350, block: 0.2 },
    },
    // Nécromant (troupe) : tire des ÂMES qui blessent la horde. Chaque monstre
    // tué PAR SON PROPRE TIR (le coup de grâce d'une de ses âmes) est ressuscité
    // en SQUELETTE qui sort près de la BASE et marche EN SENS INVERSE au-devant
    // de la horde : au contact d'un monstre, le squelette EXCHANGE SES PV (les
    // deux prennent les PV de l'autre — ni oneshot ni passage au travers).
    // PV du squelette = % des PV du monstre source (20 % → 65 %). 3 max posées.
    necro: {
      key: 'necro', name: 'Nécromant', cost: 150, kind: 'necro',
      range: 8,          // vraie portée des âmes
      cooldown: 0.9,     // s entre deux âmes (Lv1)
      damage: 20,        // dégâts par âme (croît ×1,32/niveau)
      projectile: 'soul', projectileSpeed: 24,
      summonEvery: 8,    // s entre deux résurrections (Lv1) — min 2 s
      upgrade: { cooldown: -0.06, range: 0.4, summon: -1 }, // Lv5 : 0,66 s / 4 s
    },
  },
  towerMaxLevel: 5,
  towerStartCap: 2, // ceiling au départ — les niveaux 3 à 5 se débloquent dans la Boutique
  // Point 9 : nombre max de tours POSÉES SIMULTANÉMENT de chaque type
  // (en plus de la limite globale du mode — voir DIFFICULTIES.maxTowers)
  towerTypeMax: {
    gunner: 15,  // demandé : 15 max
    sniper: 5,   // demandé : 5 max
    farm: 3,     // demandé : 3 max
    mine: 10,    // mines pas chères & à usage unique → on en pose beaucoup
    frost: 6,
    flame: 4,
    mortar: 5,
    shock: 3,    // point 8 : 3 Électro max posées en même temps
    gatling: 4,
    barricade: 12, // barricades : pas chères, on en aligne plusieurs sur le chemin
    necro: 3,      // demandé : 3 Nécromants max posés
  },
  damageGrowth: 1.36,   // dégâts/DPS ×1,36 par niveau — rééquilibré contre la courbe d'HP adoucie
  settingsDefault: { particles: 'moyen', corpses: 20, sound: true }, // menu → Paramètres

  // Build order shown in the panel (left -> right) --------------------
  towerOrder: ['gunner', 'frost', 'flame', 'sniper', 'mortar', 'mine', 'shock', 'gatling', 'farm', 'barricade', 'necro'],

  // 100 progressive waves (generated). A boss appears every 10th wave.
  // (vagues maintenant par mode de difficulté — voir WAVES_BY_MODE / DIFFICULTIES)

  // Boss definitions — each has a distinct 3D model + special ability ----
  bosses: {
    brute:       { key: 'brute',       name: 'The Brute',        hp: 1200, speed: 0.9,  reward: 120, damage: 8 },
    stalker:     { key: 'stalker',     name: 'The Stalker',      hp: 900,  speed: 2.2,  reward: 100, damage: 8 },
    frostking:   { key: 'frostking',   name: 'The Frost King',   hp: 1100, speed: 1.1,  reward: 110, damage: 8 },
    pyrolord:    { key: 'pyrolord',    name: 'The Pyro Lord',    hp: 1300, speed: 1.0,  reward: 130, damage: 10 },
    abomination: { key: 'abomination', name: 'The Abomination',  hp: 2000, speed: 0.7,  reward: 200, damage: 12 },
    golem:       { key: 'golem',       name: 'Stone Golem',      hp: 2600, speed: 0.6,  reward: 260, damage: 14, ability: 'petrify' },
    runner:      { key: 'runner',      name: 'The Sprinter',     hp: 2200, speed: 1.4,  reward: 240, damage: 12, ability: 'sprint' },
    regenerator: { key: 'regenerator', name: 'The Regenerator',  hp: 2400, speed: 1.0,  reward: 250, damage: 12, ability: 'regen' },
    titan:       { key: 'titan',       name: 'The Titan',        hp: 3200, speed: 0.8,  reward: 320, damage: 16, ability: 'twolives' },
    wraith:      { key: 'wraith',      name: 'The Wraith',       hp: 2800, speed: 1.2,  reward: 300, damage: 14, ability: 'phase' },
  },

  // Boss order for the every-10th-wave bosses (waves 10,20,...,100)
  bossOrder: ['brute','stalker','frostking','pyrolord','abomination','golem','runner','regenerator','titan','wraith'],

  // Per-10-wave map themes (applied at wave milestones) ----------------
  // One visual map per 5-wave segment. The path + tower positions are
  // unchanged between themes; only sky/fog/ground/path + scattered props
  // differ to give each segment a distinct, well-built map.
  themes: THEMES,

  // fallback prop set if a theme has no list
  defaultProps: [
    'tree','tree','tree','tree','tree','tree',
    'rock','rock','rock','bush','bush','bush',
    'tombstone','tombstone','lamp','lamp','fence','sign',
    'stump','log','crate','well','hedge','mushroom',
  ],
};
