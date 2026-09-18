// menu.js - the barn menu: a panel of big buttons for choosing a horse and
// dressing it up in a new saddle and blanket.
//
// It is ordinary HTML, not 3D: a dark sheet over the whole screen with a panel
// of buttons in the middle. That is far easier to read (and to tap) than
// anything drawn inside the game, and it costs the graphics card nothing.
//
// How you use it, from main.js:
//
//   const barnMenu = createBarnMenu({
//     horses,                  // the array of horse groups from horse.js
//     controls,                // so the keyboard can be switched off
//     interactions,            // so E and F stop working while we are in here
//     breeding,                // breeding.js, for the Foals section (optional)
//     onChange: () => save(),  // runs after every colour change (optional)
//     onReset: () => start(),  // runs when "Start over" is confirmed (optional)
//   });
//
//   barnMenu.open();           // the barn door interaction calls this
//   barnMenu.close();
//   barnMenu.isOpen();         // true while the panel is up
//   barnMenu.update(dt);       // once a frame; there is nothing to do, but
//                              // the game loop calls it anyway so the menu
//                              // can grow an animation later without main.js
//                              // having to change.
//
// The colours come straight from TACK_COLORS in horse.js and the stars come
// from HORSE_KINDS, so adding a new colour or a new breed over there makes a
// new button appear in here on its own.
//
// Clicking a colour changes the horse in the world immediately (the game keeps
// drawing behind the panel, so you can see it happen through the dark sheet),
// and then calls onChange() - which is where Phase 4's saving code hooks in.
//
// PHASE 7 adds the FOALS section at the bottom of the panel: pick a mum, pick
// a dad - two different grown-up horses - and press "Have a foal!". It costs
// two sacks of horse feed, and the foal is born outside the barn door in a coat
// colour NOBODY CHOOSES. All the rules (how many horses the ranch holds, how
// much a foal costs, whether one is still growing up) live in breeding.js; this
// file only asks it "may I?" and shows the answer on the button.
//
// Because a foal can be born while the panel is open, the rows of horse buttons
// are built fresh every time the panel opens and again after every birth (see
// rebuild below) rather than once at the start.
//
// At the bottom of the panel there is also a small grey "Start over" button.
// It does not wipe anything by itself: it asks first, right there inside the
// panel, and only calls onReset() if the player taps "Yes, start over".
// main.js is the one that knows what starting over means (throw the save file
// away and reload the page), so this file never has to know about saving.

import { HORSE_KINDS, TACK_COLORS, setSaddle, setBlanket } from './horse.js';
import { BREED_COST } from './breeding.js';

// The CSS class index.html uses to show the panel. No class = hidden.
const VISIBLE_CLASS = 'visible';

// The class on whichever button is the chosen one right now.
const SELECTED_CLASS = 'selected';

// Stars in the little "Speed ★★★" hint under the horse buttons.
const MAX_STARS = 3;

// ---------------------------------------------------------------------------
// countStars - turn a stat into 1, 2 or 3 stars.
//
//   atOneStar    the value that earns a single star (the weakest horse)
//   atThreeStars the value that earns all three (the strongest)
//
// Anything in between lands on the nearest star, and anything outside the two
// ends is clamped, so a future horse with a wild number still gets 1 to 3.
// ---------------------------------------------------------------------------
function countStars(value, atOneStar, atThreeStars) {
  const span = atThreeStars - atOneStar;
  if (span === 0) return MAX_STARS;
  const howFar = (value - atOneStar) / span;          // 0 at one star, 1 at three
  const stars = Math.round(1 + howFar * (MAX_STARS - 1));
  return Math.max(1, Math.min(MAX_STARS, stars));
}

// "★★★" - the little row of stars itself.
function starText(count) {
  return '★'.repeat(count);
}

// What KIND of horse this is, in a word: 'Chestnut', 'Pony' - or, for a horse
// born on the ranch, the coat it was born with ('Palomino'). horse.js works it
// out when the horse is built and writes it down as userData.label, so a coat
// nobody has ever heard of still reads as something.
function labelOf(horse) {
  const data = horse.userData;
  if (data.label) return data.label;
  return HORSE_KINDS[data.kind] ? HORSE_KINDS[data.kind].label : 'Horse';
}

// "Speed ★★★ · Stays full ★★" for one horse.
//
// Both numbers come from the horse ITSELF rather than from the breed table,
// because a foal's stats are a mix of its mum's and its dad's and belong to no
// breed at all.
//   speed          8 units a second earns one star, 13 earns three
//   hungerSeconds  60 seconds to empty earns one star, 150 earns three
function statsTextFor(horse) {
  const data = horse.userData;
  const speed = countStars(data.speed ?? 10, 8, 13);
  const full = countStars(data.hungerSeconds ?? 100, 60, 150);
  return 'Speed ' + starText(speed) + ' · Stays full ' + starText(full);
}

// A plain <div> with a class, and optionally some text in it.
function div(className, text) {
  const element = document.createElement('div');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// ---------------------------------------------------------------------------
// createBarnMenu - build the panel once, and hand back the four things the
// rest of the game needs.
// ---------------------------------------------------------------------------
export function createBarnMenu({
  horses, controls, interactions, breeding, onChange, onReset,
} = {}) {
  const horseList = horses ?? [];

  // Which horse the colour buttons are dressing right now.
  let selectedHorse = horseList[0] ?? null;

  // Is the panel up?
  let open = false;

  // --- the panel ------------------------------------------------------------
  // root is the dark sheet over the whole screen; panel is the rounded box of
  // buttons in the middle of it.
  const root = div('barn-menu');
  root.id = 'barn-menu';

  const panel = div('barn-panel');
  root.appendChild(panel);

  const title = document.createElement('h1');
  title.className = 'barn-title';
  title.textContent = 'The Barn';
  panel.appendChild(title);

  // --- row 1: which horse ---------------------------------------------------
  // The buttons themselves are built by buildHorseButtons below, because the
  // herd can grow while the game is running: a foal born this afternoon has to
  // turn up in this row without the page being reloaded.
  const horseRow = div('barn-row');
  horseRow.appendChild(div('barn-row-label', 'Horse'));
  const horseChoices = div('barn-choices barn-choices-scroll');
  // A handle for the save code and for tests: which row of buttons is this?
  horseChoices.dataset.choices = 'horses';
  horseRow.appendChild(horseChoices);

  // Which horse each button is for: { button, horse }. refresh() walks this
  // list to tick the chosen one.
  let horseButtons = [];

  // The one-line hint under the horse buttons: "Speed ★★★ · Stays full ★★".
  const statsLine = div('barn-stats', '');
  horseRow.appendChild(statsLine);
  panel.appendChild(horseRow);

  // -------------------------------------------------------------------------
  // buildHorseButtons - fill a row with one big button per horse.
  //
  //   container  the <div class="barn-choices"> to fill
  //   list       which horses to show
  //   className  'barn-horse' for the main row, 'barn-parent' for the smaller
  //              mum and dad rows in the Foals section
  //   onPick     what to do when one is tapped
  //
  // Each button says the horse's name, with what kind it is in smaller letters
  // underneath - and " · foal" after that while it is still growing up, so the
  // reason its saddle buttons are greyed out is written right there.
  // -------------------------------------------------------------------------
  function buildHorseButtons(container, list, className, onPick) {
    container.textContent = '';               // empty it out first
    const made = [];

    for (const horse of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      // A handle for the save code and for tests: which horse is this button?
      button.dataset.horseId = horse.userData.id ?? '';

      const kindWords = horse.userData.isFoal
        ? labelOf(horse) + ' · foal'
        : labelOf(horse);

      button.appendChild(div('barn-horse-name', horse.userData.name ?? 'Horse'));
      button.appendChild(div('barn-horse-kind', kindWords));

      button.addEventListener('click', () => onPick(horse));

      container.appendChild(button);
      made.push({ button, horse });
    }

    return made;
  }

  // --- rows 2 and 3: the saddle and blanket colours -------------------------
  // Both rows are the same thing with a different "apply" function, so one
  // helper builds either of them.
  //
  //   labelText  the words above the row, e.g. 'Saddle'
  //   rowName    'saddle' or 'blanket' - also the userData field we read to
  //              work out which swatch is the chosen one
  //   apply      setSaddle or setBlanket from horse.js
  function buildColorRow(labelText, rowName, apply) {
    // "barn-row-inline" puts the word "Saddle" beside its circles rather than
    // above them, which keeps the panel short enough to read without scrolling
    // on an ordinary laptop screen.
    const row = div('barn-row barn-row-inline');
    row.appendChild(div('barn-row-label', labelText));

    const choices = div('barn-choices');
    row.appendChild(choices);

    const swatches = [];

    for (const colorKey of Object.keys(TACK_COLORS)) {
      const color = TACK_COLORS[colorKey];

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'barn-swatch';
      // Handles for the save code and for tests.
      button.dataset.row = rowName;
      button.dataset.color = colorKey;

      if (color === null) {
        // The "not wearing one" button: a grey circle that says so in words,
        // which is clearer to a young player than an empty circle.
        button.classList.add('barn-swatch-none');
        button.textContent = 'None';
        button.title = 'No ' + labelText.toLowerCase();
      } else {
        // '#' plus the colour as six hex digits, e.g. 0xc62828 -> '#c62828'.
        button.style.background = '#' + color.toString(16).padStart(6, '0');
        button.title = labelText + ': ' + colorKey;
      }

      button.addEventListener('click', () => {
        if (!selectedHorse) return;
        // Dress the horse straight away: the world is still being drawn behind
        // the panel, so the change shows up at once.
        apply(selectedHorse, colorKey);
        refresh();
        // Tell whoever is listening (Phase 4's saving code) that something
        // about this horse changed.
        if (typeof onChange === 'function') onChange(selectedHorse);
      });

      choices.appendChild(button);
      swatches.push({ button, colorKey });
    }

    panel.appendChild(row);
    return { rowName, swatches };
  }

  const saddleRow = buildColorRow('Saddle', 'saddle', setSaddle);
  const blanketRow = buildColorRow('Blanket', 'blanket', setBlanket);

  // The line that says why the colours are greyed out: a foal is too little to
  // wear a saddle. It is empty (and so invisible) the rest of the time.
  const tackWhy = div('barn-tack-why', '');
  panel.appendChild(tackWhy);

  // --- the Foals section ----------------------------------------------------
  // Pick a mum, pick a dad, press the big green button. Everything about what
  // is allowed comes from breeding.js; if nobody passed a breeding object in,
  // the whole section simply is not built.
  const foalRow = div('barn-row barn-foal');
  let mumButtons = [];
  let dadButtons = [];
  let mumChoices = null;
  let dadChoices = null;
  let foalButton = null;
  let foalWhy = null;
  let foalNote = null;

  // The two horses picked as the parents. Nothing is picked to begin with, so
  // the button starts out greyed with "Pick a mum and a dad" under it.
  let mum = null;
  let dad = null;

  // "Mum" (or "Dad") with its row of horse buttons beside it.
  function parentRow(word, choices) {
    const row = div('barn-row-inline barn-parent-row');
    row.appendChild(div('barn-foal-sub', word));
    row.appendChild(choices);
    return row;
  }

  if (breeding) {
    foalRow.appendChild(div('barn-row-label', 'Foals'));
    foalRow.appendChild(
      div('barn-foal-hint', 'Pick two horses. The foal’s colour is a surprise!')
    );

    // "Mum" and "Dad", each with its own row of horses beside it - the same
    // shape as the Saddle and Blanket rows above.
    mumChoices = div('barn-choices barn-choices-scroll');
    mumChoices.dataset.choices = 'mum';
    foalRow.appendChild(parentRow('Mum', mumChoices));

    dadChoices = div('barn-choices barn-choices-scroll');
    dadChoices.dataset.choices = 'dad';
    foalRow.appendChild(parentRow('Dad', dadChoices));

    foalButton = document.createElement('button');
    foalButton.type = 'button';
    foalButton.className = 'barn-foal-go';
    foalButton.textContent = 'Have a foal! (🌾 ' + BREED_COST + ')';
    foalButton.addEventListener('click', () => {
      const result = breeding.breed(mum, dad);
      if (result.ok) {
        // "A palomino foal was born! Her name is Clover."
        foalNote.textContent = result.message;
        foalNote.classList.remove('barn-foal-note-bad');
        // The herd just grew, so every row of horse buttons is out of date.
        rebuild();
      } else {
        // The button should already have been greyed out, but if something
        // changed while the panel was open, say why in the same place.
        foalNote.textContent = result.message;
        foalNote.classList.add('barn-foal-note-bad');
        refresh();
      }
    });
    foalRow.appendChild(foalButton);

    // Under the button: why it cannot be pressed, and then the happy news when
    // it can and has been.
    foalWhy = div('barn-foal-why', '');
    foalNote = div('barn-foal-note', '');
    foalRow.appendChild(foalWhy);
    foalRow.appendChild(foalNote);

    panel.appendChild(foalRow);
  }

  // --- the Close button -----------------------------------------------------
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'barn-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => close());
  panel.appendChild(closeButton);

  // --- "Start over", right down at the bottom -------------------------------
  // Small, grey and quiet: it is not something a player should hit by accident
  // while reaching for Close, so it is smaller than Close and a long way from
  // the colour buttons.
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'barn-reset';
  resetButton.textContent = 'Start over';
  resetButton.addEventListener('click', () => showConfirm(true));
  panel.appendChild(resetButton);

  // The "are you sure?" box. It lives inside the panel (no browser confirm()
  // pop-up, which looks nothing like the rest of the game) and is hidden until
  // "Start over" is tapped.
  const confirmBox = div('barn-confirm');
  confirmBox.appendChild(
    div('barn-confirm-text', 'Erase everything and start a new ranch?')
  );

  const confirmChoices = div('barn-confirm-choices');

  const yesButton = document.createElement('button');
  yesButton.type = 'button';
  yesButton.className = 'barn-confirm-yes';
  yesButton.textContent = 'Yes, start over';
  yesButton.addEventListener('click', () => {
    // main.js throws the save away and reloads the page.
    if (typeof onReset === 'function') onReset();
  });

  const noButton = document.createElement('button');
  noButton.type = 'button';
  noButton.className = 'barn-confirm-no';
  noButton.textContent = 'No';
  noButton.addEventListener('click', () => showConfirm(false));

  confirmChoices.appendChild(yesButton);
  confirmChoices.appendChild(noButton);
  confirmBox.appendChild(confirmChoices);
  panel.appendChild(confirmBox);

  // Show the question and hide the button that asked it, or the other way
  // round. Only ever one of the two is on screen.
  function showConfirm(show) {
    confirmBox.classList.toggle(VISIBLE_CLASS, show);
    resetButton.style.display = show ? 'none' : '';
  }

  document.body.appendChild(root);

  // --- rebuilding the rows when the herd changes ----------------------------
  // Called when the panel opens and again after a foal is born. It throws the
  // old buttons away and makes one per horse there is now, which is why a new
  // foal turns up in all three rows without anybody having to reload anything.
  function rebuild() {
    // A horse that is no longer about (nothing removes one today, but let us
    // not depend on that) must not stay picked.
    if (!horseList.includes(selectedHorse)) selectedHorse = horseList[0] ?? null;

    horseButtons = buildHorseButtons(horseChoices, horseList, 'barn-horse', (horse) => {
      selectedHorse = horse;
      refresh();
    });

    if (breeding) {
      // Only grown-up horses can be a mum or a dad, so a foal is simply not
      // offered here - there is nothing to grey out and nothing to explain.
      const grownUps = breeding.parents();

      if (!grownUps.includes(mum)) mum = null;
      if (!grownUps.includes(dad)) dad = null;

      mumButtons = buildHorseButtons(mumChoices, grownUps, 'barn-parent', (horse) => {
        mum = horse;
        // Mum and dad always have to be two different horses, so picking this
        // one as the mum takes it out of the dad slot rather than complaining.
        if (dad === horse) dad = null;
        refresh();
      });

      dadButtons = buildHorseButtons(dadChoices, grownUps, 'barn-parent', (horse) => {
        dad = horse;
        if (mum === horse) mum = null;
        refresh();
      });
    }

    refresh();
  }

  // --- keeping the buttons in step with the horses --------------------------
  // Tick the chosen horse, tick the colours it is wearing, and write the stars.
  function refresh() {
    for (const entry of horseButtons) {
      const isChosen = entry.horse === selectedHorse;
      entry.button.classList.toggle(SELECTED_CLASS, isChosen);
      // aria-pressed tells a screen reader which button is the chosen one.
      entry.button.setAttribute('aria-pressed', isChosen ? 'true' : 'false');
    }

    statsLine.textContent = selectedHorse ? statsTextFor(selectedHorse) : '';

    // A foal is too little to wear anything, so its colour buttons are greyed
    // out until it has grown up - and the line under them says why.
    const dressable = !!selectedHorse && !selectedHorse.userData.isFoal;
    tackWhy.textContent = dressable
      ? ''
      : selectedHorse
        ? selectedHorse.userData.name + ' is too little for a saddle'
        : '';

    for (const row of [saddleRow, blanketRow]) {
      // What is this horse wearing on this row? 'none' if we have no horse.
      const worn = selectedHorse ? selectedHorse.userData[row.rowName] : 'none';
      for (const swatch of row.swatches) {
        const isChosen = swatch.colorKey === worn;
        swatch.button.classList.toggle(SELECTED_CLASS, isChosen);
        swatch.button.setAttribute('aria-pressed', isChosen ? 'true' : 'false');
        swatch.button.disabled = !dressable;
      }
    }

    refreshFoals();
  }

  // The Foals section: tick the two parents, and grey the big button out with
  // a reason whenever breeding.js says no.
  function refreshFoals() {
    if (!breeding) return;

    for (const entry of mumButtons) {
      const isChosen = entry.horse === mum;
      entry.button.classList.toggle(SELECTED_CLASS, isChosen);
      entry.button.setAttribute('aria-pressed', isChosen ? 'true' : 'false');
    }

    for (const entry of dadButtons) {
      const isChosen = entry.horse === dad;
      entry.button.classList.toggle(SELECTED_CLASS, isChosen);
      entry.button.setAttribute('aria-pressed', isChosen ? 'true' : 'false');
    }

    // One question, asked in one place: "may these two have a foal?" An empty
    // answer means yes; anything else is a short line a child can read.
    const why = breeding.whyNot(mum, dad);
    foalButton.disabled = why !== '';
    foalWhy.textContent = why;
  }

  // --- opening and closing --------------------------------------------------
  function openMenu() {
    if (open) return;
    open = true;

    // Build the rows from the herd as it is RIGHT NOW - a foal may have been
    // born, or grown up, since the panel was last open - and put every button
    // in step with the horse it belongs to.
    rebuild();
    // Yesterday's happy news is not today's.
    if (foalNote) {
      foalNote.textContent = '';
      foalNote.classList.remove('barn-foal-note-bad');
    }
    // Never open on top of a half-answered "are you sure?".
    showConfirm(false);
    root.classList.add(VISIBLE_CLASS);

    // Hand the keyboard and the mouse over to the menu. The camera keeps
    // following Natalia, she just stops walking, and E and F stop working so
    // she cannot climb onto a horse from inside a menu.
    if (controls && controls.setEnabled) controls.setEnabled(false);
    if (interactions && interactions.setEnabled) interactions.setEnabled(false);
  }

  function close() {
    if (!open) return;
    open = false;

    root.classList.remove(VISIBLE_CLASS);
    // Put the "are you sure?" question away too, so it is not still sitting
    // there the next time the barn is opened.
    showConfirm(false);

    // Give the game back its keyboard and mouse.
    if (controls && controls.setEnabled) controls.setEnabled(true);
    if (interactions && interactions.setEnabled) interactions.setEnabled(true);
  }

  function isOpen() {
    return open;
  }

  // Esc closes the menu, the way Esc closes a menu everywhere else.
  function onKeyDown(event) {
    if (event.repeat) return;            // holding Esc must not flap the panel
    if (event.code !== 'Escape') return;
    if (!open) return;
    // If the "are you sure?" question is up, Esc answers "no" and leaves the
    // barn menu open, which is what Esc does everywhere else.
    if (confirmBox.classList.contains(VISIBLE_CLASS)) {
      showConfirm(false);
      return;
    }
    close();
  }

  window.addEventListener('keydown', onKeyDown);

  // Once a frame from the game loop.
  //
  // The game keeps running behind the panel, so a foal can finish growing up
  // while the barn menu is open - and the moment it does, it should stop being
  // marked "· foal" and start being allowed to be a parent. Rather than redraw
  // sixty times a second for something that changes twice an hour, we glance at
  // the herd twice a second and only rebuild when it has actually changed.
  let sinceCheck = 0;
  let lastHerdSize = 0;
  let lastGrowingId = '';

  function update(dt) {
    if (!open || !breeding) return;

    sinceCheck += dt;
    if (sinceCheck < 0.4) return;
    sinceCheck = 0;

    const foal = breeding.growingFoal();
    const growingId = foal ? foal.userData.id ?? '' : '';

    if (horseList.length !== lastHerdSize || growingId !== lastGrowingId) {
      lastHerdSize = horseList.length;
      lastGrowingId = growingId;
      rebuild();
    }
  }

  // Start hidden, with a button for every horse the ranch has right now and the
  // "are you sure?" question tucked away.
  rebuild();
  showConfirm(false);

  return { open: openMenu, close, isOpen, update, refresh: rebuild };
}
