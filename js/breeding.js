// breeding.js - Phase 7: foals.
//
// Two grown-up horses, two sacks of horse feed and a big button in the barn
// menu, and a little foal is standing outside the barn door a moment later.
//
// The one rule that matters: NOBODY CHOOSES THE COAT. The colour a foal is
// born with is picked at random from the table below, which is the whole point
// of the phase - "a foal appears in the barn with a coat colour I didn't
// choose". Its name is random too (never one already in use on the ranch), and
// its speed and appetite are a mix of its mum's and its dad's with a small
// nudge either way, so no two foals are ever quite the same.
//
// A foal is a perfectly ordinary horse in every way but two: it is little, and
// it cannot be ridden. After four minutes of playing it is all grown up, and
// from that moment it is a horse like any other - it can be ridden, dressed up
// in the barn, and be the mum or dad of a foal of its own.
//
// What this module gives the rest of the game:
//
//   FOAL_COATS          the table of coats a foal can be born with
//   FOAL_NAMES          the names it can be given
//   MAX_HERD            how many horses the ranch can hold (8)
//   BREED_COST          how much horse feed a foal costs (2)
//   GROW_SECONDS        how long it takes to grow up (240 = four minutes)
//   makeFoalSpec({ mum, dad, herd })
//                       -> the plain description of ONE new foal: its id, its
//                          name, its random coat and its mixed-up stats. No
//                          Three.js and no side effects, so a test can call it
//                          a hundred times over and count the colours.
//   createBreeding({ ... })
//                       -> { whyNot, canBreed, breed, update, growingFoal,
//                            parents, fromSave }
//
// main.js owns what "put a horse in the world" means (add it to the scene, make
// it something to walk around, register its E and F keys); this file only ever
// asks for it through the addHorse callback it is handed.

import { createHorse, applyGrowth, FOAL_SCALE } from './horse.js';

// ---------------------------------------------------------------------------
// THE COATS. Eleven of them, so the same colour rarely comes up twice running.
//
//   key      what the save file writes down
//   label    the word an eight-year-old reads: "A palomino foal was born!"
//   coat     the body colour
//   mane     the mane, tail and hooves
//   markings (two of them only) little boxes of a second colour: the spotted
//            horse's spots and the pinto's patches. horse.js draws them.
// ---------------------------------------------------------------------------
export const FOAL_COATS = [
  { key: 'chestnut', label: 'chestnut', coat: 0x9c6b3a, mane: 0x3e2723 },
  { key: 'bay', label: 'bay', coat: 0x8a5524, mane: 0x241a12 },
  { key: 'black', label: 'black', coat: 0x2b2b2b, mane: 0x111111 },
  { key: 'white', label: 'white', coat: 0xf2efe6, mane: 0xdcd6c6 },
  { key: 'grey', label: 'grey', coat: 0x9aa0a6, mane: 0x646a70 },
  { key: 'palomino', label: 'palomino', coat: 0xe0b661, mane: 0xfff3d6 },
  { key: 'cream', label: 'cream', coat: 0xf0dfc0, mane: 0xd8c39a },
  { key: 'chocolate', label: 'chocolate', coat: 0x5d4037, mane: 0x35241d },
  { key: 'dun', label: 'dun', coat: 0xc9a26b, mane: 0x4e342e },
  {
    key: 'spotted',
    label: 'spotted',
    coat: 0xe8e2d6,
    mane: 0x5b5048,
    markings: { style: 'spots', color: 0x4e3b2f },
  },
  {
    key: 'pinto',
    label: 'pinto',
    coat: 0x7d4a22,
    mane: 0x2e2018,
    markings: { style: 'patches', color: 0xf5f0e6 },
  },
];

// The coat we fall back to if a save file names one we have never heard of.
const DEFAULT_COAT = FOAL_COATS[0];

// ---------------------------------------------------------------------------
// THE NAMES. Twenty cute ones. A foal is never given a name another horse on
// the ranch already has, so nobody ever has to shout "Poppy!" at two horses.
// ---------------------------------------------------------------------------
export const FOAL_NAMES = [
  'Clover', 'Pebble', 'Sunny', 'Daisy', 'Willow',
  'Peanut', 'Bluebell', 'Poppy', 'Maple', 'Nutmeg',
  'Honey', 'Pumpkin', 'Misty', 'Twinkle', 'Toffee',
  'Jellybean', 'Rosie', 'Pippin', 'Hazel', 'Comet',
];

// ---------------------------------------------------------------------------
// The tuning numbers, all in one place.
// ---------------------------------------------------------------------------

// How many horses the ranch can hold. Eight horses is about twenty meshes each
// - plenty for a laptop with no graphics card, and plenty for a child to look
// after. The barn menu says "The ranch is full!" rather than letting the
// button do nothing.
export const MAX_HERD = 8;

// What a foal costs: two sacks of horse feed, which a new game can just about
// afford (it starts with three). No coins change hands - a foal is not
// something you buy, it is something that happens on the ranch.
export const BREED_COST = 2;

// How long a foal takes to grow up, in seconds of PLAYING - the same idea as
// the chicks in chickens.js. Four minutes is long enough that it really is
// something to look forward to, and short enough that it happens in one sitting.
export const GROW_SECONDS = 240;

// How much of the parents' speed and appetite a foal wanders off by. Both are
// "the average of mum and dad, give or take this much".
const SPEED_NUDGE = 0.7;         // units a second
const HUNGER_NUDGE = 15;         // seconds of bar

// The stats never wander outside these, so a foal is always a horse a child can
// ride and feed: never slower than a walk, never hungry every ten seconds.
const MIN_SPEED = 8;
const MAX_SPEED = 13.5;
const MIN_HUNGER_SECONDS = 55;
const MAX_HUNGER_SECONDS = 170;

// ---------------------------------------------------------------------------
// WHERE A FOAL IS BORN: on the grass just outside the barn door, which is the
// spot the child is standing on when they press the button.
//
// The barn takes up x 8.5..19.5, z -14.5..-5.5 and its door is in the middle of
// the front wall, with the "open the barn" spot at (14, -4.5). None of these
// places is inside the barn, none of them is on the dirt path or the road, and
// none of them is right in front of the door - a foal should be the first thing
// you see when you come out, not the thing you have to walk around.
//
// They are tried in order, and the first one with nothing standing on it wins,
// so a second foal never turns up inside the first one.
// ---------------------------------------------------------------------------
const FOAL_SPOTS = [
  { x: 11.0, z: -3.8 },
  { x: 16.6, z: -3.8 },
  { x: 9.2, z: -2.4 },
  { x: 13.0, z: -1.4 },
  { x: 15.4, z: -1.2 },
  { x: 19.2, z: 0.4 },
];

// How much room we ask for when looking for a free spot. A newborn foal is
// small, but it will grow, so we leave room for the horse it is going to be.
const FOAL_SPOT_RADIUS = 1.5;

// A number rounded to one decimal place, which is all the save file needs.
function round1(value) {
  return Math.round(value * 10) / 10;
}

// Keep a number inside a range.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// The coat table entry for a key, or the chestnut if we do not know it.
export function coatByKey(key) {
  return FOAL_COATS.find((entry) => entry.key === key) ?? DEFAULT_COAT;
}

// A random member of a list.
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// "Somewhere between -amount and +amount."
function nudge(amount) {
  return (Math.random() * 2 - 1) * amount;
}

// ---------------------------------------------------------------------------
// A name no horse on the ranch has yet. If every name on the list is taken
// (which needs twenty horses, and the ranch holds eight) we start again with a
// number on the end rather than giving up.
// ---------------------------------------------------------------------------
function freeName(herd) {
  const taken = new Set(herd.map((horse) => horse.userData.name));
  const spare = FOAL_NAMES.filter((name) => !taken.has(name));
  if (spare.length > 0) return pick(spare);

  const base = pick(FOAL_NAMES);
  for (let n = 2; n < 100; n++) {
    if (!taken.has(base + ' ' + n)) return base + ' ' + n;
  }
  return base;
}

// ---------------------------------------------------------------------------
// An id no horse has yet. The starting horses are h1, h2, h3; every foal born
// here is f1, f2, f3..., counting on from the highest one already about.
// ---------------------------------------------------------------------------
function freeId(herd) {
  let highest = 0;
  for (const horse of herd) {
    const id = horse.userData.id;
    if (typeof id !== 'string' || id[0] !== 'f') continue;
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return 'f' + (highest + 1);
}

// ---------------------------------------------------------------------------
// makeFoalSpec - everything about one new foal, as plain numbers and strings.
//
//   makeFoalSpec({ mum: biscuit, dad: snowy, herd: horses })
//     -> { id: 'f1', name: 'Clover', coat: 'palomino', label: 'Palomino',
//          coatColor: 0xe0b661, maneColor: 0xfff3d6, markings: null,
//          speed: 11.6, hungerSeconds: 88, scale: 0.98,
//          mumName: 'Biscuit', dadName: 'Snowy' }
//
// The coat is rolled HERE, from FOAL_COATS, and nothing that is passed in can
// steer it: there is no coat argument to pass.
// ---------------------------------------------------------------------------
export function makeFoalSpec({ mum, dad, herd = [] } = {}) {
  const mumData = mum ? mum.userData : null;
  const dadData = dad ? dad.userData : null;

  // The random bit: which coat this foal happens to be born with.
  const coat = pick(FOAL_COATS);

  // Its stats: halfway between its parents', give or take a little. A missing
  // parent (which should never happen) falls back to ordinary horse numbers.
  const mumSpeed = mumData && Number.isFinite(mumData.speed) ? mumData.speed : 11;
  const dadSpeed = dadData && Number.isFinite(dadData.speed) ? dadData.speed : 11;
  const mumFull = mumData && Number.isFinite(mumData.hungerSeconds) ? mumData.hungerSeconds : 100;
  const dadFull = dadData && Number.isFinite(dadData.hungerSeconds) ? dadData.hungerSeconds : 100;

  const speed = clamp(
    (mumSpeed + dadSpeed) / 2 + nudge(SPEED_NUDGE), MIN_SPEED, MAX_SPEED
  );
  const hungerSeconds = clamp(
    (mumFull + dadFull) / 2 + nudge(HUNGER_NUDGE),
    MIN_HUNGER_SECONDS, MAX_HUNGER_SECONDS
  );

  // How big it will be once it is grown: the average of its parents' grown-up
  // sizes, so two ponies have a pony-sized foal.
  const mumScale = mumData && Number.isFinite(mumData.adultScale) ? mumData.adultScale : 1;
  const dadScale = dadData && Number.isFinite(dadData.adultScale) ? dadData.adultScale : 1;

  return {
    id: freeId(herd),
    name: freeName(herd),
    coat: coat.key,
    label: coat.label.charAt(0).toUpperCase() + coat.label.slice(1),
    coatWord: coat.label,
    coatColor: coat.coat,
    maneColor: coat.mane,
    markings: coat.markings ?? null,
    speed: round1(speed),
    hungerSeconds: Math.round(hungerSeconds),
    scale: round1((mumScale + dadScale) / 2),
    mumName: mumData ? mumData.name : 'a horse',
    dadName: dadData ? dadData.name : 'a horse',
  };
}

// ---------------------------------------------------------------------------
// buildFoalHorse - turn a spec into an actual horse, built by the same builder
// every other horse on the ranch is built by.
//
//   growSecondsLeft  how much growing it still has to do. GROW_SECONDS for a
//                    brand new foal, 0 for one that grew up in an earlier visit.
// ---------------------------------------------------------------------------
function buildFoalHorse(spec, place, growSecondsLeft) {
  const left = clamp(Number(growSecondsLeft) || 0, 0, GROW_SECONDS);
  const grown = 1 - left / GROW_SECONDS;

  const horse = createHorse({
    id: spec.id,
    name: spec.name,
    // A bred horse's "kind" is its coat, so the save file, the barn menu and
    // the hunger sums all agree on one word for what it is.
    kind: spec.coat,
    coat: spec.coat,
    label: spec.label,
    coatColor: spec.coatColor,
    maneColor: spec.maneColor,
    markings: spec.markings,
    speed: spec.speed,
    hungerSeconds: spec.hungerSeconds,
    scale: spec.scale,
    grown,
    bred: true,
    position: { x: place.x, y: 0, z: place.z },
    rotationY: Number.isFinite(place.rotationY) ? place.rotationY : 0,
  });

  horse.userData.isFoal = left > 0;
  horse.userData.growSecondsLeft = left;
  return horse;
}

// ---------------------------------------------------------------------------
// createBreeding - the part that knows about the ranch as it is right now.
//
//   horses     the live array of horses (the same one main.js and the barn
//              menu hold, so a new foal shows up everywhere at once)
//   inventory  her pocket: this is what pays the two sacks of horse feed
//   addHorse   main.js's addHorseToWorld: put this horse in the world
//   isSpotFree (x, z, radius) -> is there room to stand here?
//   onResize   called while a foal is growing, so main.js can widen the circle
//              nobody may walk through as it gets bigger
//   announce   show a short message on screen ("Clover is all grown up!")
//   onChange   something worth saving happened
// ---------------------------------------------------------------------------
export function createBreeding({
  horses,
  inventory,
  addHorse,
  isSpotFree,
  onResize,
  announce,
  onChange,
} = {}) {
  const herd = horses ?? [];

  // Is this horse still too little to ride?
  function isFoal(horse) {
    return !!(horse && horse.userData.isFoal);
  }

  // The horses that can be a mum or a dad: the grown-up ones.
  function parents() {
    return herd.filter((horse) => !isFoal(horse));
  }

  // The foal that is growing up right now, or null. Only ever one at a time.
  function growingFoal() {
    return herd.find(isFoal) ?? null;
  }

  // -------------------------------------------------------------------------
  // whyNot - why the "Have a foal!" button cannot be pressed, in words a child
  // can read. An empty string means "it can".
  //
  // The order matters: the reasons that are about the RANCH come first, then
  // the ones about the two horses picked, then the shopping. That way the
  // button never says "pick a mum and a dad" when the real problem is that
  // there is no room for a foal anyway.
  // -------------------------------------------------------------------------
  function whyNot(mum, dad) {
    if (herd.length >= MAX_HERD) return 'The ranch is full!';

    const growing = growingFoal();
    if (growing) return growing.userData.name + ' is still growing up';

    if (parents().length < 2) return 'You need two grown-up horses';

    if (!mum || !dad) return 'Pick a mum and a dad';
    if (mum === dad) return 'Pick two different horses';
    if (isFoal(mum)) return mum.userData.name + ' is still a foal';
    if (isFoal(dad)) return dad.userData.name + ' is still a foal';

    const feed = inventory ? inventory.get('horseFeed') : 0;
    if (feed < BREED_COST) return 'You need 🌾 ' + BREED_COST + ' horse feed';

    return '';
  }

  function canBreed(mum, dad) {
    return whyNot(mum, dad) === '';
  }

  // -------------------------------------------------------------------------
  // Where shall this one stand? The first spot outside the barn door with
  // nothing on it; if every one of them is taken, the first one anyway (which
  // can only happen with six foals born in a row and nobody moving).
  // -------------------------------------------------------------------------
  function findSpot() {
    if (typeof isSpotFree === 'function') {
      for (const spot of FOAL_SPOTS) {
        if (isSpotFree(spot.x, spot.z, FOAL_SPOT_RADIUS)) return spot;
      }
    }
    return FOAL_SPOTS[0];
  }

  // -------------------------------------------------------------------------
  // breed - the button itself.
  //
  // Hands back { ok, horse, message }:
  //   ok false  nothing happened at all, and message says why in child's words
  //   ok true   a foal is standing outside the barn, and message is the happy
  //             announcement to show: "A palomino foal was born! Her name is
  //             Clover."
  // -------------------------------------------------------------------------
  function breed(mum, dad) {
    const reason = whyNot(mum, dad);
    if (reason) return { ok: false, horse: null, message: reason };

    // Two sacks of oats for the new arrival. spend() refuses and changes
    // nothing if they are not both there, so nothing else can go wrong after
    // this line.
    if (!inventory.spend('horseFeed', BREED_COST)) {
      return { ok: false, horse: null, message: 'You need 🌾 ' + BREED_COST + ' horse feed' };
    }

    const spec = makeFoalSpec({ mum, dad, herd });
    const spot = findSpot();

    // Facing out into the yard, turned a little so a row of them never looks
    // like a line of toy soldiers.
    const horse = buildFoalHorse(
      spec,
      { x: spot.x, z: spot.z, rotationY: nudge(0.5) },
      GROW_SECONDS
    );

    if (typeof addHorse === 'function') addHorse(horse);

    const message =
      'A ' + spec.coatWord + ' foal was born! Her name is ' + spec.name + '.';

    if (typeof announce === 'function') announce(message);
    if (typeof onChange === 'function') onChange();

    return { ok: true, horse, message, spec };
  }

  // -------------------------------------------------------------------------
  // fromSave - build a foal (or a grown-up one) that was born in an earlier
  // visit. save.js calls this for every saved horse whose id it does not
  // recognise, then puts its position, hunger and tack back itself.
  // -------------------------------------------------------------------------
  function fromSave(entry) {
    if (!entry || typeof entry !== 'object') return null;
    // Never let a strange save file fill the ranch past the cap.
    if (herd.length >= MAX_HERD) return null;

    const coat = coatByKey(entry.coat);
    const spec = {
      id: typeof entry.id === 'string' && entry.id ? entry.id : freeId(herd),
      name: typeof entry.name === 'string' && entry.name ? entry.name : freeName(herd),
      coat: coat.key,
      label: coat.label.charAt(0).toUpperCase() + coat.label.slice(1),
      coatWord: coat.label,
      coatColor: coat.coat,
      maneColor: coat.mane,
      markings: coat.markings ?? null,
      speed: clamp(Number(entry.speed) || 11, MIN_SPEED, MAX_SPEED),
      hungerSeconds: clamp(
        Number(entry.hungerSeconds) || 100, MIN_HUNGER_SECONDS, MAX_HUNGER_SECONDS
      ),
      scale: clamp(Number(entry.scale) || 1, 0.6, 1.2),
    };

    const horse = buildFoalHorse(
      spec,
      { x: 0, z: 0, rotationY: 0 },     // save.js moves it to where it was
      Number(entry.growSecondsLeft) || 0
    );

    if (typeof addHorse === 'function') addHorse(horse);
    return horse;
  }

  // -------------------------------------------------------------------------
  // update - one frame. The only thing with anything to do is a foal that is
  // still growing: its timer runs down, it swells a little, and when the timer
  // runs out it becomes an ordinary horse and the game says so.
  // -------------------------------------------------------------------------
  function update(dt) {
    const foal = growingFoal();
    if (!foal) return;

    // Cap dt the same way the rest of the game does, so a tab left in the
    // background does not grow a foal up while nobody is looking.
    const step = Math.min(dt || 0, 0.1);
    const data = foal.userData;

    data.growSecondsLeft = Math.max(0, data.growSecondsLeft - step);

    const grown = 1 - data.growSecondsLeft / GROW_SECONDS;
    applyGrowth(foal, grown);
    // It is a little wider than it was a frame ago, so the circle nobody may
    // walk through has to keep up with it.
    if (typeof onResize === 'function') onResize(foal);

    if (data.growSecondsLeft > 0) return;

    // All grown up: full size, rideable, and ready to be a parent itself.
    data.isFoal = false;
    applyGrowth(foal, 1);
    if (typeof onResize === 'function') onResize(foal);

    if (typeof announce === 'function') {
      announce(data.name + ' is all grown up! You can ride ' + data.name + ' now.');
    }
    if (typeof onChange === 'function') onChange();
  }

  return {
    whyNot,
    canBreed,
    breed,
    update,
    isFoal,
    parents,
    growingFoal,
    fromSave,
    // Handy for tests and for anybody poking about in the console.
    spots: FOAL_SPOTS,
    foalScale: FOAL_SCALE,
  };
}
