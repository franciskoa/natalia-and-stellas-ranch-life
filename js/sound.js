// sound.js - every noise the ranch makes, invented on the spot by the browser.
//
// There is not a single sound FILE in this project, and there never will be.
// Everything you hear - the coin ding, the munching, the clip-clop of hooves -
// is a handful of notes and a puff of noise built with the Web Audio API while
// the game is running. That keeps the whole game a few small text files, which
// is exactly what Phase 8 asked for.
//
// THE FOUR RULES this file lives by:
//
//   1. NOTHING happens until the player has touched the page. Browsers refuse
//      to make a noise before that, and they are right to: a tab that starts
//      talking on its own is horrible. The big Play button on the title screen
//      is our first touch, and that is where unlock() is called.
//   2. The setting lives in its OWN corner of the browser's storage
//      (ranchLifeSound), NOT inside the saved ranch. Turning the sound off and
//      then starting a brand new ranch must not turn it back on.
//   3. When the sound is off, nothing is played at all - not quietly, not
//      muted, nothing. No oscillator is even started.
//   4. Nothing in here may ever throw. A browser with no Web Audio at all (or
//      one that says no when we ask) just plays the game in silence.
//
// It is all deliberately QUIET. A parent is in the room.
//
// How main.js uses it:
//
//   const sound = createSound();
//   sound.unlock();                 // once, from a real click or tap
//   sound.play('coin');             // a single noise
//   sound.setMovement('walk');      // '' | 'walk' | 'ride' - footsteps/hooves
//   sound.update(dt);               // once a frame, for the footsteps and birds
//   sound.isOn();  sound.setOn(false);  sound.toggle();
//   sound.onChange(fn)              // the two 🔊 buttons redraw themselves
//
// Every one of those is safe to call at any time, in any order, on any browser.

// Where the on/off setting is kept. It is ITS OWN KEY on purpose (rule 2).
export const SOUND_KEY = 'ranchLifeSound';

// How loud the whole game is, before each individual noise turns itself down
// further. 1.0 would be full blast; this is a gentle background.
const MASTER_VOLUME = 0.22;

// The noises that are not one-offs: a footstep every so often while she walks,
// a pair of hoofbeats while she rides, and a bird somewhere in the distance.
const WALK_STEP_SECONDS = 0.42;   // one footstep every 0.42s of walking
const RIDE_STEP_SECONDS = 0.44;   // one clip-CLOP every 0.44s of riding
const BIRD_MIN_SECONDS = 14;      // a bird chirps somewhere between 14 and
const BIRD_MAX_SECONDS = 34;      // 34 seconds after the last one

// ---------------------------------------------------------------------------
// Reading and writing the setting. Both are wrapped in try/catch: a browser
// with storage switched off (or a page opened straight off the disk) throws
// when you so much as look at localStorage, and the game must not care.
//
// ANYTHING other than the word 'off' means the sound is ON, so a brand new
// player - who has never touched the button - gets sound.
// ---------------------------------------------------------------------------
function readSetting() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch (error) {
    return true;
  }
}

function writeSetting(on) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch (error) {
    // Storage is blocked or full. The setting will not survive a refresh, and
    // that is the whole of the damage.
  }
}

// ---------------------------------------------------------------------------
// createSound - one set of ears for the whole game.
// ---------------------------------------------------------------------------
export function createSound() {
  // Is the sound on? Read once, from the browser's storage.
  let on = readSetting();

  // The Web Audio machinery. All three stay null until unlock() is called from
  // a real click, and they stay null forever on a browser that has no Web Audio.
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  // Set to true the moment anything goes wrong. From then on this whole file
  // is a set of functions that politely do nothing (rule 4).
  let broken = false;

  // Everybody who wants to know when the setting changes: the 🔊 button in the
  // corner, the one on the title screen and the one in the pause menu.
  const listeners = [];

  // Walking and riding noises: which one is playing, and how long until the
  // next footstep.
  let movement = '';
  let moveTimer = 0;

  // How long until the next bird. It starts part-way through so the first one
  // does not arrive the instant the game opens.
  let birdTimer = BIRD_MIN_SECONDS * 0.6;

  // --- the two building blocks ---------------------------------------------
  // Everything in the SOUNDS table below is made of these two: a NOTE (a pure
  // tone that slides from one pitch to another and fades away) and a PUFF of
  // noise (which is what a footstep, a hoof and a munch are really made of).

  // A note.
  //   freq     the pitch it starts on, in hertz (440 is the A above middle C)
  //   toFreq   the pitch it slides to, if it slides at all
  //   type     'sine' is soft and round, 'triangle' is a little brighter
  //   start    how long from now it begins, in seconds
  //   dur      how long it lasts
  //   gain     how loud, 0 to 1, on top of MASTER_VOLUME
  function note({ freq, toFreq, type = 'sine', start = 0, dur = 0.18, gain = 0.3 }) {
    const at = ctx.currentTime + start;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (toFreq && toFreq !== freq) {
      // A slide, not a jump: exponentialRampToValueAtTime is how a pitch bend
      // sounds natural to an ear.
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), at + dur);
    }

    // The shape of the sound over time: a quick fade in (so it does not click),
    // then a long fade out to nothing.
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(envelope);
    envelope.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // A puff of noise, squeezed through a filter so it sounds like a soft thud
  // (a low filter) or a little click (a high, narrow one).
  function puff({ start = 0, dur = 0.09, gain = 0.25, cutoff = 600, type = 'lowpass' }) {
    const at = ctx.currentTime + start;

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, at);
    filter.Q.setValueAtTime(type === 'bandpass' ? 1.4 : 0.7, at);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(at);
    source.stop(at + dur + 0.02);
  }

  // One hoof hitting the ground: a short bright click and a low thump together.
  function hoof(start = 0) {
    puff({ start, dur: 0.05, gain: 0.26, cutoff: 1800, type: 'bandpass' });
    note({ freq: 190, toFreq: 110, start, dur: 0.07, gain: 0.18 });
  }

  // --- the noises themselves ------------------------------------------------
  // One entry per thing that can happen on the ranch. They are all short, all
  // soft, and all made of the three helpers above.
  const SOUNDS = {
    // A found egg: two little rising blips, like a small happy surprise.
    egg: () => {
      note({ freq: 880, toFreq: 1150, dur: 0.11, gain: 0.26 });
      note({ freq: 1320, dur: 0.14, gain: 0.2, start: 0.09 });
    },

    // Feeding: two soft munches, low and round.
    munch: () => {
      puff({ dur: 0.1, gain: 0.42, cutoff: 480 });
      puff({ start: 0.15, dur: 0.11, gain: 0.34, cutoff: 400 });
    },

    // Money changing hands: the classic two-note ding.
    coin: () => {
      note({ freq: 1046, dur: 0.1, gain: 0.24, type: 'triangle' });
      note({ freq: 1568, start: 0.07, dur: 0.2, gain: 0.2, type: 'triangle' });
    },

    // A seed going into the earth: a pat of soil and a small rising note.
    plant: () => {
      puff({ dur: 0.08, gain: 0.3, cutoff: 700 });
      note({ freq: 300, toFreq: 500, start: 0.03, dur: 0.2, gain: 0.18 });
    },

    // Picking a crop: three notes up the scale, like reaching into the leaves.
    harvest: () => {
      [523, 659, 784].forEach((freq, i) => {
        note({ freq, start: i * 0.07, dur: 0.17, gain: 0.2, type: 'triangle' });
      });
    },

    // A foal is born (and again when it grows up): a little four-note fanfare.
    // It is the biggest noise in the game, and it is still very small.
    foal: () => {
      [523, 659, 784, 1046].forEach((freq, i) => {
        note({ freq, start: i * 0.1, dur: 0.3, gain: 0.22, type: 'triangle' });
      });
    },

    // Climbing into the saddle: a swing upwards and one hoof shifting.
    mount: () => {
      note({ freq: 300, toFreq: 620, dur: 0.22, gain: 0.2, type: 'triangle' });
      hoof(0.13);
    },

    // A panel opening and closing: the same soft note, one way up and one way
    // down, so the ear knows which just happened without being told.
    panelOpen: () => note({ freq: 520, toFreq: 740, dur: 0.14, gain: 0.16 }),
    panelClose: () => note({ freq: 700, toFreq: 460, dur: 0.14, gain: 0.14 }),

    // One footstep on grass, and one hoofbeat, for the walking noises below.
    step: () => puff({ dur: 0.07, gain: 0.14, cutoff: 380 }),
    hoof: () => hoof(0),

    // A bird somewhere off in the trees. Two quick chirps, barely there - it is
    // the quietest thing in the game by a long way.
    bird: () => {
      note({ freq: 2100, toFreq: 2600, dur: 0.06, gain: 0.05 });
      note({ freq: 2400, toFreq: 1900, start: 0.1, dur: 0.07, gain: 0.045 });
    },
  };

  // --- waking the sound up --------------------------------------------------
  // unlock() builds the AudioContext, and it must only ever be called from
  // inside a real click or tap (rule 1). The Play button on the title screen is
  // the one that does it; the 🔊 buttons call it too, because switching the
  // sound back on is a tap as good as any.
  //
  // It hands back true if there is a working AudioContext afterwards.
  function unlock() {
    if (broken) return false;

    try {
      if (!ctx) {
        // Looked up HERE and not at the top of the file, so a browser with no
        // Web Audio at all simply never gets this far.
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) {
          broken = true;
          return false;
        }

        ctx = new Ctor();

        master = ctx.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(ctx.destination);

        // Half a second of white noise, made once and used by every footstep,
        // hoofbeat and munch from now on.
        const frames = Math.floor(ctx.sampleRate * 0.5);
        noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      }

      // A context built before the tap (or one the browser put to sleep when
      // the tab went into the background) has to be woken up again.
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const waking = ctx.resume();
        // resume() hands back a promise on most browsers. Nobody is waiting on
        // it, so a rejection would land in the console as an unhandled one.
        if (waking && typeof waking.catch === 'function') waking.catch(() => {});
      }

      return true;
    } catch (error) {
      // No Web Audio, or the browser said no. Play on in silence.
      broken = true;
      ctx = null;
      master = null;
      return false;
    }
  }

  // --- making a noise -------------------------------------------------------
  // play('coin'). Returns true if something was actually played, which is only
  // ever useful to a test.
  //
  // Notice the two early exits: sound OFF means nothing at all is started
  // (rule 3), and no context means the player has not touched the page yet.
  function play(name) {
    if (!on) return false;
    if (broken || !ctx || !master) return false;

    const recipe = SOUNDS[name];
    if (!recipe) return false;

    try {
      recipe();
      return true;
    } catch (error) {
      // One bad noise must never take the game down with it.
      return false;
    }
  }

  // --- the noises that keep going -------------------------------------------
  // setMovement tells us what her feet are doing right now:
  //   ''      standing still
  //   'walk'  walking on her own two feet
  //   'ride'  on a horse
  // main.js calls it every frame; only a CHANGE does anything, and a change
  // starts the new rhythm straight away rather than half way through a step.
  function setMovement(kind) {
    const next = kind === 'walk' || kind === 'ride' ? kind : '';
    if (next === movement) return;
    movement = next;
    moveTimer = 0;
  }

  // Once a frame, from the game loop. It is what turns "she is walking" into an
  // actual rhythm of footsteps, and what lets a bird chirp now and then.
  function update(dt) {
    if (!on || broken || !ctx) return;

    // A tab that has been in the background hands us a huge dt; cap it, the
    // same way the rest of the game does, so we do not fire fifty footsteps in
    // one frame.
    const step = Math.min(Number(dt) || 0, 0.1);

    if (movement) {
      moveTimer -= step;
      if (moveTimer <= 0) {
        if (movement === 'ride') {
          // Clip-CLOP: two beats close together, then a gap.
          hoofSafely();
          moveTimer = RIDE_STEP_SECONDS;
        } else {
          play('step');
          moveTimer = WALK_STEP_SECONDS;
        }
      }
    }

    birdTimer -= step;
    if (birdTimer <= 0) {
      play('bird');
      birdTimer = BIRD_MIN_SECONDS
        + Math.random() * (BIRD_MAX_SECONDS - BIRD_MIN_SECONDS);
    }
  }

  // The two-beat hoof pattern, wrapped so a wobble in the audio code cannot
  // stop the game loop.
  function hoofSafely() {
    try {
      hoof(0);
      hoof(0.12);
    } catch (error) {
      // Silence for one step. Nothing else needs to know.
    }
  }

  // --- the on/off switch ----------------------------------------------------
  function isOn() {
    return on;
  }

  // setOn(true) also wakes the audio up, because it is always called from a
  // tap on one of the 🔊 buttons - which is exactly the gesture browsers want.
  function setOn(value) {
    const next = !!value;
    if (next === on) return on;

    on = next;
    writeSetting(on);

    if (on) unlock();

    // Stop the footsteps dead rather than letting the rhythm carry on silently.
    moveTimer = 0;

    for (const fn of listeners) {
      try {
        fn(on);
      } catch (error) {
        // One broken listener must not stop the others.
      }
    }

    return on;
  }

  function toggle() {
    return setOn(!on);
  }

  // Hear about every flick of the switch from now on. The 🔊 button in the
  // corner, the one on the title screen and the one in the pause menu all use
  // this, so tapping any of them redraws all three.
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  // Is there a working AudioContext right now? Only a test ever asks.
  function ready() {
    return !!ctx && !broken;
  }

  return { play, update, setMovement, isOn, setOn, toggle, onChange, unlock, ready };
}
