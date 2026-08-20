import * as THREE from 'three';
import { CONFIG, terrainHeight } from './config.js';
import {
  createZombieModel, createTowerModel, createBossModel,
  createProjectileModel, createExplosionModel,
} from './assets.js';
import {
  walkZombie, idleZombie, deathCollapse, deathExplode,
  animateProjectile, aimTurret, towerRecoil,
  bossSlam, bossTeleport, bossFreezeAura, bossFireballThrow, bossSpawnMinions,
} from './animation.js';

const UP = new THREE.Vector3(0, 1, 0);
const perf = () => performance.now();

// Helper: cache the flashable materials of a model (for hit-flash pulse).
function cacheFlashMats(model) {
  const mats = [];
  model.traverse((o) => {
    if (o.isMesh && o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (m.emissive !== undefined) {
          if (m.userData.baseEmissive === undefined) {
            m.userData.baseEmissive = m.emissive.getHex();
            m.userData.baseEI = m.emissiveIntensity;
          }
          mats.push(m);
        }
      }
    }
  });
  return mats;
}

// ===========================================================================
// ZOMBIE
// ===========================================================================
export class Zombie {
  constructor({ type, skin, isBoss = false, bossKey = null, hpScale = 1, spScale = 1 }) {
    const boss = isBoss ? CONFIG.bosses[bossKey] : null;
    let model;
    let base;
    if (isBoss) {
      model = createBossModel(bossKey);
      base = boss;
    } else {
      model = createZombieModel(type, skin);
      base = CONFIG.zombies[type];
    }

    const sk = CONFIG.skins[skin] || CONFIG.skins.default;
    this.type = type;
    this.skin = skin;
    this.isBoss = isBoss;
    this.bossKey = bossKey;

    this.maxHp = Math.round((base.hp ?? boss.hp) * hpScale * (sk.hp ?? 1));
    this.hp = this.maxHp;
    this.baseSpeed = (base.speed ?? boss.speed) * spScale * (sk.speed ?? 1);
    this.reward = base.reward ?? boss.reward ?? 10;
    this.baseDamage = base.damage ?? boss.damage ?? 2;
    this.armor = Math.min(0.9, (base.armor ?? 0) + (sk.armor ?? 0));
    this.slowResist = sk.slowResist ?? 0;
    this.radius = base.radius ?? 1;

    this.model = model;
    this.model.userData.zombie = this;
    this._flashMats = cacheFlashMats(model);
    this._flash = 0;

    this.progress = 0;
    this.slow = { pct: 0, until: 0 };
    this.dead = false;
    this._dying = false;
    this._deathDone = false;
    this.reachedBase = false;
    // — Nécromant / Barricade —
    this.reverse = false;    // unité qui marche EN SENS INVERSE (base → spawn)
    this.skeleton = false;   // troupe du Nécromant (se sacrifie, ne oneshotte pas)
    this.reachedStart = false; // a atteint le bout du chemin côté spawn (squelette)
    this.blockedBy = null;   // barricade qui nous retient actuellement
    this._barT = -Infinity;  // anti-spam des dégâts sur la barricade
    this.game = null;

    // special-ability timers
    this._atkT = -Infinity; // so the first cast isn't blocked by the cooldown gate
    this._nextAtk = 1 + Math.random() * 2;

    // per-boss ability state
    this.lives = (bossKey === 'titan') ? 2 : 1;   // titan has two lives
    this.sprintUntil = 0;                          // runner: speed burst (ms)
    this.invulnUntil = 0;                          // brief invulnerability (ms)
    this.regenPerCast = (bossKey === 'regenerator') ? this.maxHp * 0.05 : 0;
    this.phasing = bossKey === 'wraith';            // wraith: phases in/out
    this._phaseT = 0;
    this.phased = false;

    // death animation state
    this.death = null; // {t0, kind}
  }

  get alive() {
    return !this.dead && !this.reachedBase && !this.reachedStart;
  }

  speedFactor(now) {
    let f = (this.slow.pct > 0 && now < this.slow.until) ? 1 - this.slow.pct * (1 - this.slowResist) : 1;
    if (now < this.sprintUntil) f *= 2.0; // runner sprint burst
    return f;
  }

  applySlow(pct, duration, now) {
    const p = pct * (1 - this.slowResist);
    if (p > 0.001) {
      const until = now + duration;
      if (this.slow.pct <= p || this.slow.until <= now) {
        this.slow = { pct: Math.max(this.slow.pct, p), until };
      } else {
        this.slow.until = until; // refresh duration, keep max pct
      }
    }
  }

  takeDamage(amount, now) {
    if (!this.alive) return 0;
    // Point 10 : l'horloge de jeu pour la vérif d'invulnérabilité (cohérent si un
    // appelant passe `now` en gameTime, sinon on prend game.gameTime)
    const t = (now !== undefined) ? now : (this.game ? this.game.gameTime : perf());
    // invulnerable (titan revive grace) or fully phased (wraith) -> no damage
    if (t < this.invulnUntil || this.phased) return 0;
    const real = amount * (1 - this.armor);
    this.hp -= real;
    this._flash = 0.12;
    if (this._flashMats.length) {
      for (const m of this._flashMats) {
        m.emissive.setHex(0xff4a2a);
        m.emissiveIntensity = 1.6;
      }
    }
    if (this.hp <= 0) {
      // TITAN: two lives — first "death" triggers a revive instead
      if (this.lives > 1 && this.game) {
        this.lives -= 1;
        this.hp = Math.round(this.maxHp * 0.5);
        this.invulnUntil = t + 3000; // 3s invulnerability after revive (horloge de jeu)
        this.game.vfx.explosion(this.model.position, 'big');
        this.game.shake(0.7);
        this.model.traverse((o) => { if (o.isMesh && o.material) { o.material.emissive && o.material.emissive.setHex(0xff8a2a); o.material.emissiveIntensity = 1.4; } });
        return real;
      }
      this.hp = 0;
      if (this.game) {
        // Nécromant : le monstre mort (hors squelette) devient le « cadavre »
        // dont une tour Nécromant pourra ressusciter un squelette.
        if (!this.skeleton) this.game.onMonsterKilled(this);
        this.game._onZombieDeath(this);
      }
    }
    return real;
  }

  startDeath(kind) {
    if (this.dead) return;
    // SFX mort : la ref game est fournie au spawn (zombie.game), sinon silencieux
    if (this._game && this._game.sfx) this._game.sfx.kill();
    this.dead = true;
    this.death = { t0: perf(), kind };
    this._dying = true;
  }

  update(dt, game, now) {
    // flash decay
    if (this._flash > 0) {
      this._flash -= dt;
      if (this._flash <= 0) {
        for (const m of this._flashMats) {
          m.emissive.setHex(m.userData.baseEmissive ?? 0x000000);
          m.emissiveIntensity = m.userData.baseEI ?? 0;
        }
      }
    }

    // death animation in progress
    if (this._dying) {
      const k = this.death.kind === 'explode'
        ? deathExplode(this.model, this.death.t0)
        : deathCollapse(this.model, this.death.t0);
      if (k >= 1) this._deathDone = true;
      return;
    }

    if (!this.alive) return;

    // WRAITH: phase in and out (intangible while phased -> takes no damage)
    if (this.phasing) {
      this._phaseT += dt * 1000;
      const cycle = 5000; // 3s solid + 2s phased
      const inCycle = this._phaseT % cycle;
      const shouldPhase = inCycle > 3000; // last 2s of each cycle
      if (shouldPhase !== this.phased) {
        this.phased = shouldPhase;
        this.model.traverse((o) => { if (o.isMesh) o.material.transparent = this.phased; });
        this.model.visible = !this.phased || true; // keep in scene, just intangible
        this.model.traverse((o) => { if (o.isMesh) o.material.opacity = this.phased ? 0.15 : 0.85; });
      }
    }

    // special-ability hook
    this.onStep(game, now);

    // advance along path (squelettes : de la base vers le spawn, sens inverse)
    const spd = this.baseSpeed * this.speedFactor(now);
    const step = (spd * dt) / game.pathLength;
    if (this.reverse) {
      this.progress -= step;
    } else {
      // Barricade : le premier bloc intact juste devant nous nous retient sur
      // place — on le « grignote » (dégâts infligés = nos PV / seconde).
      const bar = this._blockingBarricade(game);
      if (bar) {
        this.blockedBy = bar;
        if (now - this._barT > 100) { // fenêtre 0,1 s → maxHp * 0.1 = maxHp/s
          this._barT = now;
          bar.takeDamage(this.maxHp * 0.1, game);
        }
      } else {
        this.blockedBy = null;
        this.progress += step;
      }
    }
    const cp = Math.max(0, Math.min(1, this.progress));
    const pos = game.path.pointAt(cp);
    const tan = game.path.tangentAt(cp);
    this.model.position.set(pos.x, CONFIG.pathHeight, pos.z); // walk on the raised path
    // animation « sort de terre » (minions du nécromant) : émergence depuis -0.55 + pop d'échelle
    if (this._riseT0) {
      const rk = (now - this._riseT0) / this._riseDur;
      if (rk < 1) {
        const ease = 1 - (1 - rk) * (1 - rk); // easeOutQuad
        this.model.position.y = CONFIG.pathHeight - 0.55 * (1 - ease);
        this.model.scale.setScalar(0.7 + 0.3 * ease);
      } else {
        this.model.position.y = CONFIG.pathHeight;
        this.model.scale.setScalar(1);
        this._riseT0 = 0; // animation terminée
      }
    }
    this.model.rotation.y = Math.atan2(tan.x, tan.z);
    this.model.rotation.x = 0;

    // walk / idle animation
    if (this.isBoss) {
      idleZombie(this.model, now / 1000);
    } else {
      walkZombie(this.model, (now / 1000) * (this.type === 'fast' ? 9 : this.type === 'tank' ? 4 : 6));
    }

    // reached the base (sens normal) — ou le point de spawn (squelette, sens
    // inverse : il a fait son office de barrière humaine, on le retire sans dégât)
    if (this.reverse) {
      if (this.progress <= 0) { this.progress = 0; this.reachedStart = true; }
    } else if (this.progress >= 1) {
      this.progress = 1;
      this.reachedBase = true;
      game.onZombieReachedBase(this);
    }
  }

  // La 1re barricade (intacte) qui se trouve juste devant nous sur le chemin.
  _blockingBarricade(game) {
    const list = game.towers;
    if (!list || !list.length) return null;
    let best = null, bestD = Infinity;
    for (const t of list) {
      if (t.destroyed || t.type !== 'barricade') continue;
      if (t._prog === undefined) t._prog = game.path.nearestProgress(t.model.position.x, t.model.position.z);
      // doît être AVANT nous (ou à notre niveau), pas derrière
      if (t._prog < this.progress - 0.01) continue;
      const dist = this.model.position.distanceTo(t.model.position);
      if (dist <= t.statRange() && dist < bestD) { bestD = dist; best = t; }
    }
    return best;
  }

  // Per-boss / per-variant behavior hook.
  onStep(game, now) {
    if (this.isBoss) this.bossStep(game, now);
  }

  bossStep(game, now) {
    const key = this.bossKey;
    const cd = 5000; // ms — 'now' = horloge de jeu (scalée par le speed)
    if (now - this._atkT < cd) return;
    this._atkT = now;
    const anow = performance.now(); // temps RÉEL pour les animations cosmétiques
    const p = this.model.userData.parts;
    switch (key) {
      case 'brute': {
        // Slam: FREEZE nearby towers completely for 3s (no damage)
        bossSlam(this.model, anow);
        game.shake(0.6);
        game.vfx.explosion(this.model.position, 'big');
        for (const t of game.towers) {
          if (t.model.position.distanceTo(this.model.position) < 4.5) t.petrify(3.0, now, game);
        }
        break;
      }
      case 'stalker': {
        // Teleport a short distance forward + stun a random tower
        bossTeleport(this.model, anow);
        this.progress = Math.min(1, this.progress + 0.02);
        const t = game.towers[Math.floor(Math.random() * game.towers.length)];
        if (t) t.freeze(2.0, now);
        break;
      }
      case 'frostking': {
        // Aura glaciale : les tours proches sont prises dans la glace (visuel
        // bleu-glace bien net, restauré à la fonte) pendant 3 s, rayon 10.
        bossFreezeAura(this.model, anow);
        for (const t of game.towers) {
          if (t.model.position.distanceTo(this.model.position) < 10) t.icePetrify(3.0, now);
        }
        game.vfx.iceRing(this.model.position);
        game.shake(0.35);
        break;
      }
      case 'pyrolord': {
        // Boule de feu vers la base : 5 dégâts, tir toutes les 5 s (cooldown
        // commun du bossStep) — la 1re boule attend 5 s après le spawn.
        bossFireballThrow(this.model, anow);
        game.spawnFireball(this.model.position, game.basePos, 5);
        break;
      }
      case 'abomination': {
        bossSpawnMinions(this.model, anow);
        game.spawnMinion(this.model.position);
        break;
      }
      case 'golem': {
        // PETRIFY: nearby towers turn to stone (frozen + grayed) for 4s
        for (const t of game.towers) {
          if (t.model.position.distanceTo(this.model.position) < 6) t.petrify(4.0, now, game);
        }
        game.vfx.explosion(this.model.position, 'big');
        game.shake(0.6);
        break;
      }
      case 'runner': {
        // SPRINT: speed burst + dash forward
        this.sprintUntil = now + 2500;
        this.progress = Math.min(1, this.progress + 0.03);
        game.vfx.ring(this.model.position, 0x6ae0ff, 3);
        break;
      }
      case 'regenerator': {
        // REGEN: heal 5% of max HP per cast
        this.hp = Math.min(this.maxHp, this.hp + this.regenPerCast);
        game.vfx.ring(this.model.position, 0x6aff5a, 2.5);
        break;
      }
      case 'titan': {
        // TITAN: shockwave that damages + knocks back nearby towers
        game.shake(0.9);
        game.vfx.explosion(this.model.position, 'big');
        for (const t of game.towers) {
          if (t.model.position.distanceTo(this.model.position) < 7) {
            t.petrify(3.0, now, game); // freeze for 3s, no damage
          }
        }
        break;
      }
      case 'wraith': {
        // PHASE pulse — the wraith also phases on a cycle in update()
        game.vfx.ring(this.model.position, 0xa07aff, 3);
        break;
      }
      default: break;
    }
  }

  dispose(game) {
    game.scene.remove(this.model);
    disposeObject(this.model);
  }
}

// ===========================================================================
// TOWER
// ===========================================================================
export class Tower {
  constructor(type, x, z, game) {
    const def = CONFIG.towers[type];
    this.type = type;
    this.def = def;
    this.game = game; // niveau cap / saveData (levelCap())
    this.level = 1;
    this.invested = def.cost;
    this.model = createTowerModel(type);
    this.model.position.set(x, terrainHeight(x, z), z);
    this.model.userData.tower = this;
    game.scene.add(this.model);

    this.nextShot = 0;
    this.frozenUntil = 0;
    this._petrifiedUntil = 0;
    this._petrifyBackup = null;
    this._iceUntil = 0;
    this._iceBackup = null;
    this.lastShot = -1000;
    this.triggered = false;  // for mines
    this._hitFlash = 0;     // Barricade : flash d'impact
    this._feed = null;      // Nécromant : « cadavre » en attente de résurrection
    this.hp = def.hp ?? 60; // Barricade : gros réservoir (def.hp) ; tours = 60
    this.maxHp = this.hp;
    // Targeting priority: 'first' (most-progressed) | 'strongest' (highest hp)
    // | 'weakest' (lowest hp) | 'random'
    this.targetMode = 'first';
  }

  get range() {
    return this.statRange();
  }

  // --- level scaling ------------------------------------------------------
  statRange() {
    const d = this.def;
    let r = d.range ?? d.radius ?? d.range;
    for (let i = 1; i < this.level; i++) r += (d.upgrade.range ?? 0) + (d.upgrade.radius ?? 0);
    if (d.kind === 'mine') {
      let rr = d.radius;
      for (let i = 1; i < this.level; i++) rr += (d.upgrade.radius ?? 0);
      return rr;
    }
    return r;
  }

  statDamage() {
    const d = this.def;
    const base = d.damage ?? d.dps ?? 0;
    // smooth curve: base × 1,32^(niv−1) — integers only, jamais de virgules
    return Math.round(base * Math.pow(CONFIG.damageGrowth ?? 1.32, this.level - 1));
  }

  statCooldown() {
    const d = this.def;
    let c = d.cooldown ?? 0;
    for (let i = 1; i < this.level; i++) c += (d.upgrade.cooldown ?? 0);
    return Math.max(0.12, c);
  }

  // Point 8 : l'Électro enchaîne plus de cibles en montant de niveau.
  // base 2 chaînes (Lv1) → +1 chaîne tous les 2 niveaux (max 4 en Lv5).
  statChains() {
    const d = this.def;
    if (d.kind !== 'zap') return 0;
    const base = d.chains ?? 0;
    const extra = Math.floor((this.level - 1) / 2);
    return base + extra;
  }

  statSlowPct() {
    let p = this.def.slowPct ?? 0;
    for (let i = 1; i < this.level; i++) p += (this.def.upgrade.slowPct ?? 0);
    return Math.min(0.68, p); // cap du ralentissement (~68 %), les zombies restent jouables
  }

  statSlowDur() {
    let d = this.def.slowDuration ?? 0;
    for (let i = 1; i < this.level; i++) d += (this.def.upgrade.slowDuration ?? 0);
    return d;
  }

  statSplash() {
    let s = this.def.splash ?? 0;
    for (let i = 1; i < this.level; i++) s += (this.def.upgrade.splash ?? 0);
    return s;
  }

  /** Level cap: bought per tower type in the shop (default = CONFIG.towerStartCap). */
  levelCap() {
    const caps = this.game && this.game.saveData && this.game.saveData.towerCaps;
    const c = caps ? caps[this.type] : undefined; // this.type = clé du type de tour
    return Math.min(typeof c === 'number' ? c : CONFIG.towerStartCap, CONFIG.towerMaxLevel);
  }

  upgradeCost() {
    if (this.level >= this.levelCap()) return null;
    return Math.round(this.def.cost * (0.6 + this.level * 0.25));
  }

  upgrade(game) {
    const cost = this.upgradeCost();
    if (cost == null || game.money < cost) return false;
    game.money -= cost;
    this.level++;
    this.invested += cost;
    return true;
  }

  sellValue() {
    return Math.round(this.invested * CONFIG.sellRefund);
  }

  freeze(seconds, now) {
    this.frozenUntil = Math.max(this.frozenUntil, now + seconds * 1000); // now is ms
  }

  // GOLEM petrify: tower turns to stone (frozen + grayed) for the given seconds
  petrify(seconds, now) {
    this.frozenUntil = Math.max(this.frozenUntil, now + seconds * 1000); // now is ms
    this._petrifiedUntil = Math.max(this._petrifiedUntil, now + seconds * 1000);
    if (!this._petrifyBackup) this._petrifyBackup = new Map();
    this.model.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined && !this._petrifyBackup.has(o.material)) {
        this._petrifyBackup.set(o.material, { e: o.material.emissive.getHex(), ei: o.material.emissiveIntensity });
        o.material.emissive.setHex(0x8a8f94);
        o.material.emissiveIntensity = 0.45;
      }
    });
  }

  // Restore original materials once petrification has expired
  _restorePetrify(now) {
    if (this._petrifyBackup && now >= this._petrifiedUntil) {
      for (const [m, b] of this._petrifyBackup) { m.emissive.setHex(b.e); m.emissiveIntensity = b.ei; }
      this._petrifyBackup = null;
    }
  }

  // FROST KING : la tour est prise dans la glace (gel + teinte bleu-glace visible)
  icePetrify(seconds, now) {
    this.frozenUntil = Math.max(this.frozenUntil, now + seconds * 1000); // now is ms
    this._iceUntil = Math.max(this._iceUntil, now + seconds * 1000);
    if (!this._iceBackup) this._iceBackup = new Map();
    this.model.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined && !this._iceBackup.has(o.material)) {
        this._iceBackup.set(o.material, { e: o.material.emissive.getHex(), ei: o.material.emissiveIntensity });
        o.material.emissive.setHex(0x63c8ff);
        o.material.emissiveIntensity = 0.65;
      }
    });
  }

  // Restore original materials once the ice has melted
  _restoreIce(now) {
    if (this._iceBackup && now >= this._iceUntil) {
      for (const [m, b] of this._iceBackup) { m.emissive.setHex(b.e); m.emissiveIntensity = b.ei; }
      this._iceBackup = null;
    }
  }

  takeDamage(amount, game) {
    this.hp -= amount;
    // Barricade : flash d'impact orange à chaque coup des zombies
    if (this.type === 'barricade' && !this.destroyed) {
      this._hitFlash = 1;
      if (!this._barrMats) {
        this._barrMats = [];
        this.model.traverse((o) => { if (o.isMesh && o.material && o.material.emissive !== undefined) this._barrMats.push(o.material); });
      }
    }
    if (this.hp <= 0 && !this.destroyed) {
      this.destroyed = true;
      game.vfx.explosion(this.model.position, 'small');
      game.removeTower(this);
    }
  }

  frozen(now) {
    return now < this.frozenUntil;
  }

  muzzleWorldPos() {
    const p = this.model.userData.parts;
    const from = new THREE.Vector3();
    (p && (p.muzzle || p.turret || p.crystal || p.disc) || this.model).getWorldPosition(from);
    return from;
  }

  // Choose a target within range according to the tower's targeting mode.
  //   'first'     -> the enemy furthest along the path (default)
  //   'strongest' -> the enemy with the most current HP
  //   'weakest'   -> the enemy with the least current HP
  //   'random'    -> a random enemy in range
  // -- Électro : éclair instantané qui CHAÎNE sur les cibles proches ------
  zapUpdate(game, now, frozen) {
    if (frozen) return;
    const d = this.def;
    const target = this.acquireTarget(game);
    if (!target) return;
    aimTurret(this.model, target.model.position, 18);
    const interval = this.statCooldown() * 1000;
    if (now < this.nextShot) return;
    this.lastShot = now; this.nextShot = now + interval;

    const from = this.muzzleWorldPos();
    let dmg = this.statDamage();
    target.takeDamage(dmg, now);
    // chaîne : cibles successives les plus proches (60 % puis 35 %) — Point 8 : le
    // nombre de chaînes monte avec le niveau (statChains)
    const hit = [target];
    const chains = this.statChains();
    for (let i = 0; i < chains; i++) {
      let best = null, bd = Infinity;
      for (const z of game.zombies) {
        if (!z.alive || z.phased || hit.includes(z)) continue;
        const dist = z.model.position.distanceTo(hit[hit.length - 1].model.position);
        if (dist <= 3.4 && dist < bd) { bd = dist; best = z; }
      }
      if (!best) break;
      dmg *= (i === 0 ? 0.6 : 0.35);
      best.takeDamage(dmg, now);
      hit.push(best);
    }
    game.vfx.zap(from, hit.map((h) => h.model.position));
    if (game.sfx) game.sfx.shoot('shock');
  }

  // -- Ferme : génère des pièces toutes les ~6 s ---------------------------
  farmUpdate(dt, game, now) {
    const d = this.def;
    const period = Math.max(3.5, (d.tickEvery || 6));
    this._farmT = (this._farmT ?? 0) + dt; // dt est déjà mis à l'échelle du speed
    if (this._farmT < period) return;
    this._farmT -= period;
    // revenu qui grimpe avec le niveau (+ income bonus / niveau, ×1.36 base)
    const lvBonus = Math.round((d.incomeBase * 0.5) * (this.level - 1));
    const gain = d.incomeBase + lvBonus;
    game.money += gain;
    // La ferme ne compte PAS dans les « pièces bankées » du save (anti-abuse
    // sur le quit/menu) — ses gains restent dans la monnaie de la partie.
    if (game.sfx) game.sfx.buy();
    if (game.vfx) game.vfx.coinBurst(this.model.position, gain);
    game.ui && game.ui.refreshHUD();
  }

  // -- Barricade : mur posé SUR le chemin. Les zombies la « grignotent » dans
  //     Zombie.update (dégâts = leurs PV/seconde). A 0 PV elle saute (takeDamage).
  //     Ici : uniquement le flash d'impact + la barre de PV au-dessus.
  barricadeUpdate(dt, game, now) {
    if (this._hitFlash > 0) {
      this._hitFlash = Math.max(0, this._hitFlash - dt * 4);
      const k = this._hitFlash;
      for (const m of (this._barrMats || [])) { m.emissive.setHex(0xff5a2a); m.emissiveIntensity = k; }
    }
  }

  // -- Nécromant (troupe) : ressuscite les monstres tués en SQUELETTES qui
  //     sortent PRÈS DE LA BASE et marchent EN SENS INVERSE pour aller
  //     au-devant des ennemis (barrière humaine sacrificielle).
  //     PV du squelette = % des PV du monstre source (20 % → 65 %).
  statNecroPct() {
    // Lv1 20 % → Lv5 65 % (progressif, 11,25 % / niveau)
    return 0.20 + (this.level - 1) * ((0.65 - 0.20) / 4);
  }

  // Un monstre vient de mourir : c'est notre « matière première ».
  // On retient la source (PV + type) pour la prochaine résurrection.
  feedKill(maxHp, type) {
    this._feed = { maxHp, type };
  }

  necroUpdate(dt, game, now) {
    this._restoreRing(now);
    if (this.frozen(now)) return;
    const d = this.def;
    const interval = Math.max(2, d.cooldown + (this.level - 1) * (d.upgrade.cooldown ?? 0)) * 1000;
    if (now < this.nextShot) return;
    if (!this._feed) return; // pas de « cadavre » à ressusciter pour l'instant
    // Il faut des ennemis vivants, sinon on stocke le squelette pour plus tard
    const hasEnemy = game.zombies.some((z) => z.alive && !z.skeleton);
    if (!hasEnemy) return;
    const src = this._feed; this._feed = null; // consomme une résurrection
    this.nextShot = now + interval;
    this._castVfx(now);
    game.spawnSkeleton({ maxHp: src.maxHp, srcType: src.type, pct: this.statNecroPct() });
  }

  _castVfx(now) {
    const p = this.model.userData.parts;
    if (p && p.ring) {
      p.ring.material.emissiveIntensity = 3.2; // pulsation du cercle runique
      this._ringUntil = now + 350;
    }
    if (this.game && this.game.sfx) this.game.sfx.shoot('frost'); // petit « pschitt » spectral
  }

  // atténue la pulsation du cercle + le flash d'impact de la barricade
  _restoreRing(now) {
    if (this._ringUntil && now >= this._ringUntil) {
      const p = this.model.userData.parts;
      if (p && p.ring) p.ring.material.emissiveIntensity = 1.6;
      this._ringUntil = 0;
    }
  }

  acquireTarget(game) {
    const t = this.range;
    const cands = [];
    for (const z of game.zombies) {
      if (!z.alive || z.phased) continue; // phased (wraith) can't be targeted
      const d = z.model.position.distanceTo(this.model.position);
      if (d <= t) cands.push(z);
    }
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    const mode = this.targetMode || 'first';
    if (mode === 'strongest') return cands.reduce((a, b) => (b.hp > a.hp ? b : a));
    if (mode === 'weakest')   return cands.reduce((a, b) => (b.hp < a.hp ? b : a));
    if (mode === 'random')   return cands[(Math.random() * cands.length) | 0];
    return cands.reduce((a, b) => (b.progress > a.progress ? b : a)); // 'first'
  }

  update(dt, game, now) {
    if (this.destroyed) return;
    const d = this.def;

    // frozen towers can't fire
    const frozen = this.frozen(now);
    // frost tint while frozen
    this.applyFrozenTint(frozen);
    // petrify (golem) restore + stone tint
    this._restorePetrify(now);
    if (now < this._petrifiedUntil) {
      this.model.traverse((o) => { if (o.isMesh && o.material && o.material.emissive !== undefined) { o.material.emissive.setHex(0x8a8f94); o.material.emissiveIntensity = 0.45; } });
    }
    // ice (frost king) restore + icy tint — passe APRÈS la pierre pour que la glace
    // prenne le dessus si les deux coexistent
    this._restoreIce(now);
    if (now < this._iceUntil) {
      this.model.traverse((o) => { if (o.isMesh && o.material && o.material.emissive !== undefined) { o.material.emissive.setHex(0x63c8ff); o.material.emissiveIntensity = 0.65; } });
    }

    switch (d.kind) {
      case 'mine': this.mineUpdate(game, now); break;
      case 'slow': this.frostUpdate(game, now); break;
      case 'continuous': this.flameUpdate(dt, game, now, frozen); break;
      case 'splash': this.mortarUpdate(game, now, frozen); break;
      case 'single': this.singleUpdate(game, now, frozen); break;
      case 'zap': this.zapUpdate(game, now, frozen); break;
      case 'economy': this.farmUpdate(dt, game, now); break;
      case 'barricade': this.barricadeUpdate(dt, game, now); break;
      case 'necro': this.necroUpdate(dt, game, now); break;
    }

    // recoil decay
    if (this.lastShot > 0 && now - this.lastShot < 140) {
      const power = d.kind === 'single' && d.key === 'sniper' ? 0.3 : 0.18;
      towerRecoil(this.model, this.lastShot, power, 0.14, now);
    } else if (this.lastShot > 0 && this.model.userData.parts && this.model.userData.parts.turret) {
      // settle turret back
      const p = this.model.userData.parts;
      if (p.turret) p.turret.position.z += (0 - p.turret.position.z) * Math.min(1, dt * 20);
    }

  }

  applyFrozenTint(frozen) {
    const p = this.model.userData.parts;
    if (!p || !p.turret) return;
    const target = frozen ? 0.6 : 0.0;
    // simple emissive tint on the turret body
    const apply = (o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material.emissive.setHex(frozen ? 0x6ab0ff : 0x000000);
        if (o.material.emissiveIntensity === undefined) o.material.emissiveIntensity = 0.8;
      }
    };
    if (p.turret) p.turret.traverse(apply);
  }

  // -- single target (gunner / sniper) --
  singleUpdate(game, now, frozen) {
    const d = this.def;
    if (frozen) return;
    const target = this.acquireTarget(game);
    if (!target) return;
    // cannon continuously tracks the enemy it is engaging
    aimTurret(this.model, target.model.position, 16);
    const interval = this.statCooldown() * 1000;
    if (now < this.nextShot) return;
    const from = this.muzzleWorldPos();
    game.vfx.muzzleFlash(from);
    if (game.sfx) game.sfx.shoot(d.projectile === 'tracer' ? 'shell' : 'bullet');
    this.lastShot = now;
    const dur = (from.distanceTo(target.model.position) / d.projectileSpeed) + 0.02;
    game.spawnProjectile({
      kind: d.projectile, from, to: target.model.position.clone(),
      target, damage: this.statDamage(), duration: Math.max(0.04, dur),
      critical: d.key === 'sniper',
    });
    this.nextShot = now + interval;
  }

  // -- frost: fires a visible ice bolt every 2s; on impact deals damage + a 1s slow --
  frostUpdate(game, now) {
    if (this.frozen(now)) return;
    const target = this.acquireTarget(game);
    if (!target) return;
    const interval = this.statCooldown() * 1000;
    if (now < this.nextShot) return;
    const from = this.muzzleWorldPos();
    game.vfx.muzzleFlash(from);
    if (game.sfx) game.sfx.shoot('frost');
    const d = this.def;
    const dur = Math.max(0.05, (from.distanceTo(target.model.position) / (d.projectileSpeed || 30)) + 0.02);
    game.spawnProjectile({
      kind: 'frost', from, to: target.model.position.clone(),
      target, damage: this.statDamage(), duration: dur,
      slowPct: this.statSlowPct(), slowDur: this.statSlowDur() * 1000,
    });
    this.lastShot = now;
    this.nextShot = now + interval;
  }

  // -- flame (continuous close AoE) --
  flameUpdate(dt, game, now, frozen) {
    if (frozen) return;
    let hitCount = 0;
    for (const z of game.zombies) {
      if (!z.alive) continue;
      if (z.model.position.distanceTo(this.model.position) <= this.range) {
        z.takeDamage(this.statDamage() * dt);
        hitCount++;
      }
    }
    const parts = this.model.userData.parts;
    if (parts && parts.glowLight) parts.glowLight.intensity = hitCount ? 2.6 : 1.0;
    const mp = this.muzzleWorldPos();
    game.vfx.flameStream(mp, hitCount, this.range);
  }

  // -- mortar (lobbed splash) --
  mortarUpdate(game, now, frozen) {
    if (frozen) return;
    const interval = this.statCooldown() * 1000;
    if (now < this.nextShot) return;
    const target = this.acquireTarget(game);
    if (!target) { this.nextShot = now + 200; return; }
    const from = this.muzzleWorldPos();
    // lead: aim at predicted position after flight time
    const flight = 0.9;
    const future = Math.min(1, target.progress + (target.baseSpeed * flight) / game.pathLength);
    const to = game.path.pointAt(future);
    this.lastShot = now;
    aimTurret(this.model, to);
    game.vfx.muzzleFlash(from);
    if (game.sfx) game.sfx.shoot('shell');
    game.spawnProjectile({
      kind: 'shell', from, to: to.clone(), target: null,
      damage: this.statDamage(), duration: 0.9, splash: this.statSplash(),
      mortar: true,
    });
    this.nextShot = now + interval;
  }

  // -- mine (proximity one-shot AoE) --
  mineUpdate(game, now) {
    if (this.triggered) return;
    for (const z of game.zombies) {
      if (!z.alive) continue;
      if (z.model.position.distanceTo(this.model.position) <= this.range) {
        this.explode(game);
        break;
      }
    }
  }

  explode(game) {
    if (this.triggered) return;
    this.triggered = true;
    this.dead = true; // one-shot — removed from the field by the game loop
    const r = this.range;
    for (const z of game.zombies) {
      if (!z.alive) continue;
      if (z.model.position.distanceTo(this.model.position) <= r) {
        z.takeDamage(this.statDamage());
      }
    }
    game.vfx.explosion(this.model.position, 'big');
    game.shake(0.5);
  }

  dispose(game) {
    game.scene.remove(this.model);
    disposeObject(this.model);
  }
}

// ===========================================================================
// PROJECTILE
// ===========================================================================
export class Projectile {
  constructor({ kind, from, to, target, damage, duration, splash, mortar, critical, fireball, slowPct, slowDur }) {
    this.kind = kind;
    this.from = from.clone();
    this.to = to.clone();
    this.target = target; // zombie ref (nullable for mortar/fireball)
    this.damage = damage;
    this.duration = duration;
    this.splash = splash ?? 0;
    this.mortar = mortar;
    this.critical = critical;
    this.fireball = fireball;
    this.slowPct = slowPct ?? 0;
    this.slowDur = slowDur ?? 1;
    this.t0 = null; // Point 10 : posé en horloge de jeu au 1er update (scalé)
    this.model = createProjectileModel(kind);
    this.model.position.copy(from);
    this.done = false;
  }

  update(dt, game) {
    if (this.t0 === null) this.t0 = game.gameTime; // départ en horloge de jeu
    const k = animateProjectile(this.model, this.t0, this.from, this.to, this.duration, this.mortar ? 3.0 : 0.25, game.gameTime);
    if (this.target && !this.target.alive) {
      // retarget to a live zombie near the intended point, else expire
      const alt = nearestZombie(game, this.to, 2.5);
      if (alt) { this.target = alt; this.to = alt.model.position.clone(); }
      else { this.expire(game); return; }
    }
    if (k >= 1) this.arrive(game);
  }

  arrive(game) {
    this.done = true;
    const at = this.model.position.clone();
    const dmg = this.damage;
    const spl = this.splash;

    if (this.mortar) {
      // splash damage all in radius
      for (const z of game.zombies) {
        if (!z.alive) continue;
        if (z.model.position.distanceTo(at) <= spl) z.takeDamage(dmg);
      }
      game.vfx.explosion(at, 'big');
      game.shake(0.3);
    } else if (this.fireball) {
      for (const z of game.zombies) {
        if (!z.alive) continue;
        if (z.model.position.distanceTo(at) <= 2.2) z.takeDamage(dmg);
      }
      game.vfx.explosion(at, 'fire');
      // also damages base if close
      if (at.distanceTo(game.basePos) < 3) game.damageBase(10);
    } else {
      if (this.target && this.target.alive) {
        this.target.takeDamage(dmg);
        if (this.slowPct > 0) this.target.applySlow(this.slowPct, this.slowDur, game.gameTime);
        game.vfx.damagePopup(at, dmg, this.critical);
      }
    }
    game.removeProjectile(this);
  }

  expire(game) {
    this.done = true;
    game.removeProjectile(this);
  }

  dispose(game) {
    game.scene.remove(this.model);
    disposeObject(this.model);
  }
}

// ---------------------------------------------------------------------------
function nearestZombie(game, point, maxD) {
  let best = null, bestD = maxD * maxD;
  for (const z of game.zombies) {
    if (!z.alive) continue;
    const d = z.model.position.distanceToSquared(point);
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) m.dispose && m.dispose();
  });
}
