import * as THREE from 'three';

/**
 * Pool de "lumières lestes" qui maintient le nombre de PointLight VISIBLES
 * de la scène CONSTANT (= size) en permanence.
 *
 * Pourquoi ? three.js inclut le NOMBRE de point lights de la scène dans la
 * clé de cache des programmes shader des matériaux standard/physical.
 * Dès qu'un objet avec une lumière entre/sort de la scène (pose d'une tour,
 * apparition d'un boss, changement de thème…), TOUTES les tuiles standard
 * sont recompilées → saccade d'une demi-seconde (surtout au démarrage).
 *
 * Le pad complète donc avec des lumières nulles (intensity 0, loin de tout,
 * mais visibles : trois ne les compte que sur `visible`) pour que le total
 * reste identique → aucun recompile, jamais.
 *
 * À appeler à CHAQUE frame (très léger : un seul traverse de la scène).
 */
export class LightPad {
  constructor(scene, size = 28) {
    this.size = size;
    this.scene = scene;
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 0, 2);
      l.userData.__pad = true;
      l.position.set(0, -9999, 0);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** Complète avec des lumières nulles pour que le total de PointLight
   *  visibles reste `size`. Si les vraies lumières dépassent `size`,
   *  le pad se met hors service (cas quasi impossible : le max théorique
   *  de la partie est ~20). */
  update() {
    let real = 0;
    this.scene.traverse((o) => {
      if (o.isPointLight && !o.userData.__pad && o.visible) real++;
    });
    const needed = Math.max(0, this.size - real);
    for (let i = 0; i < this.size; i++) this.lights[i].visible = i < needed;
  }

  dispose() {
    for (const l of this.lights) this.scene.remove(l);
    this.lights.length = 0;
  }
}
