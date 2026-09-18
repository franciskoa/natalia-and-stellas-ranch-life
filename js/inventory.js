// inventory.js - Natalia's pocket: her coins and the things she is carrying,
// plus the small row of numbers in the top-left corner of the screen (the HUD).
//
// Phase 5 is where the ranch grows an economy. Everything countable lives in
// one place so that nothing has to guess how much horse feed is left:
//
//   coins        the money she buys things with
//   horseFeed    a sack of oats - one sack feeds one horse (F on a horse)
//   chickenFeed  a bowl of feed for the chickens - one fills the whole coop
//   eggs         what the chickens lay, which she can sell later
//
// Horse feed and chicken feed are DIFFERENT things on purpose: you cannot feed
// oats to the chickens, and the horses will not eat what is in the chickens'
// bowl. That is the whole reason there are two keys rather than one "feed"
// number.
//
// Phase 6 adds the four things the NEIGHBOURS farm, which she gets by swapping
// baskets with them at their farm gates (see trade.js):
//
//   corn         sweetcorn from the Garcia farm
//   milk         a bottle from the Miller dairy
//   wool         a bundle from the Nguyen flock
//   apples       a basket from the Okafor orchard
//
// They all start at 0: the only way to get any is to go and trade for them.
//
// Phase 7 adds the vegetable garden, which brings three more:
//
//   carrots      what she pulls out of a carrot plot, and a treat for a horse
//   cornSeeds    what a corn plot is planted with
//   carrotSeeds  what a carrot plot is planted with
//
// A brand new ranch starts with two of each seed, so the garden can be used the
// very first time she walks up to it - she does not have to ride all the way to
// the store before anything can be planted. Corn is NOT a new item: the
// sweetcorn the Garcias trade and the corn she grows herself are the same thing
// in her basket, and the market stall pays the same for either.
//
// What this module gives the rest of the game:
//
//   ITEM_KEYS                     everything that can be counted
//   ITEM_ICONS                    the one emoji each of them is drawn with
//   STARTING_INVENTORY            what a brand new game begins with
//   createInventory(initial)   -> { get, add, spend, all, setAll, onChange }
//   createHud(inventory, getChickenCount) -> { refresh }
//
// Nothing here knows about Three.js, the save file or the coop. It just counts.

// ---------------------------------------------------------------------------
// The eleven things we count. Anything not on this list is ignored, so a
// hand-edited save file cannot invent a "diamonds" pile.
// ---------------------------------------------------------------------------
export const ITEM_KEYS = [
  'coins', 'horseFeed', 'chickenFeed', 'eggs',
  'corn', 'carrots', 'milk', 'wool', 'apples',
  'cornSeeds', 'carrotSeeds',
];

// What a brand new ranch starts with: enough feed to try everything out once,
// a few coins to spend at the store, and two seeds of each kind so the garden
// works from the very first minute. The neighbours' goods start at 0 - they
// have to be traded for.
export const STARTING_INVENTORY = {
  coins: 20,
  horseFeed: 3,
  chickenFeed: 5,
  eggs: 0,
  corn: 0,
  carrots: 0,
  milk: 0,
  wool: 0,
  apples: 0,
  cornSeeds: 2,
  carrotSeeds: 2,
};

// A whole number of at least zero. A save file (or a typo) can hold anything,
// so every number that comes in from outside goes through here first.
function wholeNumber(value, fallback = 0) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

// ---------------------------------------------------------------------------
// createInventory - one pocket.
//
//   const inventory = createInventory();               // a new game
//   const inventory = createInventory({ coins: 99 });  // or from a save file
//
//   inventory.get('coins')          -> 20
//   inventory.add('eggs', 2)        -> the new total
//   inventory.spend('horseFeed', 1) -> true if she had one, false if not
//   inventory.all()                 -> a copy: { coins, horseFeed, ... }
//   inventory.setAll({ ... })       -> overwrite everything (loading a save)
//   inventory.onChange(fn)          -> call fn() after every change
//
// EVERY change calls the listeners. The HUD uses one to redraw itself, and
// main.js uses another to write the save file, so neither has to remember to
// ask "did anything change?" after each action.
// ---------------------------------------------------------------------------
export function createInventory(initial) {
  // Start from the new-game amounts, then let "initial" override any of them.
  const counts = { ...STARTING_INVENTORY };

  // Everybody who wants to hear about a change.
  const listeners = [];

  function notify() {
    for (const fn of listeners) {
      // One broken listener must not stop the others (or the game).
      try {
        fn(all());
      } catch (error) {
        // Nothing sensible to do about it here; carry on.
      }
    }
  }

  // How many of something she has. An unknown key is simply 0.
  function get(key) {
    return counts[key] ?? 0;
  }

  // A copy of the whole pocket. A copy, not the real thing, so nobody outside
  // can change a number behind our back.
  function all() {
    const out = {};
    for (const key of ITEM_KEYS) out[key] = counts[key];
    return out;
  }

  // Put some in. Returns the new total.
  function add(key, n = 1) {
    if (!ITEM_KEYS.includes(key)) return 0;
    const amount = wholeNumber(n, 0);
    if (amount <= 0) return counts[key];   // nothing to do, nothing to tell
    counts[key] += amount;
    notify();
    return counts[key];
  }

  // Take some out, but ONLY if there is enough. This is the important one:
  // it returns false and changes nothing at all when she cannot afford it, so
  // the caller can say "No horse feed! Buy some at the store." and stop there.
  function spend(key, n = 1) {
    if (!ITEM_KEYS.includes(key)) return false;
    const amount = wholeNumber(n, 0);
    if (amount <= 0) return false;
    if (counts[key] < amount) return false; // not enough: refuse, untouched
    counts[key] -= amount;
    notify();
    return true;
  }

  // Replace the lot, e.g. when a save file is loaded. Keys the object does not
  // mention keep whatever they had.
  function setAll(values) {
    if (!values || typeof values !== 'object') return;
    for (const key of ITEM_KEYS) {
      if (values[key] === undefined) continue;
      counts[key] = wholeNumber(values[key], counts[key]);
    }
    notify();
  }

  // Hear about every change from now on.
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  // The starting amounts go through setAll so they get the same tidying-up as
  // anything else - but quietly, since nobody is listening yet.
  if (initial && typeof initial === 'object') {
    for (const key of ITEM_KEYS) {
      if (initial[key] === undefined) continue;
      counts[key] = wholeNumber(initial[key], counts[key]);
    }
  }

  return { get, add, spend, all, setAll, onChange };
}

// ---------------------------------------------------------------------------
// THE ICONS - one emoji per thing. THIS TABLE IS THE ONLY PLACE ANY OF THEM IS
// WRITTEN DOWN. The HUD here, the store and the market stall (main.js), the
// trade panel (trade.js), the barn menu (menu.js) and the prompts at the coop
// and the garden all read it, so a bottle of milk is the same 🥛 everywhere in
// the game and changing a picture is a one-line job.
//
// PHASE 8 SWAPPED TWO OF THEM ROUND. Until then corn-the-vegetable was 🍿
// (popcorn) while 🌽 meant chicken feed, which is exactly backwards to anybody
// looking at the pictures - and pictures are how an eight-year-old reads this
// game. So now:
//
//   corn         🌽   the sweetcorn the Garcias grow and she grows herself
//   chickenFeed  🥣   a bowl of feed. A BOWL, not a grain, because the picture
//                     has to say "this is the animals' dinner" rather than
//                     "this is a vegetable" - and 🥣 draws properly on Windows,
//                     Android and iPhones alike.
//
// Nothing about the SAVE FILE changed: the keys are still 'corn' and
// 'chickenFeed', so every ranch saved before Phase 8 loads exactly as it was.
//
// THE TWO KINDS OF SEED are the only pair in here that are not obvious from the
// picture alone: 🌱 and 🌿 are both simply "a green thing you plant". That is on
// purpose, because every single place a seed is shown - the HUD, the store row,
// the prompt at the plot - writes the WORD next to it as well ("🌱 2 corn
// seeds", "F: Plant carrots (🌿 2)"). Nothing in the game ever asks a child to
// tell one leaf from the other; the two pictures only have to be different from
// each other, and from the nine icons above them - which, now that corn is 🌽
// and the feed is 🥣, they still are.
// ---------------------------------------------------------------------------
export const ITEM_ICONS = {
  coins: '🪙',
  horseFeed: '🌾',
  chickenFeed: '🥣',
  eggs: '🥚',
  corn: '🌽',
  carrots: '🥕',
  milk: '🥛',
  wool: '🧶',
  apples: '🍎',
  cornSeeds: '🌱',
  carrotSeeds: '🌿',
};

// A chicken is not an inventory item - it is an animal standing in the pen -
// so it has no place in ITEM_ICONS. It still needs one picture that everything
// agrees on, though, so here it is, right beside the others.
export const CHICKEN_ICON = '🐔';

// ---------------------------------------------------------------------------
// THE HUD - the little row of numbers in the top-left corner.
//
// It is plain HTML, not 3D, and it is deliberately tiny and quiet, like the
// controls hint in the other corner:
//
//   🪙 20 · 🌾 3 · 🥣 5 · 🥚 0 · 🐔 4
//   coins · horse feed · chicken feed · eggs · chickens
//   🌽 3 corn · 🥛 1 milk
//
// The little legend under the first line (and the hover text) is there because
// an eight-year-old should not have to guess what 🌾 means.
//
// THE SECOND LINE is everything else she is carrying - what the neighbours grow,
// what she has picked in her own garden, and the seeds she has left to plant.
// Only the things she actually HAS any of are written into it, and each one
// carries its own word, so the line never needs a legend and never lists a pile
// of zeroes. (A brand new game shows the two packets of seeds straight away,
// which is exactly the nudge a child needs to go and find the garden.) All of
// this would have crowded the top line for no reason, hence the second one.
//
//   createHud(inventory, getChickenCount) -> { refresh }
//
// getChickenCount is a function rather than a number, because chickens come
// and go: main.js passes () => coop.count() and calls refresh() when it
// changes. The inventory numbers refresh themselves, through onChange.
// ---------------------------------------------------------------------------

// The things on the top line, in the order they appear on screen.
const HUD_MAIN_KEYS = ['coins', 'horseFeed', 'chickenFeed', 'eggs'];

// The things on the second line, with the word shown beside each number. The
// vegetables she has in her basket come first, then the seeds she has left to
// plant, so the line reads "what I have" and then "what I can grow".
const HUD_GOODS_KEYS = [
  'corn', 'carrots', 'milk', 'wool', 'apples', 'cornSeeds', 'carrotSeeds',
];
const HUD_GOODS_WORDS = {
  corn: 'corn',
  carrots: 'carrots',
  milk: 'milk',
  wool: 'wool',
  apples: 'apples',
  cornSeeds: 'corn seeds',
  carrotSeeds: 'carrot seeds',
};

// The words under the top line, in the same order, with the chickens on the end.
const HUD_LEGEND = 'coins · horse feed · chicken feed · eggs · chickens';

export function createHud(inventory, getChickenCount) {
  // These <div>s live in index.html. If the page does not have them (a test
  // harness, say) everything below still runs and simply draws nothing.
  const itemsElement = document.getElementById('hud-items');
  const hudElement = document.getElementById('hud');
  const legendElement = document.getElementById('hud-legend');
  const goodsElement = document.getElementById('hud-goods');

  if (legendElement) legendElement.textContent = HUD_LEGEND;
  if (hudElement) hudElement.setAttribute('title', HUD_LEGEND);

  // Build the lines of text and put them on screen.
  function refresh() {
    const parts = [];
    for (const key of HUD_MAIN_KEYS) {
      parts.push(`${ITEM_ICONS[key]} ${inventory.get(key)}`);
    }
    // The chickens are not an inventory item - they are animals standing in
    // the pen - so their number is asked for separately.
    const chickens = typeof getChickenCount === 'function' ? getChickenCount() : 0;
    parts.push(`${CHICKEN_ICON} ${chickens}`);

    if (itemsElement) itemsElement.textContent = parts.join(' · ');

    // The neighbours' goods: only the ones she actually has, each with its
    // word. Nothing traded for yet means an empty line, which the CSS hides
    // altogether so the HUD stays exactly as small as it was before.
    const goods = [];
    for (const key of HUD_GOODS_KEYS) {
      const count = inventory.get(key);
      if (count > 0) goods.push(`${ITEM_ICONS[key]} ${count} ${HUD_GOODS_WORDS[key]}`);
    }

    if (goodsElement) goodsElement.textContent = goods.join(' · ');
  }

  // Whenever a number in the pocket changes, redraw. That covers feeding,
  // collecting eggs and (later) buying and selling, without any of them
  // having to remember to call us.
  inventory.onChange(refresh);

  // Draw it once straight away, so the HUD is right on the very first frame.
  refresh();

  return { refresh };
}
