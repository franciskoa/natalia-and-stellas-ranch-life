// horse.js - one horse: its body, its hunger, its tack (saddle and blanket)
// and the little bar floating above its head.
//
// A horse is a THREE.Group whose origin sits on the ground between its hooves,
// so horse.position.set(x, 0, z) always stands it flat on the grass. The model
// looks along +Z, which means rotationY = 0 faces +Z.
//
// What this module gives the rest of the game:
//   HORSE_KINDS                     - the table of horse breeds and their stats
//   TACK_COLORS                     - the colours a saddle or blanket can be
//   createHorse({ id, name, kind, position, rotationY, coatColor })
//                                   -> the THREE.Group
//   updateHorse(horse, dt, camera)  - call once per frame
//   feedHorse(horse)                - fill the hunger bar up again
//   isHungry(horse)                 - true while the bar is not full
//   setSaddle(horse, colorKey)      - 'none' to take it off, or a TACK_COLORS key
//   setBlanket(horse, colorKey)     - same idea, for the blanket underneath
//   applyGrowth(horse, grown)       - Phase 7: how grown up this horse is, from
//                                     0 (a newborn foal) to 1 (a full horse)
//   FOAL_SCALE                      - how big a newborn foal is (0.55 = just
//                                     over half the size of its parents)
//
// Each horse also carries its own little walk animation, the same idea as the
// girls' setWalking in characters.js:
//   horse.userData.setMoving(isMoving, dt)   - swing the legs while it walks
//   horse.userData.legs                      - [frontLeft, frontRight,
//                                               backLeft, backRight]
//
// The hunger number itself lives on the group, at horse.userData.hunger, and
// runs from 100 (just fed) down to 0 (very hungry).
//
// ---------------------------------------------------------------------------
// About SIZE (this is the one fiddly bit, so here it is in one place).
//
// Different kinds of horse are different sizes: a pony is three quarters the
// size of a chestnut. We can NOT simply shrink the whole group, because while
// Natalia is riding she is a CHILD of the horse group (see riding.js) - so
// shrinking the group would shrink her too, and she would ride a pony as a
// tiny doll.
//
// So the body is built at its normal size inside an inner group called
// "frame", and only that inner group (plus the hunger bar) is scaled. Natalia
// is added to the OUTER group, so she always stays her own size.
//
// Because the outer group is never scaled, anything measured from it is in
// real world units, and two of those numbers are published for other modules:
//   horse.userData.saddleY  - how high up Natalia sits (riding.js uses it)
//   horse.userData.barY     - how high the hunger bar floats
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { createHungerBar } from './bar.js';

// ---------------------------------------------------------------------------
// The kinds of horse. Each one is a coat, a few colours and its own stats:
//
//   speed          how fast it gallops, in units a second (Natalia walks 4.5)
//   hungerSeconds  how long a full hunger bar takes to empty, in seconds
//   scale          how big it is next to a normal horse (1 = normal)
//
// These numbers are DELIBERATELY fast for now, so a bar visibly drops while we
// are testing. A real game would use much slower ones.
// ---------------------------------------------------------------------------
export const HORSE_KINDS = {
  chestnut: {
    label: 'Chestnut',
    coat: 0x9c6b3a,   // warm brown, the Phase 1 horse
    mane: 0x3e2723,   // mane and tail, almost black
    hoof: 0x3e2723,
    speed: 11,
    hungerSeconds: 90,
    scale: 1.0,
  },
  white: {
    label: 'White',
    coat: 0xf2efe6,   // creamy white
    mane: 0xbfbfbf,   // light grey mane and tail, so they still show up
    hoof: 0xbfbfbf,
    speed: 13,        // the fastest horse on the ranch...
    hungerSeconds: 60, // ...and the one that gets hungry quickest
    scale: 1.0,
  },
  black: {
    label: 'Black',
    coat: 0x2b2b2b,
    mane: 0x111111,
    hoof: 0x000000,
    speed: 9,          // big and steady rather than quick
    hungerSeconds: 150, // but it hardly ever needs feeding
    scale: 1.05,        // a touch taller than the others
  },
  pony: {
    label: 'Pony',
    coat: 0xc9a26b,    // sandy dun
    mane: 0x3e2723,
    hoof: 0x3e2723,
    speed: 8,
    hungerSeconds: 120,
    scale: 0.75,       // a proper little pony
  },
};

// The kind we fall back to if somebody asks for one we do not have.
const DEFAULT_KIND = 'chestnut';

// ---------------------------------------------------------------------------
// Tack colours: what a saddle or a blanket can be painted.
// 'none' means "not wearing one", which is why its value is null.
// ---------------------------------------------------------------------------
export const TACK_COLORS = {
  none: null,
  brown: 0x6d4c41,
  red: 0xc62828,
  blue: 0x1565c0,
  purple: 0x6a1b9a,
  pink: 0xd81b60,
  green: 0x2e7d32,
};

// ---------------------------------------------------------------------------
// Tuning numbers, all in one place.
// ---------------------------------------------------------------------------

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

// How high the hip joints are above the grass, at scale 1. Each leg hangs from
// this point and turns around it, the way a real leg turns at the hip.
const HIP_HEIGHT = 1.25;

// ---------------------------------------------------------------------------
// FOALS (Phase 7). A newborn foal is the same horse, built the same way, only
// smaller - and, like a real foal, all legs: its legs are nearly a fifth longer
// than a grown horse's next to its little body, which is exactly what makes a
// foal look like a foal rather than like a toy horse.
//
// Both numbers slide back to 1 as it grows up, so a grown-up foal is an
// ordinary horse with no special case anywhere else in the game.
// ---------------------------------------------------------------------------
export const FOAL_SCALE = 0.55;      // how big it is the day it is born
const FOAL_LEG_STRETCH = 1.18;       // how leggy a newborn is

// The top of the barrel at scale 1: the barrel is centred at y = 1.6 and is
// 0.85 tall, so its back is at 2.025. Everything to do with sitting on the
// horse or dressing it is measured from here.
const BACK_TOP = 2.025;

// How far BELOW the back Natalia's own origin (her feet) sits when she is in
// the saddle: she straddles the barrel, so her feet hang down either side.
// 2.025 - 0.425 = 1.6, which is exactly where Phase 3 put her.
const RIDER_SIT_DROP = 0.425;

// A saddle is a cushion, so it lifts the rider a little.
const SADDLE_LIFT = 0.12;

// The floating hunger bar floats this far above the horse's back. The back
// moves up and down with the horse's size, but this gap does NOT: it has to
// clear the straw hat of whoever is riding, and Natalia is the same height
// whichever horse she is on. At scale 1 it comes to 2.025 + 1.925 = 3.95,
// which is exactly where Phase 2 put it.
const BAR_ABOVE_BACK = 1.925;
const BAR_WIDTH = 1.6;
const BAR_THICKNESS = 0.22;
const BAR_DEPTH = 0.05;

// ---------------------------------------------------------------------------
// Materials. One per colour, made once and shared by every mesh that uses it,
// which keeps the game light on the graphics card.
//
// The saddle and the blanket are the exception: each horse makes its OWN two
// materials, because Biscuit's red saddle must not turn Snowy's saddle red.
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

// Phase 7: the two markings a coat can have. A spotted horse wears little dark
// blobs; a pinto wears bigger patches. Both are just flat boxes sitting a hair
// proud of the barrel, which costs the graphics card almost nothing.
const spotGeo = new THREE.BoxGeometry(0.34, 0.3, 0.34);
const patchGeo = new THREE.BoxGeometry(0.5, 0.46, 0.66);

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
// buildMarkings - Phase 7: the spots on a spotted horse, or the big white
// patches on a pinto. They are added to the BODY group, so they ride along with
// the barrel while it trots and shrink with the horse.
//
//   style  'spots'   half a dozen little blobs on the flanks and the rump
//          'patches' three bigger ones, the way a pinto is coloured
//   color  the colour to paint them (shared, like every other material here)
//
// The positions are written down rather than rolled, so a spotted foal has the
// same spots in the same places every time the game is opened.
// ---------------------------------------------------------------------------
const MARKING_SPOTS = [
  [0.43, 1.78, -0.55], [0.43, 1.52, 0.35], [-0.43, 1.64, -0.15],
  [-0.43, 1.86, 0.5], [0.18, 1.98, -0.75], [-0.2, 1.98, 0.1],
];

const MARKING_PATCHES = [
  [0.36, 1.62, -0.5], [-0.36, 1.74, 0.35], [0, 1.95, -0.62],
];

function buildMarkings(body, style, color) {
  const material = mat(color);
  const isPatches = style === 'patches';
  const geometry = isPatches ? patchGeo : spotGeo;
  const places = isPatches ? MARKING_PATCHES : MARKING_SPOTS;
  for (const [x, y, z] of places) {
    body.add(shaped(geometry, x, y, z, material));
  }
}

// ---------------------------------------------------------------------------
// The tack: a saddle and the blanket that goes under it.
//
// Both are built at scale 1 and hung off the BODY group, so they bob up and
// down with the barrel while the horse trots, and they shrink with the horse
// because the body lives inside the scaled frame.
//
// Each horse gets its own material for each piece, so every horse can wear a
// different colour.
// ---------------------------------------------------------------------------
function buildSaddle() {
  // One material, used by both the seat and the pommel, so setting the saddle
  // colour is a single line later on.
  const material = new THREE.MeshLambertMaterial({ color: TACK_COLORS.brown });

  const saddle = new THREE.Group();
  saddle.name = 'saddle';

  // The seat: a small box lying on the horse's back.
  saddle.add(box(0.55, 0.18, 0.7, 0, BACK_TOP + 0.095, -0.05, material));

  // The pommel: the little raised lip at the front that a rider holds on to.
  saddle.add(box(0.34, 0.14, 0.14, 0, BACK_TOP + 0.215, 0.24, material));

  saddle.visible = false; // horses start bare; setSaddle() puts it on
  return { saddle, material };
}

function buildBlanket() {
  const material = new THREE.MeshLambertMaterial({ color: TACK_COLORS.brown });

  // Wider than the barrel (which is 0.9 across) so it hangs over both sides,
  // and thin, so it reads as a cloth draped over the back.
  const blanket = box(1.0, 0.06, 0.9, 0, BACK_TOP + 0.015, -0.05, material);
  blanket.name = 'blanket';
  blanket.visible = false;
  return { blanket, material };
}

// Make the bar match the horse's current hunger: how long it is, and its
// colour. The bar itself is built by bar.js, which the chicken coop uses too.
function refreshBar(horse) {
  horse.userData.bar.setValue(horse.userData.hunger, MAX_HUNGER);
}

// ---------------------------------------------------------------------------
// createHorse - build one horse and everything it carries.
//
//   createHorse({
//     id: 'h1',                   // a short name the save file can use
//     name: 'Biscuit',            // what the horse is called
//     kind: 'chestnut',           // a key of HORSE_KINDS
//     position: new THREE.Vector3(6, 0, 4),   // or a plain { x, y, z }
//     rotationY: -0.35,           // which way it is turned, in radians
//     coatColor: 0x9c6b3a,        // optional: override the kind's own coat.
//                                 // Phase 7 uses this for foals, whose coat
//                                 // colour is random.
//   })
//
// PHASE 7 adds a handful of optional extras, all of which a bred horse uses and
// none of which a starting horse needs. Left out, every one of them falls back
// to what the kind's own row in HORSE_KINDS says, so nothing changes:
//
//     maneColor: 0x3e2723,        // mane, tail and hooves
//     label: 'Palomino',          // the pretty name the barn menu shows
//     speed: 10.4,                // units a second (mixed from its parents)
//     hungerSeconds: 105,         // how long its bar takes to empty
//     scale: 1,                   // how big a GROWN-UP one of these is
//     markings: { style: 'spots', color: 0x4e3b2f },   // see buildMarkings
//     grown: 1,                   // 0 = a newborn foal, 1 = all grown up
//     bred: true,                 // born here rather than a starting horse
//     coat: 'palomino',           // which coat it was born with (for the save)
// ---------------------------------------------------------------------------
export function createHorse({
  id = null,
  name = 'Horse',
  kind = DEFAULT_KIND,
  position,
  rotationY = 0,
  coatColor = null,
  maneColor = null,
  label = null,
  speed = null,
  hungerSeconds = null,
  scale: scaleOverride = null,
  markings = null,
  grown = 1,
  bred = false,
  coat: coatKey = null,
} = {}) {
  // Look the kind up. An unknown kind quietly falls back to a chestnut's
  // numbers, so a typo (or an old save file) can never crash the game - and a
  // bred horse, whose "kind" is its coat ('palomino'), simply takes every one
  // of its own numbers from the extras above.
  const breed = HORSE_KINDS[kind] ?? HORSE_KINDS[DEFAULT_KIND];

  // How big a GROWN-UP one of these is. A foal starts smaller than this and
  // grows into it (see applyGrowth at the bottom of the file).
  const adultScale = Number.isFinite(scaleOverride) ? scaleOverride : breed.scale;

  // The outer group: never scaled, so Natalia keeps her own size when she is
  // added to it as a rider.
  const horse = new THREE.Group();
  horse.name = 'horse';

  // The inner group holds the whole animal, built at normal size, and IS
  // scaled. Shrink this and the horse gets smaller; the rider does not.
  const frame = new THREE.Group();
  frame.name = 'frame';
  horse.add(frame);

  // A foal's random coat (Phase 7) overrides whatever the kind says, and so
  // does its mane colour: a palomino's creamy mane is half of what makes it
  // look like a palomino.
  const finalCoat = coatColor === null ? breed.coat : coatColor;
  const finalMane = maneColor === null ? breed.mane : maneColor;
  const coat = mat(finalCoat);
  const hair = mat(finalMane);
  const hoofColor = mat(maneColor === null ? breed.hoof : maneColor);

  // Four legs with darker hooves. The horse looks along +Z, so the front legs
  // are the ones at z = +0.7, and its own left-hand side is +X.
  const frontLeft = buildLeg(0.33, 0.7, coat, hoofColor);
  const frontRight = buildLeg(-0.33, 0.7, coat, hoofColor);
  const backLeft = buildLeg(0.33, -0.7, coat, hoofColor);
  const backRight = buildLeg(-0.33, -0.7, coat, hoofColor);
  const legs = [frontLeft, frontRight, backLeft, backRight];
  for (const leg of legs) frame.add(leg);

  // Everything above the legs hangs off "body", so the walk can bob it up and
  // down a little without lifting the legs or the hunger bar with it.
  const body = new THREE.Group();
  frame.add(body);

  // Barrel of the body, long in the Z direction.
  body.add(box(0.9, 0.85, 2.1, 0, 1.6, 0, coat));

  // Neck: a box tilted forward so it rises towards the head.
  const neck = box(0.55, 1.0, 0.55, 0, 2.05, 0.85, coat);
  neck.rotation.x = 0.45;
  body.add(neck);

  // Mane: a thin slab lying along the back of the neck.
  const mane = box(0.14, 1.05, 0.2, 0, 2.05, 0.6, hair);
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
  const tail = box(0.18, 0.8, 0.18, 0, 1.75, -1.1, hair);
  tail.rotation.x = 0.35;
  body.add(tail);

  // Spots or patches, if this coat has any (Phase 7: spotted and pinto foals).
  if (markings && Number.isFinite(markings.color)) {
    buildMarkings(body, markings.style, markings.color);
  }

  // The tack. Both pieces are children of the body, so they bob with the
  // barrel and shrink with the horse. Both start hidden.
  const blanketParts = buildBlanket();
  const saddleParts = buildSaddle();
  body.add(blanketParts.blanket);
  body.add(saddleParts.saddle);

  // The floating hunger bar rides along as a child of the OUTER group, so we
  // can place it in real world units. It is scaled to match the horse, so a
  // pony gets a pony-sized bar.
  // (Its size and height are set by applyGrowth further down, along with the
  // horse's own, so a foal gets a foal-sized bar that grows with it.)
  const bar = createHungerBar({ width: BAR_WIDTH, thickness: BAR_THICKNESS, depth: BAR_DEPTH });
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
    // bodyLift is how far the body has to sit ABOVE its usual place because
    // this horse is a leggy foal; it is 0 for every grown horse.
    body.position.y =
      horse.userData.bodyLift + Math.abs(Math.sin(phase)) * BODY_BOB * swing;
  }

  // The stats this horse plays with. A starting horse takes them from its
  // breed; a bred one (Phase 7) is handed its own, mixed from its parents.
  const finalSpeed = Number.isFinite(speed) ? speed : breed.speed;
  const finalHungerSeconds =
    Number.isFinite(hungerSeconds) && hungerSeconds > 0
      ? hungerSeconds
      : breed.hungerSeconds;

  // Everything the game needs to know about this horse lives here.
  horse.userData = {
    id,                    // for the save file: 'h1', 'h2', ... (foals: 'f1')
    name,                  // 'Biscuit'
    kind,                  // 'chestnut' | 'white' | 'black' | 'pony', or a
                           // Phase 7 coat name such as 'palomino'
    label: label ?? breed.label,   // 'Chestnut' - the pretty version, for menus
    hunger: MAX_HUNGER,    // 100 = just fed, 0 = starving
    // How fast this horse gallops, in units a second. riding.js reads it.
    speed: finalSpeed,
    // How long its bar takes to empty, and the same thing as points a second:
    // a bar that empties in 60 seconds loses 100 / 60 points a second.
    hungerSeconds: finalHungerSeconds,
    hungerDrainPerSecond: MAX_HUNGER / finalHungerSeconds,
    // Phase 7: growing up. A starting horse is born grown (grown = 1), so
    // "scale" and "adultScale" are the same number and nothing ever moves.
    bred,                  // was it born on the ranch rather than built at the start?
    coat: coatKey,         // which coat it was born with, for the save file
    grown: 1,              // 0 = a newborn foal, 1 = a full-sized horse
    isFoal: false,         // true while it is still too little to ride
    growSecondsLeft: 0,    // how much growing up it has left to do
    adultScale,            // how big it will be when it is all grown up
    scale: adultScale,     // how big it is RIGHT NOW (applyGrowth sets this)
    bodyLift: 0,           // how far a leggy foal's body sits above normal
    coatColor: finalCoat,
    saddle: 'none',        // which TACK_COLORS key it is wearing
    blanket: 'none',
    // Real world-unit heights, for code outside this module. applyGrowth fills
    // all three in properly a few lines below.
    backY: BACK_TOP * adultScale,   // the top of its back
    saddleY: 0,                // where Natalia sits
    barY: 0,                   // how high the hunger bar floats
    head,                  // the mesh that bobs when we feed it
    headRestAngle: head.rotation.x,
    feedTimer: 0,          // counts down through the happy head-bob
    bar,                   // the bar.js helper: setValue() and faceCamera()
    barHolder: bar.holder, // the part that turns to face the camera
    barFill: bar.fill,     // the coloured part we shrink as hunger drops
    frame,                 // the scaled group holding the whole animal
    body,                  // everything above the legs, for the walking bob
    legs,                  // [frontLeft, frontRight, backLeft, backRight]
    saddleGroup: saddleParts.saddle,     // seat + pommel
    saddleMaterial: saddleParts.material,
    blanketMesh: blanketParts.blanket,
    blanketMaterial: blanketParts.material,
    setMoving,             // call once a frame: swings the legs while walking
  };

  // Set its size, its legginess and all three heights (including where a rider
  // sits). A grown horse passes grown = 1 and lands on exactly the numbers the
  // game has always used; a newborn foal passes 0 and comes out little.
  applyGrowth(horse, grown);

  // Draw the bar at the right size straight away, so it is never wrong on the
  // very first frame.
  refreshBar(horse);

  return horse;
}

// ---------------------------------------------------------------------------
// applyGrowth - Phase 7: how grown up this horse is, from 0 (born this minute)
// to 1 (a full-sized horse). Call it as often as you like; breeding.js calls it
// every frame while a foal is growing, so the foal swells gently rather than
// popping from small to big.
//
// Three things change together:
//   * how big the animal is         FOAL_SCALE of its grown size, up to all of it
//   * how leggy it is               a newborn's legs are FOAL_LEG_STRETCH long
//   * every height measured off it  where a rider sits, where the bar floats
//
// The legs are stretched by moving each hip UP and scaling the leg by the same
// amount, which leaves the hooves exactly on the grass; the body is then lifted
// by the difference, so it still sits on top of the legs.
// ---------------------------------------------------------------------------
export function applyGrowth(horse, grown) {
  const data = horse.userData;

  // Anything odd (a hand-edited save, say) is treated as "all grown up".
  const g = Number.isFinite(grown) ? Math.max(0, Math.min(1, grown)) : 1;
  data.grown = g;

  // Size, and how leggy: both slide from the foal number up to 1 as it grows.
  const size = data.adultScale * (FOAL_SCALE + (1 - FOAL_SCALE) * g);
  const stretch = FOAL_LEG_STRETCH + (1 - FOAL_LEG_STRETCH) * g;
  const lift = HIP_HEIGHT * (stretch - 1);

  data.scale = size;
  data.bodyLift = lift;

  data.frame.scale.setScalar(size);

  for (const leg of data.legs) {
    leg.position.y = HIP_HEIGHT * stretch;
    leg.scale.y = stretch;
  }

  // The body sits on top of those longer legs. setMoving adds its walking
  // bounce on top of this same number every frame.
  data.body.position.y = lift;

  // The heights other files read. The back is the top of the barrel, which the
  // leggy lift has just raised, all of it shrunk by this horse's size.
  data.backY = (BACK_TOP + lift) * size;
  data.barHolder.scale.setScalar(size);
  data.barHolder.position.y = data.backY + BAR_ABOVE_BACK;
  data.barY = data.barHolder.position.y;

  // Where a rider's feet end up. (A foal cannot be ridden at all, but the sum
  // is the same one, and it is right the moment the foal grows up.)
  refreshSaddleHeight(horse);
}

// ---------------------------------------------------------------------------
// refreshSaddleHeight - how high above the grass Natalia's feet sit when she
// is on this horse. riding.js reads horse.userData.saddleY at mount time.
//
// She straddles the barrel, so she sits a little below the top of the back -
// and a saddle, being a cushion, lifts her a touch higher again.
// ---------------------------------------------------------------------------
function refreshSaddleHeight(horse) {
  const data = horse.userData;
  const lift = data.saddle === 'none' ? 0 : SADDLE_LIFT;
  // bodyLift is the extra height a leggy foal's back has; it is 0 for a grown
  // horse, so this is exactly the sum Phase 3 used.
  data.saddleY =
    (BACK_TOP - RIDER_SIT_DROP + data.bodyLift) * data.scale + lift;
}

// ---------------------------------------------------------------------------
// setSaddle / setBlanket - dress the horse.
//
//   setSaddle(horse, 'red')    puts a red saddle on
//   setSaddle(horse, 'none')   takes it off again
//
// The colour key is remembered on horse.userData.saddle / .blanket, which is
// exactly what the save file stores. An unknown key is treated as 'none', so
// an old or hand-edited save can never break the game.
// Returns the key that was actually applied.
// ---------------------------------------------------------------------------
function setTack(mesh, material, colorKey) {
  const color = TACK_COLORS[colorKey];
  // Both a missing key and 'none' end up here as null/undefined: nothing worn.
  if (color === null || color === undefined) {
    mesh.visible = false;
    return 'none';
  }
  material.color.setHex(color);
  mesh.visible = true;
  return colorKey;
}

export function setSaddle(horse, colorKey) {
  const data = horse.userData;
  data.saddle = setTack(data.saddleGroup, data.saddleMaterial, colorKey);
  // A saddle changes how high the rider sits, so redo that sum.
  refreshSaddleHeight(horse);
  return data.saddle;
}

export function setBlanket(horse, colorKey) {
  const data = horse.userData;
  data.blanket = setTack(data.blanketMesh, data.blanketMaterial, colorKey);
  return data.blanket;
}


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

  // 1. Get hungrier (never below zero), at this horse's own rate: a white
  //    horse empties its bar in a minute, a black one takes two and a half.
  data.hunger = Math.max(0, data.hunger - data.hungerDrainPerSecond * step);

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
  data.bar.faceCamera(camera);
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
