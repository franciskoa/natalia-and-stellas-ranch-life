// main.js - starts the game: renderer, scene, lights, camera and the game loop.
//
// Phase 1: the ranch, Natalia, her sister Stella following her, and a
// third-person camera you steer with the mouse.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { makeNatalia, makeStella, updateFollower } from './characters.js';
import { createControls } from './controls.js';

// Sky colour. The same value is used in index.html so the page never flashes
// white before Three.js starts drawing.
const SKY_COLOR = 0x87ceeb;

// ---------------------------------------------------------------------------
// Renderer - the thing that actually draws pixels into a <canvas>.
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Capping the pixel ratio at 2 keeps high-DPI screens from doing 3x the work.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene - the container for everything in the 3D world.
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
// Light fog in the same colour, so distant trees fade softly into the horizon.
scene.fog = new THREE.Fog(SKY_COLOR, 50, 115);

// ---------------------------------------------------------------------------
// Camera - our eye on the world.
// ---------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  55,                                     // field of view in degrees
  window.innerWidth / window.innerHeight, // aspect ratio
  0.1,                                    // nearest visible distance
  500                                     // furthest visible distance
);
// The follow camera in controls.js places this camera every frame.

// ---------------------------------------------------------------------------
// Lights - cheap and cheerful, no shadow maps.
// ---------------------------------------------------------------------------
// Sky light: blue from above, grass green bounced from below.
const hemiLight = new THREE.HemisphereLight(0xdff0ff, 0x9a9a72, 0.55);
scene.add(hemiLight);

// Sun: one directional light coming from the front-left, high up.
const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.15);
sunLight.position.set(-25, 38, 32);
scene.add(sunLight);

// ---------------------------------------------------------------------------
// The ranch itself. "world" holds { ground, house, barn, horse, bounds }.
// ---------------------------------------------------------------------------
const world = buildWorld(scene);

// ---------------------------------------------------------------------------
// The girls. Both stand in the yard in front of the house and the barn, which
// are off towards -Z, so they start turned that way (rotation.y = PI faces -Z).
// ---------------------------------------------------------------------------
const natalia = makeNatalia();
natalia.position.set(0, 0, 8);
natalia.rotation.y = Math.PI;
scene.add(natalia);

// Stella starts exactly on her following spot - a step and a half behind
// Natalia and a step to Natalia's left - so she does not shuffle into place
// on the first frame.
const stella = makeStella();
stella.position.set(-1.4, 0, 9.8);
stella.rotation.y = Math.PI;
scene.add(stella);

// ---------------------------------------------------------------------------
// Controls: WASD / arrow keys walk Natalia, dragging the mouse looks around.
// ---------------------------------------------------------------------------
const controls = createControls(natalia, camera, renderer.domElement, world.bounds);

// ---------------------------------------------------------------------------
// Keep the picture the right shape when the window is resized.
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Game loop. update(dt) runs once per frame; dt is the seconds since the last
// frame, so movement speeds stay the same on fast and slow computers.
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function update(dt) {
  // 1. Read the keys and the mouse: move Natalia, then place the camera.
  controls.update(dt);
  // 2. Swing Natalia's legs while she is walking.
  natalia.userData.setWalking(controls.isMoving(), dt);
  // 3. Stella walks to her spot a couple of steps behind her sister.
  //    (updateFollower runs her walk animation for us.)
  updateFollower(stella, natalia, dt);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  update(dt);
  renderer.render(scene, camera);
}

animate();
