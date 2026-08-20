import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Zombie Tower Defense — Animations
// All functions are stateless per-model: they read `model.userData.parts`
// and drive rotations/positions each frame.
// ---------------------------------------------------------------------------

export function walkZombie(model, phase) {
  const p = model.userData.parts;
  if (!p || !p.legL) return;
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  p.legL.rotation.x = s * 0.75;
  p.legR.rotation.x = -s * 0.75;
  p.kneeL.rotation.x = Math.max(0, -s) * 0.85;
  p.kneeR.rotation.x = Math.max(0, s) * 0.85;

  // Zombie shambling walk: shoulders relaxed and slightly forward (zombie
  // reach); the forearm stays ALMOST STRAIGHT with a hint of natural bend —
  // no more elbow curling backwards under the body.
  const ARM_BASE = -0.18; // negative x-rotation swings the arm toward +z (forward)
  p.armL.rotation.x = ARM_BASE - s * 0.26;
  p.armR.rotation.x = ARM_BASE + s * 0.26;
  p.elbowL.rotation.x = -0.10 + Math.max(0, -s) * 0.08; // tiny forward bend only
  p.elbowR.rotation.x = -0.10 + Math.max(0, s) * 0.08;

  p.root.rotation.z = c * 0.05;
  p.root.position.y = Math.abs(s) * 0.03;
  p.head.rotation.z = s * 0.06;
}

export function idleZombie(model, t) {
  const p = model.userData.parts;
  if (!p) return;
  p.armL.rotation.x = Math.sin(t * 1.3) * 0.06 - 0.2;
  p.armR.rotation.x = -Math.sin(t * 1.3 + 0.5) * 0.06 - 0.2;
  p.elbowL.rotation.x = -0.10;
  p.elbowR.rotation.x = -0.10;
  p.head.rotation.z = Math.sin(t * 0.7) * 0.05;
  p.root.position.y = Math.sin(t * 2.2) * 0.02;
}

// -- death animations -------------------------------------------------------

export function deathCollapse(model, t0, duration = 0.7) {
  const p = model.userData.parts;
  if (!p) return;
  const k = Math.min(1, (performance.now() - t0) / 1000 / duration);
  const e = 1 - (1 - k) * (1 - k);
  p.root.rotation.x = e * 1.5;
  p.root.position.y = 1.1 - e * 0.9;
  if (k >= 1) {
    p.armL.rotation.z = 0.5;
    p.armR.rotation.z = -0.5;
  }
}

export function deathExplode(model, t0, duration = 0.5) {
  const p = model.userData.parts;
  if (!p) return;
  const k = Math.min(1, (performance.now() - t0) / 1000 / duration);
  const e = k * k;
  model.scale.setScalar(model.userData.baseScale || 1);
  model.scale.multiplyScalar(1 + e * 0.5);
  model.scale.multiplyScalar(1 - e * e);
  p.armL.rotation.z = -e * 1.6;
  p.armR.rotation.z = e * 1.6;
  p.head.rotation.x = e * 0.8;
  model.position.y = e * 0.2;
}

// -- towers -----------------------------------------------------------------

export function towerRecoil(tower, t0, power = 0.35, duration = 0.12, now) {
  const p = tower.userData.parts;
  if (!p || !p.turret) return;
  const t = now !== undefined ? now : performance.now(); // Point 10 : horloge de jeu si fournie
  const k = Math.min(1, (t - t0) / 1000 / duration);
  const back = (1 - k) * (1 - k);
  p.turret.position.z = -back * power;
  if (p.barrel && tower.name === 'tower-mortar') {
    p.turret.rotation.x = back * 0.25;
  }
}

export function aimTurret(tower, target, speed = 10) {
  const p = tower.userData.parts;
  if (!p || !p.turret) return;
  const dx = target.x - tower.position.x;
  const dz = target.z - tower.position.z;
  const targetYaw = Math.atan2(dx, dz);
  const cur = p.turret.rotation.y;
  let diff = targetYaw - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  p.turret.rotation.y = cur + Math.max(-speed * 0.016, Math.min(speed * 0.016, diff));
}

// -- bosses -----------------------------------------------------------------

export function bossSlam(boss, t0, duration = 0.8) {
  const p = boss.userData.parts;
  if (!p) return;
  const t = (performance.now() - t0) / 1000;
  const k = Math.min(1, t / duration);
  if (k < 0.4) {
    const raise = k / 0.4;
    p.armL.rotation.x = -raise * 2.2;
    p.armR.rotation.x = -raise * 2.2;
    p.armL.rotation.z = -raise * 0.4;
    p.armR.rotation.z = raise * 0.4;
    p.torso.rotation.x = -raise * 0.25;
  } else if (k < 0.5) {
    p.armL.rotation.x = -2.2;
    p.armR.rotation.x = -2.2;
  } else {
    const fall = (k - 0.5) / 0.5;
    const e = fall * fall;
    p.armL.rotation.x = -2.2 + e * 2.7;
    p.armR.rotation.x = -2.2 + e * 2.7;
    p.torso.rotation.x = -0.25 + e * 0.4;
    if (fall < 0.15) {
      boss.userData.shake = 1 - fall / 0.15;
    }
  }
}

export function bossTeleport(boss, t0, duration = 0.4) {
  const k = Math.min(1, (performance.now() - t0) / 1000 / duration);
  const blink = Math.sin(k * Math.PI * 8);
  const s = 1 + blink * 0.06 * (1 - k);
  boss.scale.setScalar(s);
  boss.visible = k < 0.85 || k >= 0.92;
}

export function bossFreezeAura(boss, t0, duration = 1.2) {
  const p = boss.userData.parts;
  if (!p || !p.aura) return;
  const k = Math.min(1, (performance.now() - t0) / 1000 / duration);
  const e = k < 0.5 ? k * 2 : (1 - k) * 2;
  p.aura.scale.setScalar(0.6 + e * 0.7);
  p.aura.material.opacity = 0.06 + e * 0.2;
}

export function bossFireballThrow(boss, t0, duration = 0.7) {
  const p = boss.userData.parts;
  if (!p) return;
  const t = (performance.now() - t0) / 1000;
  const k = Math.min(1, t / duration);
  if (k < 0.4) {
    const c = k / 0.4;
    p.armL.rotation.x = -c * 1.9;
    p.armR.rotation.x = -c * 1.9;
    p.armL.rotation.z = c * 0.8;
    p.armR.rotation.z = -c * 0.8;
    if (p.handFireL) {
      const gs = 0.4 + c * 1.6;
      p.handFireL.scale.setScalar(gs);
      p.handFireR.scale.setScalar(gs);
    }
  } else {
    const f = (k - 0.4) / 0.6;
    const e = f * f;
    p.armL.rotation.x = -1.9 + e * 2.6;
    p.armR.rotation.x = -1.9 + e * 2.6;
    p.armL.rotation.z = 0.8 * (1 - e);
    p.armR.rotation.z = -0.8 * (1 - e);
    if (p.handFireL) {
      p.handFireL.scale.setScalar(2 * (1 - e));
      p.handFireR.scale.setScalar(2 * (1 - e));
    }
  }
}

export function bossSpawnMinions(boss, t0, duration = 1.0) {
  const p = boss.userData.parts;
  if (!p) return;
  const k = Math.min(1, (performance.now() - t0) / 1000 / duration);
  const c = Math.sin(k * Math.PI);
  p.torso.rotation.x = c * 0.35;
  p.armL.rotation.x = -c * 1.4;
  p.armR.rotation.x = -c * 1.4;
  if (p.bileLight) p.bileLight.intensity = 1.8 + c * 4;
}

// -- projectiles --------------------------------------------------------------

// Point 10 : `now` (horloge, ms) est optionnel — par défaut temps réel. Les
// projectiles de jeu passent game.gameTime (scalée par le speed).
export function animateProjectile(proj, t0, from, to, duration, arc = 1.2, now) {
  const t = now !== undefined ? now : performance.now();
  const k = Math.min(1, (t - t0) / 1000 / duration);
  const pos = new THREE.Vector3().copy(from).lerp(to, k);
  pos.y += Math.sin(k * Math.PI) * arc;
  proj.position.copy(pos);
  if (proj.name === 'proj-fireball') {
    proj.scale.setScalar(1 + Math.sin(k * 20) * 0.15);
  }
  if (proj.name === 'proj-shell' || proj.name === 'proj-bullet' || proj.name === 'proj-frost') {
    const dir = new THREE.Vector3().copy(to).sub(from).normalize();
    proj.lookAt(pos.clone().add(dir));
  }
  return k;
}

export function animateExplosion(exp, t0, duration = 0.6) {
  const p = exp.userData.parts;
  const k = Math.min(1, (performance.now() - t0) / 1000 / duration);
  if (p) {
    p.ring.scale.setScalar(0.3 + k * 2.4);
    p.ring.material.opacity = 0.9 * (1 - k);
    p.flash.scale.setScalar(0.5 + k * 1.8);
    p.flash.material.opacity = 0.8 * (1 - k);
  }
  for (const e of exp.userData.embers) {
    const pos = e.userData.dir.clone().multiplyScalar(e.userData.speed * k * duration);
    pos.y -= 4.5 * k * k * duration * 0.5;
    e.position.copy(pos);
    e.scale.setScalar(Math.max(0.05, 1 - k));
  }
  return k;
}
