// title.js - the front of the game: the title screen, the Esc pause menu and
// the two little buttons in the top-right corner.
//
// None of this is 3D. It is the same kind of plain HTML the barn menu and the
// shops are built from (menu.js, shop.js, trade.js), laid over the top of the
// game, because big readable buttons are far easier for an eight-year-old to
// tap than anything drawn inside the world.
//
// There are three things in here, and main.js uses all three:
//
//   createTitleScreen(...)  the front page: the game's name, one big Play
//                           button, a sound switch and a how-to-play strip.
//                           The ranch is already being drawn behind it - it
//                           just turns very slowly and nothing in it moves
//                           until Play is pressed.
//
//   createPauseMenu(...)    what Esc opens in the middle of a game: Resume,
//                           the sound switch, How to play, Back to title. The
//                           whole ranch is on hold while it is up.
//
//   createTopButtons(...)   the small ☰ and 🔊 buttons in the top-right corner,
//                           so a player on a tablet with no Esc key can still
//                           reach the menu.
//
// WHY THE PAUSE MENU IS BUILT EARLY (this one really matters)
//
// Esc already closes the barn menu, the store, the market stall and the trade
// panel: each of those files has its own "if Escape and I am open, close me"
// listener on the window. The pause menu listens for Escape too, and one press
// must never both close a panel AND open the pause menu.
//
// The fix is simply the ORDER the listeners were added in. Browsers call
// keydown listeners in the order they were registered, so main.js builds the
// pause menu FIRST, before any of the four panels. When Escape is pressed the
// pause menu is asked first, it looks at isPanelOpen() and sees that a panel is
// up, and it does nothing at all - and a moment later that panel's own listener
// closes it. Move this later in main.js and one press of Esc starts doing two
// things at once.

// The CSS class index.html uses to show a panel. No class = hidden.
const VISIBLE_CLASS = 'visible';

// A plain <div> with a class, and optionally some text in it. (The same little
// helper every other panel in the game is built with.)
function div(className, text) {
  const element = document.createElement('div');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// A button with a class, some words and something to do when it is tapped.
function button(className, text, onClick, id) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  if (id) element.id = id;
  if (typeof onClick === 'function') element.addEventListener('click', onClick);
  return element;
}

// A little key cap, like the ones printed on a keyboard: <kbd>W</kbd>.
function keyCap(letter) {
  const element = document.createElement('kbd');
  element.className = 'howto-key';
  element.textContent = letter;
  return element;
}

// ---------------------------------------------------------------------------
// THE HOW-TO-PLAY STRIP
//
// Four little cards - walk, look, do, feed - each one a big picture, the keys
// underneath and three or four words. It is deliberately readable without
// reading: the pictures and the key caps say most of it on their own.
//
// It is built fresh each time it is asked for, because the title screen and
// the pause menu each need their own copy (one <div> cannot be in two places).
//
// THERE ARE TWO SETS OF CARDS: one about keys, for a laptop, and one about
// thumbs, for a phone. js/touch.js cannot know which it is until it has either
// asked the browser or felt the first prod of a finger - which may well be
// AFTER the front page has been drawn - so setHowToTouch() below swaps every
// strip that has been built over, wherever it is.
// ---------------------------------------------------------------------------
const HOW_TO_KEYS = [
  { picture: '🚶‍♀️', keys: ['W', 'A', 'S', 'D'], words: 'Walk about' },
  { picture: '🖱️', keys: ['drag'], words: 'Look around' },
  { picture: '🐴', keys: ['E'], words: 'Ride · open · pick' },
  { picture: '🌾', keys: ['F'], words: 'Feed the animals' },
];

// The same four things, said with thumbs. No key is named anywhere, because
// there is not one to press.
const HOW_TO_TOUCH = [
  { picture: '👆', keys: ['left thumb'], words: 'Walk about' },
  { picture: '👉', keys: ['right thumb'], words: 'Look around' },
  { picture: '🐴', keys: ['tap'], words: 'Ride · open · pick' },
  { picture: '🌾', keys: ['tap'], words: 'Feed the animals' },
];

// Which set of cards is the game showing? It starts on the keys and only ever
// changes once, the moment touch.js says this is a phone.
let howToTouch = false;

// Every strip that has been built, so they can all be swapped over at once.
// There are only ever two of them (the title screen's and the pause menu's).
const builtStrips = [];

// Fill one strip with one set of cards, throwing away whatever was in it.
function fillHowTo(strip) {
  strip.textContent = '';

  for (const item of (howToTouch ? HOW_TO_TOUCH : HOW_TO_KEYS)) {
    const card = div('howto-card');
    card.appendChild(div('howto-pic', item.picture));

    const keys = div('howto-keys');
    for (const key of item.keys) keys.appendChild(keyCap(key));
    card.appendChild(keys);

    card.appendChild(div('howto-words', item.words));
    strip.appendChild(card);
  }
}

function buildHowTo(id) {
  const strip = div('howto');
  if (id) strip.id = id;
  builtStrips.push(strip);
  fillHowTo(strip);
  return strip;
}

// The one line under the cards that they do not cover: how to reach the menu.
function menuLine() {
  return howToTouch
    ? 'Tap ☰ in the corner at any time for the menu'
    : 'Press Esc at any time for the menu';
}

// ---------------------------------------------------------------------------
// setHowToTouch(true) - this is a phone: show thumbs, not keys.
//
// js/main.js calls it the moment js/touch.js switches the thumb controls on,
// which may be before the front page has appeared (a phone) or a good while
// after it (a laptop with a touchscreen, the first time anybody prods it).
// Either way every strip already on the screen is redrawn on the spot.
// ---------------------------------------------------------------------------
export function setHowToTouch(on) {
  const next = !!on;
  if (next === howToTouch) return;
  howToTouch = next;

  for (const strip of builtStrips) fillHowTo(strip);
  // The "Press Esc" line under the title screen's cards changes with them.
  for (const line of document.querySelectorAll('.title-esc')) {
    line.textContent = menuLine();
  }
}

// The words on a sound button, wherever it is. The picture does the talking
// and the word underneath it makes sure.
function soundWords(on) {
  return on ? '🔊 Sound on' : '🔇 Sound off';
}

// ===========================================================================
// THE TITLE SCREEN
//
//   createTitleScreen({
//     sound,                        // from sound.js
//     hasSave: () => true/false,    // is there a ranch to come back to?
//     onPlay: () => { ... },        // the big button
//     onNewGame: () => { ... },     // "New game", AFTER the player said yes
//   })
//
//   title.show();   title.hide();   title.isOpen();
//
// show() asks hasSave() again every single time, so the big button says "Play"
// on a brand new ranch and "Continue" once there is something to come back to -
// including when the player has just walked out of a game through the pause
// menu's "Back to title".
// ===========================================================================
export function createTitleScreen({ sound, hasSave, onPlay, onNewGame } = {}) {
  let open = false;

  const root = div('title-screen');
  root.id = 'title-screen';

  // The bunting strung across the top of the screen. It is pure CSS - twelve
  // little triangles in a row - and it is the one thing up there that says
  // "this is a happy game" before a single word is read.
  const bunting = div('title-bunting');
  for (let i = 0; i < 12; i++) bunting.appendChild(div('title-flag'));
  root.appendChild(bunting);

  // The sun in the corner, also pure CSS.
  root.appendChild(div('title-sun'));

  const card = div('title-card');
  root.appendChild(card);

  card.appendChild(div('title-friends', '👧 🐴 🐔 🌻'));

  // The game's name, in two lines so the long first half does not shrink the
  // important half. Read straight through, the two lines say exactly what the
  // browser tab says: "Natalia and Stella's Ranch Life". (A plain apostrophe,
  // not a curly one, so the name is the same character for character wherever
  // it is written.)
  const heading = document.createElement('h1');
  heading.className = 'title-name';
  // The trailing space is deliberate. On screen the two lines sit one above the
  // other and it makes no difference at all, but it means the heading READ AS
  // ONE STRING is "Natalia and Stella's Ranch Life" - the very same words, and
  // the very same spacing, as the browser tab.
  heading.appendChild(div('title-name-small', "Natalia and Stella's "));
  heading.appendChild(div('title-name-big', 'Ranch Life'));
  card.appendChild(heading);

  // The big green button. Its words are written by refresh() below.
  const playButton = button('title-play', 'Play', () => {
    // The very first tap of the whole game, which is exactly what the browser
    // wants before it will let us make any noise at all.
    if (sound) sound.unlock();
    if (sound) sound.play('panelOpen');
    if (typeof onPlay === 'function') onPlay();
  }, 'title-play');
  card.appendChild(playButton);

  // "New game" - small and quiet under the big button, and only there at all
  // when there is a ranch that would be thrown away.
  const newButton = button('title-new', 'New game', () => showConfirm(true), 'title-new');
  card.appendChild(newButton);

  // The "are you sure?" question. It appears in place, inside the card, exactly
  // the way the barn menu's "Start over" asks - no browser pop-up, which would
  // look nothing like the rest of the game.
  const confirmBox = div('title-confirm');
  confirmBox.id = 'title-new-confirm';
  confirmBox.appendChild(div(
    'title-confirm-text',
    'Start a brand new ranch? Your horses, your coins and your garden will all be gone.'
  ));
  const confirmChoices = div('title-confirm-choices');
  confirmChoices.appendChild(button('barn-confirm-yes', 'Yes, new ranch', () => {
    if (typeof onNewGame === 'function') onNewGame();
  }, 'title-new-yes'));
  confirmChoices.appendChild(button('barn-confirm-no', 'No, keep mine', () => {
    showConfirm(false);
  }, 'title-new-no'));
  confirmBox.appendChild(confirmChoices);
  card.appendChild(confirmBox);

  // The sound switch. Tapping it is a real gesture, so sound.setOn wakes the
  // audio up for us on the way past.
  const soundButton = button('title-sound', soundWords(true), () => {
    if (!sound) return;
    sound.toggle();
    // A little ding, so turning it ON proves it worked. (Turning it off can
    // hardly answer back.)
    sound.play('coin');
  }, 'title-sound');
  card.appendChild(soundButton);

  card.appendChild(buildHowTo('title-howto'));

  // The one line that the four cards above do not cover. On a phone it talks
  // about the ☰ button instead of the Esc key (see setHowToTouch above).
  card.appendChild(div('title-esc', menuLine()));

  document.body.appendChild(root);

  function showConfirm(show) {
    confirmBox.classList.toggle(VISIBLE_CLASS, !!show);
    // While the question is up, the buttons that asked it step out of the way,
    // so there is only ever one thing to answer.
    playButton.style.display = show ? 'none' : '';
    newButton.style.display = show ? 'none' : '';
  }

  // Put every word on the screen in step with the world as it is right now.
  function refresh() {
    const saved = typeof hasSave === 'function' ? !!hasSave() : false;
    playButton.textContent = saved ? 'Continue' : 'Play';
    newButton.style.display = saved ? '' : 'none';
    if (sound) soundButton.textContent = soundWords(sound.isOn());
  }

  // The 🔊 buttons elsewhere in the game can change the setting too, so keep
  // this one honest.
  if (sound) sound.onChange(refresh);

  // "title-up" on the <body> is what takes the in-game furniture off the
  // screen - the HUD, the compass, the corner buttons and the keys hint. None
  // of it belongs on a front page, and all of it is somebody else's HTML, so a
  // class on the body is the tidiest way to say "not now" to the lot at once.
  function show() {
    open = true;
    showConfirm(false);
    refresh();
    root.classList.add(VISIBLE_CLASS);
    document.body.classList.add('title-up');
  }

  function hide() {
    open = false;
    root.classList.remove(VISIBLE_CLASS);
    document.body.classList.remove('title-up');
  }

  function isOpen() {
    return open;
  }

  return { show, hide, isOpen, refresh };
}

// ===========================================================================
// THE PAUSE MENU
//
//   createPauseMenu({
//     sound,
//     isPanelOpen: () => barnMenu.isOpen() || shopMenu.isOpen() || ...,
//     isBusy: () => titleScreen.isOpen(),   // Esc does nothing on the title
//     onOpen: () => { ... },                // stop the ranch
//     onResume: () => { ... },              // start it again
//     onBackToTitle: () => { ... },
//   })
//
//   pause.open();   pause.close();   pause.isOpen();
//
// It is built out of the barn menu's own CSS classes (.barn-menu, .barn-panel,
// .barn-title, .barn-close), so it is obviously the same kind of thing as every
// other panel in the game.
// ===========================================================================
export function createPauseMenu({
  sound, isPanelOpen, isBusy, onOpen, onResume, onBackToTitle,
} = {}) {
  let open = false;

  const root = div('barn-menu pause-menu');
  root.id = 'pause-menu';

  const panel = div('barn-panel pause-panel');
  root.appendChild(panel);

  const heading = document.createElement('h1');
  heading.className = 'barn-title';
  heading.textContent = 'Paused';
  panel.appendChild(heading);

  panel.appendChild(div('pause-sub', 'The ranch is having a little rest.'));

  const buttons = div('pause-buttons');
  panel.appendChild(buttons);

  // Resume is the big green one, because it is what nearly every press of Esc
  // is really asking for.
  buttons.appendChild(button('pause-go', '▶ Resume', () => close(), 'pause-resume'));

  const soundButton = button('pause-button', soundWords(true), () => {
    if (!sound) return;
    sound.toggle();
    sound.play('coin');
  }, 'pause-sound');
  buttons.appendChild(soundButton);

  const howToButton = button('pause-button', '❔ How to play', () => {
    const showing = howTo.classList.toggle(VISIBLE_CLASS);
    howToButton.setAttribute('aria-expanded', showing ? 'true' : 'false');
  }, 'pause-howto-button');
  howToButton.setAttribute('aria-expanded', 'false');
  buttons.appendChild(howToButton);

  // The how-to strip, tucked away until the button above is tapped.
  const howTo = buildHowTo('pause-howto');
  howTo.classList.add('pause-howto');
  panel.appendChild(howTo);

  // Back to the front page. It is last and it is quiet, because it is the one
  // button in here that takes the player out of their game.
  buttons.appendChild(button('pause-button pause-quiet', '🏠 Back to title', () => {
    if (sound) sound.play('panelClose');
    open = false;
    root.classList.remove(VISIBLE_CLASS);
    howTo.classList.remove(VISIBLE_CLASS);
    if (typeof onBackToTitle === 'function') onBackToTitle();
  }, 'pause-title'));

  document.body.appendChild(root);

  if (sound) {
    sound.onChange(() => {
      soundButton.textContent = soundWords(sound.isOn());
    });
  }

  function openMenu() {
    if (open) return false;
    open = true;

    soundButton.textContent = sound ? soundWords(sound.isOn()) : soundWords(true);
    // Never open with yesterday's how-to strip still unfolded.
    howTo.classList.remove(VISIBLE_CLASS);
    howToButton.setAttribute('aria-expanded', 'false');

    root.classList.add(VISIBLE_CLASS);
    if (sound) sound.play('panelOpen');
    // main.js stops the whole ranch here: no hunger, no growing, no walking.
    if (typeof onOpen === 'function') onOpen();
    return true;
  }

  function close() {
    if (!open) return false;
    open = false;

    root.classList.remove(VISIBLE_CLASS);
    howTo.classList.remove(VISIBLE_CLASS);
    if (sound) sound.play('panelClose');
    // main.js starts the ranch up again.
    if (typeof onResume === 'function') onResume();
    return true;
  }

  function isOpen() {
    return open;
  }

  // --- Esc ------------------------------------------------------------------
  // The whole matrix, in one place:
  //
  //   title screen up      Esc does nothing (there is nothing to pause)
  //   a panel open         Esc does nothing HERE - that panel's own listener
  //                        closes it a moment later (see the long note at the
  //                        top of this file about listener order)
  //   pause menu open      Esc resumes
  //   nothing open         Esc pauses
  function onKeyDown(event) {
    if (event.repeat) return;              // holding Esc must not flap the panel
    if (event.code !== 'Escape') return;

    if (open) {
      close();
      return;
    }

    if (typeof isBusy === 'function' && isBusy()) return;
    if (typeof isPanelOpen === 'function' && isPanelOpen()) return;

    openMenu();
  }

  window.addEventListener('keydown', onKeyDown);

  return { open: openMenu, close, isOpen };
}

// ===========================================================================
// THE TWO LITTLE BUTTONS IN THE TOP-RIGHT CORNER
//
//   createTopButtons({ sound, onMenu: () => pauseMenu.open() })
//
// A ☰ that opens the pause menu and a 🔊 that switches the sound. They are
// there for anybody playing on a tablet, where there is no Esc key to press,
// and they sit UNDER the panels (a lower z-index), so while the barn menu is
// open they are politely out of the way behind its dark sheet.
// ===========================================================================
export function createTopButtons({ sound, onMenu } = {}) {
  const row = div('top-buttons');
  row.id = 'top-buttons';

  const soundButton = button('top-button', '🔊', () => {
    if (!sound) return;
    sound.toggle();
    sound.play('coin');
  }, 'sound-button');
  soundButton.title = 'Sound on or off';
  soundButton.setAttribute('aria-label', 'Sound on or off');
  row.appendChild(soundButton);

  const menuButton = button('top-button', '☰', () => {
    if (typeof onMenu === 'function') onMenu();
  }, 'menu-button');
  menuButton.title = 'Menu (Esc)';
  menuButton.setAttribute('aria-label', 'Menu');
  row.appendChild(menuButton);

  function refresh() {
    if (!sound) return;
    const on = sound.isOn();
    soundButton.textContent = on ? '🔊' : '🔇';
    soundButton.classList.toggle('top-button-off', !on);
  }

  if (sound) sound.onChange(refresh);
  refresh();

  document.body.appendChild(row);

  return { refresh, element: row };
}
