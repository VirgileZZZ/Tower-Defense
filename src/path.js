import * as THREE from 'three';
import { CONFIG } from './config.js';

// ---------------------------------------------------------------------------
// Path + buildable grid.
// The path is a smooth Catmull-Rom spline through the waypoints. Zombies
// advance by a 0..1 "progress" along the arc length. Placement is validated
// against: bounds, path corridor (Mines exempt), occupied cells, props.
// ---------------------------------------------------------------------------

const wp = CONFIG.waypoints.map((w) => new THREE.Vector3(w[0], 0, w[1]));
const curve = new THREE.CatmullRomCurve3(wp, false, 'centripetal');
const length = curve.getLength();

// Sampled points for fast distance-to-path queries.
const SAMPLES = 240;
const samples = [];
for (let i = 0; i < SAMPLES; i++) samples.push(curve.getPointAt(i / (SAMPLES - 1)));

function distanceToPath(x, z) {
  let best = Infinity;
  for (const p of samples) {
    const dx = p.x - x;
    const dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function snap(x, z) {
  const c = CONFIG.gridCell;
  return [Math.round(x / c) * c, Math.round(z / c) * c];
}

// Occupancy is a Set of "gx|gz" keys (owned by the game).
function isBuildable(x, z, type, occupied, propBlocks) {
  const b = CONFIG.mapBounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  const dPath = distanceToPath(x, z);
  if (type === 'mine') {
    // Mines only make sense near the walking path.
    if (dPath > (CONFIG.minePathMax ?? 4.5)) return false;
  } else if (dPath < CONFIG.pathClearance) {
    return false;
  }
  const [gx, gz] = snap(x, z);
  if (occupied && occupied.has(gx + '|' + gz)) return false;
  if (propBlocks) {
    for (const p of propBlocks) {
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < p.r * p.r) return false;
    }
  }
  return true;
}

export const Path = {
  curve,
  length,
  get lengthValue() {
    return length;
  },
  pointAt(progress) {
    return curve.getPointAt(Math.min(1, Math.max(0, progress)));
  },
  tangentAt(progress) {
    return curve.getTangentAt(Math.min(1, Math.max(0, progress)));
  },
  distanceToPath,
  snap,
  isBuildable,
};
