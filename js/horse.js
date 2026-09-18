// horse.js - one horse: its body, its hunger, and the little bar floating
// above its head.
//
// A horse is a THREE.Group whose origin sits on the ground between its hooves,
// so horse.position.set(x, 0, z) always stands it flat on the grass. The model
// looks along +Z, which means rotationY = 0 faces +Z.
//
// What this module gives the rest of the game:
//   createHorse({ name, coatColor, position, rotationY })  -> the THREE.Group
//   updateHorse(horse, dt, camera)  - call once per frame
//   feedHorse(horse)                - fill the hunger bar up again
//   isHungry(horse)                 - true while the bar is not full
//
// Each horse also carries its own little walk animation, the same idea as the
// girls' setWalking in characters.js:
//   horse.userData.setMoving(isMoving, dt)   - swing the legs while it walks
//   horse.userData.legs                      - [frontLeft, frontRight,
//                                               backLeft, backRight]
//
// The hunger number itself lives on the group, at horse.userData.hunger, and
// runs from 100 (just fed) down to 0 (very hungry).

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tuning numbers, all in one place.
// ---------------------------------------------------------------------------

// Hunger points lost per second. 100 / 90 empties a full bar in about ninety
// seconds. That is DELIBERATELY fast for now, so the bar visibly drops while
// we are testing Phase 2. A real game would use a much slower number.
const HUNGER_DRAIN_PER_SECOND = 100 / 90; // about 1.11 points a second

const MAX_HUNGER = 100;

// The happy head-bob after being fed: how long it lasts and how far it dips.
const FEED_BOB_SECONDS = 0.6;
const FEED_BOB_ANGLE = 0.55; // radians the head tips down at the bottom

// The walk cycle, built the same way as the girls' one in characters.js.
const GAIT_SWING = 0.5;  // radians: how far forward and back a leg swings
const GAIT_RATE = 8;     // how fast the legs swing, in radians a second
const GAIT_EASE = 8;     // how quickly the swing fades in when it sets off and
                         // out when it stops, so it never freezes mid-stride
const BODY_BOB = 0.05;   // how far the body lifts on each stride

// How high the hip joints are above the grass. Each leg hangs from this point
// and turns around it, the way a real leg turns at the hip.
const HIP_HEIGHT = 1.25;

// The floating hunger bar. It has to clear the hat of whoever is riding:
// Natalia's straw hat reaches about 3.33 above the horse's feet, so 3.95
// leaves a comfortable gap above it.
const BAR_HEIGHT_ABOVE_FEET = 3.95;
const BAR_WIDTH = 1.6;
const BAR_THICKNESS = 0.22;
const BAR_DEPTH = 0.05;

// Bar colours: full and happy, getting peckish, really hungry.
const BAR_GREEN = 0x4caf50;
const BAR_YELLOW = 0xffc107;
const BAR_RED = 0xe53935;
const BAR_BACKGROUND = 0x2b2b2b; // dark grey, so the fill stands out

// Default chestnut coat, the same brown the Phase 1 horse used.
const DEFAULT_COAT = 0x9c6b3a;
const HOOF_AND_HAIR = 0x3e2723; // mane, tail and hooves are almost black

// ---------------------------------------------------------------------------
// Materials. One per colour, made once and shared by every mesh that uses it,
// which keeps the game light on the graphics card.
// ---------------------------------------------------------------------------
const materials = {};
function mat(color) {
  if (!materials[color]) {
    materials[color] = new THREE.MeshLambertMaterial({ color });
  }
  return materials[color];
}

// ---------------------------------------------------------------------------
// Shared geometries: every horse has the same size legs, hooves and ears, so
// they can all share one shape each instead of making their own copies.
// ---------------------------------------------------------------------------
const legGeo = new THREE.BoxGeometry(0.22, 1.0, 0.22);
// Move the leg shape down inside itself, so y = 0 is its TOP end. A leg has to
// swing from the hip, and a mesh always turns around its own origin: leave the
// shape centred and the leg would pivot around its knee instead.
legGeo.translate(0, -0.5, 0);

const hoofGeo = new THREE.BoxGeometry(0.28, 0.26, 0.3);
const earGeo = new THREE.BoxGeometry(0.12, 0.24, 0.12);

// Tiny helper: a box mesh at a position. Keeps the body code below short.
function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// The same idea, but re-using a geometry we already made.
function shaped(geometry, x, y, z, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

// One leg: a small group parked at the hip, with the leg and its hoof hanging
// below it. Turning that group swings the whole leg from the hip in one piece.
function buildLeg(x, z, coat, dark) {
  const leg = new THREE.Group();
  leg.position.set(x, HIP_HEIGHT, z);

  // The leg shape already has its origin at the top (see legGeo above), so it
  // simply hangs straight down from the hip.
  leg.add(new THREE.Mesh(legGeo, coat));

  // The hoof sits at the bottom. Its height is measured from the hip now that
  // it is a child of the leg, so 0.13 above the grass is 0.13 - HIP_HEIGHT.
  const hoof = new THREE.Mesh(hoofGeo, dark);
  hoof.position.y = 0.13 - HIP_HEIGHT;
  leg.add(hoof);

  return leg;
}

// ---------------------------------------------------------------------------
// The hunger bar: two flat boxes, no HTML at all.  The background is a dark
// slab and the coloured fill sits just in front of it.
//
// The trick with the fill: its shape is shifted inside itself so that its LEFT
// edge sits at the mesh origin. Then the mesh is parked at the left end of the
// bar, and shrinking it with scale.x pulls it in from the right, exactly like
// a health bar in a real game.
// ---------------------------------------------------------------------------
function buildHungerBar() {
  // "holder" is the part we spin each frame so the bar faces the camera.
  const holder = new THREE.Group();
  holder.name = 'hungerBar';
  holder.position.y = BAR_HEIGHT_ABOVE_FEET;

  // MeshBasicMaterial ignores the lights, so the bar keeps the same bright
  // colour no matter which way the sun is shining.
  const background = new THREE.Mesh(
    new THREE.BoxGeometry(BAR_WIDTH, BAR_THICKNESS, BAR_DEPTH),
    new THREE.MeshBasicMaterial({ color: BAR_BACKGROUND })
  );
  holder.add(background);

  // The fill is a little smaller than the background, so a thin dark border
  // shows all the way round it.
  const fillWidth = BAR_WIDTH - 0.1;
  const fillGeo = new THREE.BoxGeometry(fillWidth, BAR_THICKNESS - 0.07, BAR_DEPTH);
  // Move the shape sideways inside itself: now x = 0 is its left edge.
  fillGeo.translate(fillWidth / 2, 0, 0);

  const fill = new THREE.Mesh(
    fillGeo,
    new THREE.MeshBasicMaterial({ color: BAR_GREEN })
  );
  // Park it at the left end of the background, a hair in front of it.
  fill.position.set(-fillWidth / 2, 0, BAR_DEPTH * 0.6);
  holder.add(fill);

  return { holder, fill };
}

// Pick the bar colour for a hunger value: green while the horse is well fed,
// yellow when it is getting peckish, red when it is really hungry.
function barColorFor(hunger) {
  if (hunger >= 60) return BAR_GREEN;
  if (hunger >= 30) return BAR_YELLOW;
  return BAR_RED;
}

// Make the bar match the horse's current hunger: how long it is, and its colour.
function refreshBar(horse) {
  const data = horse.userData;
  const fraction = data.hunger / MAX_HUNGER;
  // Never scale all the way down to zero: a zero-wide shape upsets the maths
  // Three.js does behind the scenes, so we always leave a sliver.
  data.barFill.scale.x = Math.max(0.001, fraction);
  data.barFill.material.color.setHex(barColorFor(data.hunger));
}

// ---------------------------------------------------------------------------
// createHorse - build one horse and everything it carries.
//
//   createHorse({
//     name: 'Biscuit',            // what the horse is called
//     coatColor: 0x9c6b3a,        // its coat, as a hex colour
//     position: new THREE.Vector3(6, 0, 4),
//     rotationY: -0.35,           // which way it is turned, in radians
//   })
// ---------------------------------------------------------------------------
export function createHorse({
  name = 'Horse',
  coatColor = DEFAULT_COAT,
  position,
  rotationY = 0,
} = {}) {
  const horse = new THREE.Group();
  horse.name = 'horse';

  const coat = mat(coatColor);
  const dark = mat(HOOF_AND_HAIR);

  // Four legs with darker hooves. The horse looks along +Z, so the front legs
  // are the ones at z = +0.7, and its own left-hand side is +X.
  const frontLeft = buildLeg(0.33, 0.7, coat, dark);
  const frontRight = buildLeg(-0.33, 0.7, coat, dark);
  const backLeft = buildLeg(0.33, -0.7, coat, dark);
  const backRight = buildLeg(-0.33, -0.7, coat, dark);
  const legs = [frontLeft, frontRight, backLeft, backRight];
  for (const leg of legs) horse.add(leg);

  // Everything above the legs hangs off "body", so the walk can bob it up and
  // down a little without lifting the legs or the hunger bar with it.
  const body = new THREE.Group();
  horse.add(body);

  // Barrel of the body, long in the Z direction.
  body.add(box(0.9, 0.85, 2.1, 0, 1.6, 0, coat));

  // Neck: a box tilted forward so it rises towards the head.
  const neck = box(0.55, 1.0, 0.55, 0, 2.05, 0.85, coat);
  neck.rotation.x = 0.45;
  body.add(neck);

  // Mane: a thin dark slab lying along the back of the neck.
  const mane = box(0.14, 1.05, 0.2, 0, 2.05, 0.6, dark);
  mane.rotation.x = 0.45;
  body.add(mane);

  // Head, tipped slightly nose-down. We keep hold of this one, because it is
  // the part that bobs when the horse is fed.
  const head = box(0.45, 0.45, 0.95, 0, 2.62, 1.25, coat);
  head.rotation.x = 0.35;
  body.add(head);

  // Two small ears on top of the head.
  body.add(shaped(earGeo, -0.14, 2.92, 1.02, coat));
  body.add(shaped(earGeo, 0.14, 2.92, 1.02, coat));

  // Tail hanging off the back.
  const tail = box(0.18, 0.8, 0.18, 0, 1.75, -1.1, dark);
  tail.rotation.x = 0.35;
  body.add(tail);

  // The floating hunger bar rides along as a child of the horse.
  const bar = buildHungerBar();
  horse.add(bar.holder);

  if (position) horse.position.copy(position);
  horse.rotation.y = rotationY;

  // -------------------------------------------------------------------------
  // The walk. "phase" is where we are in the stride, and "swing" fades the
  // whole animation in and out, so the legs never freeze half way through a
  // step when the horse stops.
  //
  // Real horses move their legs in diagonal pairs: the front-left hoof and the
  // back-right hoof go forward together, then the other two. That is why two
  // legs get +a and the other two get -a.
  // -------------------------------------------------------------------------
  let phase = 0;
  let swing = 0;

  function setMoving(isMoving, dt) {
    // Cap dt the same way the rest of the game does, so a background tab
    // coming back to life does not jump the legs half a stride.
    const step = Math.min(dt || 0, 0.1);

    if (isMoving) phase += step * GAIT_RATE;
    // Ease "swing" towards 1 while moving and towards 0 while standing.
    const goal = isMoving ? 1 : 0;
    swing += (goal - swing) * Math.min(1, step * GAIT_EASE);

    const a = Math.sin(phase) * GAIT_SWING * swing;
    frontLeft.rotation.x = a;
    backRight.rotation.x = a;   // the diagonal partner, in step with it
    frontRight.rotation.x = -a;
    backLeft.rotation.x = -a;

    // A small bounce in the body, twice per stride, the way the girls bob.
    body.position.y = Math.abs(Math.sin(phase)) * BODY_BOB * swing;
  }

  // Everything the game needs to know about this horse lives here.
  horse.userData = {
    kind: 'horse',
    name,
    hunger: MAX_HUNGER,    // 100 = just fed, 0 = starving
    coatColor,
    head,                  // the mesh that bobs when we feed it
    headRestAngle: head.rotation.x,
    feedTimer: 0,          // counts down through the happy head-bob
    barHolder: bar.holder, // the part that turns to face the camera
    barFill: bar.fill,     // the coloured part we shrink as hunger drops
    body,                  // everything above the legs, for the walking bob
    legs,                  // [frontLeft, frontRight, backLeft, backRight]
    setMoving,             // call once a frame: swings the legs while walking
  };

  // Draw the bar at the right size straight away, so it is never wrong on the
  // very first frame.
  refreshBar(horse);

  return horse;
}

// A scratch vector, made once and re-used, so we are not creating new objects
// sixty times a second.
const cameraWorldPosition = new THREE.Vector3();

// ---------------------------------------------------------------------------
// updateHorse - call once per frame from the game loop.
//   dt      seconds since the last frame
//   camera  the camera, so the bar can turn to face it
// ---------------------------------------------------------------------------
export function updateHorse(horse, dt, camera) {
  const data = horse.userData;

  // A tab that has been in the background hands us a huge dt; cap it, the same
  // way controls.js does, so the horse does not starve while we were away.
  const step = Math.min(dt, 0.1);

  // 1. Get hungrier (never below zero).
  data.hunger = Math.max(0, data.hunger - HUNGER_DRAIN_PER_SECOND * step);

  // 2. Redraw the bar for the new hunger value.
  refreshBar(horse);

  // 3. The happy head-bob, if we were fed a moment ago. The head dips down and
  //    comes back up once over FEED_BOB_SECONDS, because sin() runs 0 -> 1 -> 0.
  if (data.feedTimer > 0) {
    data.feedTimer = Math.max(0, data.feedTimer - step);
    const progress = 1 - data.feedTimer / FEED_BOB_SECONDS; // 0 -> 1
    data.head.rotation.x =
      data.headRestAngle + Math.sin(progress * Math.PI) * FEED_BOB_ANGLE;
  }

  // 4. Turn the bar to face the camera ("billboarding"), so it stays readable
  //    from every side. lookAt points an object's +Z at the target, and it
  //    takes the horse's own turn into account for us.
  if (camera) {
    camera.getWorldPosition(cameraWorldPosition);
    data.barHolder.lookAt(cameraWorldPosition);
  }
}

// ---------------------------------------------------------------------------
// feedHorse - fill the hunger bar right up and give a happy little head-bob.
// Returns true if the horse actually needed feeding, and false if it was
// already full, so the interaction code can say "Biscuit is not hungry".
// ---------------------------------------------------------------------------
export function feedHorse(horse) {
  if (!isHungry(horse)) return false;

  horse.userData.hunger = MAX_HUNGER;
  horse.userData.feedTimer = FEED_BOB_SECONDS; // starts the head-bob
  refreshBar(horse);
  return true;
}

// ---------------------------------------------------------------------------
// isHungry - true whenever the bar is not completely full.
// ---------------------------------------------------------------------------
export function isHungry(horse) {
  return horse.userData.hunger < MAX_HUNGER;
}
