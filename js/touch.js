// touch.js - playing the whole game with two thumbs.
//
// Everything in here is for phones and tablets. On a laptop with a mouse not
// one pixel of it ever appears, and nothing about the keyboard changes: this
// file only ever ADDS a second way in.
//
// The two thumbs:
//
//   LEFT THUMB   a floating joystick. Put your thumb down anywhere in the
//                left-hand part of the screen and a ring appears right there,
//                under your thumb. Push it the way you want to walk. Push it
//                half way and she strolls; push it all the way and she runs.
//                The push is handed to controls.setTouchMove(), which feeds it
//                into the very same movement code W A S D uses - same speeds,
//                same "away from the camera is forward" rule, same everything.
//
//   RIGHT THUMB  drag anywhere else to look around. That needs no code at all
//                in this file: controls.js already turns a pointer drag into a
//                camera turn, and a finger IS a pointer. (What it did need was
//                a little care about WHICH finger, which is the pointerId
//                business over in controls.js.)
//
// ...and, instead of the E and F keys, one or two big round buttons in the
// bottom-right corner that appear only when there is actually something to do,
// with that thing's own words on them: "Ride Biscuit", "Pick the corn",
// "Trade with Mrs. Garcia". Tapping one does exactly what the key would have
// done - it goes through interactions.press(), the same queue a key press goes
// into - so nothing else in the game has to know whether a thumb or a keyboard
// asked.
//
// HOW WE DECIDE IT IS A TOUCH DEVICE. Three ways in, because no single one of
// them is right on its own:
//   1. ?touch=1 in the address bar. Forces the controls on anywhere, which is
//      how you try them out on a laptop.
//   2. matchMedia('(pointer: coarse)'). True on a phone or tablet from the
//      very first frame, so the thumb controls are there before anything is
//      touched.
//   3. the first real touch. A laptop with a touchscreen reports a FINE
//      pointer (it has a mouse too), so it fails test 2 - but the moment
//      somebody actually prods the screen, up the controls come.
//
// createTouchControls({ controls, interactions, isBlocked, onModeChange })
//   controls      from controls.js - we call setTouchMove() on it
//   interactions  from interact.js - we ask currentActions() and call press()
//   isBlocked()   true whenever the thumb controls should be out of the way:
//                 the title screen, the pause menu or any panel is up
//   onModeChange(on)  called once, when the touch controls first switch on, so
//                 main.js can swap the title screen's how-to pictures over
//
// It hands back:
//   update(dt)    once a frame, from the game loop
//   isActive()    are the thumb controls switched on?
//   enable()      switch them on by hand (a test does this; so does the first
//                 real touch)
//   element       the <div> everything lives in, for a test to look at

// How big the joystick is, in screen pixels. The ring is what you see; the
// distance is how far the thumb has to travel from where it landed for the push
// to count as "all the way over".
const STICK_RADIUS = 54;

// How far the thumb has to move before she takes a single step. Without this,
// resting a thumb on the glass would have her drifting slowly across the ranch.
// It is a fraction of STICK_RADIUS, so about 9 pixels.
const DEAD_ZONE = 0.17;

// The left-hand strip of the screen the joystick may appear in: 45% of the
// width, and everything below the top of the screen except a band at the very
// top (where the numbers live, and where a thumb is more likely to be reaching
// for something than to be walking).
const STICK_ZONE_WIDTH = '45%';
const STICK_ZONE_TOP = 92;

// How long the "turn your phone sideways" note stays up before it fades away on
// its own, in seconds. It is only ever shown once a visit anyway.
const ROTATE_HINT_SECONDS = 7;

// The class index.html uses to show something. No class = hidden.
const VISIBLE_CLASS = 'visible';

// A plain <div> with a class, and optionally an id. (The same little helper
// every other panel in the game is built with.)
function div(className, id) {
  const element = document.createElement('div');
  element.className = className;
  if (id) element.id = id;
  return element;
}

// Is ?touch=1 in the address bar? That is the "pretend this is a phone" switch,
// and it is the only way to see these controls on an ordinary laptop.
function touchForced() {
  try {
    return new URLSearchParams(window.location.search).get('touch') === '1';
  } catch (error) {
    // A browser that cannot be asked about its own address: no forcing, then.
    return false;
  }
}

// Does the browser say the pointer is a fat one - a finger rather than a mouse?
function coarsePointer() {
  try {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (error) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// createTouchControls - build the whole thumb layer, switched off until it is
// wanted.
// ---------------------------------------------------------------------------
export function createTouchControls({
  controls, interactions, isBlocked, onModeChange,
} = {}) {
  // Is the thumb layer switched on? Either from the first frame (a phone) or
  // from the first prod (a laptop with a touchscreen).
  let active = false;

  // ?touch=1 also lets a MOUSE work the joystick, so the whole thing can be
  // tried out - and tested - on an ordinary laptop.
  const forced = touchForced();

  // --- the layer everything lives in ---------------------------------------
  // It covers the screen but takes no taps itself (pointer-events: none in the
  // CSS); only the joystick strip and the buttons inside it do. That is what
  // lets a drag anywhere else fall straight through to the canvas underneath
  // and turn the camera.
  const root = div('touch-ui', 'touch-ui');

  // The part of the screen the joystick may appear in, on the left.
  const stickZone = div('touch-stick-zone', 'touch-stick-zone');
  stickZone.style.width = STICK_ZONE_WIDTH;
  stickZone.style.top = STICK_ZONE_TOP + 'px';
  root.appendChild(stickZone);

  // The faint ring that sits in the corner doing nothing, so a player who has
  // never held a phone before can see where to put their thumb.
  const restRing = div('touch-stick-rest', 'touch-stick-rest');
  root.appendChild(restRing);

  // The real ring: hidden until a thumb lands, and then drawn wherever that
  // thumb happens to be.
  const stick = div('touch-stick', 'touch-stick');
  const thumb = div('touch-stick-thumb');
  stick.appendChild(thumb);
  root.appendChild(stick);

  // The one or two big buttons in the bottom-right corner.
  const actionBar = div('touch-actions', 'touch-actions');
  root.appendChild(actionBar);

  // "Turn your phone sideways" - a gentle suggestion, never a wall.
  const rotateHint = div('touch-rotate', 'touch-rotate');
  const rotateWords = document.createElement('span');
  rotateWords.textContent = '↔ Turn your phone sideways for a bigger view';
  rotateHint.appendChild(rotateWords);
  const rotateClose = document.createElement('button');
  rotateClose.type = 'button';
  rotateClose.className = 'touch-rotate-close';
  rotateClose.textContent = '✕';
  rotateClose.setAttribute('aria-label', 'Hide this note');
  rotateHint.appendChild(rotateClose);
  root.appendChild(rotateHint);

  document.body.appendChild(root);

  // =========================================================================
  // THE JOYSTICK
  // =========================================================================
  // Which finger is on the joystick (its pointerId), and where it first landed.
  // null means nobody is pushing it.
  let stickPointerId = null;
  let originX = 0;
  let originY = 0;

  // Put the thumb blob back in the middle of its ring.
  function centreThumb() {
    thumb.style.transform = 'translate(-50%, -50%)';
  }

  // Let go of the joystick: she stops, the ring goes away and the faint resting
  // ring comes back. Called when the thumb lifts, when the game is paused, and
  // if the browser ever takes the gesture away from us.
  function releaseStick() {
    stickPointerId = null;
    stick.classList.remove(VISIBLE_CLASS);
    restRing.classList.add(VISIBLE_CLASS);
    centreThumb();
    if (controls && controls.setTouchMove) controls.setTouchMove(0, 0);
  }

  // Work out the push from where the thumb is now, and tell controls.js.
  function pushFrom(clientX, clientY) {
    let dx = clientX - originX;
    let dy = clientY - originY;

    // How far the thumb has travelled, as a fraction of the ring's radius.
    const distance = Math.hypot(dx, dy);
    const reach = Math.min(1, distance / STICK_RADIUS);

    // The thumb blob follows the finger, but never leaves the ring.
    if (distance > STICK_RADIUS && distance > 0) {
      dx = (dx / distance) * STICK_RADIUS;
      dy = (dy / distance) * STICK_RADIUS;
    }
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Inside the dead zone nothing happens at all.
    if (reach <= DEAD_ZONE || distance < 0.0001) {
      controls.setTouchMove(0, 0);
      return;
    }

    // Outside it, spread what is left over the whole 0-to-1 range, so the very
    // first step out of the dead zone is a gentle one rather than a jolt.
    const strength = (reach - DEAD_ZONE) / (1 - DEAD_ZONE);
    const dirX = dx / Math.hypot(dx, dy);
    const dirY = dy / Math.hypot(dx, dy);

    // On the screen, DOWN is a bigger y. In the world, pushing the joystick UP
    // means walking AWAY from the camera - so the sign is flipped on the way
    // through.
    controls.setTouchMove(dirX * strength, -dirY * strength);
  }

  // Would we listen to this pointer? A finger always; a mouse only when the
  // controls have been forced on for testing (otherwise a mouse click on the
  // left of the screen would stop being a look-drag, which would be a horrible
  // surprise on a laptop with a touchscreen).
  function isOurPointer(event) {
    if (event.pointerType === 'touch') return true;
    return forced;
  }

  stickZone.addEventListener('pointerdown', (event) => {
    if (!active) return;
    if (stickPointerId !== null) return;      // a thumb is already on it
    if (!isOurPointer(event)) return;

    stickPointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;

    // The ring appears right under the thumb, wherever that is.
    stick.style.left = originX + 'px';
    stick.style.top = originY + 'px';
    stick.classList.add(VISIBLE_CLASS);
    restRing.classList.remove(VISIBLE_CLASS);
    centreThumb();
    controls.setTouchMove(0, 0);

    // Somebody who is already walking does not need to be told how to hold
    // their phone, so the sideways note bows out at the first push.
    hideRotateHint();

    // Keep the gesture even if the thumb slides out of the strip, which it
    // will the moment anybody pushes right.
    try {
      stickZone.setPointerCapture(event.pointerId);
    } catch (error) {
      // No capture available: the joystick still works inside the strip.
    }

    event.preventDefault();
  });

  stickZone.addEventListener('pointermove', (event) => {
    if (stickPointerId === null) return;
    if (event.pointerId !== stickPointerId) return;   // somebody else's finger
    pushFrom(event.clientX, event.clientY);
    event.preventDefault();
  });

  function onStickUp(event) {
    if (stickPointerId === null) return;
    if (event.pointerId !== stickPointerId) return;
    try {
      stickZone.releasePointerCapture(event.pointerId);
    } catch (error) {
      // The browser had already let it go.
    }
    releaseStick();
  }

  stickZone.addEventListener('pointerup', onStickUp);
  stickZone.addEventListener('pointercancel', onStickUp);
  // If the tab is left mid-push, she must not walk on for ever.
  window.addEventListener('blur', () => {
    if (stickPointerId !== null) releaseStick();
  });

  // =========================================================================
  // THE ACTION BUTTONS
  // =========================================================================
  // We rebuild them only when the WORDS change, not every frame: a button being
  // thrown away and made again sixty times a second could never be tapped.
  // "signature" is just those words squashed into one string to compare.
  let signature = '';

  function buildActions(list) {
    actionBar.textContent = '';

    // The first action is the big one. interact.js hands them back in the order
    // they were registered, and E is always registered before F, so the big
    // button is the E one and the smaller one above it is F.
    list.forEach((action, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = index === 0
        ? 'touch-action touch-action-main'
        : 'touch-action touch-action-second';
      element.dataset.key = action.key;
      element.textContent = action.label;
      element.addEventListener('click', () => {
        // Straight into the same queue a key press goes into. Nothing in the
        // game can tell the difference, which is exactly what we want.
        action.press();
      });
      actionBar.appendChild(element);
    });
  }

  function refreshActions() {
    const list = (interactions && interactions.currentActions)
      ? interactions.currentActions()
      : [];

    const next = list.map((action) => action.key + '|' + action.label).join('~');
    if (next === signature) return;      // nothing has changed: leave them be
    signature = next;
    buildActions(list);
  }

  function clearActions() {
    if (signature === '') return;
    signature = '';
    actionBar.textContent = '';
  }

  // =========================================================================
  // THE "TURN YOUR PHONE SIDEWAYS" NOTE
  // =========================================================================
  // It is a suggestion and nothing more: it never covers the middle of the
  // screen, it goes away on its own, and one tap gets rid of it for good.
  let rotateShown = false;      // has it had its turn this visit?
  let rotateTimer = 0;          // seconds left on screen

  // Send it away and never show it again this visit. Two things do that: the ✕,
  // and the first push of the joystick.
  function hideRotateHint() {
    rotateShown = true;
    rotateTimer = 0;
    rotateHint.classList.remove(VISIBLE_CLASS);
  }

  rotateClose.addEventListener('click', hideRotateHint);

  function updateRotateHint(dt) {
    // Taller than it is wide = being held upright.
    const portrait = window.innerHeight > window.innerWidth;

    if (rotateTimer > 0) {
      rotateTimer -= dt;
      // Turning the phone sideways answers the question, so the note can go.
      if (rotateTimer <= 0 || !portrait) {
        rotateTimer = 0;
        rotateHint.classList.remove(VISIBLE_CLASS);
      }
      return;
    }

    if (rotateShown || !portrait) return;
    rotateShown = true;
    rotateTimer = ROTATE_HINT_SECONDS;
    rotateHint.classList.add(VISIBLE_CLASS);
  }

  // =========================================================================
  // SWITCHING THE WHOLE THING ON
  // =========================================================================
  function enable() {
    if (active) return false;
    active = true;

    // The class on the <body> is what hides the keyboard-shaped bits of the
    // game: the "Move: W A S D" note in the corner and the "E: Ride Biscuit"
    // prompt, whose job the round buttons have taken over.
    document.body.classList.add('touch-mode');
    root.classList.add('touch-on');

    // The prompt, if it is ever shown, drops the key letters: there is no E key
    // on a phone to press.
    if (interactions && interactions.setShowKeyNames) {
      interactions.setShowKeyNames(false);
    }

    restRing.classList.add(VISIBLE_CLASS);

    // main.js swaps the title screen's how-to pictures over to thumbs.
    if (typeof onModeChange === 'function') {
      try {
        onModeChange(true);
      } catch (error) {
        // A wobble in somebody else's code must not stop the controls working.
      }
    }

    stopWatchingForTouch();
    return true;
  }

  // --- waiting for the first real touch ------------------------------------
  // A laptop with a touchscreen has a mouse as well, so it reports a FINE
  // pointer and fails the media query above. These two listeners catch the
  // moment somebody actually prods the screen, and then take themselves off.
  function onFirstTouch(event) {
    if (event && event.pointerType && event.pointerType !== 'touch') return;
    enable();
  }

  function stopWatchingForTouch() {
    window.removeEventListener('pointerdown', onFirstTouch, true);
    window.removeEventListener('touchstart', onFirstTouch, true);
  }

  window.addEventListener('pointerdown', onFirstTouch, true);
  window.addEventListener('touchstart', onFirstTouch, true);

  // Nothing in the game should ever open the browser's own menu, pick out a
  // word or zoom in because a thumb rested a moment too long.
  root.addEventListener('contextmenu', (event) => event.preventDefault());

  // A phone or tablet gets the controls before it is even touched; ?touch=1
  // forces them anywhere.
  if (forced || coarsePointer()) enable();

  // =========================================================================
  // ONE FRAME
  // =========================================================================
  // main.js calls this from frame(), BEFORE the title-screen check, so the
  // thumb controls take themselves off the screen while the front page or a
  // panel is up even though the ranch itself is on hold.
  function update(dt) {
    if (!active) return;

    const blocked = typeof isBlocked === 'function' ? !!isBlocked() : false;
    if (blocked) {
      // A panel is up. Everything goes away, and she stops walking - otherwise
      // opening the barn menu mid-stride would leave her jogging on the spot.
      if (stickPointerId !== null) releaseStick();
      clearActions();
      rotateHint.classList.remove(VISIBLE_CLASS);
      rotateTimer = 0;
      root.classList.remove(VISIBLE_CLASS);
      return;
    }

    root.classList.add(VISIBLE_CLASS);
    refreshActions();
    updateRotateHint(Math.min(Number(dt) || 0, 0.1));
  }

  function isActive() {
    return active;
  }

  return { update, isActive, enable, element: root };
}
