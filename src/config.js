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
            'lamp','lamp','lamp','fence','fence','fence','sign','sign',
            'tombstone','tombstone','bush','bush','bush',
            'stump','log','crate','cart','well','hedge','mushroom',
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
            'flower','flower','flower','flower','flower','flower','flower','flower','flower'],
  },
  {
    name: 'winter', skin: 'snowy',
    sky: 0x1a2436, fog: [30, 90], ground: 0xdce8f2, path: 0x9fb4cc,
    snow: true,
    props: ['tree','tree','tree','tree','tree','tree','tree',
            'rock','rock','rock','lamp','lamp',
            'tombstone','fence','bush','snowpile','snowpile',
            'stump','crate','well','hedge','mushroom',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'flower','flower','flower','flower'],
  },
  {
    name: 'volcanic', skin: 'lava',
    sky: 0x241512, fog: [26, 80], ground: 0x2a1a16, path: 0xb87a4a,
    volcano: true,
    // no bushes in the volcanic zone — extra rock spikes + cinders + lava pools
    props: ['rock','rock','rock','rock','rock','rock','rock','rock','rock',
            'rockspire','rockspire','rockspire','rockspire','rockspire','rockspire',
            'lavapool','lavapool','lavapool','lavapool',
            'cinder','cinder','cinder','cinder','cinder',
            'sign','stump','log','crate','cart','mushroom',
            'grass','grass','grass','grass','grass','grass','grass','grass','grass','grass',
            'flower','flower','flower'],
  },
  {
    name: 'ashlands', skin: 'dirty',
    sky: 0x191614, fog: [38, 92], ground: 0x574f45, path: 0xc9bfa4,
    // Post-apocalyptic wasteland : panneaux cassés, ruines, cendres
    props: ['sign','sign','tombstone','tombstone','stump','stump','fence','fence',
            'crate','cart','lamp','rock','cinder','cinder',
            'grass','grass','grass','grass','grass'],
  },
  {
    name: 'haunted', skin: 'water',
    sky: 0x16233a, fog: [40, 85], ground: 0x33506b, path: 0xa9c7e0,
    // Brumeux et spectral : champignons bioluminescents et vieilles ruines
    props: ['tree','lamp','mushroom','mushroom','sign','tombstone','well',
            'stump','log','hedge','flower','flower'],
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

// Which boss appears on each 10th wave (waves 10..100)
const BOSS_ORDER = ['brute','stalker','frostking','pyrolord','abomination','golem','runner','regenerator','titan','wraith'];

// Generate 100 escalating waves. A boss appears on every 10th wave.
function buildWaves(totalWaves, themes, bossOrder) {
  const waves = [];
  for (let w = 1; w <= totalWaves; w++) {
    const seg = Math.floor((w - 1) / 5);
    const skin = (themes[seg % themes.length] && themes[seg % themes.length].skin) || 'default';
    // HP ramps up linearly + a quadratic term so late waves really hurt
    const hp = +(1 + 0.13 * (w - 1) + 0.0035 * (w - 1) * (w - 1)).toFixed(2);
    const sp = +Math.min(1.7, 1 + 0.008 * (w - 1)).toFixed(2);
    const list = [];
    list.push(['walker', skin, Math.min(45, 3 + w)]);
    if (w >= 3) list.push(['fast', skin, Math.min(35, Math.floor(w * 0.6))]);
    if (w >= 5) list.push(['tank', skin, Math.min(25, Math.floor(w * 0.35))]);
    if (w % 10 === 0) {
      const idx = (w / 10) - 1;
      list.push(['boss', bossOrder[idx % bossOrder.length], 1]);
    }
    waves.push({ w, hp, sp, list });
  }
  return waves;
}

export const CONFIG = {
  startMoney: 150,
  baseHP: 20,
  totalWaves: 100,
  autoWaveDelay: 5,         // seconds of auto-start countdown between waves
  earlyBonusPerSec: 2,      // money per remaining second when starting early
  speedOptions: [1, 2, 4],
  sellRefund: 0.5,
  pathHeight: 0.05,         // natural low walkway (now visible from above thanks to DoubleSide)

  // Map ---------------------------------------------------------------
  groundSize: 58,
  mapBounds: { minX: -26, maxX: 26, minZ: -18, maxZ: 18 },
  waypoints: [
    [-26, -8], [-16, -3], [-8, 3], [0, -1], [8, 4], [18, 6], [26, 2],
  ],
  pathWidth: 3.0,
  pathClearance: 1.2,       // min distance from path center to place non-mine towers
  minePathMax: 4.5,         // mines must be this close to the path to be useful
  gridCell: 1.0,

  // Camera / lighting / fog -------------------------------------------
  camera: { pos: [14, 13, 16], target: [0, 0.8, 0], fov: 50, near: 0.1, far: 300 },
  fog: { near: 45, far: 130 },

  // Economy -----------------------------------------------------------
  rewards: { walker: 8, fast: 10, tank: 18 },

  // Zombie base stats (before per-wave scaling) -----------------------
  zombies: {
    walker: { hp: 40,  speed: 1.6, reward: 8,  damage: 2, armor: 0,   radius: 0.5, label: 'Walker' },
    fast:   { hp: 30,  speed: 2.6, reward: 10, damage: 2, armor: 0,   radius: 0.45, label: 'Fast' },
    tank:   { hp: 120, speed: 1.0, reward: 18, damage: 5, armor: 0.15, radius: 0.7, label: 'Tank' },
  },

  // Elemental variant modifiers (applied on top of base type) ---------
  skins: {
    default: { hp: 1.0,  speed: 1.0,  armor: 0.00, slowResist: 0.00, color: 0x8a9a78 },
    snowy:   { hp: 1.15, speed: 0.9,  armor: 0.10, slowResist: 0.10, color: 0xbcd2ea },
    lava:    { hp: 1.10, speed: 0.95, armor: 0.05, slowResist: 0.00, color: 0xff6a2a },
    dirty:   { hp: 0.95, speed: 1.05, armor: 0.00, slowResist: 0.00, color: 0x6a6a42 },
    water:   { hp: 1.05, speed: 1.10, armor: 0.00, slowResist: 0.50, color: 0x4a8ae8 },
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
  },
  towerMaxLevel: 5,
  towerStartCap: 2, // ceiling au départ — les niveaux 3 à 5 se débloquent dans la Boutique
  damageGrowth: 1.32, // dégâts/DPS ×1,32 par niveau (montée douce, jamais disproportionnée)

  // Build order shown in the panel (left -> right) --------------------
  towerOrder: ['gunner', 'frost', 'flame', 'sniper', 'mortar', 'mine'],

  // 100 progressive waves (generated). A boss appears every 10th wave.
  waves: buildWaves(100, THEMES, BOSS_ORDER),

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
