// trade.js - swapping baskets with the neighbours.
//
// Phase 6 asks for "a simple trade dialog": walk up to a neighbour, press E,
// and swap something you have for something they grow. No coins change hands
// anywhere in here - a trade is goods for goods, which is much easier for an
// eight-year-old to follow than a price.
//
// This file holds TWO things:
//
//   1. TRADE_OFFERS - a plain data table of who swaps what for what. No
//      Three.js and no HTML: a test, a map screen or a future "trade by post"
//      feature could read it just as happily as the panel below.
//   2. createTradeMenu - the panel itself, built out of ordinary HTML in
//      exactly the way shop.js builds the store and the market stall. It even
//      borrows their CSS classes (.barn-menu, .barn-panel, .shop-item,
//      .shop-buy ...) so all four panels in the game look like brothers.
//
// WHY NOT JUST REUSE createShopMenu? Because every row of a shop is priced in
// coins: it prints "🪙 5" under the words and takes (or pays) that many coins
// when the button is pressed. A trade has no price at all - it is "🥚 2 → 🍿 3"
// - so a trade row needs its own middle line, and the panel needs no "You have
// 🪙 20" line at the top. The rest (the dark sheet, Esc, switching the game's
// keyboard off, the little note that answers back) is the same idea, written
// out again here in about a page.
//
// How main.js uses it:
//
//   const tradeMenu = createTradeMenu({
//     inventory, controls, interactions,
//     onTrade: () => { hud.refresh(); saveAndShow(); },
//   });
//
//   tradeMenu.open(farm);      // farm is one entry of neighbors.farms
//   tradeMenu.close();
//   tradeMenu.isOpen();
//   tradeMenu.currentFarm();   // the farm whose panel is up, or null
//   tradeMenu.update(dt);      // once a frame from the game loop
//
// ONE panel is built, not four, and open(farm) fills it in with that family's
// name, greeting and offers. That keeps a single Esc handler and a single
// "are we open?" question for the whole neighbourhood.

import { ITEM_ICONS } from './inventory.js';

// ---------------------------------------------------------------------------
// THE WORDS for each thing that can be swapped. The icon comes from
// inventory.js (one emoji per thing, shared with the HUD); all this table adds
// is how to SAY it: "1 egg" but "2 eggs", and "2 chicken feed" rather than
// "2 chicken feeds".
// ---------------------------------------------------------------------------
export const TRADE_WORDS = {
  eggs:        { one: 'egg',          many: 'eggs' },
  corn:        { one: 'corn',         many: 'corn' },
  milk:        { one: 'milk',         many: 'milk' },
  wool:        { one: 'wool',         many: 'wool' },
  apples:      { one: 'apple',        many: 'apples' },
  chickenFeed: { one: 'chicken feed', many: 'chicken feed' },
  horseFeed:   { one: 'horse feed',   many: 'horse feed' },
};

// "3 eggs", "1 milk", "2 chicken feed".
export function amountWords(key, count) {
  const words = TRADE_WORDS[key] ?? { one: key, many: key };
  return `${count} ${count === 1 ? words.one : words.many}`;
}

// "🥚 3" - the same amount with its picture instead of its name.
export function amountIcon(key, count) {
  return `${ITEM_ICONS[key] ?? '❔'} ${count}`;
}

// ---------------------------------------------------------------------------
// WHO SWAPS WHAT.
//
// One entry per neighbour farm, keyed by farm.id from neighbors.js. Each entry
// has the one friendly line they say when the panel opens and two or three
// offers, each one "give this, get that".
//
// The numbers are deliberately kind. Eggs are the thing Natalia always has (the
// coop lays them for free), so every family takes eggs, and two of them also
// sell her feed for the animals at home - which is the point of having
// neighbours at all: a basket of eggs saves a ride to the store.
//
// Nothing here is worth more in coins than what it costs. Corn and apples sell
// for 2 at the market stall and 2 eggs (worth 4) buy 3 of them; wool sells for
// 12 and costs 4 eggs (8) or 3 apples (6). So trading is a small profit for a
// walk down the lane, never a money machine you can stand and tap.
// ---------------------------------------------------------------------------
export const TRADE_OFFERS = {
  corn: {
    greeting: 'Hello Natalia! My sweetcorn is the sweetest for miles.',
    offers: [
      { give: { key: 'eggs', count: 2 }, get: { key: 'corn', count: 3 } },
      { give: { key: 'eggs', count: 2 }, get: { key: 'chickenFeed', count: 2 } },
      { give: { key: 'milk', count: 1 }, get: { key: 'corn', count: 4 } },
    ],
  },
  dairy: {
    greeting: 'Morning! The cows have been busy - fancy some fresh milk?',
    offers: [
      { give: { key: 'eggs', count: 3 }, get: { key: 'milk', count: 1 } },
      { give: { key: 'corn', count: 4 }, get: { key: 'milk', count: 1 } },
      { give: { key: 'corn', count: 2 }, get: { key: 'horseFeed', count: 1 } },
    ],
  },
  sheep: {
    greeting: 'Hello there! The sheep have plenty of wool to spare today.',
    offers: [
      { give: { key: 'eggs', count: 4 }, get: { key: 'wool', count: 1 } },
      { give: { key: 'apples', count: 3 }, get: { key: 'wool', count: 1 } },
    ],
  },
  apple: {
    greeting: 'Welcome to the orchard! Every apple was picked this morning.',
    offers: [
      { give: { key: 'eggs', count: 2 }, get: { key: 'apples', count: 3 } },
      { give: { key: 'milk', count: 1 }, get: { key: 'apples', count: 4 } },
      { give: { key: 'corn', count: 2 }, get: { key: 'apples', count: 3 } },
    ],
  },
};

// The CSS class index.html uses to show a panel. No class = hidden.
const VISIBLE_CLASS = 'visible';

// A plain <div> with a class, and optionally some text in it. (The same little
// helper menu.js and shop.js use; every panel is built the same way on purpose.)
function div(className, text) {
  const element = document.createElement('div');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// Everything this farm's offers mention, give side and get side, with no
// repeats and in the order they first come up. It is what the "You have ..."
// line at the top of the panel counts out, so she can see at a glance whether
// she has enough without reading every row.
function itemsInOffers(offers) {
  const keys = [];
  for (const offer of offers) {
    for (const side of [offer.give, offer.get]) {
      if (!keys.includes(side.key)) keys.push(side.key);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// createTradeMenu - build the one panel and hand back what the game needs:
// open, close, isOpen, currentFarm, refresh and update.
// ---------------------------------------------------------------------------
export function createTradeMenu({
  inventory,
  controls,
  interactions,
  offers = TRADE_OFFERS,
  onTrade,
} = {}) {
  // Is the panel up, and whose farm is it showing?
  let open = false;
  let farm = null;

  // The rows on screen right now: one per offer, rebuilt by open().
  let rows = [];

  // --- the panel ------------------------------------------------------------
  // root is the dark sheet over the whole screen; panel is the rounded box in
  // the middle of it. Both classes come straight from the barn menu.
  const root = div('barn-menu trade-menu');
  // A handle for tests, and a way to tell the panels apart in the page:
  //   document.querySelector('.trade-menu[data-farm="corn"] .shop-buy')
  root.dataset.farm = '';

  const panel = div('barn-panel');
  root.appendChild(panel);

  // The family's name: "The Garcia farm".
  const titleElement = document.createElement('h1');
  titleElement.className = 'barn-title';
  panel.appendChild(titleElement);

  // What the neighbour says, in their own voice.
  const greetingElement = div('shop-intro', '');
  panel.appendChild(greetingElement);

  // "You have 🥚 4 · 🍿 0 · 🥛 1" - only the things this family's offers are
  // about, so it never turns into the whole pocket.
  const pocketElement = div('trade-pocket', '');
  panel.appendChild(pocketElement);

  // The offers, one per line.
  const list = div('shop-list');
  panel.appendChild(list);

  // --- the line that answers back -------------------------------------------
  // "Swapped 2 eggs for 3 corn! (🍿 3)" after a trade, or "Not enough eggs"
  // when she taps a row she cannot do. It sits between the offers and Close, so
  // it never moves anything else around when it changes.
  const noteLine = div('shop-note', '');
  panel.appendChild(noteLine);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'barn-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => close());
  panel.appendChild(closeButton);

  document.body.appendChild(root);

  // --- can she do this swap right now? --------------------------------------
  // Returns an empty string for "yes", or a short line saying why not. The
  // same answer greys the button out AND gets said out loud if she taps it.
  function blockedReason(offer) {
    if (inventory && inventory.get(offer.give.key) < offer.give.count) {
      const words = TRADE_WORDS[offer.give.key] ?? { many: offer.give.key };
      return `Not enough ${words.many}`;
    }
    return '';
  }

  // --- say something in the panel -------------------------------------------
  function say(text, cheerful) {
    noteLine.textContent = text ?? '';
    noteLine.classList.toggle('shop-note-good', !!cheerful);
    noteLine.classList.toggle('shop-note-bad', !cheerful);
  }

  // --- somebody tapped a Trade button ---------------------------------------
  function press(offer) {
    // The button is greyed out in this case, so a click should not even reach
    // us - but say it out loud anyway, in case it was tapped some other way.
    const why = blockedReason(offer);
    if (why) {
      say(why, false);
      refresh();
      return;
    }

    // Hand the basket over first. spend() refuses - and changes nothing at all
    // - if she has run out since the panel was drawn, so a trade can never take
    // the goods without giving anything back.
    if (!inventory.spend(offer.give.key, offer.give.count)) {
      say(blockedReason(offer) || 'Not enough to swap', false);
      refresh();
      return;
    }

    inventory.add(offer.get.key, offer.get.count);

    say(
      `Swapped ${amountWords(offer.give.key, offer.give.count)}`
      + ` for ${amountWords(offer.get.key, offer.get.count)}!`
      + ` (${amountIcon(offer.get.key, inventory.get(offer.get.key))})`,
      true
    );

    refresh();

    // main.js redraws the HUD and writes the save file from here, so a basket
    // of apples survives the tab being closed a second later.
    if (typeof onTrade === 'function') onTrade(offer, farm);
  }

  // --- building one row ------------------------------------------------------
  // [🍿]  2 eggs → 3 corn        [Trade]
  //       🥚 2 → 🍿 3
  //       Not enough eggs
  //
  // The big icon on the left is what she GETS, because that is the exciting
  // part; the words say the whole swap; the line under them says the same thing
  // in pictures for a player who is not reading yet.
  function buildRow(offer, index) {
    const row = div('shop-item trade-item');
    // A handle for tests: '.shop-buy[data-offer="eggs2-corn3"]'
    const handle = `${offer.give.key}${offer.give.count}-${offer.get.key}${offer.get.count}`;
    row.dataset.offer = handle;

    row.appendChild(div('shop-item-icon', ITEM_ICONS[offer.get.key] ?? '❔'));

    const text = div('shop-item-text');
    text.appendChild(div(
      'shop-item-label',
      `${amountWords(offer.give.key, offer.give.count)}`
      + ` → ${amountWords(offer.get.key, offer.get.count)}`
    ));
    text.appendChild(div(
      'trade-swap',
      `${amountIcon(offer.give.key, offer.give.count)}`
      + ` → ${amountIcon(offer.get.key, offer.get.count)}`
    ));
    const whyLine = div('shop-item-why', '');
    text.appendChild(whyLine);
    row.appendChild(text);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-buy trade-buy';
    button.textContent = 'Trade';
    button.dataset.offer = handle;
    button.dataset.index = String(index);
    button.addEventListener('click', () => press(offer));
    row.appendChild(button);

    list.appendChild(row);
    rows.push({ offer, row, button, whyLine });
  }

  // --- keeping the panel in step with her pocket ----------------------------
  function refresh() {
    if (!farm) return;

    // "You have 🥚 4 · 🍿 0"
    const keys = itemsInOffers(rows.map((entry) => entry.offer));
    pocketElement.textContent = keys.length
      ? 'You have ' + keys.map((key) => amountIcon(key, inventory.get(key))).join(' · ')
      : '';

    for (const entry of rows) {
      const why = blockedReason(entry.offer);
      entry.button.disabled = !!why;
      entry.row.classList.toggle('shop-item-off', !!why);
      entry.whyLine.textContent = why;
    }
  }

  // --- opening and closing ---------------------------------------------------
  // open(farm) takes one entry of neighbors.farms and fills the panel in with
  // that family's name, greeting and offers. A farm with no offers in the table
  // (a fifth family added to the world but not to TRADE_OFFERS yet) simply does
  // not open, so main.js can call this for anybody.
  function openMenu(which) {
    if (open) return false;
    if (!which) return false;

    const deal = offers[which.id];
    if (!deal || !Array.isArray(deal.offers) || deal.offers.length === 0) return false;

    farm = which;
    open = true;

    root.dataset.farm = which.id;
    titleElement.textContent = which.family ?? 'A neighbour';
    greetingElement.textContent = `${which.name}: “${deal.greeting}”`;

    // Build this family's rows from scratch. There are only two or three of
    // them, so throwing the old ones away is far simpler than trying to reuse
    // rows that belong to somebody else's offers.
    rows = [];
    list.replaceChildren();
    deal.offers.forEach((offer, index) => buildRow(offer, index));

    // Fresh numbers before anybody sees them, and no stale "Not enough eggs"
    // left over from last time.
    say('', true);
    refresh();
    root.classList.add(VISIBLE_CLASS);

    // Hand the keyboard and the mouse over to the panel, exactly the way the
    // barn menu and the shop do: the camera keeps following her, she just stops
    // walking, and E and F stop working so she cannot climb onto a horse from
    // in here.
    if (controls && controls.setEnabled) controls.setEnabled(false);
    if (interactions && interactions.setEnabled) interactions.setEnabled(false);

    return true;
  }

  function close() {
    if (!open) return;
    open = false;
    farm = null;

    root.classList.remove(VISIBLE_CLASS);

    // Give the game back its keyboard and mouse.
    if (controls && controls.setEnabled) controls.setEnabled(true);
    if (interactions && interactions.setEnabled) interactions.setEnabled(true);
  }

  function isOpen() {
    return open;
  }

  // Whose panel is up right now (or null). Handy for tests and for anything
  // later that wants to know who she is talking to.
  function currentFarm() {
    return farm;
  }

  // Esc closes the panel. The "if (!open) return" is what keeps the panels out
  // of each other's way: the barn menu and the two shops each have a listener
  // that does the same check, so a press of Esc only ever reaches whichever one
  // is up.
  function onKeyDown(event) {
    if (event.repeat) return;              // holding Esc must not flap the panel
    if (event.code !== 'Escape') return;
    if (!open) return;
    close();
  }

  window.addEventListener('keydown', onKeyDown);

  // Once a frame from the game loop. There is nothing to animate - it is plain
  // HTML and the browser fades it for us - so this does nothing today. It
  // exists so the game loop never has to change if that alters.
  function update(dt) {
    // Nothing to do.
  }

  return { open: openMenu, close, isOpen, currentFarm, refresh, update };
}
