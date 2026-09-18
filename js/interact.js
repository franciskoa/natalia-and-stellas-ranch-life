// interact.js - the little "walk up to something and press a key" system.
//
// It is deliberately generic: it knows nothing about horses. It only knows
// "here is a thing, here is how close you must stand, and here is a list of
// keys you can press on it".
//
// How you use it:
//
//   const interactions = createInteractions(natalia, promptDiv, messageDiv);
//
//   interactions.register({
//     object: horse,          // any THREE.Object3D: we use its world position
//     radius: 3.0,            // how close you must stand, in units
//     actions: [
//       { key: 'KeyE', getLabel: () => 'Ride Biscuit', onPress: () => { ... } },
//       { key: 'KeyF', getLabel: () => 'Feed Biscuit', onPress: () => { ... } },
//     ],
//   });
//
//   interactions.update(dt);  // once per frame, from the game loop
//
// A getLabel() that returns an empty string means "there is nothing to say
// about this key right now", so that line is left out of the on-screen prompt.
//
// It hands back:
//   register(target)         - add something the player can interact with
//   update(dt)               - once per frame: show/hide the prompt, handle keys
//   current()                - the target the player could interact with, or null
//   setPlayer(object)        - change what we measure distances from. While
//                              Natalia is riding, the horse becomes the player,
//                              so the horse under her is always the active
//                              target and E gets her off again.
//   setEnabled(bool)         - false while a menu is open: the prompt is
//                              hidden and E and F do nothing
//   showMessage(text, secs)  - flash a short message at the top of the screen
//   currentActions()         - Phase 8, for the on-screen buttons on a phone:
//                              a plain list of what the player could do right
//                              here, as [{ key, label, press }]. Only actions
//                              with something to say are in it - the very same
//                              test the prompt above uses - so the buttons and
//                              the words always agree.
//   press(code)              - do whatever that key would have done, as though
//                              it had just been pressed. The touch buttons call
//                              it, so a tap and a key press go down exactly the
//                              same road (queued now, acted on in update()).
//   setShowKeyNames(bool)    - false on a phone, where there is no E key to
//                              press: the prompt then reads "Ride Biscuit"
//                              rather than "E: Ride Biscuit", because the round
//                              button on the screen is what you press instead.

import * as THREE from 'three';

// How long a message stays on screen if you do not say otherwise, in seconds.
const DEFAULT_MESSAGE_SECONDS = 1.5;

// The CSS class index.html uses to fade an element in. Adding it shows the
// element, removing it hides it again.
const VISIBLE_CLASS = 'visible';

// Keys we always listen for, even before anything has been registered.
const BASE_KEYS = ['KeyE', 'KeyF'];

// Scratch vectors, made once and re-used, so we are not creating new objects
// sixty times a second.
const targetWorldPosition = new THREE.Vector3();
const playerWorldPosition = new THREE.Vector3();

// Flat distance: how far apart two spots are on the ground, ignoring height.
// A horse's head is high up, but standing "close to the horse" only means close
// on the grass, so we leave y out of the sum.
function flatDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// 'KeyE' -> 'E', 'Space' -> 'Space'. Just the friendly letter for the prompt.
function keyName(code) {
  return code.startsWith('Key') ? code.slice(3) : code;
}

// Our labels are written by us, but they go into innerHTML, so give the three
// characters that mean something to HTML their harmless spellings first.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// createInteractions - build the system for one player.
//   player         the THREE.Object3D we measure distances from (Natalia)
//   promptElement  the <div id="prompt"> that lists the keys you can press
//   messageElement the <div id="message"> used for short bits of feedback
// ---------------------------------------------------------------------------
export function createInteractions(player, promptElement, messageElement) {
  // Everything the player can walk up to.
  const targets = [];

  // The thing we measure distances from. It starts as Natalia and becomes the
  // horse while she is riding (see setPlayer below).
  let distanceFrom = player;

  // The target the player is standing next to right now (or null).
  let activeTarget = null;

  // Every key any registered action uses, so we only listen for keys we care
  // about. A Set never stores the same key twice.
  const watchedKeys = new Set(BASE_KEYS);

  // Keys pressed since the last frame. They are used up inside update(), so one
  // press of a key can only ever do one thing.
  const pressedKeys = new Set();

  // Seconds of message left to show. 0 means "no message on screen".
  let messageTimer = 0;

  // While the barn menu is open this whole system is switched off: no prompt
  // on screen, and E and F do nothing.
  let enabled = true;

  // Does the prompt print the key letters ("E: Ride Biscuit")? True on a
  // keyboard, false on a phone, where the round buttons do that job.
  let showKeyNames = true;

  // --- the interaction keys -------------------------------------------------
  // These live here and not in controls.js on purpose: walking keys are held
  // down, but E and F are one-shot presses, so the two are handled differently.
  function onKeyDown(event) {
    if (!enabled) return;      // a menu is open: E and F belong to it
    if (event.repeat) return;  // holding E must not mount and dismount forever
    if (!watchedKeys.has(event.code)) return;
    pressedKeys.add(event.code);
  }

  // If the player alt-tabs away mid-press, forget it.
  function onBlur() {
    pressedKeys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onBlur);

  // --- adding things to interact with ---------------------------------------
  function register(target) {
    const actions = (target.actions ?? []).map((action) => {
      watchedKeys.add(action.key);
      return {
        key: action.key,
        getLabel: action.getLabel ?? (() => ''),
        onPress: action.onPress ?? (() => {}),
      };
    });

    targets.push({
      object: target.object,
      radius: target.radius ?? 2.5,
      actions,
    });
  }

  // --- finding the nearest thing the player is standing next to -------------
  function findNearest() {
    let nearest = null;
    let nearestDistance = Infinity;

    distanceFrom.getWorldPosition(playerWorldPosition);

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
  // One line per usable key, e.g. "E: Ride Biscuit" then "F: Feed Biscuit".
  // The key letter is bold so a young player can spot it at a glance.
  function promptHtmlFor(target) {
    const lines = [];
    for (const action of target.actions) {
      const label = action.getLabel();
      if (!label) continue;  // nothing to say about this key right now
      // On a phone there is no key to name, so the words stand on their own.
      if (!showKeyNames) {
        lines.push(escapeHtml(label));
        continue;
      }
      lines.push('<b>' + escapeHtml(keyName(action.key)) + '</b>: ' + escapeHtml(label));
    }
    return lines.join('<br>');
  }

  function showPrompt(html) {
    if (!promptElement) return;
    promptElement.innerHTML = html;
    promptElement.classList.add(VISIBLE_CLASS);
  }

  function hidePrompt() {
    if (!promptElement) return;
    promptElement.classList.remove(VISIBLE_CLASS);
  }

  // showMessage - flash a short bit of feedback, e.g. "Giddy up!".
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

    // Switched off (a menu is open): no prompt, nothing in range, and any key
    // pressed while we were away is thrown out rather than saved up. The
    // message timer below still runs, so a message fades away as usual.
    if (!enabled) {
      pressedKeys.clear();
      activeTarget = null;
      hidePrompt();
      if (messageTimer > 0) {
        messageTimer -= step;
        if (messageTimer <= 0) hideMessage();
      }
      return;
    }

    // 1. What is the player standing next to?
    activeTarget = findNearest();

    // 2. Which keys were pressed this frame? They are used up either way, so a
    //    press made in the middle of the field is not saved up for later.
    //    This happens before the words are worked out, so that mounting a horse
    //    changes the prompt on the very same frame.
    const justPressed = [...pressedKeys];
    pressedKeys.clear();

    if (activeTarget && justPressed.length > 0) {
      // A press always reaches the action, even when its label is empty: that
      // is how "Biscuit isn't hungry right now." still gets said out loud.
      for (const action of activeTarget.actions) {
        if (justPressed.includes(action.key)) action.onPress();
      }
    }

    // 3. Show that target's key list, unless it has nothing to offer right now.
    const html = activeTarget ? promptHtmlFor(activeTarget) : '';
    if (html) showPrompt(html);
    else hidePrompt();

    // 4. Let any message on screen run down and fade away.
    if (messageTimer > 0) {
      messageTimer -= step;
      if (messageTimer <= 0) hideMessage();
    }
  }

  // Which target is in range right now: handy for testing.
  function current() {
    return activeTarget;
  }

  // ---------------------------------------------------------------------------
  // THE TOUCH HOOKS (Phase 8)
  //
  // On a phone there is no E key, so js/touch.js puts a big round button on the
  // screen instead. These three little functions are everything it needs, and
  // they are deliberately tiny: the button asks what could be done here, prints
  // those words on itself, and hands the key press straight back to us.
  // ---------------------------------------------------------------------------

  // press('KeyE') - exactly as though the player had pressed E a moment ago.
  // It goes into the SAME queue a real key press goes into, so update() acts on
  // it in the same place, in the same order, on the very next frame. Nothing in
  // the game can tell a tap from a key press, which is the whole idea.
  function press(code) {
    if (!enabled) return false;
    if (!watchedKeys.has(code)) return false;
    pressedKeys.add(code);
    return true;
  }

  // What could the player do right here? One entry per action that has
  // something to say, in the order the actions were registered - which is why
  // E always comes before F, and so the big button is always the E one.
  function currentActions() {
    if (!enabled || !activeTarget) return [];

    const list = [];
    for (const action of activeTarget.actions) {
      const label = action.getLabel();
      if (!label) continue;   // nothing to offer on this key right now
      list.push({
        key: action.key,
        label,
        press: () => press(action.key),
      });
    }
    return list;
  }

  // On a phone the prompt drops the "E:" and "F:" key names.
  function setShowKeyNames(value) {
    showKeyNames = !!value;
  }

  // Measure distances from something else from now on (the horse, while riding).
  function setPlayer(object) {
    if (object) distanceFrom = object;
  }

  // setEnabled(false) switches the prompt and the interaction keys off while a
  // menu is open, so E cannot mount a horse from behind the panel.
  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) {
      pressedKeys.clear();
      activeTarget = null;
      hidePrompt();
    }
  }

  // Start with both bits of text hidden, whatever the page was showing before.
  hidePrompt();
  hideMessage();

  return {
    register, update, current, setPlayer, setEnabled, showMessage,
    // Phase 8, for the on-screen buttons on a phone.
    currentActions, press, setShowKeyNames,
  };
}
