// chickens.js - the chicken coop: a little hen house, a fenced pen, the
// chickens pottering about inside it, and the eggs they leave on the ground.
//
// The whole coop is ONE thing as far as the rest of the game is concerned:
// one shared hunger bar, one "Feed chickens" key, one pile of eggs. That is a
// deliberate simplification - four separate hungry chickens would be four
// bars to watch and no more fun for an eight-year-old.
//
// How you use it:
//
//   const coop = createCoop({ scene, position: new THREE.Vector3(-12, 0, 2) });
//   controls.addBlockBox(coop.penBox);          // nobody walks through the pen
//   coop.update(dt, camera);                    // once a frame
//
// What it hands back:
//
//   group             the THREE.Group holding everything (already in the scene)
//   chickens          the array of chicken groups, so tests can look at them
//   penBox            { minX, maxX, minZ, maxZ } - the pen on the ground
//   gate              an empty Object3D at the gate, for interact.js to
//                     measure distances to
//   addChicken(opts)  -> the new chicken (up to MAX_CHICKENS).
//                        addChicken({ chick: true }) puts a small yellow CHICK
//                        in the pen instead, which grows into a full chicken
//                        over ninety seconds.
//   removeChicken()   -> true if a GROWN chicken was taken away, false if there
//                        were none (a chick is too young to go anywhere)
//   count()           -> how many chickens are in the pen, chicks included
//   adultCount()      -> how many of those are grown up. Only grown chickens
//                        lay eggs, and only grown chickens can be sold.
//   hunger / setHunger(v) / isHungry()
//                     -> the one shared hunger, 0..100 (it also lives at
//                        coop.group.userData.hunger)
//   feed()            -> true if they needed feeding: fills the bar to 100 and
//                        every chicken does a happy little hop. (The CALLER
//                        spends the chicken feed - see main.js.)
//   eggsWaiting()     -> how many laid eggs are sitting in the pen
//   collectEggs()     -> how many were picked up, and clears the pen
//   update(dt, camera)-> hunger, wandering, egg laying, bar facing the camera
//   getState()        -> a plain object for the save file
//   setState(state)   -> put a loaded save back

import * as THREE from 'three';
import { createHungerBar } from './bar.js';

// ---------------------------------------------------------------------------
// Tuning numbers, all in one place.
// ---------------------------------------------------------------------------

const MAX_HUNGER = 100;

// How long a full coop bar takes to empty, in seconds. DELIBERATELY fast, the
// same way the horses' numbers are: 150 seconds means the bar visibly drops
// while we are playing. A real game would use something far slower.
const HUNGER_SECONDS = 150;
const HUNGER_DRAIN_PER_SECOND = MAX_HUNGER / HUNGER_SECONDS;

// The pen, in world units, measured out from the middle of the coop.
const PEN_WIDTH = 8;   // along X
const PEN_DEPTH = 6;   // along Z

// The hen house: a small box with a sloped roof, tucked against the west wall
// of the pen so the chickens have the rest of the floor to wander on.
const HOUSE_WIDTH = 1.9;
const HOUSE_HEIGHT = 1.0;
const HOUSE_DEPTH = 1.6;
const HOUSE_OFFSET_X = -2.9;  // from the middle of the pen towards the west wall

// How high above the pen floor the shared hunger bar floats. The hen house
// roof peaks at about 1.5, so this clears it comfortably.
const BAR_HEIGHT = 2.35;

// The chickens themselves.
const START_CHICKENS = 4;
// Exported because the store sells chicks: its "Chick" button greys itself out
// (rather than taking coins for a chicken that has nowhere to stand) once the
// pen is this full.
export const MAX_CHICKENS = 12; // the pen would be a crowd beyond this
const CHICKEN_SPEED = 0.8;      // units a second: a gentle potter
const CHICKEN_TURN_SPEED = 6;   // how fast one swivels to face where it is off to
const WAIT_MIN = 1;             // seconds of standing still between walks
const WAIT_MAX = 3;
const HEAD_BOB_RATE = 9;        // how fast the head bobs while walking
const HEAD_BOB_SIZE = 0.035;    // how far it bobs, in units
const HOP_SECONDS = 0.5;        // the happy hop after being fed
const HOP_HEIGHT = 0.28;

// CHICKS. A chick bought at the store costs 8 coins and a grown chicken sells
// for 10 at the market stall, so if a chick were grown-up the moment it was
// bought you could stand between the two shops making free money forever.
// Making it GROW fixes that: for a minute and a half it is a small yellow ball
// of fluff that cannot lay an egg and cannot be sold, and then it is a chicken.
export const GROW_SECONDS = 90;
// How big a brand new chick is next to a grown chicken. It lerps from this up
// to 1 over those ninety seconds, so it visibly gets bigger while you watch.
export const CHICK_SCALE = 0.55;
// Chick colours: the soft yellow every picture book uses.
const CHICK_COAT = { body: 0xffe082, wing: 0xffd54f };

// How much room a chicken keeps between itself and the pen fence, so nobody
// ever pokes a beak through the rails.
const WANDER_MARGIN = 0.4;

// Eggs. The coop lays one egg every EGG_SECONDS "chicken-pair seconds": with
// four chickens that is one egg every ten seconds, with two it is one every
// twenty. Hungry chickens (below EGG_HUNGER_FLOOR) stop laying altogether.
const EGG_SECONDS = 20;
const EGG_HUNGER_FLOOR = 30;
const MAX_EGGS_ON_GROUND = 6;   // beyond this we stop showing new ones

// ---------------------------------------------------------------------------
// Colours and shared materials. One material per colour, reused by every mesh
// that needs it, which keeps the game light on the graphics card.
// ---------------------------------------------------------------------------
const COLORS = {
  wood: 0xa1887f,      // the pen fence, same as world.js
  houseWall: 0xb98b5e, // warm plank brown
  houseRoof: 0x7b3f2e, // dark brown, same as the barn roof
  door: 0x5d4037,
  beak: 0xffb300,      // orange-yellow
  comb: 0xd32f2f,      // red
  leg: 0xffa726,       // orange
  eye: 0x2b2b2b,
  egg: 0xfffaf0,       // off-white
};

const M = {};
for (const key of Object.keys(COLORS)) {
  M[key] = new THREE.MeshLambertMaterial({ color: COLORS[key] });
}

// The three kinds of chicken. They are picked in turn, so four chickens come
// out white, brown, black, white.
const CHICKEN_COATS = [
  { name: 'white', body: 0xf7f4ee, wing: 0xdedad2 },
  { name: 'brown', body: 0x8d6e63, wing: 0x6d4c41 },
  { name: 'black', body: 0x424242, wing: 0x2b2b2b },
];

// Body and wing colours are per-coat, so they get their own cached materials.
const coatMaterials = {};
function coatMaterial(color) {
  if (!coatMaterials[color]) {
    coatMaterials[color] = new THREE.MeshLambertMaterial({ color });
  }
  return coatMaterials[color];
}

// Shapes that every chicken and every egg share.
const bodyGeo = new THREE.SphereGeometry(0.16, 7, 5);
const headGeo = new THREE.SphereGeometry(0.095, 6, 5);
const beakGeo = new THREE.ConeGeometry(0.035, 0.09, 4);
const combGeo = new THREE.BoxGeometry(0.04, 0.06, 0.1);
const legGeo = new THREE.BoxGeometry(0.035, 0.16, 0.035);
const wingGeo = new THREE.SphereGeometry(0.1, 5, 4);
const tailGeo = new THREE.ConeGeometry(0.1, 0.16, 4);
const eggGeo = new THREE.SphereGeometry(0.09, 7, 5);
const postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);

// A random number between two values. Used all over the wandering code.
function between(min, max) {
  return min + Math.random() * (max - min);
}

// Turn "current" towards "target" the short way round, at most "maxStep".
// (The same helper controls.js uses, kept local so the two files stay apart.)
function turnTowards(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

// ---------------------------------------------------------------------------
// ONE CHICKEN - a little low-poly bird about 0.45 units tall.
//
// Like the horse, its origin sits on the ground between its feet, so
// chicken.position.set(x, 0, z) stands it flat on the grass. It looks along
// +Z, so rotation.y = 0 faces +Z.
//
// "lift" is the group everything above the legs hangs from. Hopping moves
// that, not the whole chicken, so the feet stay put while it bounces.
// ---------------------------------------------------------------------------
function buildChicken(coat) {
  const chicken = new THREE.Group();
  chicken.name = 'chicken';

  const lift = new THREE.Group();
  chicken.add(lift);

  const bodyMaterial = coatMaterial(coat.body);
  const wingMaterial = coatMaterial(coat.wing);

  // The meshes painted in the two coat colours are collected as we go, so that
  // a chick can be repainted yellow now and repainted back in its grown-up
  // colours the moment it is old enough (see dressChicken below).
  const skin = [];       // body and head: the "body" colour
  const feathers = [];   // wings and tail: the "wing" colour

  // Body: a sphere squashed a little and stretched along Z, which reads as a
  // plump little hen.
  const body = new THREE.Mesh(bodyGeo, bodyMaterial);
  body.position.y = 0.24;
  body.scale.set(1.0, 0.92, 1.25);
  lift.add(body);
  skin.push(body);

  // A wing on each side, flat against the body.
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMaterial);
    wing.position.set(side * 0.13, 0.25, 0.01);
    wing.scale.set(0.35, 0.8, 1.15);
    lift.add(wing);
    feathers.push(wing);
  }

  // Tail: a little cone tipped up and back.
  const tail = new THREE.Mesh(tailGeo, wingMaterial);
  tail.position.set(0, 0.32, -0.19);
  tail.rotation.x = -2.2;
  lift.add(tail);
  feathers.push(tail);

  // Head on a short neck, towards the front (+Z). It bobs while she walks.
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.13);
  lift.add(head);

  const skull = new THREE.Mesh(headGeo, bodyMaterial);
  head.add(skull);
  skin.push(skull);

  // Beak: a cone tipped over so its point aims forwards.
  const beak = new THREE.Mesh(beakGeo, M.beak);
  beak.position.set(0, -0.01, 0.1);
  beak.rotation.x = Math.PI / 2;
  head.add(beak);

  // Comb: the little red crest on top.
  const comb = new THREE.Mesh(combGeo, M.comb);
  comb.position.set(0, 0.1, 0.01);
  head.add(comb);

  // Two tiny dark eyes.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), M.eye);
    eye.position.set(side * 0.06, 0.02, 0.07);
    head.add(eye);
  }

  // Two stick legs. These hang off the chicken itself, not off "lift", so a
  // hop lifts the body and leaves the feet on the ground.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, M.leg);
    leg.position.set(side * 0.06, 0.08, 0);
    chicken.add(leg);
  }

  // Everything this chicken needs to remember from one frame to the next.
  chicken.userData = {
    coat: coat.name,
    lift,                 // the part a hop lifts
    head,                 // the part that bobs while walking
    headRestY: head.position.y,
    targetX: 0,           // where it is walking to
    targetZ: 0,
    waitTimer: between(WAIT_MIN, WAIT_MAX),  // stand still for a moment first
    bobPhase: Math.random() * Math.PI * 2,   // so they do not bob in unison
    hopTimer: 0,
    // Growing up. isChick is the one the rest of the game asks about; growTimer
    // is how many seconds of being small are left.
    isChick: false,
    growTimer: 0,
    // The meshes to repaint, and the grown-up colours to repaint them in.
    skin,
    feathers,
    adultBody: bodyMaterial,
    adultWing: wingMaterial,
  };

  return chicken;
}

// ---------------------------------------------------------------------------
// GROWING UP - three little helpers that turn a chicken into a chick and back.
// ---------------------------------------------------------------------------

// Repaint one chicken in a pair of colours.
function dressChicken(chicken, bodyMaterial, wingMaterial) {
  for (const mesh of chicken.userData.skin) mesh.material = bodyMaterial;
  for (const mesh of chicken.userData.feathers) mesh.material = wingMaterial;
}

// How big this chicken should be right now: CHICK_SCALE when it has just been
// bought, growing smoothly to full size as its timer runs down.
function applyGrowScale(chicken) {
  const left = Math.max(0, Math.min(GROW_SECONDS, chicken.userData.growTimer));
  const grown = 1 - left / GROW_SECONDS;   // 0 = brand new, 1 = all grown up
  chicken.scale.setScalar(CHICK_SCALE + (1 - CHICK_SCALE) * grown);
}

// Turn a chicken into a chick with this many seconds of growing left.
function makeChick(chicken, secondsLeft = GROW_SECONDS) {
  const seconds = Number(secondsLeft);
  chicken.userData.isChick = true;
  chicken.userData.growTimer = Number.isFinite(seconds)
    ? Math.max(0, Math.min(GROW_SECONDS, seconds))
    : GROW_SECONDS;
  dressChicken(chicken, coatMaterial(CHICK_COAT.body), coatMaterial(CHICK_COAT.wing));
  applyGrowScale(chicken);
}

// All grown up: full size, and back in its own colours.
function growUp(chicken) {
  chicken.userData.isChick = false;
  chicken.userData.growTimer = 0;
  dressChicken(chicken, chicken.userData.adultBody, chicken.userData.adultWing);
  chicken.scale.setScalar(1);
}

// ---------------------------------------------------------------------------
// THE HEN HOUSE - a box of planks with a sloped roof and a little round-ish
// door, built around (0, 0, 0) and then moved into place.
// ---------------------------------------------------------------------------
function buildHenHouse() {
  const house = new THREE.Group();
  house.name = 'henHouse';

  // The walls.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(HOUSE_WIDTH, HOUSE_HEIGHT, HOUSE_DEPTH),
    M.houseWall
  );
  walls.position.y = HOUSE_HEIGHT / 2;
  house.add(walls);

  // The roof: one flat slab, tipped over so the rain would run off the front.
  // Making it a little bigger than the walls gives it an overhanging eave.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(HOUSE_WIDTH + 0.3, 0.12, HOUSE_DEPTH + 0.5),
    M.houseRoof
  );
  roof.position.y = HOUSE_HEIGHT + 0.22;
  roof.rotation.x = -0.32;   // the slope
  house.add(roof);

  // The door, on the front (+Z) face, where the chickens go in at night.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.06), M.door);
  door.position.set(0, 0.25, HOUSE_DEPTH / 2 + 0.02);
  house.add(door);

  // A little ramp from the door down to the ground.
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.6), M.houseWall);
  ramp.position.set(0, 0.12, HOUSE_DEPTH / 2 + 0.3);
  ramp.rotation.x = 0.35;
  house.add(ramp);

  return house;
}

// ---------------------------------------------------------------------------
// THE PEN FENCE - posts and two rails, built the same way world.js builds the
// ranch fence, with a gap left in the east side for the gate.
// ---------------------------------------------------------------------------
function buildFenceRun(x1, z1, x2, z2) {
  const run = new THREE.Group();
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return run;

  const angle = Math.atan2(dx, dz);

  // A post roughly every two metres, always including both ends.
  const count = Math.max(2, Math.round(length / 2) + 1);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const post = new THREE.Mesh(postGeo, M.wood);
    post.position.set(x1 + dx * t, 0.5, z1 + dz * t);
    run.add(post);
  }

  // Two rails: single long boxes turned to follow the run.
  const railGeo = new THREE.BoxGeometry(0.07, 0.12, length);
  for (const y of [0.35, 0.75]) {
    const rail = new THREE.Mesh(railGeo, M.wood);
    rail.position.set(x1 + dx / 2, y, z1 + dz / 2);
    rail.rotation.y = angle;
    run.add(rail);
  }

  return run;
}

// The pen is built in the coop group's own coordinates, so the middle of the
// pen is (0, 0) here and the group's position puts it on the ranch.
function buildPen(gateZ, gateHalfWidth) {
  const pen = new THREE.Group();
  pen.name = 'chickenPen';

  const halfW = PEN_WIDTH / 2;
  const halfD = PEN_DEPTH / 2;

  pen.add(buildFenceRun(-halfW, -halfD, halfW, -halfD));  // north (towards the house)
  pen.add(buildFenceRun(-halfW, halfD, halfW, halfD));    // south
  pen.add(buildFenceRun(-halfW, -halfD, -halfW, halfD));  // west

  // East side, facing the yard, in two pieces with the gate gap between them.
  pen.add(buildFenceRun(halfW, -halfD, halfW, gateZ - gateHalfWidth));
  pen.add(buildFenceRun(halfW, gateZ + gateHalfWidth, halfW, halfD));

  return pen;
}

// ---------------------------------------------------------------------------
// createCoop - build the whole thing and hand back the controls for it.
//
//   scene     where to add the coop (optional: you can add coop.group yourself)
//   position  the middle of the pen, e.g. new THREE.Vector3(-12, 0, 2)
//   chickens  how many to start with (4 unless you say otherwise)
// ---------------------------------------------------------------------------
export function createCoop({ scene, position, chickens: startCount = START_CHICKENS } = {}) {
  const group = new THREE.Group();
  group.name = 'coop';
  if (position) group.position.set(position.x ?? 0, 0, position.z ?? 0);

  const centreX = group.position.x;
  const centreZ = group.position.z;

  // --- the pen on the ground, in WORLD numbers ------------------------------
  // main.js hands this straight to controls.addBlockBox(), so nobody can walk
  // into the pen and stand on a chicken.
  const penBox = {
    minX: centreX - PEN_WIDTH / 2,
    maxX: centreX + PEN_WIDTH / 2,
    minZ: centreZ - PEN_DEPTH / 2,
    maxZ: centreZ + PEN_DEPTH / 2,
  };

  // The gate is in the middle of the east wall - the side facing the yard,
  // which is where Natalia comes from.
  const gateHalfWidth = 0.7;
  const gate = new THREE.Object3D();
  gate.name = 'coopGate';
  gate.position.set(PEN_WIDTH / 2, 0, 0);
  group.add(gate);

  group.add(buildPen(0, gateHalfWidth));

  // --- the hen house --------------------------------------------------------
  const henHouse = buildHenHouse();
  henHouse.position.set(HOUSE_OFFSET_X, 0, 0);
  group.add(henHouse);

  // --- where a chicken is allowed to walk -----------------------------------
  // The pen, pulled in a little from the fence, and with the strip the hen
  // house stands on left out, so nobody walks through a wall.
  const houseEastEdge = centreX + HOUSE_OFFSET_X + HOUSE_WIDTH / 2;
  const wanderBox = {
    minX: houseEastEdge + 0.45,
    maxX: penBox.maxX - WANDER_MARGIN,
    minZ: penBox.minZ + WANDER_MARGIN,
    maxZ: penBox.maxZ - WANDER_MARGIN,
  };

  // A random spot inside the wander area.
  function randomSpot() {
    return {
      x: between(wanderBox.minX, wanderBox.maxX),
      z: between(wanderBox.minZ, wanderBox.maxZ),
    };
  }

  // --- the shared hunger bar, floating over the hen house roof --------------
  const bar = createHungerBar({ width: 1.1, thickness: 0.17, depth: 0.04 });
  bar.holder.position.set(HOUSE_OFFSET_X, BAR_HEIGHT, 0);
  group.add(bar.holder);

  // --- the coop's own numbers, kept on the group -----------------------------
  group.userData = {
    kind: 'coop',
    hunger: MAX_HUNGER,   // 100 = just fed, 0 = very hungry
    eggTimer: 0,          // counts up towards the next egg
  };

  // Every chicken, and every egg lying on the ground.
  const chickens = [];
  const eggs = [];

  // --- chickens -------------------------------------------------------------
  // addChicken()                  a grown chicken, ready to lay and to sell
  // addChicken({ chick: true })   a small yellow chick that grows up in 90s
  function addChicken({ chick = false, growSeconds = GROW_SECONDS } = {}) {
    if (chickens.length >= MAX_CHICKENS) return null;

    // The coats are used in turn, so a new chicken is rarely the same colour
    // as the one before it.
    const coat = CHICKEN_COATS[chickens.length % CHICKEN_COATS.length];
    const chicken = buildChicken(coat);

    // Drop it somewhere random in the pen, already facing a random way.
    const spot = randomSpot();
    chicken.position.set(spot.x - centreX, 0, spot.z - centreZ);
    chicken.rotation.y = Math.random() * Math.PI * 2;

    // And give it somewhere to walk to next.
    const target = randomSpot();
    chicken.userData.targetX = target.x - centreX;
    chicken.userData.targetZ = target.z - centreZ;

    // A chick starts small and yellow. Everything else about it - where it
    // walks, how it bobs its head - is exactly the same as a grown chicken.
    if (chick) makeChick(chicken, growSeconds);

    group.add(chicken);
    chickens.push(chicken);
    return chicken;
  }

  // Take a GROWN chicken out of the pen: the newest one first. This is what the
  // market stall calls, and it is why a chick can never be sold - it simply is
  // not one of the chickens this function will pick. false means "there are no
  // grown chickens in here".
  function removeChicken() {
    for (let i = chickens.length - 1; i >= 0; i--) {
      if (chickens[i].userData.isChick) continue;
      const [chicken] = chickens.splice(i, 1);
      group.remove(chicken);
      return true;
    }
    return false;
  }

  // Take the last chicken out whether it is grown or not. Only loading a save
  // file uses this, to shrink the flock down to the size the save says.
  function removeAnyChicken() {
    const chicken = chickens.pop();
    if (!chicken) return false;
    group.remove(chicken);
    return true;
  }

  // Everything in the pen, chicks included: this is the number on the HUD.
  function count() {
    return chickens.length;
  }

  // Just the grown-up ones. They are the only chickens that lay eggs, and the
  // only ones the market stall will take.
  function adultCount() {
    let grown = 0;
    for (const chicken of chickens) if (!chicken.userData.isChick) grown++;
    return grown;
  }

  // --- eggs -----------------------------------------------------------------
  // A laid egg is a little white ellipsoid lying in the grass until Natalia
  // picks it up.
  function layEgg() {
    if (eggs.length >= MAX_EGGS_ON_GROUND) return null;

    const egg = new THREE.Mesh(eggGeo, M.egg);
    egg.name = 'egg';
    egg.scale.set(0.8, 1.05, 0.8);   // a squashed ball reads as an egg
    egg.rotation.z = between(-0.4, 0.4);

    const spot = randomSpot();
    egg.position.set(spot.x - centreX, 0.075, spot.z - centreZ);

    group.add(egg);
    eggs.push(egg);
    return egg;
  }

  function eggsWaiting() {
    return eggs.length;
  }

  // Pick them all up at once. Returns how many there were, so main.js can add
  // that many to the inventory and say "Collected 3 eggs!".
  function collectEggs() {
    const collected = eggs.length;
    for (const egg of eggs) group.remove(egg);
    eggs.length = 0;
    return collected;
  }

  // Put a given number of eggs on the ground (loading a save file).
  function setEggsOnGround(n) {
    collectEggs();
    const wanted = Math.max(0, Math.min(MAX_EGGS_ON_GROUND, Math.floor(Number(n) || 0)));
    for (let i = 0; i < wanted; i++) layEgg();
  }

  // --- hunger ---------------------------------------------------------------
  function getHunger() {
    return group.userData.hunger;
  }

  function setHunger(value) {
    const n = Number(value);
    group.userData.hunger = Number.isFinite(n)
      ? Math.max(0, Math.min(MAX_HUNGER, n))
      : MAX_HUNGER;
    bar.setValue(group.userData.hunger, MAX_HUNGER);
  }

  function isHungry() {
    return group.userData.hunger < MAX_HUNGER;
  }

  // feed - fill the bar right up and set every chicken hopping.
  // It does NOT touch the inventory: main.js spends the chicken feed first and
  // only calls this if the spend worked.
  // Returns false if they were already full, so main.js can say so.
  function feed() {
    if (!isHungry()) return false;
    setHunger(MAX_HUNGER);
    for (const chicken of chickens) chicken.userData.hopTimer = HOP_SECONDS;
    return true;
  }

  // --- one chicken's frame --------------------------------------------------
  function updateChicken(chicken, step) {
    const data = chicken.userData;

    // Growing up: the timer runs down, the chick gets a little bigger every
    // frame, and when the timer reaches zero it turns into a proper chicken.
    if (data.growTimer > 0) {
      data.growTimer -= step;
      if (data.growTimer <= 0) growUp(chicken);
      else applyGrowScale(chicken);
    }

    // The happy hop after being fed: up and down once, because sin() runs
    // 0 -> 1 -> 0 over half a turn.
    if (data.hopTimer > 0) {
      data.hopTimer = Math.max(0, data.hopTimer - step);
      const progress = 1 - data.hopTimer / HOP_SECONDS;
      data.lift.position.y = Math.sin(progress * Math.PI) * HOP_HEIGHT;
    }

    // Standing still for a moment between walks.
    if (data.waitTimer > 0) {
      data.waitTimer -= step;
      // Settle the head back to its resting height while it waits.
      data.head.position.y = data.headRestY;
      return;
    }

    // How far is it from where it is going?
    const dx = data.targetX - chicken.position.x;
    const dz = data.targetZ - chicken.position.z;
    const distance = Math.hypot(dx, dz);

    // Arrived: have a little rest, then pick somewhere new.
    if (distance < 0.08) {
      chicken.position.x = data.targetX;
      chicken.position.z = data.targetZ;
      data.waitTimer = between(WAIT_MIN, WAIT_MAX);
      const next = randomSpot();
      data.targetX = next.x - centreX;
      data.targetZ = next.z - centreZ;
      return;
    }

    // Walk towards it, never overshooting in one frame.
    const stepDistance = Math.min(CHICKEN_SPEED * step, distance);
    chicken.position.x += (dx / distance) * stepDistance;
    chicken.position.z += (dz / distance) * stepDistance;

    // Turn to face the way it is going (+Z is forward).
    chicken.rotation.y = turnTowards(
      chicken.rotation.y, Math.atan2(dx, dz), CHICKEN_TURN_SPEED * step
    );

    // The head bobs back and forth as it walks, the way a hen's does.
    data.bobPhase += HEAD_BOB_RATE * step;
    data.head.position.y = data.headRestY + Math.sin(data.bobPhase) * HEAD_BOB_SIZE;

    // A belt-and-braces clamp: whatever happened above, a chicken never ends
    // up outside its own pen.
    chicken.position.x = Math.max(
      wanderBox.minX - centreX, Math.min(wanderBox.maxX - centreX, chicken.position.x)
    );
    chicken.position.z = Math.max(
      wanderBox.minZ - centreZ, Math.min(wanderBox.maxZ - centreZ, chicken.position.z)
    );
  }

  // --- one frame of the whole coop ------------------------------------------
  function update(dt, camera) {
    // A tab that has been in the background hands us a huge dt; cap it, the
    // same way the horses do, so the chickens do not starve while we were away.
    const step = Math.min(dt, 0.1);

    // 1. The whole coop gets a little hungrier.
    setHunger(group.userData.hunger - HUNGER_DRAIN_PER_SECOND * step);

    // 2. Every chicken potters about.
    for (const chicken of chickens) updateChicken(chicken, step);

    // 3. Laying. Two chickens between them lay an egg every twenty seconds, so
    //    the timer counts up at "half a second per chicken per second". Hungry
    //    chickens (below 30) stop laying until they have been fed, and chicks
    //    are far too young to lay anything at all - hence adultCount() here
    //    rather than the whole flock.
    const layers = adultCount();
    if (group.userData.hunger > EGG_HUNGER_FLOOR && layers > 0) {
      group.userData.eggTimer += step * layers / 2;
      // ">=" rather than ">": adding up lots of little dt steps lands on
      // exactly 20 often enough that a strict ">" would skip an egg.
      while (group.userData.eggTimer >= EGG_SECONDS) {
        group.userData.eggTimer -= EGG_SECONDS;
        layEgg();   // quietly does nothing once six eggs are waiting
      }
    }

    // 4. Turn the bar to face the camera, so it stays readable from every side.
    bar.faceCamera(camera);
  }

  // --- saving and loading ---------------------------------------------------
  function getState() {
    return {
      hunger: group.userData.hunger,
      chickens: chickens.length,
      eggsOnGround: eggs.length,
      eggTimer: group.userData.eggTimer,
      // One number per chick: how many seconds of growing it has left. An empty
      // list (the usual case) means every chicken in the pen is grown up.
      chicks: chickens
        .filter((chicken) => chicken.userData.isChick)
        .map((chicken) => Math.round(chicken.userData.growTimer * 10) / 10),
    };
  }

  function setState(state) {
    if (!state || typeof state !== 'object') return;

    setHunger(state.hunger);

    // Add or take away chickens until the flock is the size the save says.
    const wanted = Math.max(
      0, Math.min(MAX_CHICKENS, Math.floor(Number(state.chickens) || 0))
    );
    while (chickens.length > wanted) removeAnyChicken();
    while (chickens.length < wanted) addChicken();

    // Everybody starts grown up, and then the chicks the save file remembers
    // are made small again. A save from before chicks existed (version 2 and
    // older) simply has no "chicks" list, so the whole flock stays grown - which
    // is exactly right, because back then they all were.
    for (const chicken of chickens) {
      if (chicken.userData.isChick) growUp(chicken);
    }

    const chicks = Array.isArray(state.chicks) ? state.chicks : [];
    for (let i = 0; i < chicks.length && i < chickens.length; i++) {
      const left = Number(chicks[i]);
      if (!Number.isFinite(left) || left <= 0) continue;
      // Counting back from the end, so the chicks are the newest arrivals.
      makeChick(chickens[chickens.length - 1 - i], left);
    }

    setEggsOnGround(state.eggsOnGround);

    const timer = Number(state.eggTimer);
    group.userData.eggTimer =
      Number.isFinite(timer) && timer >= 0 ? Math.min(timer, EGG_SECONDS) : 0;
  }

  // --- build the starting flock and put it all in the world ------------------
  const wantedStart = Math.max(0, Math.min(MAX_CHICKENS, Math.floor(startCount)));
  for (let i = 0; i < wantedStart; i++) addChicken();

  // Draw the bar at the right size straight away, so it is never wrong on the
  // very first frame.
  bar.setValue(group.userData.hunger, MAX_HUNGER);

  if (scene) scene.add(group);

  return {
    group,
    chickens,
    penBox,
    wanderBox,
    gate,
    bar,
    addChicken,
    removeChicken,
    count,
    adultCount,
    getHunger,
    setHunger,
    isHungry,
    feed,
    eggsWaiting,
    collectEggs,
    update,
    getState,
    setState,
  };
}
