// controls.js - keyboard walking plus the third-person follow camera.
//
// createControls(player, camera, domElement, bounds) wires up the listeners and
// hands back an object with:
//   update(dt)  - move the player and the camera, once per frame
//   isMoving()  - true while a walk key is held (used for the walk animation)
//
// Movement is camera-relative: W always walks away from the camera, whichever
// way the camera happens to be pointing.

import * as THREE from 'three';

// --- tuning numbers, all in one place --------------------------------------
const WALK_SPEED = 4.5;      // units per second
const TURN_SPEED = 10;       // how fast the player swivels to face her path
const CAMERA_HEIGHT = 1.2;   // the camera orbits this far above her feet
const CAMERA_DISTANCE = 7;   // starting distance from her
const MIN_DISTANCE = 4;      // mouse wheel zoom limits
const MAX_DISTANCE = 12;
const MIN_PITCH = 0.15;      // nearly level with the ground
const MAX_PITCH = 1.2;       // looking down from above
const MIN_CAMERA_Y = 0.6;    // never let the camera sink below the grass
const MOUSE_SENSITIVITY = 0.005;
const CAMERA_SMOOTHING = 8;  // higher = the camera keeps up more tightly

// Keys we care about. Using event.code means the keys work on any keyboard
// layout (a French AZERTY keyboard still reports "KeyW" for the same key).
const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACK_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const ALL_KEYS = [...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS];

// Solid things the player cannot walk into. Boxes are flat rectangles on the
// ground, given as their min and max x/z.
const BLOCK_BOXES = [
  { minX: -15.5, maxX: -8.5, minZ: -11.5, maxZ: -4.5 }, // house
  { minX: 8.5, maxX: 19.5, minZ: -14.5, maxZ: -5.5 },   // barn
];
// And one round thing: the horse.
const BLOCK_CIRCLES = [
  { x: 6, z: 4, radius: 1.6 },
];

// Turn "current" towards "target" the short way round, at most "maxStep".
function turnTowards(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

// Push a position out of a box, along whichever side is nearest.
function pushOutOfBox(position, b) {
  if (position.x < b.minX || position.x > b.maxX) return;
  if (position.z < b.minZ || position.z > b.maxZ) return;

  // How far she would have to travel to leave by each of the four sides.
  const outLeft = position.x - b.minX;
  const outRight = b.maxX - position.x;
  const outBack = position.z - b.minZ;
  const outFront = b.maxZ - position.z;
  const smallest = Math.min(outLeft, outRight, outBack, outFront);

  if (smallest === outLeft) position.x = b.minX;
  else if (smallest === outRight) position.x = b.maxX;
  else if (smallest === outBack) position.z = b.minZ;
  else position.z = b.maxZ;
}

// Push a position out to the edge of a circle.
function pushOutOfCircle(position, c) {
  const dx = position.x - c.x;
  const dz = position.z - c.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= c.radius) return;
  if (dist < 0.0001) {
    // Exactly in the middle: just nudge her out along +X.
    position.x = c.x + c.radius;
    return;
  }
  position.x = c.x + (dx / dist) * c.radius;
  position.z = c.z + (dz / dist) * c.radius;
}

export function createControls(player, camera, domElement, bounds) {
  // Which movement keys are held down right now.
  const held = new Set();

  // Where the camera sits: an angle around the player (yaw), an angle above
  // the ground (pitch) and how far away it is.
  let yaw = 0;          // 0 puts the camera on the +Z side, behind her back
  let pitch = 0.42;
  let distance = CAMERA_DISTANCE;

  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let moving = false;

  // Reusable vectors, so we are not making new ones 60 times a second.
  const lookTarget = new THREE.Vector3();
  const wantedCamera = new THREE.Vector3();

  // --- keyboard ------------------------------------------------------------
  function onKeyDown(event) {
    if (event.repeat) return;              // ignore the OS key-repeat storm
    if (!ALL_KEYS.includes(event.code)) return;
    held.add(event.code);
    event.preventDefault();                // stop arrow keys scrolling the page
  }

  function onKeyUp(event) {
    if (!ALL_KEYS.includes(event.code)) return;
    held.delete(event.code);
    event.preventDefault();
  }

  // If the player alt-tabs away, forget every held key so she does not walk off
  // on her own while the tab is in the background.
  function onBlur() {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // --- mouse: hold the left button and drag to look around ------------------
  function onPointerDown(event) {
    if (event.button !== 0) return;
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    // Capturing the pointer keeps the drag working even if the mouse slides
    // off the canvas. Some browsers refuse, which is fine - hence the try.
    try {
      domElement.setPointerCapture(event.pointerId);
    } catch (err) {
      // No capture available: dragging still works inside the canvas.
    }
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    yaw -= dx * MOUSE_SENSITIVITY;
    pitch += dy * MOUSE_SENSITIVITY;
    pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
  }

  function onPointerUp(event) {
    dragging = false;
    if (domElement.releasePointerCapture && event.pointerId !== undefined) {
      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch (err) {
        // The browser had already let the capture go - nothing to do.
      }
    }
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);

  // Mouse wheel moves the camera nearer or further away.
  function onWheel(event) {
    distance += event.deltaY * 0.01;
    distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
    event.preventDefault();
  }
  domElement.addEventListener('wheel', onWheel, { passive: false });

  // --- one frame of movement ------------------------------------------------
  function movePlayer(dt) {
    // Add up the keys into "forward" and "sideways" amounts.
    let forwardInput = 0;
    let rightInput = 0;
    for (const code of held) {
      if (FORWARD_KEYS.includes(code)) forwardInput += 1;
      if (BACK_KEYS.includes(code)) forwardInput -= 1;
      if (RIGHT_KEYS.includes(code)) rightInput += 1;
      if (LEFT_KEYS.includes(code)) rightInput -= 1;
    }

    moving = forwardInput !== 0 || rightInput !== 0;
    if (!moving) return;

    // The camera sits at yaw around the player, so "away from the camera" is
    // the opposite of that direction. Right is that vector turned 90 degrees.
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    let moveX = forwardX * forwardInput + rightX * rightInput;
    let moveZ = forwardZ * forwardInput + rightZ * rightInput;

    // Normalise, so walking diagonally is not faster than walking straight.
    const length = Math.hypot(moveX, moveZ);
    if (length < 0.0001) {
      moving = false;
      return;
    }
    moveX /= length;
    moveZ /= length;

    player.position.x += moveX * WALK_SPEED * dt;
    player.position.z += moveZ * WALK_SPEED * dt;

    // Turn her smoothly to face the way she is walking (+Z is her forward).
    const facing = Math.atan2(moveX, moveZ);
    player.rotation.y = turnTowards(player.rotation.y, facing, TURN_SPEED * dt);

    // Stay on the ranch and out of the buildings.
    player.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, player.position.x));
    player.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, player.position.z));
    for (const b of BLOCK_BOXES) pushOutOfBox(player.position, b);
    for (const c of BLOCK_CIRCLES) pushOutOfCircle(player.position, c);
  }

  function moveCamera(dt, snap) {
    // The point the camera orbits around and looks at: her head-ish height.
    lookTarget.set(player.position.x, player.position.y + CAMERA_HEIGHT, player.position.z);

    // Turn yaw/pitch/distance into an actual spot in the world.
    const flat = Math.cos(pitch) * distance;
    wantedCamera.set(
      lookTarget.x + Math.sin(yaw) * flat,
      lookTarget.y + Math.sin(pitch) * distance,
      lookTarget.z + Math.cos(yaw) * flat
    );

    // Glide towards that spot instead of jumping to it. On the very first
    // frame we do jump, so the game does not open mid-swoop.
    if (snap) {
      camera.position.copy(wantedCamera);
    } else {
      const smooth = 1 - Math.exp(-CAMERA_SMOOTHING * dt);
      camera.position.lerp(wantedCamera, smooth);
    }

    // Safety net: the camera may never drop below the grass.
    if (camera.position.y < MIN_CAMERA_Y) camera.position.y = MIN_CAMERA_Y;

    camera.lookAt(lookTarget);
  }

  function update(dt) {
    // A tab that has been in the background can hand us a huge dt; cap it so
    // nobody teleports across the field.
    const step = Math.min(dt, 0.1);
    movePlayer(step);
    moveCamera(step);
  }

  function isMoving() {
    return moving;
  }

  // Put the camera straight behind her before the first frame is drawn.
  moveCamera(0, true);

  return { update, isMoving };
}
