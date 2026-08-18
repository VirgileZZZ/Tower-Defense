import * as THREE from 'three';
import { terrainHeight } from './config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
  cam.position.set(14, 11, 16);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0x8aa8c8, 0x2a2420, 0.55);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffe8c0, 1.6);
  dir.position.set(18, 24, 12);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -28;
  dir.shadow.camera.right = 28;
  dir.shadow.camera.top = 28;
  dir.shadow.camera.bottom = -28;
  dir.shadow.camera.far = 80;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  return { hemi, dir };
}

export function createGround(size = 90) {
  const geo = new THREE.PlaneGeometry(size, size, 64, 64);
  // Add gentle rolling terrain relief (kept flat near the monster path).
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i);
      const wx = lx, wz = -ly; // plane is rotated -90° about X: local Y -> world -Z
      pos.setZ(i, terrainHeight(wx, wz));
    }
    geo.computeVertexNormals();
  }
  const g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3d4a36, roughness: 1, metalness: 0 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  g.name = 'ground';
  return g;
}

export function createPathRibbon(waypoints, width = 4.6, color = 0xd8c896, height = 0.5, groundColor = 0x3d4a36) {
  const curve = new THREE.CatmullRomCurve3(waypoints.map((w) => new THREE.Vector3(w[0], 0, w[1])));
  const pts = curve.getPoints(150);
  const N = pts.length;

  // Pre-compute a side (left/right) unit vector per sample so walls + ribbons line up.
  const samples = [];
  for (let i = 0; i < N; i++) {
    const next = pts[Math.min(i + 1, N - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    samples.push({ p: pts[i], side });
  }

  // Build a strip mesh. off(i, sign) => Vector3 gives the row-edge points;
  // cols = number of columns across the width; colorFn(t) => THREE.Color gives
  // a per-vertex gradient across the width (t: 0..1, 0.5 = center).
  const strip = (off, twoSided = true, cols = 2, colorFn = null) => {
    const C = Math.max(2, cols | 0);
    const positions = [];
    const indices = [];
    const uvs = [];
    const colors = colorFn ? [] : null;
    for (let i = 0; i < N; i++) {
      const L = off(i, +1), R = off(i, -1);
      for (let c = 0; c < C; c++) {
        const t = C === 1 ? 0 : c / (C - 1);
        const x = L.x + (R.x - L.x) * t, y = L.y + (R.y - L.y) * t, z = L.z + (R.z - L.z) * t;
        positions.push(x, y, z);
        uvs.push(t, i / (N - 1));
        if (colors) {
          const col = colorFn(t);
          colors.push(col.r, col.g, col.b);
        }
      }
      if (i < N - 1) {
        for (let c = 0; c < C - 1; c++) {
          const a = i * C + c, b = a + 1, d = (i + 1) * C + c, e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: twoSided ? THREE.DoubleSide : THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: !!colors });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    return mesh;
  };

  const group = new THREE.Group();
  group.name = 'path';
  const hw = width / 2, hwB = (width + 0.7) / 2;

  // Curbed base (wider, dark) at ground level so the walkway has a crisp dark lip
  const base = strip((i, s) => new THREE.Vector3(samples[i].p.x + samples[i].side.x * hwB * s, 0.02, samples[i].p.z + samples[i].side.z * hwB * s), true, 2);
  base.material.color.setHex(0x2e2820);
  base.material.emissive.setHex(0x14100a);
  base.material.emissiveIntensity = 0.4;
  base.renderOrder = 4;
  group.add(base);

  // Top face: a warm sandy/brown walkway that FADES into the ground at its
  // edges (per-vertex gradient) so it merges with the environment.
  const TOP_COLS = 13;
  const pathC0 = new THREE.Color(color);
  const groundC0 = new THREE.Color(groundColor);
  const top = strip(
    (i, s) => new THREE.Vector3(samples[i].p.x + samples[i].side.x * hw * s, height, samples[i].p.z + samples[i].side.z * hw * s),
    true, TOP_COLS,
    (t) => groundC0.clone().lerp(pathC0, Math.pow(Math.sin(Math.PI * t), 1.4))
  );
  top.material.color.setHex(0xffffff); // path tint now lives in vertex colors
  top.material.emissive = new THREE.Color(0x6a4c1e);
  top.material.emissiveIntensity = 0.18; // subtle self-light, reads as ground-level detail
  top.renderOrder = 6; // always drawn on top of the ground
  group.add(top);

  // keep a 'path' reference so existing color-swap code keeps working
  top.name = 'path';
  group.userData.height = height;
  // Re-tint the top-face gradient (called by applyTheme for each map)
  group.userData.setColors = (pathHex, groundHex) => {
    const pc = new THREE.Color(pathHex), gc = new THREE.Color(groundHex);
    const attr = top.geometry.getAttribute('color');
    if (!attr) return;
    for (let i = 0; i < attr.count; i++) {
      const t = (i % TOP_COLS) / (TOP_COLS - 1);
      const c = gc.clone().lerp(pc, Math.pow(Math.sin(Math.PI * t), 1.4));
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  };
  return group;
}

export function onResize(renderer, camera) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
