// save.js - keeping the ranch between visits.
//
// Everything the game wants to remember is written into the browser's own
// localStorage under one key, as one small blob of JSON. There is no server
// and no account: the save lives in this browser, on this computer.
//
// What this module gives the rest of the game:
//   SAVE_VERSION                       - the number stamped into every save
//   SAVE_KEY                           - the localStorage key we use
//   loadGame()                         -> the saved object, or null
//   saveGame(data)                     -> true if it was written, false if not
//   clearSave()                        - throw the save away ("Start over")
//   collectState({ natalia, horses, inventory, coop })
//                                      -> the plain object we save
//   applyState(state, { ... })         - put a loaded save back into the world
//
// ---------------------------------------------------------------------------
// SAVE VERSIONS
//
// Version 1 (Phase 4) held the player and the horses.
// Version 2 (Phase 5) adds her pocket (coins and feed) and the chicken coop.
// Version 3 (Phase 5, market stall) adds coop.chicks: a list with one number in
//   it per chick in the pen - how many seconds that chick still has to grow
//   before it is a full chicken.
//
// Older saves still load. The parts they do not have simply get the new-game
// defaults (20 coins, 3 horse feed, 5 chicken feed, 0 eggs, four chickens with
// a full bar), and a save with no "chicks" list means what it says: every
// chicken in that pen is grown up. Nobody loses the horses they dressed up in
// Phase 4 just because the game learned about chickens.
//
// WHY BUMP THE NUMBER RATHER THAN QUIETLY ADD THE FIELD? Because the version is
// the one place that says what a save is meant to contain, and "3" is how a
// future slice can tell a save that knows about chicks from one that predates
// them. Reading old saves costs nothing (OLDEST_READABLE_VERSION is still 1),
// so there is no reason not to be honest about the shape.
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// WHY EVERY SINGLE STORAGE CALL IS WRAPPED IN try/catch
//
// localStorage looks like a plain object, but it is allowed to fail:
//   * in a private / incognito window some browsers refuse to write at all;
//   * a browser set to "block all cookies and site data" can make even
//     *reading* window.localStorage throw a SecurityError;
//   * storage can be full (a quota error) if the disk or the 5MB limit is up;
//   * a file:// page has no proper storage area in some browsers.
//
// None of that should ever stop an eight-year-old from playing. So every call
// sits inside try/catch, and when something goes wrong we quietly carry on
// with no save file: the game simply starts a fresh ranch each time. That is
// also why we never touch window.localStorage outside the helpers below.
// ---------------------------------------------------------------------------

import { setSaddle, setBlanket } from './horse.js';
import { STARTING_INVENTORY } from './inventory.js';

// The one key in localStorage that belongs to this game.
export const SAVE_KEY = 'ranchLifeSave';

// The shape of the save file we WRITE.
export const SAVE_VERSION = 3;

// The oldest shape we can still READ. Anything between this and SAVE_VERSION
// is loaded and quietly brought up to date (see applyState).
export const OLDEST_READABLE_VERSION = 1;

// What the coop looks like in a brand new game, and therefore what a version 1
// save (which had never heard of chickens) gets filled in with.
const DEFAULT_COOP = {
  hunger: 100,
  chickens: 4,
  eggsOnGround: 0,
  eggTimer: 0,
  chicks: [],      // no chicks: the four starting chickens are all grown up
};

// Hunger runs 0..100, the same as in horse.js.
const MAX_HUNGER = 100;

// How wide Natalia is when we ask "would she fit here?" - the same number
// controls.js and riding.js use.
const NATALIA_RADIUS = 0.35;

// A finite number, or the fallback when the save file holds nonsense
// (null, a string, NaN - a hand-edited file can hold anything).
function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Keep a number inside a range, and turn anything that is not a number (a
// hand-edited save file, say) into the fallback.
function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// getStorage - window.localStorage, or null if we are not allowed to have it.
//
// Even reading this property can throw (see the note at the top), which is why
// this tiny function exists instead of touching localStorage directly.
// ---------------------------------------------------------------------------
function getStorage() {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    return storage;
  } catch (error) {
    // Storage is blocked. Not a problem: we just play without saving.
    return null;
  }
}

// ---------------------------------------------------------------------------
// loadGame - read the save file back.
//
// Hands back the saved object, or null when there is nothing to load: no save
// yet, storage blocked, the text is not valid JSON, or it is not the shape we
// expect. A null answer always means "start a brand new ranch", so the game
// only ever has one thing to check.
// ---------------------------------------------------------------------------
export function loadGame() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return null;                 // nothing saved yet

    const data = JSON.parse(text);          // throws on a half-written file

    // A light sanity check on the shape. We are not trying to validate every
    // field here - applyState below treats every value as suspect anyway - we
    // just want to be sure this really is one of our save files.
    if (!data || typeof data !== 'object') return null;
    if (typeof data.version !== 'number') return null;
    // Older saves we still understand are welcome; a save from a FUTURE
    // version is not, because we have no idea what is in it.
    if (data.version < OLDEST_READABLE_VERSION) return null;
    if (data.version > SAVE_VERSION) return null;
    if (!Array.isArray(data.horses)) return null;

    return data;
  } catch (error) {
    // Corrupted text, or storage that threw on us. Start fresh.
    return null;
  }
}

// ---------------------------------------------------------------------------
// saveGame - write the save file.
// Returns true if it went in, false if storage would not take it. It never
// throws, so callers can simply ignore the answer.
// ---------------------------------------------------------------------------
export function saveGame(data) {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    // Private mode, a full disk, or a browser that refuses to store anything.
    return false;
  }
}

// ---------------------------------------------------------------------------
// clearSave - forget everything ("Start over" in the barn menu).
// ---------------------------------------------------------------------------
export function clearSave() {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.removeItem(SAVE_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// collectState - look at the world right now and build the plain object we
// write to localStorage. Plain numbers and strings only: no Three.js objects,
// because JSON.stringify would make an enormous mess of those.
//
// The shape:
//   {
//     version: 2,
//     savedAt: 1758200000000,                 // Date.now(), just for humans
//     player: { x, z, rotationY },
//     horses: [
//       { id, name, kind, hunger, saddle, blanket, x, z, rotationY },
//       ...
//     ],
//     inventory: { coins, horseFeed, chickenFeed, eggs },
//     coop: { hunger, chickens, eggsOnGround, eggTimer, chicks: [12.5, ...] }
//   }
//
// Note there is no y: everybody stands on flat grass, so y is always 0.
//
// ON PURPOSE: we do NOT remember that Natalia was sitting on a horse. If the
// page is closed mid-gallop we save the HORSE's spot as her spot, and next
// time she starts standing on her own two feet next to it. Persisting a
// "mounted" state would mean rebuilding the parent/child link, the camera and
// the controls subject on load, and that is a lot of fiddly machinery to buy
// one second of convenience. Simple wins.
// ---------------------------------------------------------------------------
export function collectState({ natalia, horses, inventory, coop } = {}) {
  const horseList = horses ?? [];

  // Where is Natalia? While she is riding she is a CHILD of the horse, so her
  // own position is measured from the horse's back (0, saddleY, 0) and is no
  // use to us. In that case we save the horse's spot instead.
  let playerX = 0;
  let playerZ = 0;
  let playerRotation = Math.PI;

  if (natalia) {
    const mount = natalia.parent && natalia.parent.name === 'horse'
      ? natalia.parent
      : null;
    const source = mount ?? natalia;
    playerX = source.position.x;
    playerZ = source.position.z;
    playerRotation = source.rotation.y;
  }

  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    player: {
      x: playerX,
      z: playerZ,
      rotationY: playerRotation,
    },
    horses: horseList.map((horse) => {
      const data = horse.userData;
      return {
        id: data.id,
        name: data.name,
        kind: data.kind,
        hunger: data.hunger,
        saddle: data.saddle,
        blanket: data.blanket,
        x: horse.position.x,
        z: horse.position.z,
        rotationY: horse.rotation.y,
      };
    }),

    // Her pocket: coins, horse feed, chicken feed, eggs. inventory.all()
    // already hands back a plain copy, which is exactly what JSON wants.
    inventory: inventory ? inventory.all() : { ...STARTING_INVENTORY },

    // The coop: one shared hunger, how many chickens are in the pen, how many
    // eggs are lying about waiting to be picked up, how far along the next egg
    // is, and how much growing each chick has left to do. chickens.js builds
    // this for us with getState().
    coop: coop ? coop.getState() : { ...DEFAULT_COOP },
  };
}

// ---------------------------------------------------------------------------
// applyState - put a loaded save back into the world.
//
//   applyState(saved, { natalia, horses, controls })
//
// It expects the world to be built already: the horses in "horses" are the
// live ones from main.js, and we simply move them and dress them. Anything the
// save file does not mention is left exactly as the fresh game made it.
//
// You can pass either "controls" (we use controls.resolveSpot) or your own
// "resolveSpot" function; "bounds" is optional and only used to clamp Natalia
// before we ask for a safe spot.
// ---------------------------------------------------------------------------
export function applyState(
  state,
  { natalia, horses, controls, resolveSpot, bounds, inventory, coop } = {}
) {
  if (!state) return false;

  const horseList = horses ?? [];
  const savedHorses = Array.isArray(state.horses) ? state.horses : [];

  // The edge of the ranch. world.bounds is the real answer; this fallback only
  // matters if nobody passed it in, and it is simply a very large field.
  const limits = bounds ?? { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };

  // --- the horses ----------------------------------------------------------
  for (const saved of savedHorses) {
    if (!saved || typeof saved !== 'object') continue;

    // Match by id ('h1', 'h2', ...), not by position in the list, so adding a
    // new starting horse later does not shuffle everybody's saddles around.
    const horse = horseList.find((h) => h.userData.id === saved.id);

    // A saved horse with an id we do not have is ignored for now. Phase 7
    // (breeding) will need to CREATE a horse here instead, because a foal born
    // in a previous session has no starting-horse entry to match against.
    if (!horse) continue;

    horse.position.x = clampNumber(saved.x, limits.minX, limits.maxX, horse.position.x);
    horse.position.y = 0;                     // horses stand on the grass
    horse.position.z = clampNumber(saved.z, limits.minZ, limits.maxZ, horse.position.z);
    // An angle needs no clamping - any angle is a legal way to face.
    horse.rotation.y = finiteOr(saved.rotationY, horse.rotation.y);

    horse.userData.hunger = clampNumber(saved.hunger, 0, MAX_HUNGER, MAX_HUNGER);

    // setSaddle / setBlanket know how to handle a colour name they have never
    // heard of: they treat it as 'none'. So a hand-edited save cannot break
    // anything here.
    setSaddle(horse, saved.saddle);
    setBlanket(horse, saved.blanket);
  }

  // --- Natalia -------------------------------------------------------------
  // She always starts on her own two feet (see the note in collectState), so
  // all we need is a patch of grass to stand on.
  if (natalia && state.player && typeof state.player === 'object') {
    const player = state.player;

    // Clamped to the edge of the ranch on the way in.
    let x = clampNumber(player.x, limits.minX, limits.maxX, natalia.position.x);
    let z = clampNumber(player.z, limits.minZ, limits.maxZ, natalia.position.z);

    // Then let the collision code shove her out of anything she would be
    // standing inside: the house, the barn, the fence, or a horse that has
    // since been moved onto the spot she was saved on.
    const resolve = resolveSpot ?? (controls ? controls.resolveSpot : null);
    if (typeof resolve === 'function') {
      const spot = resolve(x, z, NATALIA_RADIUS);
      if (spot) {
        x = spot.x;
        z = spot.z;
      }
    }

    natalia.position.set(x, 0, z);
    natalia.rotation.y = finiteOr(player.rotationY, natalia.rotation.y);
  }

  // --- her pocket -----------------------------------------------------------
  // A version 1 save has no "inventory" at all. setAll only touches the keys
  // it is given, so passing the new-game amounts in that case leaves her with
  // 20 coins and a little feed rather than an empty pocket.
  if (inventory) {
    const saved = state.inventory;
    inventory.setAll(
      saved && typeof saved === 'object' ? saved : { ...STARTING_INVENTORY }
    );
  }

  // --- the chicken coop -----------------------------------------------------
  // Same idea: a version 1 save gets a brand new coop - four chickens, a full
  // bar and no eggs on the ground - instead of an empty pen.
  if (coop) {
    const saved = state.coop;
    coop.setState(
      saved && typeof saved === 'object' ? saved : { ...DEFAULT_COOP }
    );
  }

  return true;
}
