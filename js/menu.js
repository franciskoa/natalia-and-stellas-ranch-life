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
// At the bottom of the panel there is also a small grey "Start over" button.
// It does not wipe anything by itself: it asks first, right there inside the
// panel, and only calls onReset() if the player taps "Yes, start over".
// main.js is the one that knows what starting over means (throw the save file
// away and reload the page), so this file never has to know about saving.

import { HORSE_KINDS, TACK_COLORS, setSaddle, setBlanket } from './horse.js';

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

// The breed table entry for a horse, or a safe empty one if the kind is
// unknown (an old save file, say), so the menu never crashes.
function kindOf(horse) {
  const key = horse.userData.kind;
  return HORSE_KINDS[key] ?? { label: 'Horse', speed: 10, hungerSeconds: 100 };
}

// "Speed ★★★ · Stays full ★★" for one horse.
//   speed          8 units a second earns one star, 13 earns three
//   hungerSeconds  60 seconds to empty earns one star, 150 earns three
function statsTextFor(horse) {
  const breed = kindOf(horse);
  const speed = countStars(breed.speed, 8, 13);
  const full = countStars(breed.hungerSeconds, 60, 150);
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
export function createBarnMenu({ horses, controls, interactions, onChange, onReset } = {}) {
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
  const horseRow = div('barn-row');
  horseRow.appendChild(div('barn-row-label', 'Horse'));
  const horseChoices = div('barn-choices');
  horseRow.appendChild(horseChoices);

  // One button per horse: its name, with its breed in smaller letters under it.
  // We keep the buttons in a list so refresh() can tick the right one.
  const horseButtons = [];

  for (const horse of horseList) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'barn-horse';
    // A handle for the save code and for tests: which horse is this button?
    button.dataset.horseId = horse.userData.id ?? '';

    const name = div('barn-horse-name', horse.userData.name ?? 'Horse');
    const kind = div('barn-horse-kind', kindOf(horse).label);
    button.appendChild(name);
    button.appendChild(kind);

    button.addEventListener('click', () => {
      selectedHorse = horse;
      refresh();
    });

    horseChoices.appendChild(button);
    horseButtons.push({ button, horse });
  }

  // The one-line hint under the horse buttons: "Speed ★★★ · Stays full ★★".
  const statsLine = div('barn-stats', '');
  horseRow.appendChild(statsLine);
  panel.appendChild(horseRow);

  // --- rows 2 and 3: the saddle and blanket colours -------------------------
  // Both rows are the same thing with a different "apply" function, so one
  // helper builds either of them.
  //
  //   labelText  the words above the row, e.g. 'Saddle'
  //   rowName    'saddle' or 'blanket' - also the userData field we read to
  //              work out which swatch is the chosen one
  //   apply      setSaddle or setBlanket from horse.js
  function buildColorRow(labelText, rowName, apply) {
    const row = div('barn-row');
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

    for (const row of [saddleRow, blanketRow]) {
      // What is this horse wearing on this row? 'none' if we have no horse.
      const worn = selectedHorse ? selectedHorse.userData[row.rowName] : 'none';
      for (const swatch of row.swatches) {
        const isChosen = swatch.colorKey === worn;
        swatch.button.classList.toggle(SELECTED_CLASS, isChosen);
        swatch.button.setAttribute('aria-pressed', isChosen ? 'true' : 'false');
      }
    }
  }

  // --- opening and closing --------------------------------------------------
  function openMenu() {
    if (open) return;
    open = true;

    // Put the buttons in step with the horses before anybody sees them: a
    // horse may have been dressed by the save file since we last looked.
    refresh();
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

  // Once a frame from the game loop. There is nothing for the panel to animate
  // yet - it is plain HTML and the browser fades it for us - so this does
  // nothing. It exists so the game loop never has to change if that alters.
  function update(dt) {
    // Nothing to do.
  }

  // Start hidden, with every button already showing the right state and the
  // "are you sure?" question tucked away.
  refresh();
  showConfirm(false);

  return { open: openMenu, close, isOpen, update };
}
