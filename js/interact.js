// interact.js - the little "walk up to something and press E" system.
//
// It is deliberately generic: Phase 2 uses it to feed a horse, Phase 3 will use
// the very same code to climb on and ride one. The system knows nothing about
// horses - it only knows "here is a thing, here is how close you must stand,
// here is the words to show, and here is what to do when E is pressed".
//
// How you use it:
//
//   const interactions = createInteractions(natalia, promptDiv, messageDiv);
//
//   interactions.register({
//     object: horse,                    // any THREE.Object3D: we use its position
//     radius: 3.0,                      // how close the player must be, in units
//     getPrompt: () => 'Press E to feed Biscuit',
//     onInteract: () => { ... },
//   });
//
//   interactions.update(dt);            // once per frame, from the game loop
//
// It hands back:
//   register(target)         - add something the player can interact with
//   update(dt)               - once per frame: show/hide the prompt, handle E
//   current()                - the target the player could interact with, or null
//   showMessage(text, secs)  - flash a short message at the top of the screen

import * as THREE from 'three';

// How long a message stays on screen if you do not say otherwise, in seconds.
const DEFAULT_MESSAGE_SECONDS = 1.5;

// The CSS class index.html uses to fade an element in. Adding it shows the
// element, removing it hides it again.
const VISIBLE_CLASS = 'visible';

// Scratch vectors, made once and re-used, so we are not creating new objects
// sixty times a second.
const targetWorldPosition = new THREE.Vector3();
const playerWorldPosition = new THREE.Vector3();

// Flat distance: how far apart two spots are on the ground, ignoring height.
// A horse's head is high up, but walking "close to the horse" only means close
// on the grass, so we leave y out of the sum.
function flatDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ---------------------------------------------------------------------------
// createInteractions - build the system for one player.
//   player         the THREE.Object3D we measure distances from (Natalia)
//   promptElement  the <div id="prompt"> that says "Press E to ..."
//   messageElement the <div id="message"> used for short bits of feedback
// ---------------------------------------------------------------------------
export function createInteractions(player, promptElement, messageElement) {
  // Everything the player can walk up to.
  const targets = [];

  // The target the player is standing next to right now (or null).
  let activeTarget = null;

  // Set to true by the keydown listener, and used up again inside update(),
  // so one press of E can only ever do one thing.
  let ePressed = false;

  // Seconds of message left to show. 0 means "no message on screen".
  let messageTimer = 0;

  // --- the E key ------------------------------------------------------------
  // This lives here and not in controls.js on purpose: walking keys are held
  // down, but E is a one-shot press, so the two are handled quite differently.
  function onKeyDown(event) {
    if (event.code !== 'KeyE') return;
    if (event.repeat) return; // holding E down must not feed a horse 60 times
    ePressed = true;
  }

  // If the player alt-tabs away mid-press, forget it.
  function onBlur() {
    ePressed = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onBlur);

  // --- adding things to interact with ---------------------------------------
  function register(target) {
    targets.push({
      object: target.object,
      radius: target.radius ?? 2.5,
      getPrompt: target.getPrompt ?? (() => ''),
      onInteract: target.onInteract ?? (() => {}),
    });
  }

  // --- finding the nearest thing the player is standing next to -------------
  function findNearest() {
    let nearest = null;
    let nearestDistance = Infinity;

    player.getWorldPosition(playerWorldPosition);

    for (const target of targets) {
      if (!target.object) continue;
      target.object.getWorldPosition(targetWorldPosition);
      const distance = flatDistance(playerWorldPosition, targetWorldPosition);
      // Too far away to matter, or further off than something we already found.
      if (distance > target.radius) continue;
      if (distance >= nearestDistance) continue;
      nearest = target;
      nearestDistance = distance;
    }

    return nearest;
  }

  // --- showing and hiding the two bits of text ------------------------------
  function showPrompt(text) {
    if (!promptElement) return;
    promptElement.textContent = text;
    promptElement.classList.add(VISIBLE_CLASS);
  }

  function hidePrompt() {
    if (!promptElement) return;
    promptElement.classList.remove(VISIBLE_CLASS);
  }

  // showMessage - flash a short bit of feedback, e.g. "Yum! Biscuit is happy."
  // A new message always replaces whatever was on screen before.
  function showMessage(text, seconds = DEFAULT_MESSAGE_SECONDS) {
    messageTimer = seconds;
    if (!messageElement) return;
    messageElement.textContent = text;
    messageElement.classList.add(VISIBLE_CLASS);
  }

  function hideMessage() {
    messageTimer = 0;
    if (!messageElement) return;
    messageElement.classList.remove(VISIBLE_CLASS);
  }

  // --- one frame ------------------------------------------------------------
  function update(dt) {
    // A tab that has been in the background hands us a huge dt; cap it, the
    // same way the rest of the game does.
    const step = Math.min(dt, 0.1);

    // 1. Who is the player standing next to?
    activeTarget = findNearest();

    // 2. Did they press E this frame? Use the press up either way, so a press
    //    made while standing in the middle of the field is not saved up.
    //    This happens before the words are worked out, so that feeding a horse
    //    changes the prompt on the very same frame.
    const pressed = ePressed;
    ePressed = false;
    if (pressed && activeTarget) activeTarget.onInteract();

    // 3. Show that target's words, unless it has nothing to say right now.
    const prompt = activeTarget ? activeTarget.getPrompt() : '';
    if (prompt) showPrompt(prompt);
    else hidePrompt();

    // 4. Let any message on screen run down and fade away.
    if (messageTimer > 0) {
      messageTimer -= step;
      if (messageTimer <= 0) hideMessage();
    }
  }

  // Which target is in range right now: handy for testing, and for Phase 3.
  function current() {
    return activeTarget;
  }

  // Start with both bits of text hidden, whatever the page was showing before.
  hidePrompt();
  hideMessage();

  return { register, update, current, showMessage };
}
