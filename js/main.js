// main.js - starts the game: renderer, scene, lights, camera and the game loop.
//
// Phase 1: the ranch, Natalia, her sister Stella following her, and a
// third-person camera you steer with the mouse.
// Phase 2: the horse gets hungry, with a bar floating above its head, and you
// walk up and press F to feed it.
// Phase 3: press E next to a horse to climb on, gallop about, and press E again
// to hop off.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { makeNatalia, makeStella, updateFollower } from './characters.js';
import { createControls } from './controls.js';
import { createHorse, updateHorse, feedHorse, isHungry } from './horse.js';
import { createInteractions } from './interact.js';
import { createRiding } from './riding.js';

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
// The ranch itself. "world" holds { ground, house, barn, bounds }.
// ---------------------------------------------------------------------------
const world = buildWorld(scene);

// ---------------------------------------------------------------------------
// The horses. There is just one for now, but they live in an array so Phase 4
// can add a whole field of them without changing the game loop.
// The spot (6, 4) matches the round "you cannot walk through me" area that
// controls.js already keeps the player out of.
// ---------------------------------------------------------------------------
const horse = createHorse({
  name: 'Biscuit',
  coatColor: 0x9c6b3a, // chestnut brown
  position: new THREE.Vector3(6, 0, 4),
  rotationY: -0.35,    // turned a little so it looks towards the camera
});
scene.add(horse);

const horses = [horse];

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

// Every horse is a round thing nobody can walk through. The circle is read
// from the horse's own position each frame, so once a horse has been ridden to
// a new spot the no-go area is there too, not back where it started.
// (A horse never bumps into itself while it is the one being ridden.)
const HORSE_BLOCK_RADIUS = 1.6;
for (const h of horses) controls.addObstacle(h, HORSE_BLOCK_RADIUS);

// ---------------------------------------------------------------------------
// Interactions: walk up to something and press a key. The system itself lives
// in interact.js and knows nothing about horses - it just shows the words we
// give it and calls us back.
//
// Two <div>s in index.html do the talking: #prompt lists the keys near the
// bottom of the screen, #message flashes the reply at the top.
// ---------------------------------------------------------------------------
const interactions = createInteractions(
  natalia,
  document.getElementById('prompt'),
  document.getElementById('message')
);

// ---------------------------------------------------------------------------
// Riding: E climbs onto a horse and E climbs off again. riding.js does the
// actual work of sitting Natalia on the horse's back and handing the keyboard
// and camera over to it.
// ---------------------------------------------------------------------------
const riding = createRiding({ natalia, stella, controls, interactions, scene });

// Every horse is something Natalia can ride (E) and feed (F). The radius of 3
// units is comfortably outside the 1.6-unit circle controls.js keeps her out
// of, so there is a wide band where she is close enough but not stuck on it.
for (const h of horses) {
  const name = h.userData.name;

  interactions.register({
    object: h,
    radius: 3.0,
    actions: [
      {
        key: 'KeyE',
        // Sitting on this horse? Then E is how you get down again.
        getLabel: () =>
          riding.isRiding() && riding.ridingHorse() === h ? 'Get off' : `Ride ${name}`,
        onPress: () => {
          if (riding.isRiding()) {
            // Only the horse she is actually on can put her down.
            if (riding.ridingHorse() === h) {
              riding.dismount();
              interactions.showMessage('Natalia hops off.');
            }
          } else {
            riding.mount(h);
            interactions.showMessage('Giddy up!');
          }
        },
      },
      {
        key: 'KeyF',
        // An empty label means "nothing to say about F right now", so a full
        // horse simply does not show the feeding line.
        getLabel: () => (isHungry(h) ? `Feed ${name}` : ''),
        onPress: () => {
          // Feeding from the saddle is allowed - she can lean down.
          if (feedHorse(h)) interactions.showMessage(`Yum! ${name} is happy.`);
          else interactions.showMessage(`${name} isn't hungry right now.`);
        },
      },
    ],
  });
}

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
  // 1. Read the keys and the mouse: move whoever is being driven (Natalia on
  //    foot, or the horse she is riding), then place the camera.
  controls.update(dt);
  // 2. Swing Natalia's legs while she is walking. While she is in the saddle
  //    this does nothing - she is holding the sitting pose instead.
  natalia.userData.setWalking(controls.isMoving(), dt);
  // 3. Stella walks to her spot a couple of steps behind whoever she is
  //    following: her sister, or the horse her sister is on.
  //    (updateFollower runs her walk animation for us.)
  const leader = riding.isRiding() ? riding.ridingHorse() : natalia;
  updateFollower(stella, leader, dt);
  // 4. Every horse gets a little hungrier, and turns its bar to face us.
  //    Only the horse Natalia is riding swings its legs; the others stand
  //    still (and setMoving(false) eases their legs back to standing).
  const riddenHorse = riding.isRiding() ? riding.ridingHorse() : null;
  for (const h of horses) {
    updateHorse(h, dt, camera);
    h.userData.setMoving(h === riddenHorse && controls.isMoving(), dt);
  }
  // 5. Show the "E: Ride Biscuit" prompt when she is close enough, and act on
  //    E and F.
  interactions.update(dt);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  update(dt);
  renderer.render(scene, camera);
}

animate();
