// shop.js - the buy (and, later, sell) panel.
//
// It is the same idea as the barn menu in menu.js: a dark sheet over the whole
// screen with one rounded panel of big buttons in the middle of it, built out
// of ordinary HTML. It even borrows the barn menu's CSS classes - .barn-menu,
// .barn-panel, .barn-title, .barn-close - so the two panels are obviously the
// same kind of thing to look at, and only the rows of goods are new.
//
// It knows NOTHING about horses, chickens or feed. It is handed a list of
// things, and each thing says what it costs and what to do when it is bought.
// That is what lets the market stall in the next slice reuse this same file
// for SELLING: the stall passes mode: 'sell' and its own items.
//
// How you use it, from main.js:
//
//   const shop = createShopMenu({
//     title: 'The Store',
//     name: 'store',                           // becomes data-shop on the panel
//     intro: 'Everything a ranch needs.',      // optional line under the title
//     items: [ ... see below ... ],
//     inventory,                               // from inventory.js
//     controls,                                // so the keyboard can be switched off
//     interactions,                            // so E and F stop working in here
//     onBuy: (item) => { hud.refresh(); save(); },
//   });
//
//   shop.open();      shop.close();      shop.isOpen();      shop.update(dt);
//
// AN ITEM
//
//   {
//     key:    'horseFeed',        // a handle for tests: it becomes data-item
//     label:  'Horse feed',       // the words on the row
//     icon:   '🌾',               // one emoji, shown big on the left
//     price:  5,                  // in coins
//
//     // label and price may each be a FUNCTION instead of a plain value, for a
//     // row whose words or price change while the panel is open:
//     //   label: () => `All eggs (${inventory.get('eggs')})`,
//     //   price: () => inventory.get('eggs') * 2,
//     // The price is read once, before give() runs, so selling everything in
//     // the basket still pays for everything that was in it.
//
//     // Optional. Say why this row cannot be used right now, as a short line
//     // the player can read ("The coop is full!"). true means "go ahead".
//     canBuy: () => coop.count() < MAX_CHICKENS ? true : 'The coop is full!',
//
//     // What actually happens. Hand over the goods and return the little
//     // confirmation line to show in the panel. Returning false means "it did
//     // not work after all" - nothing is charged and item.refused is shown.
//     give: () => {
//       inventory.add('horseFeed', 1);
//       return `Bought horse feed! (🌾 ${inventory.get('horseFeed')})`;
//     },
//
//     buttonLabel: 'Buy',         // optional, overrides the panel's default
//     refused: 'No room!',        // optional, shown when give() returns false
//
//     // Optional and rarely needed: do the WHOLE transaction yourself,
//     // including the coins. When this is given, the panel never touches the
//     // coin pile - handy for a swap that costs no money at all.
//     onPress: () => { ... return 'Swapped!'; },
//   }
//
// THE TWO MODES
//
//   mode: 'buy'  (the default)  the panel checks she has enough coins, then
//                               takes item.price coins off her after give()
//                               has handed the goods over.
//   mode: 'sell'                the panel does not check coins at all, and
//                               ADDS item.price coins after give() has taken
//                               the goods away. The buttons say "Sell".
//
// Everything else - opening, closing, Esc, switching the game's keyboard off -
// works exactly the same in both.

// Every picture in the game comes out of this one table, so the coins counted
// at the top of a shop are the same 🪙 the HUD shows in the corner.
import { ITEM_ICONS } from './inventory.js';

// The CSS class index.html uses to show a panel. No class = hidden.
const VISIBLE_CLASS = 'visible';

// A plain <div> with a class, and optionally some text in it. (The same little
// helper menu.js uses; the two panels are built the same way on purpose.)
function div(className, text) {
  const element = document.createElement('div');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// A whole number of coins, never negative, whatever the item said.
function coinsOf(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// An item's label or price, which is allowed to be either a plain value or a
// function that works one out fresh every time we ask. The market stall needs
// the second kind for its "All eggs (3)" row, where both the words and the
// price change as the basket fills up. A function that throws is treated as if
// it were not there at all, so one bad row cannot take the panel down.
function readValue(value, fallback) {
  if (typeof value !== 'function') return value ?? fallback;
  try {
    const answer = value();
    return answer ?? fallback;
  } catch (error) {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// createShopMenu - build one panel and hand back the four things the rest of
// the game needs: open, close, isOpen and update.
// ---------------------------------------------------------------------------
export function createShopMenu({
  title = 'Store',
  name,
  intro,
  items = [],
  inventory,
  controls,
  interactions,
  onBuy,
  mode = 'buy',
  buttonLabel,
} = {}) {
  const selling = mode === 'sell';

  // What the big button on each row says, unless the item asks for something
  // else. "Buy" in a shop, "Sell" at the market stall.
  const defaultButtonLabel = buttonLabel ?? (selling ? 'Sell' : 'Buy');

  // Is the panel up?
  let open = false;

  // --- the panel ------------------------------------------------------------
  // root is the dark sheet over the whole screen; panel is the rounded box in
  // the middle of it. Both classes come straight from the barn menu.
  const root = div('barn-menu shop-menu');
  // A handle for tests, and a way to tell the two panels apart in the page:
  //   document.querySelector('.shop-menu[data-shop="market"] .shop-buy')
  root.dataset.shop = name ?? (selling ? 'sell' : 'buy');

  const panel = div('barn-panel');
  root.appendChild(panel);

  const titleElement = document.createElement('h1');
  titleElement.className = 'barn-title';
  titleElement.textContent = title;
  panel.appendChild(titleElement);

  // "You have 🪙 20" - the first thing anybody looks at in a shop.
  const coinsLine = div('shop-coins', '');
  panel.appendChild(coinsLine);

  if (intro) panel.appendChild(div('shop-intro', intro));

  // --- one row per thing ----------------------------------------------------
  const list = div('shop-list');
  panel.appendChild(list);

  // We keep a handle on every row so refresh() can grey out the ones she
  // cannot use right now.
  const rows = [];

  for (const item of items) {
    const row = div('shop-item');
    row.dataset.item = item.key ?? '';

    row.appendChild(div('shop-item-icon', item.icon ?? ''));

    // The middle column: the name, the price, and (when something is in the
    // way) a short line saying what.
    const text = div('shop-item-text');
    // The words and the price are filled in by refresh() below, because either
    // of them may be a function whose answer changes while the panel is open.
    const labelLine = div('shop-item-label', '');
    const priceLine = div('shop-item-price', '');
    text.appendChild(labelLine);
    text.appendChild(priceLine);
    const whyLine = div('shop-item-why', '');
    text.appendChild(whyLine);
    row.appendChild(text);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-buy';
    button.textContent = item.buttonLabel ?? defaultButtonLabel;
    // A handle for tests: document.querySelector('.shop-buy[data-item="chick"]')
    button.dataset.item = item.key ?? '';
    button.addEventListener('click', () => press(item));
    row.appendChild(button);

    list.appendChild(row);
    rows.push({ item, row, button, whyLine, labelLine, priceLine });
  }

  // The words on a row ("Chicken", "All eggs (3)"), and what it is worth.
  function labelOf(item) {
    return String(readValue(item.label, item.key ?? 'Thing'));
  }

  function priceOf(item) {
    return coinsOf(readValue(item.price, 0));
  }

  // --- the line that answers back -------------------------------------------
  // "Bought horse feed! (🌾 4)" after a purchase, or "Not enough coins" when
  // she taps a row she cannot use. It sits between the goods and Close, so it
  // never moves anything else around when it changes.
  const noteLine = div('shop-note', '');
  panel.appendChild(noteLine);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'barn-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => close());
  panel.appendChild(closeButton);

  document.body.appendChild(root);

  // --- is this row usable right now? ----------------------------------------
  // Returns an empty string for "yes", or a short line saying why not. The
  // same answer greys the button out AND gets said out loud if she taps it.
  function blockedReason(item) {
    if (typeof item.canBuy === 'function') {
      let answer;
      try {
        answer = item.canBuy();
      } catch (error) {
        answer = false;   // a broken check must not take the whole panel down
      }
      if (answer !== true && answer !== undefined) {
        return typeof answer === 'string' && answer ? answer : 'Not right now';
      }
    }

    // Buying costs coins; selling earns them, so there is nothing to afford.
    if (!selling && inventory && inventory.get('coins') < priceOf(item)) {
      return 'Not enough coins';
    }

    return '';
  }

  // --- say something in the panel -------------------------------------------
  function say(text, cheerful) {
    noteLine.textContent = text ?? '';
    noteLine.classList.toggle('shop-note-good', !!cheerful);
    noteLine.classList.toggle('shop-note-bad', !cheerful);
  }

  // --- somebody tapped a Buy button ------------------------------------------
  function press(item) {
    // The button is greyed out in this case, so a click should not even reach
    // us - but say it out loud anyway, in case it was tapped some other way.
    const why = blockedReason(item);
    if (why) {
      say(why, false);
      refresh();
      return;
    }

    // Work the price out BEFORE anything changes hands. It matters for a row
    // whose price is a function: "All eggs (3)" is worth 6 coins, but the
    // moment give() has handed the eggs over there are none left and the same
    // sum would come to nothing.
    const price = priceOf(item);
    // Same for the words, so the fallback line further down still says what was
    // actually sold.
    const words = labelOf(item);

    // Hand the goods over FIRST, and only take the money once that has worked.
    // Doing it in this order means a purchase that turns out to be impossible
    // (the coop filled up a moment ago) costs nothing at all.
    const handOver = typeof item.onPress === 'function' ? item.onPress : item.give;
    const result = typeof handOver === 'function' ? handOver() : true;

    if (result === false) {
      say(item.refused ?? 'Sorry, not this time.', false);
      refresh();
      return;
    }

    // The coins. An item with its own onPress has already done whatever it
    // wanted with them, so we leave it alone.
    if (typeof item.onPress !== 'function' && inventory && price > 0) {
      if (selling) inventory.add('coins', price);
      else inventory.spend('coins', price);
    }

    // The confirmation. give() usually writes its own ("Bought horse feed!
    // (🌾 4)"); this is the fallback for one that does not bother.
    const done = selling ? 'Sold' : 'Bought';
    say(
      typeof result === 'string' && result ? result : `${done} ${words}!`,
      true
    );

    refresh();

    // main.js redraws the HUD and writes the save file from here.
    if (typeof onBuy === 'function') onBuy(item);
  }

  // --- keeping the panel in step with her pocket ----------------------------
  function refresh() {
    coinsLine.textContent = `You have ${ITEM_ICONS.coins} ${inventory ? inventory.get('coins') : 0}`;

    for (const entry of rows) {
      // The words and the price first: a row like "All eggs (3)" has to redraw
      // itself every time anything changes.
      entry.labelLine.textContent = labelOf(entry.item);
      entry.priceLine.textContent = `${ITEM_ICONS.coins} ${priceOf(entry.item)}`;

      const why = blockedReason(entry.item);
      entry.button.disabled = !!why;
      entry.row.classList.toggle('shop-item-off', !!why);
      entry.whyLine.textContent = why;
    }
  }

  // --- opening and closing ---------------------------------------------------
  function openMenu() {
    if (open) return;
    open = true;

    // Fresh numbers before anybody sees them, and no stale "Not enough coins"
    // left over from last time.
    say('', true);
    refresh();
    root.classList.add(VISIBLE_CLASS);

    // Hand the keyboard and the mouse over to the panel, exactly the way the
    // barn menu does: the camera keeps following her, she just stops walking,
    // and E and F stop working so she cannot climb onto a horse from in here.
    if (controls && controls.setEnabled) controls.setEnabled(false);
    if (interactions && interactions.setEnabled) interactions.setEnabled(false);
  }

  function close() {
    if (!open) return;
    open = false;

    root.classList.remove(VISIBLE_CLASS);

    // Give the game back its keyboard and mouse.
    if (controls && controls.setEnabled) controls.setEnabled(true);
    if (interactions && interactions.setEnabled) interactions.setEnabled(true);
  }

  function isOpen() {
    return open;
  }

  // Esc closes the panel. The "if (!open) return" is what keeps the two panels
  // out of each other's way: the barn menu has its own listener that does the
  // same check, so a press of Esc only ever reaches whichever one is up.
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

  // Start hidden, with every row already showing the right state.
  refresh();

  return { open: openMenu, close, isOpen, refresh, update };
}
