import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRenderer, createCamera, createLights, createGround, createPathRibbon, onResize } from './scene.js';
import { createBaseModel, applySkin } from './assets.js';
import { loadSave, loadProgressFromFile, persistSave } from './save.js';
import { Path } from './path.js';
import { CONFIG, terrainHeight, DIFFICULTIES } from './config.js';
import { Game } from './game.js';
import { LightPad } from './lightpad.js';
import { UI } from './ui.js';
import { VFX } from './vfx.js';
import { Input } from './input.js';

// ---------------------------------------------------------------------------
// Scene bootstrap
// ---------------------------------------------------------------------------
const app = document.getElementById('app');
const labelsRoot = document.getElementById('labels');

const renderer = createRenderer(app);
const scene = new THREE.Scene();
const theme0 = CONFIG.themes[0];
scene.background = new THREE.Color(theme0.sky);
scene.fog = new THREE.Fog(theme0.sky, theme0.fog[0], theme0.fog[1]);
const camera = createCamera();
createLights(scene);
// Pool de lumières "lestes" : garde le nombre de PointLight visibles constant
// → les shaders standard ne sont JAMAIS recompilés à l'exécution (sinon :
// saccade à la pose des tours, à l'apparition des boss, au changement de thème).
const lightPad = new LightPad(scene, 28);
scene.add(createGround(CONFIG.groundSize));
scene.add(createPathRibbon(CONFIG.waypoints, 2.6, 0xd2a560, CONFIG.pathHeight, 0x3d4a36));

// Base at the path end, facing the path.
const end = CONFIG.waypoints[CONFIG.waypoints.length - 1];
const preEnd = CONFIG.waypoints[CONFIG.waypoints.length - 2];
const base = createBaseModel();
base.position.set(Math.min(end[0] + 2, CONFIG.mapBounds.maxX - 0.5), 0, end[1]);
base.lookAt(preEnd[0], 0, preEnd[1]);
scene.add(base);
// Apply the equipped house skin (shop) on boot
const _bootSave = loadSave();
if (_bootSave.baseSkin && _bootSave.baseSkin !== 'classic') applySkin(base, _bootSave.baseSkin);
const basePos = base.position.clone();

// ---------------------------------------------------------------------------
// Wire game + ui + vfx + input
// ---------------------------------------------------------------------------
const game = new Game({
  scene, camera, renderer,
  path: Path,
  pathLength: Path.length,
  basePos,
  ui: null, vfx: null, // assigned below
});

const ui = new UI({ game });
const vfx = new VFX({ scene, camera, uiRoot: document.getElementById('labels'), labelsRoot: labelsRoot });
game.ui = ui;
game.vfx = vfx;

const input = new Input({ game, camera, domElement: renderer.domElement });
game.input = input;
game.lightPad = lightPad;

// Initial scenery (theme 0). Re-scattered per theme in game.applyTheme.
game.scatterProps(theme0.props || CONFIG.defaultProps);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 5;
controls.maxDistance = 70;
controls.target.set(0, 0.8, 0);
game.controls = controls;

onResize(renderer, camera);
// Pré-compile tous les shaders AVANT la 1ère image (tours, peaux, zombies,
// boss, décor, munitions, VFX) → plus aucun freeze de compilation pendant
// la partie (ex : à la pose des premières tours).
lightPad.update();
game._warmupShaders();
game.init();
window.__game = game; // debug/inspection handle
window.__CONFIG = CONFIG;
window.__DIFFICULTIES = DIFFICULTIES; // utilisé par le menu (boutons de difficulté + verrouillages)
window.__terrainHeight = terrainHeight; // debug/inspection handle

// progress.json : si un fichier est lié, il est la source de vérité à l'allumage.
// (Récupère la progression si le brouillon localStorage a été effacé.)
loadProgressFromFile().then((data) => {
  if (!data) return;
  if (JSON.stringify(data) === JSON.stringify(game.saveData)) return; // déjà à jour
  game.saveData = data;
  if (data.baseSkin && data.baseSkin !== 'classic') applySkin(base, data.baseSkin);
  else applySkin(base, 'classic');
  game.applySettings(false);
  persistSave(data); // re-synchronise le brouillon localStorage
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let last = performance.now();


function loop(now) {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000;
  last = now;

  if (game.state === 'PLAYING') {
    game.update(dt, now);
  }
  // no auto-rotating camera (user requested it removed)

  controls.update();
  lightPad.update(); // total de point lights constant → 0 recompile shader
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
