// controls.js - keyboard driving plus the third-person follow camera.
//
// The same code moves whoever is being driven: Natalia on foot, or a horse once
// she has climbed on. That "whoever" is called the SUBJECT, and riding.js swaps
// it over with setSubject().
//
// createControls(subject, camera, domElement, bounds) wires up the listeners and
// hands back an object with:
//   update(dt)             - move the subject and the camera, once per frame
//   isMoving()             - true while a walk key is held (for the animations)
//   setSubject(config)     - drive something else, at its own speed
//   getSubject()           - the config we are driving right now
//   addObstacle(obj, r)    - a round thing to walk around that can move about
//   isSpotFree(x, z, r)    - is that patch of grass clear of the buildings and
//                            inside the ranch? (riding.js asks before it puts
//                            Natalia down beside a horse)
//   resolveSpot(x, z, r)   - the nearest spot that IS clear, pushed out of any
//                            building the same way walking into one would be
//
// Movement is camera-relative: W always walks away from the camera, whichever
// way the camera happens to be pointing.

import * as THREE from 'three';

// --- tuning numbers, all in one place --------------------------------------
// The "on foot" numbers. A horse's numbers are passed in by riding.js.
const WALK_SPEED = 4.5;      // units per second
const TURN_SPEED = 10;       // how fast the subject swivels to face its path
const CAMERA_HEIGHT = 1.2;   // the camera orbits this far above her feet
const CAMERA_DISTANCE = 7;   // starting distance from her
const WALK_RADIUS = 0.35;    // how wide she is, for bumping into things

const MIN_DISTANCE = 4;      // mouse wheel zoom limits
const MAX_DISTANCE = 14;     // roomy enough for the further-back horse camera
const MIN_PITCH = 0.15;      // nearly level with the ground
const MAX_PITCH = 1.2;       // looking down from above
const MIN_CAMERA_Y = 0.6;    // never let the camera sink below the grass
const MOUSE_SENSITIVITY = 0.005;
const CAMERA_SMOOTHING = 8;  // higher = the camera keeps up more tightly
const SWITCH_SMOOTHING = 4;  // how fast the camera glides to its new distance
                             // and height after climbing on or off a horse

// Keys we care about. Using event.code means the keys work on any keyboard
// layout (a French AZERTY keyboard still reports "KeyW" for the same key).
const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACK_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const ALL_KEYS = [...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS];

// Solid things nobody can walk into. Boxes are flat rectangles on the ground,
// given as their min and max x/z. These never move, so plain numbers will do.
export const BLOCK_BOXES = [
  { minX: -15.5, maxX: -8.5, minZ: -11.5, maxZ: -4.5 }, // house
  { minX: 8.5, maxX: 19.5, minZ: -14.5, maxZ: -5.5 },   // barn
];

// Round things - horses - are added with addObstacle(). They are stored as the
// object itself, not as x/z numbers, because a horse walks about: we read its
// position fresh every frame, so the no-go circle travels with it.

// Turn "current" towards "target" the short way round, at most "maxStep".
function turnTowards(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

// Push a position out of a box, along whichever side is nearest.
// "pad" makes the box a little bigger, so a wide subject (a horse) stops
// further out than a narrow one (a girl).
function pushOutOfBox(position, b, pad) {
  const minX = b.minX - pad;
  const maxX = b.maxX + pad;
  const minZ = b.minZ - pad;
  const maxZ = b.maxZ + pad;

  if (position.x < minX || position.x > maxX) return;
  if (position.z < minZ || position.z > maxZ) return;

  // How far it would have to travel to leave by each of the four sides.
  const outLeft = position.x - minX;
  const outRight = maxX - position.x;
  const outBack = position.z - minZ;
  const outFront = maxZ - position.z;
  const smallest = Math.min(outLeft, outRight, outBack, outFront);

  if (smallest === outLeft) position.x = minX;
  else if (smallest === outRight) position.x = maxX;
  else if (smallest === outBack) position.z = minZ;
  else position.z = maxZ;
}

// Is (x, z) inside this box once the box has been padded out by "pad"?
function insideBox(x, z, b, pad) {
  return (
    x > b.minX - pad && x < b.maxX + pad &&
    z > b.minZ - pad && z < b.maxZ + pad
  );
}

// ---------------------------------------------------------------------------
// isSpotFree - could somebody of this size stand here?  True when the spot is
// out of every building and (if bounds are given) still on the ranch.
// Anyone can call this without having made a controls object, which is how
// riding.js checks where it may put Natalia down.
// ---------------------------------------------------------------------------
export function isSpotFree(x, z, radius = WALK_RADIUS, bounds = null) {
  if (bounds) {
    if (x < bounds.minX || x > bounds.maxX) return false;
    if (z < bounds.minZ || z > bounds.maxZ) return false;
  }
  for (const b of BLOCK_BOXES) {
    if (insideBox(x, z, b, radius)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// resolveSpot - the same spot, made safe: clamped onto the ranch and pushed
// out of any building it was inside, exactly the way walking into a wall is
// handled. Hands back a plain { x, z }.
// ---------------------------------------------------------------------------
export function resolveSpot(x, z, radius = WALK_RADIUS, bounds = null) {
  const spot = { x, z };

  if (bounds) {
    spot.x = Math.max(bounds.minX, Math.min(bounds.maxX, spot.x));
    spot.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, spot.z));
  }

  for (const b of BLOCK_BOXES) pushOutOfBox(spot, b, radius);

  // Pushing out of a wall could in theory nudge the spot off the edge of the
  // ranch, so clamp once more on the way out.
  if (bounds) {
    spot.x = Math.max(bounds.minX, Math.min(bounds.maxX, spot.x));
    spot.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, spot.z));
  }

  return spot;
}

// Push a position out to the edge of a circle centred on (cx, cz).
function pushOutOfCircle(position, cx, cz, radius) {
  const dx = position.x - cx;
  const dz = position.z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= radius) return;
  if (dist < 0.0001) {
    // Exactly in the middle: just nudge it out along +X.
    position.x = cx + radius;
    return;
  }
  position.x = cx + (dx / dist) * radius;
  position.z = cz + (dz / dist) * radius;
}

export function createControls(player, camera, domElement, bounds) {
  // Which movement keys are held down right now.
  const held = new Set();

  // What we are driving, and how it handles. riding.js replaces this whole
  // object when Natalia climbs on or off a horse.
  let subject = {
    object: player,
    speed: WALK_SPEED,
    turnSpeed: TURN_SPEED,
    cameraDistance: CAMERA_DISTANCE,
    cameraHeight: CAMERA_HEIGHT,
    collisionRadius: WALK_RADIUS,
  };

  // Round obstacles that can move: { object, radius }.
  const obstacles = [];

  // Where the camera sits: an angle around the subject (yaw), an angle above
  // the ground (pitch) and how far away it is.
  let yaw = 0;          // 0 puts the camera on the +Z side, behind her back
  let pitch = 0.42;

  // Distance and height come in pairs: the "wanted" value is where we are
  // heading (set by setSubject and by the mouse wheel) and the plain one is
  // where the camera actually is. The plain one slides towards the wanted one,
  // so swinging up onto a horse pulls the camera back smoothly instead of
  // snapping to the new spot.
  let wantedDistance = subject.cameraDistance;
  let distance = wantedDistance;
  let wantedHeight = subject.cameraHeight;
  let height = wantedHeight;

  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let moving = false;

  // Reusable vectors, so we are not making new ones 60 times a second.
  const lookTarget = new THREE.Vector3();
  const wantedCamera = new THREE.Vector3();
  const obstaclePosition = new THREE.Vector3();

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
    wantedDistance += event.deltaY * 0.01;
    wantedDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, wantedDistance));
    event.preventDefault();
  }
  domElement.addEventListener('wheel', onWheel, { passive: false });

  // --- who are we driving? --------------------------------------------------
  // Everything except "object" is optional and falls back to the walking numbers.
  function setSubject(config) {
    if (!config || !config.object) return;

    subject = {
      object: config.object,
      speed: config.speed ?? WALK_SPEED,
      turnSpeed: config.turnSpeed ?? TURN_SPEED,
      cameraDistance: config.cameraDistance ?? CAMERA_DISTANCE,
      cameraHeight: config.cameraHeight ?? CAMERA_HEIGHT,
      collisionRadius: config.collisionRadius ?? WALK_RADIUS,
    };

    // Aim the camera at the new distance and height. It glides there over the
    // next half-second or so rather than jumping.
    wantedDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, subject.cameraDistance));
    wantedHeight = subject.cameraHeight;
  }

  function getSubject() {
    return subject;
  }

  // Add a round thing to walk around. We keep the object, not its numbers, so
  // the no-go circle follows it if it moves.
  function addObstacle(object, radius) {
    if (!object) return;
    obstacles.push({ object, radius });
  }

  // --- one frame of movement ------------------------------------------------
  function moveSubject(dt) {
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

    // The camera sits at yaw around the subject, so "away from the camera" is
    // the opposite of that direction. Right is that vector turned 90 degrees.
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    let moveX = forwardX * forwardInput + rightX * rightInput;
    let moveZ = forwardZ * forwardInput + rightZ * rightInput;

    // Normalise, so moving diagonally is not faster than moving straight.
    const length = Math.hypot(moveX, moveZ);
    if (length < 0.0001) {
      moving = false;
      return;
    }
    moveX /= length;
    moveZ /= length;

    const position = subject.object.position;
    position.x += moveX * subject.speed * dt;
    position.z += moveZ * subject.speed * dt;

    // Turn it smoothly to face the way it is going (+Z is forward for both the
    // girls and the horses).
    const facing = Math.atan2(moveX, moveZ);
    subject.object.rotation.y = turnTowards(
      subject.object.rotation.y, facing, subject.turnSpeed * dt
    );

    // Stay on the ranch and out of the buildings.
    position.x = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
    position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));

    const pad = subject.collisionRadius;
    for (const b of BLOCK_BOXES) pushOutOfBox(position, b, pad);

    for (const obstacle of obstacles) {
      // A horse must not bump into itself while it is the one being ridden.
      if (obstacle.object === subject.object) continue;
      obstacle.object.getWorldPosition(obstaclePosition);
      pushOutOfCircle(position, obstaclePosition.x, obstaclePosition.z, obstacle.radius + pad);
    }
  }

  function moveCamera(dt, snap) {
    // Ease the camera's distance and height towards the numbers the current
    // subject asked for.
    if (snap) {
      distance = wantedDistance;
      height = wantedHeight;
    } else {
      const switchSmooth = 1 - Math.exp(-SWITCH_SMOOTHING * dt);
      distance += (wantedDistance - distance) * switchSmooth;
      height += (wantedHeight - height) * switchSmooth;
    }

    // The point the camera orbits around and looks at: head-ish height.
    const position = subject.object.position;
    lookTarget.set(position.x, position.y + height, position.z);

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
    moveSubject(step);
    moveCamera(step);
  }

  function isMoving() {
    return moving;
  }

  // The same two spot helpers as above, but with this ranch's bounds already
  // filled in, so callers that hold the controls object do not have to.
  function isSpotFreeHere(x, z, radius = WALK_RADIUS) {
    return isSpotFree(x, z, radius, bounds);
  }

  function resolveSpotHere(x, z, radius = WALK_RADIUS) {
    return resolveSpot(x, z, radius, bounds);
  }

  // Put the camera straight behind her before the first frame is drawn.
  moveCamera(0, true);

  return {
    update,
    isMoving,
    setSubject,
    getSubject,
    addObstacle,
    isSpotFree: isSpotFreeHere,
    resolveSpot: resolveSpotHere,
  };
}
