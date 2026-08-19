import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Zombie Tower Defense — Model Factory (Phase 2 detailed models)
// Pure Three.js primitives, no external files.
// Every model is a THREE.Group whose `userData.parts` exposes the named,
// animatable sub-groups (limbs, turrets, muzzles, ...).
// ---------------------------------------------------------------------------

const rand = (a, b) => a + Math.random() * (b - a);

// Geometry cache: identical primitive shapes are shared (avoids re-allocating
// buffers on every model/projectile/explosion spawn — the main source of the
// one-frame hitches when towers fire or props are placed).
const _geoCache = new Map();
function geoBox(w, h, d) {
  const k = 'b' + w + ',' + h + ',' + d;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _geoCache.set(k, g); }
  return g;
}
function geoCyl(rTop, rBot, h, seg = 12) {
  const k = 'c' + rTop + ',' + rBot + ',' + h + ',' + seg;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rTop, rBot, h, seg); _geoCache.set(k, g); }
  return g;
}
function geoSphere(r, w = 12, h = 10) {
  const k = 's' + r + ',' + w + ',' + h;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, w, h); _geoCache.set(k, g); }
  return g;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, ...opts });
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(geoBox(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, material, seg = 12) {
  const m = new THREE.Mesh(geoCyl(rTop, rBot, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, w = 12, h = 10) {
  const m = new THREE.Mesh(geoSphere(r, w, h), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// ZOMBIES
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skins — cosmetic tints applied to tower & base models (shop)
// ---------------------------------------------------------------------------
// Rich cosmetic recipes — beyond a flat tint: real PBR finishing + glow.
export const SKIN_TINTS = {
  // Tower skins -----------------------------------------------------------
  auric:     { mult: [1.38, 1.20, 0.58], em: 0xffb63a, ei: 0.20, metalness: 1.0, roughness: 0.24 },   // poli or sacré
  phantom:   { mult: [0.70, 0.84, 1.15], em: 0x9fd8ff, ei: 0.35, opacity: 0.76 },                    // spectre translucide
  magma:     { mult: [1.28, 0.78, 0.42], em: 0xff4d1a, ei: 1.0, roughness: 0.95, metalness: 0.04 }, // cœur volcanique
  // Base / house skins (fantasy) -------------------------------------------
  enchanted: { mult: [1.05, 0.85, 1.32], em: 0xb07aff, ei: 0.5, roughness: 0.4, metalness: 0.3 },   // patine arcanique
  crystal:   { mult: [0.86, 1.06, 1.28], em: 0x9fefff, ei: 0.7, roughness: 0.07, metalness: 0.35 }, // verre glacé
  haunted:   { mult: [0.62, 0.95, 0.66], em: 0x4aff8a, ei: 0.55, opacity: 0.93 },                   // brume spectrale
};

/** Apply a cosmetic skin (or 'classic' to restore) to a model group.
 *  Original material colors are snapshotted on first use so switching skins
 *  never accumulates colour drift. */
export function applySkin(model, id) {
  if (!model || !model.traverse) return;
  const list = [];
  model.traverse((o) => {
    if (o.isMesh && o.material && o.material.color && o.material.emissive) list.push(o.material);
  });
  // snapshot originals once so switching skins never accumulates drift
  let snap = model.userData._skinSnap;
  if (!snap) {
    snap = new Map();
    for (const m of list) {
      snap.set(m, { color: m.color.getHex(), em: m.emissive ? m.emissive.getHex() : 0x000000,
        ei: m.emissiveIntensity ?? 1, metalness: m.metalness ?? 0.5, roughness: m.roughness ?? 0.8,
        opacity: m.opacity ?? 1, transparent: !!m.transparent });
    }
    model.userData._skinSnap = snap;
  }
  const tint = SKIN_TINTS[id];
  for (const mat of list) {
    const orig = snap.get(mat);
    if (!orig) continue;
    // restore base look, then apply the skin finish
    mat.color.setHex(orig.color);
    if (mat.emissive) { mat.emissive.setHex(orig.em); mat.emissiveIntensity = orig.ei; }
    mat.metalness = orig.metalness; mat.roughness = orig.roughness;
    mat.opacity = orig.opacity; mat.transparent = orig.transparent;
    if (!tint || id === 'classic') { mat.needsUpdate = true; continue; }
    const c = new THREE.Color();
    c.setHex(orig.color);
    c.r *= tint.mult[0]; c.g *= tint.mult[1]; c.b *= tint.mult[2];
    mat.color.copy(c);
    if (mat.emissive) { mat.emissive.setHex(tint.em); mat.emissiveIntensity = tint.ei; }
    if (tint.metalness != null) mat.metalness = tint.metalness;
    if (tint.roughness != null) mat.roughness = tint.roughness;
    if (tint.opacity != null && tint.opacity < 1) { mat.transparent = true; mat.opacity = tint.opacity; }
    mat.needsUpdate = true;
  }
  try { _applySkinDecor(model, id); } catch {}
}

// Attach / remove the distinctive decor pieces of a skin onto any model.
function _applySkinDecor(model, id) {
  if (!model || !model.add || !model.userData) return;
  const old = model.userData._skinDecor;
  if (old) { old.removeFromParent(); delete model.userData._skinDecor; }
  if (!id || id === 'classic') return;
  let big = false;
  try {
    const sz = new THREE.Vector3();
    new THREE.Box3().setFromObject(model).getSize(sz);
    big = sz.y > 2.0; // house models are ~2-3 units tall
  } catch {}
  const key = id + (big ? ':big' : '');
  let tmpl = _skinDecorCache.get(key);
  if (!tmpl) { tmpl = buildSkinDecor(id, big ? 2.6 : 1, big); _skinDecorCache.set(key, tmpl); }
  const inst = tmpl.clone(true); // live instance per model
  try { model.add(inst); } catch {}
  model.userData._skinDecor = inst;
}

// ===================================================================== SKIN DECOR
// Each skin grows its own distinctive silhouette pieces (beyond a flat tint),
// so Or Sacré / Fantôme / Magma / Enchantée / Cristal / Hanté all read as
// genuinely different builds in shop previews and on the live battlefield.
const _skinDecorCache = new Map();
export function buildSkinDecor(id, scale = 1, big = false) {
  // Les skins de maison ont des structures 3D à part entière (coordonnées
  // absolues de la demeure : sol à y=0, toit ≈ y=4.3, perron côté +z)
  if (big && (id === 'enchanted' || id === 'crystal' || id === 'haunted')) {
    return buildBaseSkinDecor(id);
  }
  const g = new THREE.Group();
  const gold   = mat(0xd9a324, { metalness: 1.0, roughness: 0.25 });
  const goldGlow = mat(0xffc84a, { emissive: 0xffb63a, emissiveIntensity: 1.2, metalness: .9, roughness: .3 });
  const ghost  = mat(0xbfe4ff, { emissive: 0x9fd8ff, emissiveIntensity: .9, transparent: true, opacity: .55, roughness: .1 });
  const emberM = mat(0x3a2620, { roughness: .95 });
  const lava   = mat(0xff4d1a, { emissive: 0xff5a20, emissiveIntensity: 2.4, roughness: .6 });
  const arcane = mat(0x8b5cf6, { emissive: 0xb07aff, emissiveIntensity: 1.1, metalness: .4, roughness: .35 });
  const ice    = mat(0xcfefff, { emissive: 0x9fefff, emissiveIntensity: .8, transparent: true, opacity: .6, metalness: .4, roughness: .05 });
  const spect  = mat(0x3fae7a, { emissive: 0x4aff8a, emissiveIntensity: 1.0, transparent: true, opacity: .5, roughness: .2 });

  if (id === 'auric') {
    const ringB = cyl(0.86, 0.94, 0.16, gold); ringB.position.y = -0.35; g.add(ringB);
    const ringT = cyl(0.72, 0.8, 0.1, gold);   ringT.position.y = 0.72; g.add(ringT);
    const spire = cyl(0.06, 0.14, 0.5, gold, 6); spire.position.y = 1.3; g.add(spire);
    const orb   = sphere(0.16, goldGlow);      orb.position.y = 1.62;  g.add(orb);
  } else if (id === 'phantom') {
    for (let i = 0; i < 3; i++) {
      const w = sphere(0.13 - i * 0.015, ghost);
      const a = i * 2.4;
      w.position.set(Math.cos(a) * 0.62, -0.2 + i * 0.5, Math.sin(a) * 0.62);
      g.add(w);
    }
    const halo = cyl(0.78, 0.78, 0.14, ghost, 20); halo.position.y = -0.5; g.add(halo);
  } else if (id === 'magma') {
    const ped = box(1.9, 0.2, 1.9, emberM); ped.position.y = -0.48; g.add(ped);
    for (let i = 0; i < 4; i++) {
      const cr = box(0.06, 0.5, 0.16, lava);
      const a = (i / 4) * Math.PI * 2 + 0.7;
      cr.position.set(Math.cos(a) * 0.82, -0.05 + (i % 2) * 0.35, Math.sin(a) * 0.82);
      cr.lookAt(0, cr.position.y, 0);
      g.add(cr);
    }
    const em = sphere(0.14, lava); em.position.set(0.5, 1.35, -0.3); g.add(em);
    const em2 = sphere(0.09, lava); em2.position.set(-0.45, 1.62, 0.35); g.add(em2);
  } else if (id === 'enchanted') {
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(geoSphere(0.08), arcane.clone());
      const a = (i / 5) * Math.PI * 2;
      r.position.set(Math.cos(a) * 0.7, 1.1 + (i % 2) * 0.24, Math.sin(a) * 0.7);
      g.add(r);
    }
    const arch = cyl(0.34, 0.62, 0.26, arcane, 6); arch.position.y = -0.5; g.add(arch);
  } else if (id === 'crystal') {
    for (let i = 0; i < 7; i++) {
      const s = cyl(0.02, 0.14, 0.4, ice, 5);
      const a = (i / 7) * Math.PI * 2;
      const hgt = 0.3 + ((i * 7919) % 5) * 0.06;
      s.scale.y = hgt / 0.4;
      s.position.set(Math.cos(a) * 0.8, -0.2 + (s.scale.y - 1) * 0.1, Math.sin(a) * 0.8);
      s.rotation.z = 0.25; g.add(s);
    }
    const peak = cyl(0.03, 0.26, 0.7, ice, 6); peak.position.y = 1.35; g.add(peak);
  } else if (id === 'haunted') {
    const mist = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), spect.clone());
    mist.material.side = THREE.DoubleSide;
    mist.rotation.x = -Math.PI / 2; mist.position.y = -0.52; g.add(mist);
    for (let i = 0; i < 3; i++) {
      const w = sphere(0.1 + i * 0.03, spect.clone());
      const a = 1.2 + i * 1.9;
      w.position.set(Math.cos(a) * 0.68, 0.45 + i * 0.4, Math.sin(a) * 0.68);
      g.add(w);
    }
    const post = cyl(0.04, 0.05, 0.7, emberM); post.position.set(1.1, 0, 0.9); g.add(post);
    const lant = box(0.2, 0.26, 0.2, mat(0x2a3a30, { emissive: 0x4aff8a, emissiveIntensity: .8 }));
    lant.position.set(1.1, 0.45, 0.9); g.add(lant);
  }
  g.scale.setScalar(Math.max(0.6, Math.min(scale, 3.4)));
  return g;
}

// ===================================================================== BASE SKINS (vraies structures 3D)
// Coordonnées absolues : la maison s'étend de y=0 (sol) à ≈4.3 (faîtage),
// corps 3.4 × 2.8, perron/lanternes côté +z. Pas de scale — 1 unit = 1 m.
function buildBaseSkinDecor(id) {
  const g = new THREE.Group();
  if (id === 'enchanted') {
    const stone = mat(0x6a5a7a, { roughness: 0.9, metalness: 0.15 });
    const rune  = mat(0x8b5cf6, { emissive: 0xb07aff, emissiveIntensity: 1.5, metalness: 0.4, roughness: 0.3 });
    // Cercle de 8 menhirs runiques
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const h = rand(1.0, 1.6);
      const m = box(0.22, h, 0.4, stone);
      m.position.set(Math.cos(a) * 4.3, h / 2, Math.sin(a) * 4.3);
      m.rotation.y = -a + Math.PI / 2;
      m.rotation.z = rand(-0.06, 0.06);
      g.add(m);
      const p = box(0.5, 0.14, 0.6, mat(0x4a4058, { roughness: 1 }));
      p.position.set(Math.cos(a) * 4.3, 0.07, Math.sin(a) * 4.3);
      g.add(p);
    }
    // Cercle magique gravé au sol
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 40),
      mat(0xb07aff, { emissive: 0xb07aff, emissiveIntensity: 1.6, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.12, 40),
      mat(0xb07aff, { emissive: 0xb07aff, emissiveIntensity: 1.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.05; g.add(ring2);
    // Reliquaire cristallin sur le faîtage
    const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), rune);
    c1.position.set(0, 4.8, 0); g.add(c1);
    const c2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), rune);
    c2.position.set(0.5, 4.25, 0.3); g.add(c2);
    // Runes en lévitation autour de la demeure
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.8;
      const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), rune);
      r.position.set(Math.cos(a) * 3.0, 2.3 + (i % 3) * 0.6, Math.sin(a) * 3.0);
      g.add(r);
    }
    // Piliers de porte runiques de chaque côté du perron
    for (const s of [-1, 1]) {
      const p = cyl(0.14, 0.18, 2.7, stone, 8); p.position.set(s * 1.9, 1.35, 3.3); g.add(p);
      const t = box(0.6, 0.18, 0.5, rune); t.position.set(s * 1.9, 2.78, 3.3); g.add(t);
    }
  } else if (id === 'crystal') {
    const ice  = mat(0xcfefff, { emissive: 0x8fdfff, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, roughness: 0.06, metalness: 0.35 });
    const ice2 = mat(0xa8dcff, { emissive: 0x6fd0ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.4 });
    // Plateforme de glace sous la demeure
    const plat = cyl(5.4, 5.9, 0.22, ice, 10); plat.position.y = 0.1; g.add(plat);
    // Muraille de pics de cristal autour de la maison
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const h = rand(1.6, 3.6);
      const s = new THREE.Mesh(new THREE.ConeGeometry(rand(0.25, 0.5), h, 5), i % 2 ? ice : ice2);
      s.position.set(Math.cos(a) * rand(3.8, 4.8), h / 2 + 0.1, Math.sin(a) * rand(3.8, 4.8));
      s.rotation.z = rand(-0.25, 0.25);
      g.add(s);
    }
    // Gros cristal royal sur le toit
    const big = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), ice2);
    big.position.set(0, 4.6, 0); big.rotation.y = 0.6; g.add(big);
    const b2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), ice);
    b2.position.set(-0.7, 4.1, -0.4); g.add(b2);
    // Cristaux épars dans la cour
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.12, 0.22), 0), ice);
      c.position.set(Math.cos(a) * rand(2.3, 3.4), 0.15, Math.sin(a) * rand(2.3, 3.4));
      g.add(c);
    }
  } else if (id === 'haunted') {
    const bone = mat(0x5a6a58, { roughness: 0.95 });
    const spec = mat(0x4aff8a, { emissive: 0x4aff8a, emissiveIntensity: 1.2, transparent: true, opacity: 0.55, roughness: 0.2 });
    const wood = mat(0x2e332c, { roughness: 1 });
    // Cercle de tombeaux penchés
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const t = box(0.5, rand(0.7, 1.1), 0.14, bone);
      t.position.set(Math.cos(a) * 4.5, 0.5, Math.sin(a) * 4.5);
      t.rotation.y = -a; t.rotation.z = rand(-0.22, 0.22); t.rotation.x = rand(-0.12, 0.12);
      g.add(t);
    }
    // Arbre mort noué
    const trunk = cyl(0.1, 0.24, 2.8, wood, 7); trunk.position.set(-3.6, 1.4, -2.8); trunk.rotation.z = 0.12; g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const b = cyl(0.03, 0.08, rand(0.9, 1.5), wood, 6);
      const a = (i / 4) * Math.PI * 2 + 0.9;
      b.position.set(-3.6 + Math.cos(a) * 0.35, 2.1 + (i % 2) * 0.4, -2.8 + Math.sin(a) * 0.35);
      b.rotation.set(Math.sin(a) * 0.9, a, Math.cos(a) * 0.9);
      g.add(b);
    }
    // Spectres flottants
    for (let i = 0; i < 4; i++) {
      const a = 1 + i * 1.7;
      const w = sphere(0.2 + i * 0.03, spec);
      w.position.set(Math.cos(a) * rand(2.4, 3.6), 1.6 + i * 0.5, Math.sin(a) * rand(2.4, 3.6));
      g.add(w);
    }
    // Brume verte basse
    const fog = new THREE.Mesh(new THREE.CircleGeometry(5.8, 28),
      mat(0x4aff8a, { emissive: 0x2a8a5a, emissiveIntensity: 0.5, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
    fog.rotation.x = -Math.PI / 2; fog.position.y = 0.12; g.add(fog);
    // Grande lanterne courbée
    const post = cyl(0.07, 0.09, 2.4, wood, 7); post.position.set(3.2, 1.2, 3.0); post.rotation.z = 0.1; g.add(post);
    const lant = box(0.3, 0.36, 0.3, mat(0x1c2a22, { emissive: 0x4aff8a, emissiveIntensity: 1.6, roughness: 0.4 }));
    lant.position.set(3.26, 2.5, 3.0); g.add(lant);
  }
  return g;
}

const ZOMBIE_SPECS = {
  walker: { scale: 1.0, torsoW: 0.52, skin: 0x7a8f6a, jacket: 0x4a5a44, pants: 0x3a4238 },
  fast:   { scale: 0.92, torsoW: 0.44, skin: 0x8fa37a, jacket: 0x7a4a3a, pants: 0x333a42, hunch: 0.16 },
  tank:   { scale: 1.32, torsoW: 0.66, skin: 0x5f6f57, jacket: 0x42484e, pants: 0x2e3430, armor: true },
};

const SKINS = {
  default: { skinMul: 1.0, emissive: 0x000000, emissiveI: 0, opacity: 1 },
  snowy:   { skinTint: 0xdde8f2, emissive: 0x4a7ab8, emissiveI: 0.12, crystals: true },
  lava:    { skinTint: 0x2a2320, emissive: 0xff5a1a, emissiveI: 0.55, cracks: true },
  dirty:   { skinTint: 0x6a5f42, emissive: 0x000000, emissiveI: 0, mottle: true },
  water:   { skinTint: 0x4a7ac8, emissive: 0x3a8ae8, emissiveI: 0.35, opacity: 0.72 },
};

export function createZombieModel(type = 'walker', skin = 'default') {
  const spec = ZOMBIE_SPECS[type] || ZOMBIE_SPECS.walker;
  const sk = SKINS[skin] || SKINS.default;

  const skinColor = sk.skinTint ?? spec.skin;
  const skinMat = mat(skinColor, {
    roughness: 0.9,
    metalness: 0.05,
    emissive: sk.emissive,
    emissiveIntensity: sk.emissiveI,
    transparent: sk.opacity < 1,
    opacity: sk.opacity ?? 1,
  });
  const jacketMat = mat(spec.jacket, { roughness: 1 });
  const pantsMat = mat(spec.pants, { roughness: 1 });

  const model = new THREE.Group();
  model.name = `zombie-${type}-${skin}`;

  const root = new THREE.Group();
  root.name = 'root';
  model.add(root);

  // -- pelvis --
  const pelvis = box(spec.torsoW * 0.9, 0.26, 0.3, jacketMat);
  pelvis.position.y = 0.82;
  pelvis.name = 'pelvis';
  root.add(pelvis);

  // -- torso --
  const torso = box(spec.torsoW, 0.62, 0.34, jacketMat);
  torso.position.y = 1.28;
  torso.name = 'torso';
  root.add(torso);

  if (spec.hunch) torso.rotation.x = spec.hunch;
  if (spec.armor) {
    const plate = box(spec.torsoW * 1.02, 0.4, 0.06, mat(0x555c63, { metalness: 0.7, roughness: 0.35 }));
    plate.position.set(0, 0.05, 0.18);
    torso.add(plate);
    const padL = box(0.16, 0.1, 0.24, mat(0x555c63, { metalness: 0.7, roughness: 0.35 }));
    padL.position.set(-spec.torsoW / 2 - 0.05, 0.26, 0);
    torso.add(padL);
    const padR = padL.clone();
    padR.position.x = spec.torsoW / 2 + 0.05;
    torso.add(padR);
  }

  // -- head --
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.78;
  const skull = sphere(0.19, skinMat);
  head.add(skull);
  const jaw = box(0.2, 0.07, 0.16, skinMat);
  jaw.position.set(0, -0.14, 0.05);
  head.add(jaw);
  const eyeMat = mat(0xffb020, { emissive: 0xff9000, emissiveIntensity: 1.4 });
  const eyeL = sphere(0.035, eyeMat);
  eyeL.position.set(-0.07, 0.03, 0.16);
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.07;
  head.add(eyeR);
  root.add(head);

  // -- limb builder (pivot at joint, geometry offset below) --
  function buildArm(side) {
    const s = side === 'L' ? -1 : 1;
    const arm = new THREE.Group();
    arm.name = `arm${side}`;
    arm.position.set(s * (spec.torsoW / 2 + 0.07), 1.58, 0);
    const upper = box(0.13, 0.34, 0.13, skinMat);
    upper.position.y = -0.17;
    arm.add(upper);
    const elbow = new THREE.Group();
    elbow.name = `elbow${side}`;
    elbow.position.y = -0.34;
    const fore = box(0.11, 0.3, 0.11, skinMat);
    fore.position.y = -0.15;
    elbow.add(fore);
    const hand = sphere(0.07, skinMat);
    hand.position.y = -0.32;
    hand.name = `hand${side}`;
    elbow.add(hand);
    arm.add(elbow);
    root.add(arm);
    return { arm, elbow };
  }

  function buildLeg(side) {
    const s = side === 'L' ? -1 : 1;
    const leg = new THREE.Group();
    leg.name = `leg${side}`;
    leg.position.set(s * 0.13, 0.82, 0);
    const thigh = box(0.16, 0.42, 0.16, pantsMat);
    thigh.position.y = -0.21;
    leg.add(thigh);
    const knee = new THREE.Group();
    knee.name = `knee${side}`;
    knee.position.y = -0.42;
    const shin = box(0.13, 0.4, 0.13, skinMat);
    shin.position.y = -0.2;
    knee.add(shin);
    const foot = box(0.14, 0.07, 0.24, mat(0x22251f, { roughness: 1 }));
    foot.position.set(0, -0.43, 0.05);
    knee.add(foot);
    leg.add(knee);
    root.add(leg);
    return { leg, knee };
  }

  const { arm: armL, elbow: elbowL } = buildArm('L');
  const { arm: armR, elbow: elbowR } = buildArm('R');
  const { leg: legL, knee: kneeL } = buildLeg('L');
  const { leg: legR, knee: kneeR } = buildLeg('R');

  // -- skin extras --
  if (sk.crystals) {
    const crys = mat(0xcfe8ff, { emissive: 0x8ac0ff, emissiveIntensity: 0.4, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.3 });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, rand(0.1, 0.2), 4), crys);
      c.position.set(rand(-0.25, 0.25), rand(1.1, 1.8), rand(-0.15, 0.15));
      c.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
      root.add(c);
    }
  }
  if (sk.cracks) {
    const crack = mat(0x000000, { emissive: 0xff5a1a, emissiveIntensity: 2.2 });
    for (let i = 0; i < 5; i++) {
      const c = box(rand(0.06, 0.12), 0.02, 0.02, crack);
      c.position.set(rand(-0.2, 0.2), rand(1.0, 1.6), rand(0.14, 0.18));
      c.rotation.y = rand(0, Math.PI);
      root.add(c);
    }
  }
  if (sk.mottle) {
    const blot = mat(0x4a5030, { roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const b = sphere(rand(0.05, 0.09), blot);
      b.position.set(rand(-0.25, 0.25), rand(0.9, 1.8), rand(-0.16, 0.16));
      root.add(b);
    }
  }

  model.scale.setScalar(spec.scale);
  model.userData.parts = { root, pelvis, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
  model.userData.type = type;
  model.userData.skin = skin;
  return model;
}

// ---------------------------------------------------------------------------
// TOWERS (6 types) — each exposes turret + muzzle (+ barrel where relevant)
// ---------------------------------------------------------------------------

function towerBase(radius, height, color, opts = {}) {
  const base = new THREE.Group();
  base.name = 'base';
  const pad = cyl(radius + 0.15, radius + 0.25, 0.18, mat(0x4a525a, { roughness: 0.9 }));
  pad.position.y = 0.09;
  base.add(pad);
  const deck = cyl(radius, radius * 1.08, height, mat(color, { roughness: 0.7, metalness: 0.25, ...opts }));
  deck.position.y = 0.18 + height / 2;
  base.add(deck);
  return { base, deckY: 0.18 + height };
}

// ---- Tour ÉLECTRO (chaîne d'électricité) : base sombre + bobine lumineuse --
function towerShock() {
  const model = new THREE.Group();
  model.name = 'tower-shock';
  const root = box(1.3, 0.5, 1.3, mat(0x2c3240, { metalness: 0.7, roughness: 0.35 }));
  root.position.y = 0.3;
  model.add(root);
  const post = cyl(0.18, 0.26, 0.9, mat(0x4a5266, { metalness: 0.6, roughness: 0.4 }), 10);
  post.position.y = 0.9;
  model.add(post);
  // bobine (spire de Tesla) : sphère + anneau + filament émissif
  const coilMat = mat(0x7ef5e6, { emissive: 0x39ffd8, emissiveIntensity: 1.5, metalness: 0.4 });
  const orb = sphere(0.26, coilMat);
  orb.position.y = 1.62; model.add(orb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 24), mat(0x9aa7bd, { metalness: 0.8, roughness: 0.3 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.4; model.add(ring);
  // arcs latéraux
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const rod = cyl(0.03, 0.05, 0.5, coilMat, 8);
    rod.position.set(Math.cos(a) * 0.42, 1.3, Math.sin(a) * 0.42);
    rod.rotation.z = -Math.cos(a) * 0.9;
    model.add(rod);
  }
  const sparkLight = new THREE.PointLight(0x66ffe8, 1.4, 5, 2);
  sparkLight.position.y = 1.7; sparkLight.name = 'spark';
  model.add(sparkLight);
  // petite couronne de base
  const crown = cyl(0.62, 0.78, 0.34, mat(0x232935, { metalness: 0.5 }), 12);
  crown.position.y = -0.02; model.add(crown);
  model.userData.parts = { root, post, orb };
  return model;
}

// ---- Tour MINIGUN (tir très rapide) : socle + tourelle à barils multiples --
function towerGatling() {
  const model = new THREE.Group();
  model.name = 'tower-gatling';
  const base = box(1.5, 0.5, 1.2, mat(0x3d4a3e, { metalness: 0.5, roughness: 0.5 }));
  base.position.y = 0.28; model.add(base);
  const mount = box(0.9, 0.5, 1.6, mat(0x55634f, { metalness: 0.6, roughness: 0.4 }));
  mount.position.set(0, 0.85, -0.2); model.add(mount);
  const turret = new THREE.Group();
  const hub = cyl(0.34, 0.34, 0.5, mat(0x6b7a63, { metalness: 0.7, roughness: 0.3 }), 12);
  hub.rotation.x = Math.PI / 2; turret.add(hub);
  // 5 barils circulaires + canon central
  const barrelMat = mat(0x8d9b84, { metalness: 0.85, roughness: 0.25 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = cyl(0.035, 0.045, 1.1, barrelMat, 8);
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.6); turret.add(b);
  }
  const center = cyl(0.05, 0.06, 1.25, barrelMat, 8);
  center.rotation.x = Math.PI / 2; center.position.z = 0.7; turret.add(center);
  const motor = box(0.5, 0.4, 0.5, mat(0x39423a, { metalness: 0.6 }));
  motor.position.y = -0.15; turret.add(motor);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 1.3); turret.add(muzzle);
  turret.position.set(0, 1.15, -0.2);
  model.add(turret);
  // portière de munitions
  const drum = cyl(0.22, 0.28, 0.34, mat(0x7a6b3f, { metalness: 0.7, roughness: 0.4 }), 10);
  drum.position.set(-0.55, 0.95, -0.5); model.add(drum);
  model.userData.parts = { base, mount, turret, muzzle };
  return model;
}

// ---- Tour FERME (générateur d'or) : table de bois + planter de légumes ----- 
function towerFarm() {
  const model = new THREE.Group();
  model.name = 'tower-farm';
  const legsMat = mat(0x6d543a, { roughness: 0.9 });
  for (const [lx, lz] of [[-0.55,-0.55],[0.55,-0.55],[-0.55,0.55],[0.55,0.55]]) {
    const leg = box(0.12, 0.7, 0.12, legsMat);
    leg.position.set(lx, 0.35, lz); model.add(leg);
  }
  const table = box(1.5, 0.14, 1.5, mat(0x8a6b45, { roughness: 0.8 }));
  table.position.y = 0.76; model.add(table);
  // terreau
  const dirt = box(1.24, 0.1, 1.24, mat(0x3e2f20, { roughness: 1 }));
  dirt.position.y = 0.86; model.add(dirt);
  // plants de légumes
  const leaf = mat(0x57b36a, { roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const gx = ((i % 3) - 1) * 0.42;
    const gz = (Math.floor(i / 3) - 1) * 0.42;
    const st = cyl(0.02, 0.02, 0.28, leaf, 6);
    st.position.set(gx, 1.05, gz); model.add(st);
    const head = sphere(0.09, mat(0x7ede8a, { roughness: 0.6 }));
    head.position.set(gx, 1.24, gz); head.scale.y = 1.25; model.add(head);
  }
  // seau à côté
  const bucket = cyl(0.14, 0.18, 0.3, mat(0x6d7b8c, { metalness: 0.7, roughness: 0.35 }), 12);
  bucket.position.set(-1.15, 0.5, 0.9); model.add(bucket);
  // panais
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 8), mat(0xe8693a, { roughness: 0.6 }));
    car.position.set(-1.15 + i * 0.16, 0.62, 0.9); car.rotation.z = Math.PI / 2; model.add(car);
  }
  const glow = new THREE.PointLight(0xffd76a, 0.5, 3.4, 2);
  glow.position.y = 1.5; model.add(glow);
  return model;
}

export function createTowerModel(type = 'gunner') {
  switch (type) {
    case 'sniper':   return towerSniper();
    case 'frost':    return towerFrost();
    case 'flame':    return towerFlame();
    case 'mortar':   return towerMortar();
    case 'mine':     return towerMine();
    case 'shock':    return towerShock();
    case 'gatling':  return towerGatling();
    case 'farm':     return towerFarm();
    default:         return towerGunner();
  }
}

function towerGunner() {
  const { base, deckY } = towerBase(0.55, 0.4, 0x5a6a5a);
  const model = new THREE.Group();
  model.name = 'tower-gunner';
  model.add(base);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = deckY;
  const body = cyl(0.26, 0.3, 0.42, mat(0x46524a, { metalness: 0.4, roughness: 0.5 }));
  body.position.y = 0.21;
  turret.add(body);
  const dome = sphere(0.24, mat(0x39443c, { metalness: 0.5, roughness: 0.4 }), 14, 10);
  dome.scale.y = 0.55;
  dome.position.y = 0.42;
  turret.add(dome);
  const barrelMat = mat(0x2e3430, { metalness: 0.6, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const barrel = cyl(0.045, 0.055, 0.62, barrelMat, 10);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(s * 0.11, 0.28, 0.34);
    barrel.name = 'barrel';
    turret.add(barrel);
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.28, 0.68);
  turret.add(muzzle);
  const antenna = cyl(0.012, 0.012, 0.3, mat(0x889099, { metalness: 0.8 }));
  antenna.position.set(0.18, 0.55, -0.1);
  turret.add(antenna);
  model.add(turret);

  model.userData.parts = { base, turret, muzzle };
  return model;
}

function towerSniper() {
  const { base, deckY } = towerBase(0.5, 0.55, 0x515a66);
  const model = new THREE.Group();
  model.name = 'tower-sniper';
  model.add(base);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = deckY;
  const body = box(0.34, 0.4, 0.4, mat(0x3c4550, { metalness: 0.4, roughness: 0.5 }));
  body.position.y = 0.2;
  turret.add(body);
  const barrel = cyl(0.07, 0.09, 1.5, mat(0x22282f, { metalness: 0.7, roughness: 0.35 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.3, 0.85);
  barrel.name = 'barrel';
  turret.add(barrel);
  const scope = cyl(0.06, 0.06, 0.22, mat(0x1a1e24, { metalness: 0.8, roughness: 0.3 }));
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.46, 0.35);
  turret.add(scope);
  for (const s of [-1, 1]) {
    const leg = cyl(0.03, 0.03, 0.5, mat(0x2a2f36, { metalness: 0.6 }));
    leg.position.set(s * 0.2, 0.25, -0.25);
    leg.rotation.x = -0.5;
    turret.add(leg);
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.3, 1.62);
  turret.add(muzzle);
  model.add(turret);

  model.userData.parts = { base, turret, barrel, muzzle };
  return model;
}

function towerFrost() {
  const { base, deckY } = towerBase(0.55, 0.45, 0x3a4a5c);
  const model = new THREE.Group();
  model.name = 'tower-frost';
  model.add(base);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = deckY;
  const ring = cyl(0.4, 0.44, 0.14, mat(0x6a89a8, { metalness: 0.6, roughness: 0.4 }));
  ring.position.y = 0.07;
  turret.add(ring);
  const crystalMat = mat(0xbfe2ff, {
    emissive: 0x5aa8ff, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.4,
  });
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), crystalMat);
  crystal.position.y = 0.42;
  crystal.name = 'crystal';
  crystal.castShadow = true;
  turret.add(crystal);
  for (let i = 0; i < 4; i++) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), crystalMat);
    const a = (i / 4) * Math.PI * 2;
    shard.position.set(Math.cos(a) * 0.3, 0.28, Math.sin(a) * 0.3);
    shard.rotation.z = Math.cos(a) * 0.5;
    shard.rotation.x = -Math.sin(a) * 0.5;
    turret.add(shard);
  }
  const pulse = new THREE.PointLight(0x66bbff, 2.2, 4.5, 2);
  pulse.position.y = 0.45;
  turret.add(pulse);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.4, 0);
  turret.add(muzzle);
  model.add(turret);

  model.userData.parts = { base, turret, crystal, muzzle, pulseLight: pulse };
  return model;
}

function towerFlame() {
  const { base, deckY } = towerBase(0.55, 0.4, 0x6a3a2a);
  const model = new THREE.Group();
  model.name = 'tower-flame';
  model.add(base);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = deckY;
  const tank = sphere(0.3, mat(0x7a4a3a, { metalness: 0.3, roughness: 0.6 }), 14, 10);
  tank.position.set(0, 0.28, -0.12);
  turret.add(tank);
  const tankB = tank.clone();
  tankB.scale.setScalar(0.7);
  tankB.position.set(0.14, 0.16, 0.05);
  turret.add(tankB);
  const nozzle = cyl(0.05, 0.14, 0.55, mat(0x3a2a24, { metalness: 0.7, roughness: 0.4 }));
  nozzle.rotation.x = Math.PI / 2 + 0.25;
  nozzle.position.set(0, 0.3, 0.3);
  nozzle.name = 'barrel';
  turret.add(nozzle);
  const valve = cyl(0.05, 0.05, 0.1, mat(0x99a0a8, { metalness: 0.8 }));
  valve.position.set(0.2, 0.42, -0.15);
  turret.add(valve);
  const glow = new THREE.PointLight(0xff7a2a, 1.6, 3.5, 2);
  glow.position.set(0, 0.32, 0.58);
  glow.name = 'glow';
  turret.add(glow);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.34, 0.62);
  turret.add(muzzle);
  model.add(turret);

  model.userData.parts = { base, turret, barrel: nozzle, muzzle, glowLight: glow };
  return model;
}

function towerMortar() {
  const { base, deckY } = towerBase(0.6, 0.35, 0x4a5244);
  const model = new THREE.Group();
  model.name = 'tower-mortar';
  model.add(base);

  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = deckY;
  for (const s of [-1, 1]) {
    for (const f of [-1, 1]) {
      const leg = cyl(0.04, 0.05, 0.5, mat(0x333a2e, { metalness: 0.4 }));
      leg.position.set(s * 0.3, 0.25, f * 0.28);
      leg.rotation.x = f * 0.35;
      leg.rotation.z = -s * 0.35;
      turret.add(leg);
    }
  }
  const barrel = cyl(0.16, 0.2, 0.85, mat(0x3a4436, { metalness: 0.5, roughness: 0.5 }));
  barrel.position.set(0, 0.55, 0);
  barrel.rotation.x = 0.55;
  barrel.name = 'barrel';
  turret.add(barrel);
  const band = cyl(0.19, 0.19, 0.08, mat(0x2a3028, { metalness: 0.6 }));
  band.position.set(0, 0.55, 0);
  band.rotation.x = 0.55;
  turret.add(band);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  const dir = new THREE.Vector3(0, Math.sin(0.55), Math.cos(0.55)).normalize();
  muzzle.position.copy(barrel.position).addScaledVector(dir, 0.45);
  turret.add(muzzle);
  model.add(turret);

  model.userData.parts = { base, turret, barrel, muzzle };
  return model;
}

function towerMine() {
  const model = new THREE.Group();
  model.name = 'tower-mine';
  const disc = cyl(0.4, 0.42, 0.16, mat(0x3a3f33, { metalness: 0.5, roughness: 0.5 }), 16);
  disc.position.y = 0.08;
  disc.name = 'disc';
  model.add(disc);
  const spikesMat = mat(0x555c50, { metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), spikesMat);
    sp.position.set(Math.cos(a) * 0.32, 0.2, Math.sin(a) * 0.32);
    sp.rotation.z = Math.cos(a) * 1.1;
    sp.rotation.x = -Math.sin(a) * 1.1;
    sp.castShadow = true;
    model.add(sp);
  }
  const lightMat = mat(0x661111, { emissive: 0xff2222, emissiveIntensity: 1.6 });
  const lamp = sphere(0.05, lightMat);
  lamp.position.y = 0.24;
  lamp.name = 'lamp';
  model.add(lamp);
  const lampLight = new THREE.PointLight(0xff3322, 0.8, 2, 2);
  lampLight.position.y = 0.35;
  lampLight.name = 'lampLight';
  model.add(lampLight);

  model.userData.parts = { disc, lamp, lampLight };
  return model;
}

// ---------------------------------------------------------------------------
// BASE (house / lab at the path end)
// ---------------------------------------------------------------------------

export function createBaseModel() {
  const model = new THREE.Group();
  model.name = 'base';

  const wallMat = mat(0x8a7a66, { roughness: 0.95 });
  const trimMat = mat(0xe8e0d0, { roughness: 0.9 });
  const roofMat = mat(0x5a3a34, { roughness: 0.8 });
  const darkMat = mat(0x3a322c, { roughness: 0.9 });
  const woodMat = mat(0x6a5f52, { roughness: 1 });

  // --- main body + corner trim ---
  const body = box(3.4, 2.4, 2.8, wallMat);
  body.position.y = 1.2;
  model.add(body);
  // corner boards (trim)
  for (const [cx, cz] of [[-1.7, -1.4], [1.7, -1.4], [-1.7, 1.4], [1.7, 1.4]]) {
    const corner = box(0.1, 2.4, 0.1, trimMat);
    corner.position.set(cx, 1.2, cz);
    model.add(corner);
  }
  // siding lines
  for (let i = 0; i < 6; i++) {
    const line = box(3.42, 0.02, 0.02, mat(0x7a6a58));
    line.position.set(0, 0.5 + i * 0.35, 1.41);
    model.add(line);
  }
  // foundation skirt
  const skirt = box(3.5, 0.2, 2.9, mat(0x4a443c, { roughness: 1 }));
  skirt.position.y = 0.1;
  model.add(skirt);

  // --- roof (4-sided hipped) + eaves + ridge ---
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.5, 4), roofMat);
  roof.position.y = 3.15;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  model.add(roof);
  const eave = box(3.9, 0.08, 3.3, roofMat); eave.position.y = 2.45; model.add(eave);
  const ridge = cyl(0.06, 0.06, 2.4, mat(0x4a302c), 6); ridge.rotation.z = Math.PI / 2; ridge.position.y = 3.9; model.add(ridge);

  // --- door: frame + panels + knob + mat + steps ---
  const door = box(0.7, 1.3, 0.08, darkMat);
  door.position.set(0, 0.65, 1.42);
  model.add(door);
  const doorFrameL = box(0.08, 1.4, 0.1, trimMat); doorFrameL.position.set(-0.42, 0.7, 1.42); model.add(doorFrameL);
  const doorFrameR = box(0.08, 1.4, 0.1, trimMat); doorFrameR.position.set(0.42, 0.7, 1.42); model.add(doorFrameR);
  const doorFrameT = box(0.92, 0.08, 0.1, trimMat); doorFrameT.position.set(0, 1.38, 1.42); model.add(doorFrameT);
  const knob = sphere(0.04, mat(0xd8c060, { metalness: 0.8, roughness: 0.3 })); knob.position.set(0.25, 0.65, 1.48); model.add(knob);
  const doormat = box(0.8, 0.04, 0.5, mat(0x8a4a3a, { roughness: 1 })); doormat.position.set(0, 0.02, 1.95); model.add(doormat);
  const step1 = box(1.0, 0.14, 0.5, woodMat); step1.position.set(0, 0.07, 1.95); model.add(step1);
  const step2 = box(1.2, 0.14, 0.5, woodMat); step2.position.set(0, 0.0, 2.3); model.add(step2);

  // --- windows: frame + glass + cross mullion + shutters + flower boxes ---
  const winMat = mat(0xbfe0f0, { emissive: 0xddeeff, emissiveIntensity: 0.5, roughness: 0.2 });
  const glassLight = new THREE.PointLight(0xffd8a0, 0.8, 4, 2);
  function addWindow(x, y, z, faceY) {
    const frame = box(0.74, 0.74, 0.08, trimMat); frame.position.set(x, y, z); model.add(frame);
    const win = box(0.6, 0.6, 0.06, winMat); win.position.set(x, y, z + (faceY ? 0.02 : 0.02)); model.add(win);
    const mullV = box(0.03, 0.6, 0.02, trimMat); mullV.position.set(x, y, z + 0.04); model.add(mullV);
    const mullH = box(0.6, 0.03, 0.02, trimMat); mullH.position.set(x, y, z + 0.04); model.add(mullH);
    const sill = box(0.84, 0.05, 0.14, woodMat); sill.position.set(x, y - 0.4, z + 0.04); model.add(sill);
    // flower box
    const fb = box(0.6, 0.12, 0.16, mat(0x6a4a3a, { roughness: 1 })); fb.position.set(x, y - 0.5, z + 0.08); model.add(fb);
    for (let f = 0; f < 4; f++) {
      const fc = [0xd85a6a, 0xe8c84a, 0xc86ad8, 0xe86a9a][f % 4];
      const fl = sphere(0.05, mat(fc, { emissive: fc, emissiveIntensity: 0.2 }));
      fl.position.set(x - 0.2 + f * 0.13, y - 0.4, z + 0.08); model.add(fl);
    }
  }
  addWindow(-1.1, 1.5, 1.42, true);
  addWindow(1.1, 1.5, 1.42, true);
  // side windows
  const sideWin = box(0.6, 0.6, 0.06, winMat); sideWin.position.set(1.72, 1.5, 0.4); model.add(sideWin);
  glassLight.position.set(0, 1.5, 1.6); model.add(glassLight);

  // --- chimney with cap + a puff of smoke ---
  const chimney = cyl(0.22, 0.26, 1.1, mat(0x6a5a4a, { roughness: 1 }), 8);
  chimney.position.set(1.1, 3.4, -0.7);
  model.add(chimney);
  const chimneyCap = cyl(0.3, 0.26, 0.12, mat(0x5a4a3a, { roughness: 1 }), 8); chimneyCap.position.set(1.1, 4.0, -0.7); model.add(chimneyCap);
  const smoke = sphere(0.16, mat(0x9aa0a6, { transparent: true, opacity: 0.5, roughness: 1 })); smoke.position.set(1.1, 4.3, -0.7); model.add(smoke);

  // --- porch with full railing (balusters) ---
  const porch = box(2.4, 0.12, 1.2, woodMat);
  porch.position.set(0, 0.06, 2.2);
  model.add(porch);
  const railMat = mat(0x55483a, { roughness: 1 });
  for (const s of [-1, 1]) {
    const post = cyl(0.08, 0.08, 2.3, darkMat, 8);
    post.position.set(s * 1.1, 1.2, 2.7);
    model.add(post);
    const railTop = box(0.06, 0.06, 1.4, railMat); railTop.position.set(s * 1.5, 1.15, 2.5); railTop.rotation.y = Math.PI / 2; model.add(railTop);
    const railBot = box(0.06, 0.05, 1.4, railMat); railBot.position.set(s * 1.5, 0.4, 2.5); railBot.rotation.y = Math.PI / 2; model.add(railBot);
    for (let i = 0; i < 5; i++) {
      const bal = box(0.04, 0.72, 0.04, railMat); bal.position.set(s * 1.5, 0.78, 1.9 + i * 0.3); model.add(bal);
    }
  }
  // porch roof
  const porchRoof = box(2.8, 0.08, 1.4, roofMat); porchRoof.position.set(0, 2.3, 2.4); model.add(porchRoof);
  // hanging lantern on porch
  const lantern = sphere(0.1, mat(0xffe9b0, { emissive: 0xffd88a, emissiveIntensity: 1.5 })); lantern.position.set(0, 2.1, 2.6); model.add(lantern);
  const lanLight = new THREE.PointLight(0xffd88a, 1.0, 4, 2); lanLight.position.set(0, 2.1, 2.6); model.add(lanLight);

  // --- streetlamps ---
  const lampMat = mat(0x33383e, { metalness: 0.7, roughness: 0.4 });
  const bulbMat = mat(0xffe9b0, { emissive: 0xffd88a, emissiveIntensity: 1.6 });
  for (const s of [-1, 1]) {
    const pole = cyl(0.05, 0.07, 2.8, lampMat, 8);
    pole.position.set(s * 2.6, 1.4, 2.2);
    model.add(pole);
    const bulb = sphere(0.14, bulbMat);
    bulb.position.set(s * 2.6, 2.85, 2.2);
    model.add(bulb);
    const lampLight = new THREE.PointLight(0xffd88a, 1.4, 5, 2);
    lampLight.position.set(s * 2.6, 2.9, 2.2);
    model.add(lampLight);
  }

  // --- yard props: little fence, bush, barrel, cart, mailbox ---
  // small yard fence
  for (let i = 0; i < 4; i++) {
    const pf = box(0.08, 0.6, 0.08, railMat); pf.position.set(-2.6 + i * 0.5, 0.3, 3.4); model.add(pf);
  }
  const yfence = box(2.0, 0.05, 0.04, railMat); yfence.position.set(-1.55, 0.5, 3.4); model.add(yfence);
  const yfence2 = box(2.0, 0.05, 0.04, railMat); yfence2.position.set(-1.55, 0.2, 3.4); model.add(yfence2);
  // barrel
  const barrel = cyl(0.28, 0.24, 0.5, mat(0x5a4433, { roughness: 1 }), 10); barrel.position.set(-2.4, 0.25, 1.6); model.add(barrel);
  // a bush in the yard
  const ybushMat = mat(0x446a3a, { roughness: 1 });
  for (let i = 0; i < 3; i++) { const yb = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.2, 0.3), 0), ybushMat); yb.position.set(2.3, 0.25, 1.8 + (i - 1) * 0.25); yb.castShadow = true; model.add(yb); }
  // mailbox
  const mb = cyl(0.04, 0.04, 1.0, mat(0x3a3f45), 8); mb.position.set(3.2, 0.5, 1.2); model.add(mb);
  const mbx = box(0.3, 0.2, 0.2, mat(0x4a6a8a, { metalness: 0.4, roughness: 0.5 })); mbx.position.set(3.2, 1.05, 1.2); model.add(mbx);

  model.userData.parts = { body, roof, door };
  return model;
}

// ---------------------------------------------------------------------------
// BOSSES (5) — large animated builds, each with distinct features
// ---------------------------------------------------------------------------

function bossBody(color, scale, jacket) {
  const z = createZombieModel('walker', 'default');
  const p = z.userData.parts;
  z.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      if (jacket !== null) o.material.color.setHex(color);
    }
  });
  z.scale.setScalar(scale);
  return { z, p };
}

function bossGolem() {
  const { z, p } = bossBody(0x5a5f66, 2.4, 0x4a4f56);
  z.name = 'boss-golem';
  const stone = mat(0x6a7078, { roughness: 1 });
  const stone2 = mat(0x565c64, { roughness: 1 });
  // rocky plating over torso + limbs
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.14, 0.3), 0), i % 2 ? stone : stone2);
    s.position.set(rand(-0.4, 0.4), rand(0.6, 2.1), rand(-0.25, 0.25));
    s.rotation.set(rand(0, 3), rand(0, 3), 0);
    z.add(s);
  }
  // glowing arcane core
  const coreMat = mat(0x3ad0ff, { emissive: 0x2ab8f0, emissiveIntensity: 1.8, roughness: 0.3 });
  const core = sphere(0.2, coreMat); core.position.set(0, 0.14, 0.2); p.torso.add(core);
  const coreLight = new THREE.PointLight(0x3ad0ff, 2.4, 6, 2); coreLight.position.set(0, 1.0, 0.3); z.add(coreLight);
  // stone fists
  for (const side of [p.armL, p.armR]) { const f = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stone); f.position.set(0, -0.7, 0); side.add(f); }
  // jagged shoulder plates
  for (const s of [-1, 1]) { const plate = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 4), stone2); plate.position.set(s * 0.4, 1.95, 0); plate.rotation.x = s * 0.4; z.add(plate); }
  z.userData.boss = 'golem';
  z.userData.parts.coreLight = coreLight;
  return z;
}

function bossRunner() {
  const { z, p } = bossBody(0x2a6a7a, 1.7, 0x1f5a6a);
  z.name = 'boss-runner';
  z.rotation.x = 0.18; // leaning into the sprint
  // speed streaks trailing behind
  const streakMat = mat(0x6ae0ff, { emissive: 0x4ad8ff, emissiveIntensity: 1.4, transparent: true, opacity: 0.7, roughness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const line = box(rand(0.5, 1.1), 0.03, 0.03, streakMat);
    line.position.set(rand(-0.2, 0.2), rand(0.5, 1.8), rand(-0.3, -0.5));
    z.add(line);
  }
  // glowing eyes
  const eyeMat = mat(0x8affff, { emissive: 0x6affff, emissiveIntensity: 2.0 });
  for (const s of [-1, 1]) { const e = sphere(0.04, eyeMat); e.position.set(s * 0.08, 0.04, 0.16); p.head.add(e); }
  // long tail-like trail of energy
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.6, 6), streakMat);
  trail.rotation.x = -Math.PI / 2; trail.position.set(0, 1.1, -1.0); z.add(trail);
  const speedLight = new THREE.PointLight(0x6ae0ff, 2.0, 6, 2); speedLight.position.set(0, 1.1, -0.6); z.add(speedLight);
  z.userData.boss = 'runner';
  z.userData.parts.speedLight = speedLight;
  return z;
}

function bossRegenerator() {
  const { z, p } = bossBody(0x4a7a3a, 2.1, 0x3a6a2e);
  z.name = 'boss-regenerator';
  // pulsing healing core
  const healMat = mat(0x6aff5a, { emissive: 0x5aff4a, emissiveIntensity: 2.0, roughness: 0.4 });
  const core = sphere(0.22, healMat); core.position.set(0, 0.14, 0.2); p.torso.add(core);
  const healLight = new THREE.PointLight(0x6aff5a, 2.6, 7, 2); healLight.position.set(0, 1.1, 0.3); z.add(healLight);
  // scar tissue / regrowth nodes
  const scarMat = mat(0x8ad07a, { emissive: 0x6aff5a, emissiveIntensity: 0.6, roughness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const n = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.07, 0.14), 0), scarMat);
    n.position.set(rand(-0.36, 0.36), rand(0.5, 2.0), rand(-0.22, 0.22));
    z.add(n);
  }
  // regrowth tendrils
  for (let i = 0; i < 4; i++) {
    const tendril = cyl(0.03, 0.05, rand(0.3, 0.6), healMat, 6);
    tendril.position.set(rand(-0.3, 0.3), rand(0.6, 1.6), 0.24);
    tendril.rotation.x = rand(-0.5, 0.5);
    z.add(tendril);
  }
  z.userData.boss = 'regenerator';
  z.userData.parts.healLight = healLight;
  return z;
}

function bossTitan() {
  const { z, p } = bossBody(0x6a5a4a, 3.1, 0x5a4a3a);
  z.name = 'boss-titan';
  const armorMat = mat(0x7a7f88, { metalness: 0.75, roughness: 0.35 });
  // massive layered armor plates
  const plates = [[0.9, 0.5, 1.1], [0.7, 0.4, 0.9], [0.5, 0.3, 0.7]];
  plates.forEach(([sx, sy, sz], i) => {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), armorMat);
    plate.position.set(0, 1.2 + i * 0.45, 0);
    z.add(plate);
  });
  // huge metal gauntlets
  for (const side of [p.armL, p.armR]) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), armorMat); g.position.set(0, -0.7, 0); side.add(g); }
  // crown of spikes
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), armorMat); sp.position.set((i - 2) * 0.12, 0.18, 0); p.head.add(sp); }
  // molten core glow between plates
  const glowMat = mat(0xff8a2a, { emissive: 0xff7a1a, emissiveIntensity: 1.6, roughness: 0.5 });
  const gap1 = box(0.72, 0.06, 0.92, glowMat); gap1.position.set(0, 1.42, 0); z.add(gap1);
  const gap2 = box(0.52, 0.06, 0.72, glowMat); gap2.position.set(0, 1.87, 0); z.add(gap2);
  const titanLight = new THREE.PointLight(0xff8a2a, 3.0, 9, 2); titanLight.position.set(0, 1.5, 0.5); z.add(titanLight);
  z.userData.boss = 'titan';
  z.userData.parts.titanLight = titanLight;
  return z;
}

function bossWraith() {
  const { z, p } = bossBody(0x6a4a9a, 2.0, 0x5a3a8a);
  z.name = 'boss-wraith';
  z.traverse((o) => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.72; } });
  // wispy spectral tendrils
  const wispMat = mat(0xa07aff, { emissive: 0x8a5aff, emissiveIntensity: 1.4, transparent: true, opacity: 0.6, roughness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(rand(0.08, 0.16), rand(0.5, 1.2), 5), wispMat);
    w.position.set(rand(-0.4, 0.4), rand(-0.2, 0.4), rand(-0.3, 0.3));
    w.rotation.x = Math.PI + rand(-0.4, 0.4);
    z.add(w);
  }
  // ghostly hollow eyes
  const eyeMat = mat(0xd0a0ff, { emissive: 0xb06aff, emissiveIntensity: 2.4 });
  for (const s of [-1, 1]) { const e = sphere(0.05, eyeMat); e.position.set(s * 0.09, 0.04, 0.16); p.head.add(e); }
  // spectral aura
  const auraLight = new THREE.PointLight(0xa07aff, 2.6, 7, 2); auraLight.position.set(0, 1.2, 0.3); z.add(auraLight);
  // floating orb of soul energy
  const soul = sphere(0.14, mat(0xc09aff, { emissive: 0xa07aff, emissiveIntensity: 2.0 })); soul.position.set(0, 0.14, 0.22); p.torso.add(soul);
  z.userData.boss = 'wraith';
  z.userData.parts.auraLight = auraLight;
  return z;
}

export function createBossModel(key = 'brute') {
  switch (key) {
    case 'stalker':   return bossStalker();
    case 'frostking': return bossFrostKing();
    case 'pyrolord':  return bossPyroLord();
    case 'abomination': return bossAbomination();
    case 'golem':      return bossGolem();
    case 'runner':     return bossRunner();
    case 'regenerator': return bossRegenerator();
    case 'titan':      return bossTitan();
    case 'wraith':     return bossWraith();
    default:          return bossBrute();
  }
}

function bossBrute() {
  const { z, p } = bossBody(0x6a4a3a, 2.1, 0x4a3830);
  z.name = 'boss-brute';
  const armorMat = mat(0x4a5258, { metalness: 0.7, roughness: 0.35 });
  for (const side of [p.armL, p.armR]) {
    const pad = box(0.3, 0.14, 0.28, armorMat);
    pad.position.y = -0.1;
    side.add(pad);
    const fist = sphere(0.16, mat(0x5a4638, { roughness: 1 }));
    fist.position.y = -0.62;
    side.add(fist);
  }
  const plate = box(0.85, 0.5, 0.1, armorMat);
  plate.position.set(0, 0.1, 0.22);
  p.torso.add(plate);
  const headPlate = box(0.44, 0.1, 0.4, armorMat);
  headPlate.position.y = 0.12;
  p.head.add(headPlate);

  z.userData.boss = 'brute';
  return z;
}

function bossStalker() {
  const { z, p } = bossBody(0x2a3038, 1.7, 0x1a1e24);
  z.name = 'boss-stalker';
  z.scale.x *= 0.85;
  const cloakMat = mat(0x14181e, { roughness: 0.9, transparent: true, opacity: 0.85 });
  const cloak = box(0.7, 0.9, 0.42, cloakMat);
  cloak.position.set(0, -0.05, -0.02);
  p.torso.add(cloak);
  const hood = sphere(0.24, cloakMat);
  hood.position.y = 0.08;
  hood.scale.set(1.15, 1.25, 1.1);
  p.head.add(hood);
  const eyeMat = mat(0x000000, { emissive: 0x4affc8, emissiveIntensity: 2.4 });
  for (const s of [-1, 1]) {
    const eye = sphere(0.045, eyeMat);
    eye.position.set(s * 0.07, 0.03, 0.19);
    p.head.add(eye);
  }
  const blades = mat(0x9aa4ad, { metalness: 0.85, roughness: 0.2 });
  for (const side of [p.armL, p.armR]) {
    const blade = box(0.04, 0.5, 0.14, blades);
    blade.position.set(0, -0.62, 0.06);
    side.add(blade);
  }
  z.userData.boss = 'stalker';
  return z;
}

function bossFrostKing() {
  const { z, p } = bossBody(0x9ac4e8, 1.9, 0x5a7a9a);
  z.name = 'boss-frostking';
  const iceMat = mat(0xcfe8ff, {
    emissive: 0x6ab0ff, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.75, roughness: 0.12, metalness: 0.45,
  });
  const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), mat(0x8ac4ff, {
    emissive: 0x4a9aff, emissiveIntensity: 0.6, transparent: true, opacity: 0.16, roughness: 0.1,
  }));
  aura.position.y = 0.95;
  aura.name = 'aura';
  z.add(aura);
  const crown = cyl(0.16, 0.2, 0.16, mat(0xd8c060, { metalness: 0.85, roughness: 0.25 }), 8);
  crown.position.y = 0.26;
  p.head.add(crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), crown.material);
    tip.position.set(Math.cos(a) * 0.17, 0.36, Math.sin(a) * 0.17);
    p.head.add(tip);
  }
  for (const side of [p.armL, p.armR]) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), iceMat);
    shard.position.set(0, -0.62, 0);
    shard.rotation.x = Math.PI;
    side.add(shard);
  }
  const shoulderShards = new THREE.Group();
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), iceMat);
    sh.position.set(s * 0.38, 0.55, 0);
    sh.rotation.z = s * -0.5;
    shoulderShards.add(sh);
  }
  z.add(shoulderShards);
  const iceLight = new THREE.PointLight(0x66bbff, 3, 6, 2);
  iceLight.position.y = 1.2;
  z.add(iceLight);

  z.userData.boss = 'frostking';
  z.userData.parts.aura = aura;
  return z;
}

function bossPyroLord() {
  const { z, p } = bossBody(0x3a2a24, 1.95, 0x2a1f1a);
  z.name = 'boss-pyrolord';
  const fireMat = mat(0xff5a1a, { emissive: 0xff6a20, emissiveIntensity: 1.6, roughness: 0.6 });
  const core = sphere(0.2, fireMat);
  core.position.set(0, 0.12, 0.18);
  p.torso.add(core);
  for (let i = 0; i < 8; i++) {
    const ember = new THREE.Mesh(new THREE.ConeGeometry(0.05, rand(0.14, 0.3), 4), fireMat);
    ember.position.set(rand(-0.3, 0.3), rand(0.25, 0.6), rand(-0.16, 0.16));
    z.add(ember);
  }
  const hornMat = mat(0x241a14, { roughness: 0.8 });
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), hornMat);
    horn.position.set(s * 0.16, 0.22, 0);
    horn.rotation.z = s * -0.6;
    p.head.add(horn);
  }
  const fireLight = new THREE.PointLight(0xff5a1a, 3.2, 6, 2);
  fireLight.position.set(0, 1.1, 0.3);
  z.add(fireLight);
  const handFireL = sphere(0.1, fireMat);
  handFireL.position.set(0, -0.36, 0);
  p.elbowL.add(handFireL);
  const handFireR = handFireL.clone();
  p.elbowR.add(handFireR);

  z.userData.boss = 'pyrolord';
  z.userData.parts.fireLight = fireLight;
  z.userData.parts.handFireL = handFireL;
  z.userData.parts.handFireR = handFireR;
  return z;
}

function bossAbomination() {
  const { z, p } = bossBody(0x4a5a3a, 2.3, 0x3a4430);
  z.name = 'boss-abomination';
  z.rotation.x = 0.12;
  const growthMat = mat(0x5a6a44, { roughness: 1 });
  const growthMat2 = mat(0x6a7a50, { roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.09, 0.2), 0), i % 2 ? growthMat : growthMat2);
    g.position.set(rand(-0.34, 0.34), rand(0.85, 1.9), rand(-0.2, 0.2));
    g.rotation.set(rand(0, 3), rand(0, 3), 0);
    z.add(g);
  }
  const jaw = box(0.3, 0.12, 0.2, growthMat);
  jaw.position.set(0, -0.2, 0.12);
  p.head.add(jaw);
  for (const s of [-1, 1]) {
    const maw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mat(0xd8d0c0, { roughness: 0.6 }));
    maw.position.set(s * 0.09, -0.14, 0.18);
    maw.rotation.x = Math.PI;
    p.head.add(maw);
  }
  for (const side of [p.armL, p.armR]) {
    const club = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), growthMat);
    club.position.set(0, -0.66, 0);
    side.add(club);
  }
  const bileLight = new THREE.PointLight(0x9aff4a, 1.8, 5, 2);
  bileLight.position.set(0, 1.2, 0.3);
  z.add(bileLight);

  z.userData.boss = 'abomination';
  z.userData.parts.bileLight = bileLight;
  return z;
}

// ---------------------------------------------------------------------------
// PROPS (non-interactive scenery)
// ---------------------------------------------------------------------------

function propSkull() { // crâne de zombie au sol (détail macabre)
  const g = new THREE.Group();
  const bone = mat(0xd8d2c4, { roughness: 0.85 });
  const dark = mat(0x1c1a16, { roughness: 1 });
  const head = sphere(0.24, bone); head.position.y = 0.24; g.add(head);
  const jaw = box(0.26, 0.12, 0.3, bone); jaw.position.set(0, 0.08, 0.04); g.add(jaw);
  for (const s of [-1, 1]) {
    const e = sphere(0.07, dark, 8, 6); e.position.set(s * 0.09, 0.28, 0.18); g.add(e);
  }
  const nose = box(0.05, 0.07, 0.05, dark); nose.position.set(0, 0.2, 0.22); g.add(nose);
  return g;
}

function propDeadTree() { // arbre mort noueux (squelette de branches)
  const g = new THREE.Group();
  const bark = mat(0x4a4038, { roughness: 1 });
  const trunk = cyl(0.08, 0.2, 2.4, bark, 7); trunk.position.y = 1.2; trunk.rotation.z = 0.08; g.add(trunk);
  const brs = [[0.5, 1.7, 0.5, 0.9], [2.6, 1.4, -0.4, -1.1], [4.4, 2.0, 0.7, 0.7], [1.7, 2.15, -0.8, 1.3]];
  for (const [a, y, rx, rz] of brs) {
    const b = cyl(0.02, 0.06, rand(0.8, 1.4), bark, 5);
    b.position.set(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3);
    b.rotation.set(rx, a, rz);
    g.add(b);
  }
  return g;
}

function propBarrel() { // baril rouillé à bandes de fer
  const g = new THREE.Group();
  const rust = mat(0x7a4a2a, { metalness: 0.55, roughness: 0.75 });
  const band = mat(0x3a342c, { metalness: 0.7, roughness: 0.5 });
  const body = cyl(0.26, 0.3, 0.72, rust, 10); body.position.y = 0.36; g.add(body);
  for (const y of [0.16, 0.58]) {
    const b = cyl(0.285, 0.285, 0.07, band, 10); b.position.y = y; g.add(b);
  }
  const lid = cyl(0.27, 0.27, 0.05, band, 10); lid.position.y = 0.73; g.add(lid);
  return g;
}

export function createProp(kind = 'tree') {
  switch (kind) {
    case 'rock':     return propRock();
    case 'bush':     return propBush();
    case 'grass':    return propGrass();
    case 'flower':   return propFlower();
    case 'stump':    return propStump();
    case 'log':      return propLog();
    case 'crate':    return propCrate();
    case 'cart':     return propCart();
    case 'well':     return propWell();
    case 'hedge':    return propHedge();
    case 'mushroom': return propMushroom();
    case 'snowpile': return propSnowPile();
    case 'rockspire':return propRockSpire();
    case 'lavapool': return propLavaPool();
    case 'cinder':   return propCinder();
    case 'tombstone': return propTombstone();
    case 'lamp':     return propLamp();
    case 'fence':    return propFence();
    case 'sign':     return propSign();
    case 'reactor':  return propReactor();
    case 'rbarrel':  return propRBarrel();
    case 'hstripes': return propHStripes();
    case 'radplant': return propRadPlant();
    case 'boulder':  return propBoulder();
    case 'reeds':    return propReeds();
    case 'skull':    return propSkull();
    case 'deadtree': return propDeadTree();
    case 'barrel':   return propBarrel();
    default:         return propTree();
  }
}

// --- Zone radioactive --------------------------------------------------
function propReactor() { // dôme de confinement fêlé + trèfle radioactif pulsant
  const model = new THREE.Group(); model.name = 'prop-reactor';
  const concrete = mat(0x8a917e, { roughness: 0.95 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), concrete);
  dome.scale.y = 0.78; dome.castShadow = true; model.add(dome);
  const baseC = cyl(1.65, 1.75, 0.34, mat(0x6e7466, { roughness: 1 }), 20); baseC.position.y = 0.17; model.add(baseC);
  // fente de lumière radioactive traversant le dôme
  const crackM = mat(0xc8ff8a, { emissive: 0x9dff4d, emissiveIntensity: 1.4 });
  const crack = box(0.06, 0.95, 0.5, crackM); model.add(crack);
  crack.position.set(0.34, 0.78, 0.82); crack.rotation.y = -0.5; crack.rotation.x = 0.45;
  // poteau + disque trèfle (jaune/noir)
  const postM = mat(0x747a70, { roughness: 1 });
  const post = cyl(0.06, 0.08, 1.5, postM, 6); post.position.set(-2.15, 0.75, 0.95); model.add(post);
  const discM = mat(0xd8cf5a, { emissive: 0xb8a62a, emissiveIntensity: 0.7 });
  const disc = cyl(0.34, 0.34, 0.05, discM, 20); disc.position.y = 1.5; disc.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const wedgeM = mat(0x1c1a10);
    const wedgeGeo = new THREE.CircleGeometry(0.26, 12, i * ((Math.PI * 2) / 3 + 0.5), (Math.PI * 2) / 3 - 0.5);
    const wedge = new THREE.Mesh(wedgeGeo, wedgeM); wedge.position.z = 0.03; disc.add(wedge);
  }
  post.add(disc);
  // halo au sol
  const glowMat = mat(0x8dff5a, { emissive: 0x6dff2e, emissiveIntensity: 1.1 });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(rand(0.4, 0.9), 0.025, 6, 24), glowMat);
    g.rotation.x = -Math.PI / 2; g.position.y = rand(0.38, 1.0); model.add(g);
  }
  return model;
}

function propRBarrel() { // baril de déchets verts, luisant à travers les bandes
  const model = new THREE.Group(); model.name = 'prop-rbarrel';
  const body = cyl(0.32, 0.34, 0.95, mat(0x6d8a3c, { roughness: 0.5, metalness: 0.3 }), 14);
  body.position.y = 0.475; body.castShadow = true; model.add(body);
  const rimMat = mat(0xaab76e, { metalness: 0.5, roughness: 0.4 });
  for (const y of [0.18, 0.72]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 16), rimMat);
    r.rotation.x = Math.PI / 2; r.position.y = y; model.add(r);
  }
  // bandes de danger + symbole
  const stripeM = mat(0xd8d050, { emissive: 0xb0a41c, emissiveIntensity: 0.6 });
  for (let i = 0; i < 3; i++) {
    const s = box(0.52, 0.05, 0.06, stripeM);
    s.rotation.y = Math.PI / 2 + i * 1.1; s.position.y = 0.47; model.add(s);
  }
  const glowDot = sphere(0.07, mat(0xbfff6a, { emissive: 0x8dff2e, emissiveIntensity: 1.6 }), 10, 8); // capot qui suinte
  glowDot.position.y = 0.98; model.add(glowDot);
  model.rotation.z = rand(-0.12, 0.12);
  return model;
}

function propHStripes() { // plot de sol jaune/noir rayé (marquage danger)
  const model = new THREE.Group(); model.name = 'prop-hstripes';
  const baseS = box(1.6, 0.05, 1.2, mat(0x3a4034, { roughness: 1 })); baseS.position.y = 0.03; model.add(baseS);
  const yellow = mat(0xd8c832, { roughness: 0.7 }); const black = mat(0x1e221a, { roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 1.1), i % 2 ? black : yellow);
    stripe.position.set(-0.64 + i * 0.32, 0.05, 0); model.add(stripe);
  }
  return model;
}

function propRadPlant() { // grappes de champignons/branches bioluminescents malades
  const model = new THREE.Group(); model.name = 'prop-radplant';
  const stemM = mat(0x4a6b38, { roughness: 0.9 }); const glowM = mat(0xa5ff70, { emissive: 0x7dff3d, emissiveIntensity: 1.8 });
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const h = rand(0.4, 0.9); const a = rand(0, Math.PI * 2);
    const st = cyl(0.035, 0.06, h, stemM, 6); st.position.set(Math.cos(a) * rand(0, 0.3), h / 2, Math.sin(a) * rand(0, 0.3));
    st.rotation.x = rand(-0.18, 0.18); st.rotation.z = rand(0.18, -0.18);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(rand(0.09, 0.16), 10, 8), glowM); cap.position.y = h + 0.05; st.add(cap);
    model.add(st);
  }
  return model;
}

function propBoulder() { // amas de roche noire (ashlands) — plus massif que propRock
  const model = new THREE.Group(); model.name = 'prop-boulder';
  const st = mat(0x3f3a34, { roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const r = rand(0.25, 0.6); let b;
    if (_geoCache.has('icos' + r)) b = _geoCache.get('icos' + r);
    else { b = new THREE.IcosahedronGeometry(r, 0); _geoCache.set('icos' + r, b); }
    const m = new THREE.Mesh(b, st); m.position.set(rand(-0.6, 0.6), rand(0.15, 0.35), rand(-0.4, 0.4));
    m.rotation.set(rand(0, 3), rand(0, 3), 0); m.scale.y = rand(0.7, 0.9); m.castShadow = true; model.add(m);
  }
  return model;
}

function propReeds() { // roseaux penchés de la zone marécageuse/spéctrale
  const model = new THREE.Group(); model.name = 'prop-reeds';
  const m = mat(0x5a7a6e, { roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const h = rand(0.7, 1.3); const s = cyl(0.025, 0.05, h, m, 5);
    s.position.set(rand(-0.25, 0.25), h / 2, rand(-0.2, 0.2));
    s.rotation.x = (Math.random() - 0.5) * 0.4; s.rotation.z = (Math.random() - 0.5) * 0.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), m); tip.position.y = h / 2 + 0.09; s.add(tip);
    model.add(s);
  }
  return model;
}

function propTree() {
  const model = new THREE.Group();
  model.name = 'prop-tree';
  const trunk = cyl(0.14, 0.22, 1.6, mat(0x5a4232, { roughness: 1 }), 8);
  trunk.position.y = 0.8;
  model.add(trunk);
  const foliageMat = mat(0x3a5a34, { roughness: 1 });
  const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), foliageMat);
  f1.position.y = 2.1;
  f1.castShadow = true;
  model.add(f1);
  const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), foliageMat);
  f2.position.set(0.45, 1.75, 0.2);
  f2.castShadow = true;
  model.add(f2);
  const f3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), foliageMat);
  f3.position.set(-0.4, 1.6, -0.25);
  f3.castShadow = true;
  model.add(f3);
  model.scale.setScalar(rand(0.8, 1.3));
  model.rotation.y = rand(0, Math.PI * 2);
  return model;
}

function propRock() {
  const model = new THREE.Group();
  model.name = 'prop-rock';
  const rockMat = mat(0x6a6f72, { roughness: 1 });
  const r1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat);
  r1.position.y = 0.3;
  r1.castShadow = true;
  model.add(r1);
  const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), rockMat);
  r2.position.set(0.5, 0.18, 0.2);
  r2.castShadow = true;
  model.add(r2);
  model.scale.setScalar(rand(0.7, 1.4));
  return model;
}

function propBush() {
  const model = new THREE.Group();
  model.name = 'prop-bush';
  const bushMat = mat(0x446a3a, { roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.22, 0.36), 0), bushMat);
    s.position.set(rand(-0.3, 0.3), 0.25, rand(-0.2, 0.2));
    s.castShadow = true;
    model.add(s);
  }
  model.scale.setScalar(rand(0.8, 1.2));
  return model;
}

function propGrass() {
  // Small tuft of grass blades — cheap, scattered densely for detail.
  const model = new THREE.Group();
  model.name = 'prop-grass';
  const greens = [0x4f7a3a, 0x5c8a42, 0x6a9a4e];
  const c = greens[Math.floor(Math.random() * greens.length)];
  const grassMat = mat(c, { roughness: 1 });
  const n = 6 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) {
    const h = rand(0.26, 0.5);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.014, h, 4, 1), grassMat);
    const a = rand(0, Math.PI * 2);
    const r = rand(0, 0.12);
    blade.position.set(Math.cos(a) * r, h / 2 - 0.02, Math.sin(a) * r);
    blade.rotation.set(rand(-0.28, 0.28), a, rand(-0.28, 0.28));
    model.add(blade);
  }
  model.scale.setScalar(rand(0.8, 1.3));
  return model;
}

function propFlower() {
  // Little flower: thin stem + small colored head.
  const model = new THREE.Group();
  model.name = 'prop-flower';
  const stem = cyl(0.012, 0.016, 0.3, mat(0x3a5a2a, { roughness: 1 }));
  stem.position.y = 0.15;
  model.add(stem);
  const colors = [0xd85a6a, 0xe8c84a, 0xc86ad8, 0xe88a4a, 0xd8e8f8, 0xe86a9a];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const head = sphere(0.06, mat(c, { emissive: c, emissiveIntensity: 0.2, roughness: 0.6 }));
  head.position.y = 0.32;
  model.add(head);
  model.scale.setScalar(rand(0.85, 1.1));
  return model;
}

// --- additional scenery / detail props --------------------------------------

function propStump() {
  const model = new THREE.Group();
  model.name = 'prop-stump';
  const wood = mat(0x5a4433, { roughness: 1 });
  const base = cyl(0.3, 0.36, 0.5, wood, 10); base.position.y = 0.25; model.add(base);
  const top = cyl(0.32, 0.3, 0.06, mat(0x8a6f52, { roughness: 0.9 }), 10); top.position.y = 0.52; model.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 14), wood); ring.rotation.x = Math.PI / 2; ring.position.y = 0.55; model.add(ring);
  const crack = box(0.02, 0.5, 0.06, mat(0x3a2a1e)); crack.position.set(0.28, 0.28, 0); model.add(crack);
  return model;
}

function propLog() {
  const model = new THREE.Group();
  model.name = 'prop-log';
  const wood = mat(0x5f4a36, { roughness: 1 });
  const log = cyl(0.22, 0.22, 1.4, wood, 10);
  log.rotation.z = Math.PI / 2; log.position.y = 0.22; model.add(log);
  const endMat = mat(0x8a6f52, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    const end = cyl(0.2, 0.2, 0.04, endMat, 10); end.rotation.z = Math.PI / 2; end.position.set(s * 0.7, 0.22, 0); model.add(end);
  }
  model.rotation.y = rand(0, Math.PI * 2);
  model.scale.setScalar(rand(0.8, 1.15));
  return model;
}

function propCrate() {
  const model = new THREE.Group();
  model.name = 'prop-crate';
  const wood = mat(0x6a523a, { roughness: 1 });
  const c = box(0.7, 0.7, 0.7, wood); c.position.y = 0.35; model.add(c);
  const bandMat = mat(0x3a322a, { roughness: 0.9 });
  for (const s of [-0.35, 0.35]) {
    const b = box(0.72, 0.08, 0.02, bandMat); b.position.set(0, 0.35, s); model.add(b);
    const v = box(0.02, 0.72, 0.72, bandMat); v.position.set(s, 0.35, 0); model.add(v);
  }
  model.scale.setScalar(rand(0.8, 1.1));
  model.rotation.y = rand(0, Math.PI * 2);
  return model;
}

function propCart() {
  const model = new THREE.Group();
  model.name = 'prop-cart';
  const wood = mat(0x5f4a36, { roughness: 1 });
  const metal = mat(0x3a3f45, { metalness: 0.7, roughness: 0.4 });
  const bed = box(1.1, 0.12, 0.7, wood); bed.position.y = 0.5; model.add(bed);
  for (const [sx, sz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) {
    const leg = box(0.08, 0.5, 0.08, wood); leg.position.set(sx, 0.25, sz); model.add(leg);
  }
  const rail = box(1.1, 0.18, 0.06, wood); rail.position.set(0, 0.62, -0.32); model.add(rail);
  const rail2 = box(1.1, 0.18, 0.06, wood); rail2.position.set(0, 0.62, 0.32); model.add(rail2);
  for (const [sx, sz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 14), metal); w.rotation.y = Math.PI / 2; w.position.set(sx, 0.18, sz); model.add(w);
  }
  model.rotation.y = rand(0, Math.PI * 2);
  return model;
}

function propWell() {
  const model = new THREE.Group();
  model.name = 'prop-well';
  const stone = mat(0x7a7f83, { roughness: 0.95 });
  const wood = mat(0x5a4433, { roughness: 1 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 10, 18), stone); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; model.add(ring);
  const wall = cyl(0.6, 0.62, 0.3, stone, 14); wall.position.y = 0.18; model.add(wall);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), mat(0x2a4a6a, { emissive: 0x1a3a5a, emissiveIntensity: 0.4 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.35; model.add(water);
  for (const s of [-1, 1]) { const post = cyl(0.06, 0.06, 1.3, wood, 8); post.position.set(s * 0.62, 1.0, 0); model.add(post); }
  const roof = box(1.7, 0.1, 1.0, mat(0x5a3a34)); roof.position.y = 1.75; roof.rotation.x = 0.5; model.add(roof);
  const bar = cyl(0.04, 0.04, 1.2, wood, 8); bar.rotation.z = Math.PI / 2; bar.position.y = 1.1; model.add(bar);
  const bucket = cyl(0.1, 0.08, 0.14, mat(0x4a3a2a), 10); bucket.position.set(0, 0.95, 0); model.add(bucket);
  return model;
}

function propHedge() {
  const model = new THREE.Group();
  model.name = 'prop-hedge';
  const g = mat(0x3a5a30, { roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.28, 0.4), 0), g);
    s.position.set((i - 2.5) * 0.5, 0.28, rand(-0.15, 0.15)); s.castShadow = true; model.add(s);
  }
  model.scale.setScalar(rand(0.8, 1.1));
  return model;
}

function propMushroom() {
  const model = new THREE.Group();
  model.name = 'prop-mushroom';
  for (let i = 0; i < 3; i++) {
    const x = rand(-0.2, 0.2), z = rand(-0.15, 0.15);
    const stem = cyl(0.03, 0.04, 0.18, mat(0xd8d0c0, { roughness: 0.8 }), 6); stem.position.set(x, 0.09, z); model.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xb04a3a, { roughness: 0.7 }));
    cap.position.set(x, 0.18, z); model.add(cap);
    for (let d = 0; d < 3; d++) { const spot = sphere(0.018, mat(0xe8e0d0)); spot.position.set(x + rand(-0.05, 0.05), 0.2, z + rand(-0.05, 0.05)); model.add(spot); }
  }
  return model;
}

function propSnowPile() {
  const model = new THREE.Group();
  model.name = 'prop-snowpile';
  const s = mat(0xf0f6fc, { roughness: 0.6, emissive: 0x2a3a4a, emissiveIntensity: 0.15 });
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.4, 0.7), 0), s);
    blob.position.set(rand(-0.3, 0.3), rand(0.2, 0.4), rand(-0.2, 0.2)); blob.castShadow = true; model.add(blob);
  }
  return model;
}

function propRockSpire() {
  // jagged volcanic rock formation
  const model = new THREE.Group();
  model.name = 'prop-rockspire';
  const rockMat = mat(0x3a2a26, { roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const h = rand(0.8, 2.2);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(rand(0.25, 0.5), h, 5, 1), rockMat);
    spike.position.set(rand(-0.5, 0.5), h / 2, rand(-0.4, 0.4));
    spike.rotation.set(rand(-0.2, 0.2), rand(0, Math.PI * 2), rand(-0.2, 0.2));
    spike.castShadow = true; model.add(spike);
  }
  // glowing cracks
  for (let i = 0; i < 2; i++) {
    const crack = box(0.03, rand(0.4, 0.8), 0.03, mat(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 1.2 }));
    crack.position.set(rand(-0.4, 0.4), rand(0.3, 0.8), rand(-0.3, 0.3)); model.add(crack);
  }
  model.scale.setScalar(rand(0.8, 1.3));
  return model;
}

function propLavaPool() {
  const model = new THREE.Group();
  model.name = 'prop-lavapool';
  const rim = mat(0x2a1a16, { roughness: 1 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 18), mat(0xff5a1a, { emissive: 0xff4a10, emissiveIntensity: 1.6, roughness: 0.4 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; model.add(pool);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.12, 0.2), 0), rim);
    rock.position.set(Math.cos(a) * 0.72, 0.1, Math.sin(a) * 0.72); model.add(rock);
  }
  const glow = new THREE.PointLight(0xff5a1a, 1.5, 5, 2); glow.position.y = 0.4; model.add(glow);
  model.userData.lavaPool = true;
  return model;
}

function propCinder() {
  const model = new THREE.Group();
  model.name = 'prop-cinder';
  const ash = mat(0x4a3a32, { roughness: 1 });
  const blob = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.2, 0.4), 0), ash); blob.position.y = 0.15; blob.castShadow = true; model.add(blob);
  const ember = sphere(0.05, mat(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 1.4 })); ember.position.set(0.1, 0.3, 0.05); model.add(ember);
  model.scale.setScalar(rand(0.7, 1.2));
  return model;
}

// A large, beautiful volcano — centerpiece of the volcanic map.
// Returns a Group with a lava-lit crater + strata bands.
export function createVolcano(scale = 1) {
  const model = new THREE.Group();
  model.name = 'volcano';

  const H = 15, R = 10;
  // Jagged, rugged cone: displace the radial vertices for a rocky silhouette.
  const coneGeo = new THREE.ConeGeometry(R, H, 28, 6);
  {
    const p = coneGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.01) {
        const ang = Math.atan2(z, x);
        // height-based pinch (taper) + angular rocky bumps
        const jitter = 1 + 0.10 * Math.sin(ang * 5 + r) + 0.06 * Math.sin(ang * 11);
        const t = (y + H / 2) / H;            // 0 at base -> 1 at tip
        const taper = 1 - t * 0.06;            // slightly narrower toward tip
        const rr = r * jitter * taper;
        const nx = (x / r) * rr, nz = (z / r) * rr;
        // add a little vertical roughness on the body
        const ny = y + 0.25 * Math.sin(ang * 7 + r * 2) * (1 - t);
        p.setXYZ(i, nx, ny, nz);
      }
    }
    coneGeo.computeVertexNormals();
  }
  const bodyMat = mat(0x3a2a24, { roughness: 1 });
  const cone = new THREE.Mesh(coneGeo, bodyMat);
  cone.position.y = H / 2; cone.castShadow = true; cone.receiveShadow = true; model.add(cone);

  // Scattered strata / erosion bands (rugged torus rings)
  const strataMat = mat(0x2a1e1a, { roughness: 1 });
  const bands = [0.32, 0.26, 0.2, 0.16, 0.12];
  const bandY = [2.2, 5.2, 8.0, 10.4, 12.2];
  bandY.forEach((y, i) => {
    const rr = R * (1 - (y / H)) * 1.02;
    const band = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.3, rr), bands[i] ?? 0.2, 6, 26), strataMat);
    band.rotation.x = Math.PI / 2; band.position.y = y;
    band.rotation.z = 0.15 + i * 0.2;
    band.castShadow = true; model.add(band);
  });

  // Crater rim (thick, lumpy)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.75, 10, 26), mat(0x2a1e1a));
  rim.rotation.x = Math.PI / 2; rim.position.y = H - 0.6; model.add(rim);
  // inner crater wall (dark bowl)
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.2, 1.4, 20, 1, true), mat(0x1a1210, { side: THREE.DoubleSide, roughness: 1 }));
  bowl.position.y = H - 1.0; model.add(bowl);

  // Glowing lava lake in the crater
  const lava = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), mat(0xff5a1a, { emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: 0.3 }));
  lava.rotation.x = -Math.PI / 2; lava.position.y = H - 1.0; model.add(lava);
  // bright hot core in the middle of the lake
  const core = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18), mat(0xffb347, { emissive: 0xff8a2a, emissiveIntensity: 2.6, roughness: 0.2 }));
  core.rotation.x = -Math.PI / 2; core.position.y = H - 0.98; model.add(core);

  // Lava glow light (stronger, warm)
  const glow = new THREE.PointLight(0xff5a1a, 4.5, 30, 2); glow.position.set(0, H + 0.5, 0); model.add(glow);
  const glow2 = new THREE.PointLight(0xff8a2a, 2.0, 14, 2); glow2.position.set(0, H - 1, 0); model.add(glow2);

  // Lava streaks flowing down the slopes (several, varied lengths/angles)
  const streakMat = mat(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 1.4 });
  const nStreak = 7;
  for (let i = 0; i < nStreak; i++) {
    const a = (i / nStreak) * Math.PI * 2 + 0.4;
    const yTop = H - 1.4 - (i % 3) * 0.8;
    const len = 2.4 + (i % 4) * 0.7;
    const rr = R * (1 - (yTop / H));
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.55, len), streakMat);
    streak.position.set(Math.cos(a) * (rr + 0.05), yTop - len / 2, Math.sin(a) * (rr + 0.05));
    streak.lookAt(0, yTop, 0);
    streak.rotation.z = (a - Math.PI / 2) * 0.15;
    streak.castShadow = false; model.add(streak);
  }

  // Rocky debris / boulders scattered around the base
  const rockMat = mat(0x2a1e1a, { roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3;
    const rr = R + rand(0.6, 3.2);
    const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.4, 1.3), 0), rockMat);
    boulder.position.set(Math.cos(a) * rr, 0.2, Math.sin(a) * rr);
    boulder.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    boulder.scale.y = rand(0.5, 0.8);
    boulder.castShadow = true; boulder.receiveShadow = true; model.add(boulder);
  }
  // dark scorched ground ring at the base
  const scorched = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R + 3.5, 32), mat(0x1a1210, { roughness: 1 }));
  scorched.rotation.x = -Math.PI / 2; scorched.position.y = 0.03; model.add(scorched);

  // faint ember particles rising from the crater
  const emberMat = mat(0xff8a2a, { emissive: 0xff6a2a, emissiveIntensity: 1.6 });
  for (let i = 0; i < 10; i++) {
    const e = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.05, 0.12), 0), emberMat);
    const a = rand(0, Math.PI * 2);
    e.position.set(Math.cos(a) * rand(0.4, 1.6), H + rand(0.2, 2.5), Math.sin(a) * rand(0.4, 1.6));
    model.add(e);
  }

  model.scale.setScalar(scale);
  model.userData.volcano = true;
  model.userData.lava = lava;
  model.userData.glow = glow;
  return model;
}

function propTombstone() {
  const model = new THREE.Group();
  model.name = 'prop-tombstone';
  const stoneMat = mat(0x7a7f83, { roughness: 0.95 });
  // soil mound at the base
  const mound = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.18, 12), mat(0x4a4438, { roughness: 1 }));
  mound.position.y = 0.09; mound.castShadow = true; model.add(mound);
  // main slab (slightly tilted, weathered)
  const slab = box(0.5, 0.82, 0.16, stoneMat);
  slab.position.y = 0.4;
  slab.rotation.z = rand(-0.04, 0.04);
  model.add(slab);
  // rounded top (half-cylinder)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 12, 1, false, 0, Math.PI), stoneMat);
  top.rotation.z = Math.PI / 2;
  top.rotation.y = Math.PI / 2;
  top.position.y = 0.82;
  model.add(top);
  // engraved cross
  const cross = box(0.06, 0.3, 0.05, mat(0x5a5f63, { roughness: 1 }));
  cross.position.set(0, 0.5, 0.09);
  model.add(cross);
  const cross2 = box(0.2, 0.06, 0.05, mat(0x5a5f63, { roughness: 1 }));
  cross2.position.set(0, 0.56, 0.09);
  model.add(cross2);
  // engraved text lines
  for (let i = 0; i < 3; i++) { const line = box(0.3, 0.02, 0.03, mat(0x6a6f73)); line.position.set(0, 0.32 - i * 0.07, 0.09); model.add(line); }
  // a chipped corner (small missing chunk)
  const chip = box(0.08, 0.1, 0.16, mat(0x5a5f63)); chip.position.set(0.2, 0.78, 0); model.add(chip);
  // moss on top + at base
  const mossMat = mat(0x4a5a3a, { roughness: 1 });
  for (let i = 0; i < 3; i++) { const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.06, 0.1), 0), mossMat); moss.position.set(rand(-0.2, 0.2), 0.06 + i * 0.02, rand(-0.08, 0.08)); model.add(moss); }
  const mossTop = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mossMat); mossTop.position.set(rand(-0.1, 0.1), 0.9, 0); model.add(mossTop);
  // a couple of small weeds
  const weedMat = mat(0x5a7a4a, { roughness: 1 });
  for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.2, 4, 1), weedMat); w.position.set(rand(-0.4, 0.4), 0.1, rand(-0.1, 0.1)); model.add(w); }
  // a smaller broken headstone beside it
  const sideStone = box(0.28, 0.4, 0.1, stoneMat); sideStone.position.set(0.65, 0.2, 0.1); sideStone.rotation.z = 0.12; model.add(sideStone);
  model.scale.setScalar(rand(0.85, 1.15));
  model.rotation.y = rand(-0.3, 0.3);
  return model;
}

function propLamp() {
  const model = new THREE.Group();
  model.name = 'prop-lamp';
  const poleMat = mat(0x33383e, { metalness: 0.7, roughness: 0.4 });
  const pole = cyl(0.04, 0.07, 2.6, poleMat, 8);
  pole.position.y = 1.3;
  model.add(pole);
  const head = sphere(0.16, mat(0xffe9b0, { emissive: 0xffd88a, emissiveIntensity: 1.4 }));
  head.position.y = 2.68;
  model.add(head);
  const light = new THREE.PointLight(0xffd88a, 1.2, 5, 2);
  light.position.y = 2.7;
  model.add(light);
  return model;
}

function propFence() {
  const model = new THREE.Group();
  model.name = 'prop-fence';
  const fenceMat = mat(0x55483a, { roughness: 1 });
  const n = 5;
  const w = 0.28;
  for (let i = 0; i < n; i++) {
    const post = box(0.08, 0.9, 0.08, fenceMat);
    post.position.set((i - (n - 1) / 2) * w, 0.45, 0);
    model.add(post);
  }
  for (const y of [0.35, 0.7]) {
    const rail = box((n - 1) * w + 0.1, 0.05, 0.04, fenceMat);
    rail.position.y = y;
    model.add(rail);
  }
  return model;
}

function propSign() {
  const model = new THREE.Group();
  model.name = 'prop-sign';
  const poleMat = mat(0x4a3a2e, { roughness: 1 });
  // two crossed A-frame posts
  const p1 = cyl(0.045, 0.055, 1.3, poleMat, 8); p1.position.set(-0.12, 0.65, 0); p1.rotation.z = 0.12; model.add(p1);
  const p2 = cyl(0.045, 0.055, 1.3, poleMat, 8); p2.position.set(0.12, 0.65, 0); p2.rotation.z = -0.12; model.add(p2);
  const brace = box(0.4, 0.05, 0.05, poleMat); brace.position.y = 0.9; model.add(brace);
  // main board with painted frame
  const board = box(0.95, 0.5, 0.05, mat(0x6a5a44, { roughness: 1 }));
  board.position.y = 1.18;
  model.add(board);
  const frame = box(0.99, 0.54, 0.03, mat(0x3a3226)); frame.position.y = 1.18; model.add(frame);
  // second lower board
  const board2 = box(0.7, 0.3, 0.04, mat(0x7a6a50, { roughness: 1 }));
  board2.position.set(0.1, 0.72, 0.02);
  model.add(board2);
  // skull emblem + painted stripe + text lines
  const skull = sphere(0.1, mat(0xd8d0c0, { roughness: 0.8 }));
  skull.position.set(-0.25, 1.2, 0.06);
  model.add(skull);
  const eyeL = sphere(0.02, mat(0x2a2a2a)); eyeL.position.set(-0.28, 1.22, 0.14); model.add(eyeL);
  const eyeR = sphere(0.02, mat(0x2a2a2a)); eyeR.position.set(-0.22, 1.22, 0.14); model.add(eyeR);
  const stripe = box(0.5, 0.07, 0.02, mat(0xc8a04a, { roughness: 0.8 }));
  stripe.position.set(0.12, 1.26, 0.06);
  model.add(stripe);
  for (let i = 0; i < 3; i++) { const line = box(0.4, 0.03, 0.02, mat(0x8a7a5a)); line.position.set(0.14, 1.1 - i * 0.08, 0.06); model.add(line); }
  // nail heads
  for (const [nx, ny] of [[-0.4, 1.35], [0.4, 1.35], [-0.4, 1.05], [0.4, 1.05]]) {
    const nail = sphere(0.018, mat(0x8a8a8a, { metalness: 0.8, roughness: 0.3 })); nail.position.set(nx, ny, 0.07); model.add(nail);
  }
  model.rotation.y = rand(-0.3, 0.3);
  return model;
}

// ---------------------------------------------------------------------------
// PROJECTILES & EXPLOSIONS
// ---------------------------------------------------------------------------

export function createProjectileModel(kind = 'bullet') {
  const model = new THREE.Group();
  switch (kind) {
    case 'tracer': {
      model.name = 'proj-tracer';
      const line = box(0.04, 0.04, 1.6, mat(0xffe9a0, { emissive: 0xffd040, emissiveIntensity: 2, transparent: true, opacity: 0.9 }));
      model.add(line);
      break;
    }
    case 'shell': {
      model.name = 'proj-shell';
      const body = sphere(0.14, mat(0x3a4034, { metalness: 0.6, roughness: 0.4 }), 10, 8);
      model.add(body);
      const finMat = mat(0x555c50, { metalness: 0.5 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const fin = box(0.04, 0.18, 0.06, finMat);
        fin.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
        fin.rotation.y = -a;
        model.add(fin);
      }
      break;
    }
    case 'frost': {
      model.name = 'proj-frost';
      const core = sphere(0.1, mat(0xcfeaff, { emissive: 0x66d4ff, emissiveIntensity: 2.4 }), 12, 10);
      model.add(core);
      // small icy trail
      const tail = cyl(0.03, 0.05, 0.34, mat(0x8fd8ff, { transparent: true, opacity: 0.45, emissive: 0x40b0ff, emissiveIntensity: 1.2 }), 8);
      tail.rotation.x = Math.PI / 2;
      tail.position.z = -0.22;
      model.add(tail);
      // no point light per projectile (per-fragment light cost causes fire hitches);
      // the emissive core + tail reads as a glow instead.
      break;
    }
    case 'fireball': {
      model.name = 'proj-fireball';
      const core = sphere(0.16, mat(0xff8a2a, { emissive: 0xff5a1a, emissiveIntensity: 2.2 }), 10, 8);
      model.add(core);
      // no point light (see frost note) — emissive core carries the glow
      break;
    }
    default: {
      model.name = 'proj-bullet';
      const body = cyl(0.04, 0.04, 0.16, mat(0xd8c060, { metalness: 0.9, roughness: 0.2 }), 8);
      body.rotation.x = Math.PI / 2;
      model.add(body);
      break;
    }
  }
  return model;
}

export function createExplosionModel(embers = 14) {
  const model = new THREE.Group();
  model.name = 'explosion';

  const ringMat = mat(0xffaa44, { emissive: 0xff7722, emissiveIntensity: 1.8, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.name = 'ring';
  model.add(ring);

  const flash = sphere(0.5, mat(0xffdd88, { emissive: 0xffbb44, emissiveIntensity: 2.5, transparent: true, opacity: 0.8 }), 12, 10);
  flash.position.y = 0.35;
  flash.name = 'flash';
  model.add(flash);

  const emberMat = mat(0xff8833, { emissive: 0xff6622, emissiveIntensity: 2 });
  model.userData.embers = [];
  for (let i = 0; i < 14; i++) {
    const e = sphere(rand(0.03, 0.07), emberMat);
    const a = rand(0, Math.PI * 2);
    const el = rand(0.5, 1.4);
    e.userData.dir = new THREE.Vector3(Math.cos(a), el, Math.sin(a)).normalize();
    e.userData.speed = rand(4, 7);
    model.add(e);
    model.userData.embers.push(e);
  }

  model.userData.parts = { ring, flash };
  return model;
}

// ---------------------------------------------------------------------------
// MISC
// ---------------------------------------------------------------------------

export function createMuzzleFlashModel() {
  const model = new THREE.Group();
  model.name = 'muzzle-flash';
  const m = mat(0xffdd66, { emissive: 0xffbb22, emissiveIntensity: 3, transparent: true, opacity: 0.95 });
  const core = sphere(0.09, m);
  model.add(core);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), m);
    spike.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    spike.rotation.x = Math.PI / 2;
    spike.rotation.y = a;
    model.add(spike);
  }
  return model;
}

export function createRangeCircle(radius = 1, color = 0x66ccff) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.985, radius, 48),
    mat(color, { emissive: color, emissiveIntensity: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.name = 'range-circle';
  return m;
}

export function createIceMistRing(radius = 1) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.12, 8, 32),
    mat(0xbfe8ff, { emissive: 0x8ac8ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.5 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.25;
  m.name = 'ice-mist';
  return m;
}
