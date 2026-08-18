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
    return !this.dead && !this.reachedBase;
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

  takeDamage(amount, now = perf()) {
    if (!this.alive) return 0;
    // invulnerable (titan revive grace) or fully phased (wraith) -> no damage
    if (now < this.invulnUntil || this.phased) return 0;
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
        this.invulnUntil = now + 3000; // 3s invulnerability after revive
        this.game.vfx.explosion(this.model.position, 'big');
        this.game.shake(0.7);
        this.model.traverse((o) => { if (o.isMesh && o.material) { o.material.emissive && o.material.emissive.setHex(0xff8a2a); o.material.emissiveIntensity = 1.4; } });
        return real;
      }
      this.hp = 0;
      if (this.game) this.game._onZombieDeath(this);
    }
    return real;
  }

  startDeath(kind) {
    if (this.dead) return;
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

    // advance along path
    const spd = this.baseSpeed * this.speedFactor(now);
    this.progress += (spd * dt) / game.pathLength;
    const pos = game.path.pointAt(this.progress);
    const tan = game.path.tangentAt(this.progress);
    this.model.position.set(pos.x, CONFIG.pathHeight, pos.z); // walk on the raised path
    this.model.rotation.y = Math.atan2(tan.x, tan.z);
    this.model.rotation.x = 0;

    // walk / idle animation
    if (this.isBoss) {
      idleZombie(this.model, now / 1000);
    } else {
      walkZombie(this.model, (now / 1000) * (this.type === 'fast' ? 9 : this.type === 'tank' ? 4 : 6));
    }

    // reached the base
    if (this.progress >= 1) {
      this.reachedBase = true;
      game.onZombieReachedBase(this);
    }
  }

  // Per-boss / per-variant behavior hook.
  onStep(game, now) {
    if (this.isBoss) this.bossStep(game, now);
  }

  bossStep(game, now) {
    const key = this.bossKey;
    const cd = 5000; // ms — 'now' is a performance.now() timestamp
    if (now - this._atkT < cd) return;
    this._atkT = now;
    const p = this.model.userData.parts;
    switch (key) {
      case 'brute': {
        // Slam: FREEZE nearby towers completely for 3s (no damage)
        bossSlam(this.model, now);
        game.shake(0.6);
        game.vfx.explosion(this.model.position, 'big');
        for (const t of game.towers) {
          if (t.model.position.distanceTo(this.model.position) < 4.5) t.petrify(3.0, now, game);
        }
        break;
      }
      case 'stalker': {
        // Teleport a short distance forward + stun a random tower
        bossTeleport(this.model, now);
        this.progress = Math.min(1, this.progress + 0.02);
        const t = game.towers[Math.floor(Math.random() * game.towers.length)];
        if (t) t.freeze(2.0, now);
        break;
      }
      case 'frostking': {
        bossFreezeAura(this.model, now);
        for (const t of game.towers) {
          if (t.model.position.distanceTo(this.model.position) < 6) t.freeze(3.0, now);
        }
        game.vfx.iceRing(this.model.position);
        break;
      }
      case 'pyrolord': {
        bossFireballThrow(this.model, now);
        game.spawnFireball(this.model.position, game.basePos, 18);
        break;
      }
      case 'abomination': {
        bossSpawnMinions(this.model, now);
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
    this.lastShot = -1000;
    this.triggered = false;  // for mines
    this.hp = 60;           // towers can be damaged by bosses
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
    const c = caps ? caps[this.key] : undefined;
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

  takeDamage(amount, game) {
    this.hp -= amount;
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

    switch (d.kind) {
      case 'mine': this.mineUpdate(game, now); break;
      case 'slow': this.frostUpdate(game, now); break;
      case 'continuous': this.flameUpdate(dt, game, now, frozen); break;
      case 'splash': this.mortarUpdate(game, now, frozen); break;
      case 'single': this.singleUpdate(game, now, frozen); break;
    }

    // recoil decay
    if (this.lastShot > 0 && now - this.lastShot < 140) {
      const power = d.kind === 'single' && d.key === 'sniper' ? 0.3 : 0.18;
      towerRecoil(this.model, this.lastShot, power, 0.14);
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
    this.t0 = performance.now();
    this.model = createProjectileModel(kind);
    this.model.position.copy(from);
    this.done = false;
  }

  update(dt, game) {
    const k = animateProjectile(this.model, this.t0, this.from, this.to, this.duration, this.mortar ? 3.0 : 0.25);
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
        if (this.slowPct > 0) this.target.applySlow(this.slowPct, this.slowDur, performance.now());
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
