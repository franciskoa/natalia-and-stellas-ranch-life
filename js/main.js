// main.js - starts the game: renderer, scene, lights, camera and the game loop.
//
// Phase 1: the ranch, Natalia, her sister Stella following her, and a
// third-person camera you steer with the mouse.
// Phase 2: the horse gets hungry, with a bar floating above its head, and you
// walk up and press F to feed it.
// Phase 3: press E next to a horse to climb on, gallop about, and press E again
// to hop off.
// Phase 4: three horses of different kinds, each with its own speed, size and
// appetite, and each able to wear its own saddle and blanket - press E at the
// barn door to open the barn menu and dress them up. The whole ranch is saved
// into the browser, so closing the tab and coming back finds everything where
// it was left.
// Phase 5 (this slice): a pocket with coins and two different kinds of feed,
// shown as a little row of numbers in the top-left corner, and a chicken coop
// beside the house - four chickens pottering about a fenced pen, a shared
// hunger bar over the hen house, and eggs to collect. Plus a scenic road
// leading out of the ranch gate - trees, a pond, a bridge, cows and signposts -
// to a feed store about fifty seconds' gallop away, where coins buy horse feed,
// chicken feed and a new chick. A little compass at the top of the screen
// always points at whichever of the two places she is not standing in.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { buildRoad, updateCompass } from './road.js';
import { makeNatalia, makeStella, updateFollower } from './characters.js';
import { createControls } from './controls.js';
import { createHorse, updateHorse, feedHorse, isHungry } from './horse.js';
import { createInteractions } from './interact.js';
import { createRiding } from './riding.js';
import { createBarnMenu } from './menu.js';
import { createShopMenu } from './shop.js';
import { createInventory, createHud } from './inventory.js';
import { createCoop, MAX_CHICKENS } from './chickens.js';
import { loadGame, saveGame, clearSave, collectState, applyState } from './save.js';

// Sky colour. The same value is used in index.html so the page never flashes
// white before Three.js starts drawing.
const SKY_COLOR = 0x87ceeb;

// ---------------------------------------------------------------------------
// The horses the ranch starts with: which kind each one is, what it is called
// and where it stands. They are all near the barn and the water trough (which
// is at x 11, z -1) with plenty of room between them, so nobody is standing
// inside anything.
//
// This is deliberately plain data - no Three.js objects - so that the saving
// code can use it as "what a brand new game looks like" and can write the same
// shape back out into localStorage.
//
//   id        a short name the save file uses to match a saved horse to this one
//   kind      a key of HORSE_KINDS in horse.js
//   position  where it stands; y is 0 because horses stand on the grass
//   rotationY which way it is turned, in radians (0 faces +Z)
// ---------------------------------------------------------------------------
export const STARTING_HORSES = [
  {
    id: 'h1',
    name: 'Biscuit',
    kind: 'chestnut',
    position: { x: 6, y: 0, z: 4 },
    rotationY: -0.35,
  },
  {
    id: 'h2',
    name: 'Snowy',
    kind: 'white',
    position: { x: 12, y: 0, z: 2 },
    rotationY: 0.6,
  },
  {
    id: 'h3',
    name: 'Coco',
    kind: 'pony',
    position: { x: 16, y: 0, z: 6 },
    rotationY: -1.2,
  },
];

// ---------------------------------------------------------------------------
// Renderer - the thing that actually draws pixels into a <canvas>.
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Capping the pixel ratio at 2 keeps high-DPI screens from doing 3x the work.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene - the container for everything in the 3D world.
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
// Light fog in the same colour, so distant trees fade softly into the horizon.
scene.fog = new THREE.Fog(SKY_COLOR, 50, 115);

// ---------------------------------------------------------------------------
// Camera - our eye on the world.
// ---------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  55,                                     // field of view in degrees
  window.innerWidth / window.innerHeight, // aspect ratio
  0.1,                                    // nearest visible distance
  500                                     // furthest visible distance
);
// The follow camera in controls.js places this camera every frame.

// ---------------------------------------------------------------------------
// Lights - cheap and cheerful, no shadow maps.
// ---------------------------------------------------------------------------
// Sky light: blue from above, grass green bounced from below.
const hemiLight = new THREE.HemisphereLight(0xdff0ff, 0x9a9a72, 0.55);
scene.add(hemiLight);

// Sun: one directional light coming from the front-left, high up.
const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.15);
sunLight.position.set(-25, 38, 32);
scene.add(sunLight);

// ---------------------------------------------------------------------------
// The ranch itself. "world" holds { ground, house, barn, bounds }.
// ---------------------------------------------------------------------------
const world = buildWorld(scene);

// ---------------------------------------------------------------------------
// The road out of the ranch, everything you see along it, and the feed store
// at the far end of it. road.js builds the lot and hands back the few things
// the rest of the game needs to know about: where the shop is, the rectangle
// nobody may walk through, and the spot in front of its door.
// ---------------------------------------------------------------------------
const road = buildRoad(scene);

// Where "home" is, for the compass: the patch of yard the game starts on.
const RANCH_POSITION = { x: 0, z: 8 };

// ---------------------------------------------------------------------------
// The horses. One per entry in STARTING_HORSES above; the game loop and the
// interaction code below just walk the list, so adding a fourth horse is a
// matter of adding a fourth line to that array.
// ---------------------------------------------------------------------------
const horses = STARTING_HORSES.map((spec) => {
  const h = createHorse(spec);
  scene.add(h);
  return h;
});

// ---------------------------------------------------------------------------
// The chicken coop: a hen house and a fenced pen beside the house.
//
// The pen is 8 x 6 units centred at (-12, 0, 2), so it covers x -16..-8 and
// z -1..5. The house sits at (-12, 0, -8) and takes up z -11..-5, and the dirt
// path to the barn runs along z -5.5 - so the pen tucks into the empty grass
// just SOUTH of both, with nearly three units of clear ground between the top
// fence rail and the path.
//
// Its gate is in the middle of the east wall, at (-8, 0, 2), facing the yard -
// which is the side Natalia always walks up from.
// ---------------------------------------------------------------------------
const COOP_POSITION = new THREE.Vector3(-12, 0, 2);
const coop = createCoop({ scene, position: COOP_POSITION });

// ---------------------------------------------------------------------------
// The girls. Both stand in the yard in front of the house and the barn, which
// are off towards -Z, so they start turned that way (rotation.y = PI faces -Z).
// ---------------------------------------------------------------------------
const natalia = makeNatalia();
natalia.position.set(0, 0, 8);
natalia.rotation.y = Math.PI;
scene.add(natalia);

// Stella starts exactly on her following spot - a step and a half behind
// Natalia and a step to Natalia's left - so she does not shuffle into place
// on the first frame.
const stella = makeStella();
stella.position.set(-1.4, 0, 9.8);
stella.rotation.y = Math.PI;
scene.add(stella);

// ---------------------------------------------------------------------------
// Controls: WASD / arrow keys walk Natalia, dragging the mouse looks around.
// ---------------------------------------------------------------------------
const controls = createControls(natalia, camera, renderer.domElement, world.bounds);

// Every horse is a round thing nobody can walk through. The circle is read
// from the horse's own position each frame, so once a horse has been ridden to
// a new spot the no-go area is there too, not back where it started.
// (A horse never bumps into itself while it is the one being ridden.)
// A small horse gets a small circle, so you can stand closer to the pony.
const HORSE_BLOCK_RADIUS = 1.6;
for (const h of horses) {
  controls.addObstacle(h, HORSE_BLOCK_RADIUS * h.userData.scale);
}

// The chicken pen is a rectangle nobody may walk into - not Natalia, and not a
// horse she is riding. She talks to the chickens over the gate.
controls.addBlockBox(coop.penBox);

// The store at the end of the road is solid too, so nobody rides in through
// the shop window. This goes in BEFORE the save file is loaded further down,
// because loading uses the same list to shove Natalia out of anything she
// would have been standing inside.
controls.addBlockBox(road.storeBox);

// ---------------------------------------------------------------------------
// Natalia's pocket: her coins, her two kinds of feed and her eggs. It starts
// with the new-game amounts, and a save file overwrites them further down.
//
// The HUD is the little row of numbers in the top-left corner. It redraws
// itself whenever a number changes, and main.js asks it to redraw when the
// number of CHICKENS changes, since that one is not an inventory item.
// ---------------------------------------------------------------------------
const inventory = createInventory();
const hud = createHud(inventory, () => coop.count());

// ---------------------------------------------------------------------------
// Interactions: walk up to something and press a key. The system itself lives
// in interact.js and knows nothing about horses - it just shows the words we
// give it and calls us back.
//
// Two <div>s in index.html do the talking: #prompt lists the keys near the
// bottom of the screen, #message flashes the reply at the top.
// ---------------------------------------------------------------------------
const interactions = createInteractions(
  natalia,
  document.getElementById('prompt'),
  document.getElementById('message')
);

// ---------------------------------------------------------------------------
// Riding: E climbs onto a horse and E climbs off again. riding.js does the
// actual work of sitting Natalia on the horse's back and handing the keyboard
// and camera over to it.
// ---------------------------------------------------------------------------
const riding = createRiding({ natalia, stella, controls, interactions, scene });

// ---------------------------------------------------------------------------
// SAVING AND LOADING
//
// save.js does the talking to the browser's storage; this section decides WHEN
// we talk to it. The rule is: save whenever the player has done something they
// would be sad to lose, plus a quiet autosave every few seconds for everything
// else (walking about, horses getting hungry).
//
// Nothing here can throw: save.js wraps every storage call in try/catch, so a
// browser with storage switched off just plays without a save file.
// ---------------------------------------------------------------------------

// The little "Saved" note in the top-right corner, and the timer that hides it.
const savedElement = document.getElementById('saved');
let savedHideTimer = 0;

// Blink "Saved" for a second. Only the "the player just did something" saves
// call this - the every-five-seconds autosave stays silent, because a note
// blinking away in the corner forever would be annoying rather than reassuring.
function flashSaved() {
  if (!savedElement) return;
  savedElement.classList.add('visible');
  clearTimeout(savedHideTimer);
  savedHideTimer = setTimeout(() => savedElement.classList.remove('visible'), 1000);
}

// Set to true by "Start over": from that moment on nothing may write to
// storage again, or the autosave (or the save on leaving the page, which the
// reload itself sets off) would put the old ranch straight back.
let savingStopped = false;

// Which frame we last saved on. Several things can ask for a save in the same
// frame - feeding a horse also nudges the autosave, say - and writing the same
// blob three times over would be a waste.
let frameNumber = 0;
let lastSavedFrame = -1;

// Seconds since the last autosave.
let secondsSinceSave = 0;

// save()        - write the ranch out, at most once per frame.
// save(true)    - write it out even if we already saved this frame. The page
//                 is closing, so this is our last chance and it must not be
//                 skipped.
function save(force = false) {
  if (savingStopped) return;
  if (!force && lastSavedFrame === frameNumber) return;

  lastSavedFrame = frameNumber;
  secondsSinceSave = 0;
  saveGame(collectState({ natalia, horses, inventory, coop }));
}

// The same save, with the "Saved" note: for the handful of moments the player
// actually did something (dressing a horse, feeding it, getting on or off).
function saveAndShow() {
  save();
  flashSaved();
}

// --- loading, once, before the first frame is drawn ------------------------
// A brand new game (or a blocked/corrupted save) gets null back, and we simply
// leave the world exactly as it was built above: the STARTING_HORSES layout,
// no tack, full hunger bars.
const saved = loadGame();
if (saved) {
  applyState(saved, {
    natalia, horses, controls, bounds: world.bounds, inventory, coop,
  });

  // The coop may have gained or lost chickens, and the pocket may have changed
  // - so redraw the row of numbers before the first frame.
  hud.refresh();

  // Bring Stella along: put her on her following spot behind her sister rather
  // than leaving her to jog across the whole ranch on the first frame.
  const behindX = natalia.position.x - Math.sin(natalia.rotation.y) * 1.6;
  const behindZ = natalia.position.z - Math.cos(natalia.rotation.y) * 1.6;
  const stellaSpot = controls.resolveSpot(behindX, behindZ, 0.35);
  stella.position.set(stellaSpot.x, 0, stellaSpot.z);
  stella.rotation.y = natalia.rotation.y;

  // The camera was parked behind Natalia's starting spot while the world was
  // being built. She has just moved, so put it straight behind her again
  // instead of letting it swoop across the ranch on the first few frames.
  controls.snapCamera();
}

// --- the moments we save on --------------------------------------------------
// Closing the tab, or switching to another tab on a phone (where "hidden" is
// often the last thing we hear before the browser throws the page away).
window.addEventListener('beforeunload', () => save(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save(true);
});

// Every horse is something Natalia can ride (E) and feed (F). The radius of 3
// units is comfortably outside the 1.6-unit circle controls.js keeps her out
// of, so there is a wide band where she is close enough but not stuck on it.
for (const h of horses) {
  const name = h.userData.name;

  interactions.register({
    object: h,
    radius: 3.0,
    actions: [
      {
        key: 'KeyE',
        // Sitting on this horse? Then E is how you get down again.
        getLabel: () =>
          riding.isRiding() && riding.ridingHorse() === h ? 'Get off' : `Ride ${name}`,
        onPress: () => {
          if (riding.isRiding()) {
            // Only the horse she is actually on can put her down.
            if (riding.ridingHorse() === h) {
              riding.dismount();
              interactions.showMessage('Natalia hops off.');
              // Where she got off - and where the horse ended up - is worth
              // keeping straight away.
              saveAndShow();
            }
          } else {
            riding.mount(h);
            interactions.showMessage(`Giddy up, ${name}!`);
            saveAndShow();
          }
        },
      },
      {
        key: 'KeyF',
        // An empty label means "nothing to say about F right now", so a full
        // horse simply does not show the feeding line. The number in brackets
        // is how many sacks of horse feed are left in her pocket.
        getLabel: () =>
          isHungry(h) ? `Feed ${name} (🌾 ${inventory.get('horseFeed')})` : '',
        onPress: () => {
          // Feeding from the saddle is allowed - she can lean down.
          if (!isHungry(h)) {
            interactions.showMessage(`${name} isn't hungry right now.`);
            return;
          }

          // One sack of horse feed per meal. spend() refuses - and changes
          // nothing - when the sack cupboard is empty, so the horse stays
          // hungry and she is told where to get more.
          if (!inventory.spend('horseFeed', 1)) {
            interactions.showMessage('No horse feed! Buy some at the store.');
            return;
          }

          feedHorse(h);
          interactions.showMessage(
            `Yum! ${name} is happy. (🌾 ${inventory.get('horseFeed')} left)`
          );
          // A full hunger bar and one fewer sack are both worth remembering.
          saveAndShow();
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// The barn menu: the panel of big buttons for choosing a horse and painting
// its saddle and blanket. menu.js builds it out of ordinary HTML and hangs it
// over the game.
//
// onChange runs after every colour change, so a new saddle is written to the
// browser the instant it is chosen - even if the tab is closed the moment
// after.
//
// onReset runs when the player has tapped "Start over" AND confirmed it. We
// throw the save file away and reload the page, which is the simplest possible
// "new ranch": the game builds itself from STARTING_HORSES again, with no tack
// and full hunger bars. savingStopped makes sure nothing writes the old ranch
// back out while the page is on its way down.
// ---------------------------------------------------------------------------
const barnMenu = createBarnMenu({
  horses,
  controls,
  interactions,
  onChange: () => saveAndShow(),
  onReset: () => {
    savingStopped = true;
    clearSave();
    location.reload();
  },
});

// ---------------------------------------------------------------------------
// The barn door. The barn stands at (14, 0, -10) and its door is on the front
// (+Z) face, at about z = -6, so this marker sits a step out in front of it on
// the grass.
//
// It is a bare THREE.Object3D: no shape and nothing to draw, just a spot in
// the world for the interaction system to measure distances to. The barn's own
// walls stop Natalia at z = -5.85, so a radius of 3.5 gives her a comfortable
// patch of grass in front of the door where the prompt shows up.
// ---------------------------------------------------------------------------
const barnDoor = new THREE.Object3D();
barnDoor.name = 'barnDoor';
barnDoor.position.set(14, 0, -4.5);
scene.add(barnDoor);

interactions.register({
  object: barnDoor,
  radius: 3.5,
  actions: [
    {
      key: 'KeyE',
      // She has to be on her own two feet to go into the barn - you cannot
      // ride a horse through the door.
      getLabel: () =>
        riding.isRiding() ? 'Get off your horse first' : 'Open the barn',
      onPress: () => {
        if (riding.isRiding()) return;   // the label already said why
        barnMenu.open();
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// THE STORE, at the far end of the road.
//
// shop.js builds the panel; all main.js has to say is what is for sale. Each
// line below is one row in the shop: an icon, a name, a price in coins, and a
// give() that hands the goods over and writes the little confirmation line.
//
// give() is called BEFORE the coins are taken, and returning false from it
// means "that did not work after all" - which is how buying a chick for a full
// coop costs nothing. (The Chick button greys itself out in that case anyway,
// through canBuy; the false is the belt to canBuy's braces.)
// ---------------------------------------------------------------------------
const STORE_ITEMS = [
  {
    key: 'horseFeed',
    label: 'Horse feed',
    icon: '🌾',
    price: 5,
    give: () => {
      inventory.add('horseFeed', 1);
      return `Bought horse feed! (🌾 ${inventory.get('horseFeed')})`;
    },
  },
  {
    key: 'chickenFeed',
    label: 'Chicken feed',
    icon: '🌽',
    price: 3,
    give: () => {
      inventory.add('chickenFeed', 1);
      return `Bought chicken feed! (🌽 ${inventory.get('chickenFeed')})`;
    },
  },
  {
    key: 'chick',
    label: 'Chick',
    icon: '🐔',
    price: 8,
    // A pen with twelve chickens in it is already a crowd.
    canBuy: () => (coop.count() < MAX_CHICKENS ? true : 'The coop is full!'),
    refused: 'The coop is full!',
    give: () => {
      // addChicken hands back null when there is no room, and then nothing is
      // charged (see the note above).
      if (!coop.addChicken()) return false;
      // Chickens are not an inventory item, so the HUD has to be told.
      hud.refresh();
      return `A new chick! (🐔 ${coop.count()})`;
    },
  },
];

const shopMenu = createShopMenu({
  title: 'The Feed Store',
  intro: 'Everything a ranch needs.',
  items: STORE_ITEMS,
  inventory,
  controls,
  interactions,
  // After every purchase: redraw the row of numbers and write the ranch out,
  // so a new sack of oats survives closing the tab a second later.
  onBuy: () => {
    hud.refresh();
    saveAndShow();
  },
});

// The spot in front of the shop door. road.js made it for us; it is an empty
// object with nothing to draw, exactly like the barn door marker above.
//
// A radius of 4 gives her a comfortable patch of the road end to stand on:
// the shop's own walls stop her at z = 378.15, which is 1.65 units from the
// marker, and the hitching rail is far enough away that hopping off a horse
// still leaves her inside this circle.
interactions.register({
  object: road.storeAnchor,
  radius: 4,
  actions: [
    {
      key: 'KeyE',
      // Same rule as the barn: you cannot ride a horse into a shop. While she
      // is in the saddle the horse itself is the nearest thing anyway, so what
      // she actually sees is "E: Get off" - she hops down and then presses E
      // again at the door.
      getLabel: () =>
        riding.isRiding() ? 'Get off your horse first' : 'Shop at the store',
      onPress: () => {
        if (riding.isRiding()) return;   // the label already said why
        shopMenu.open();
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// The chicken coop. The spot we measure from is the pen gate at (-8, 0, 2) -
// the middle of the east fence, facing the yard. The pen itself is a no-go
// rectangle, so Natalia always stands just outside it; a radius of 3.5 gives
// her a comfortable patch of grass by the gate where the prompt shows up.
//
//   E  collect the eggs lying in the pen
//   F  feed the chickens one handful of chicken feed
//
// Chicken feed is NOT horse feed: the corn is 🌽 and the oats are 🌾, and one
// will not do for the other.
// ---------------------------------------------------------------------------
interactions.register({
  object: coop.gate,
  radius: 3.5,
  actions: [
    {
      key: 'KeyE',
      // No eggs waiting? Then E has nothing to say, the same way a full horse
      // says nothing about F.
      getLabel: () => {
        const waiting = coop.eggsWaiting();
        return waiting > 0 ? `Collect eggs (${waiting})` : '';
      },
      onPress: () => {
        const collected = coop.collectEggs();
        if (collected <= 0) {
          interactions.showMessage('No eggs yet. Come back soon!');
          return;
        }
        inventory.add('eggs', collected);
        interactions.showMessage(
          collected === 1
            ? 'You found an egg! (🥚 1)'
            : `You found ${collected} eggs! (🥚 ${collected})`
        );
        saveAndShow();
      },
    },
    {
      key: 'KeyF',
      getLabel: () =>
        coop.isHungry() ? `Feed chickens (🌽 ${inventory.get('chickenFeed')})` : '',
      onPress: () => {
        if (!coop.isHungry()) {
          interactions.showMessage("The chickens aren't hungry right now.");
          return;
        }

        // One handful of corn fills the whole coop.
        if (!inventory.spend('chickenFeed', 1)) {
          interactions.showMessage('No chicken feed! Buy some at the store.');
          return;
        }

        coop.feed();   // full bar, and every chicken does a happy little hop
        interactions.showMessage(
          `Cluck cluck! (🌽 ${inventory.get('chickenFeed')} left)`
        );
        saveAndShow();
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Keep the picture the right shape when the window is resized.
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Game loop. update(dt) runs once per frame; dt is the seconds since the last
// frame, so movement speeds stay the same on fast and slow computers.
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

// How often the quiet background autosave runs, in seconds. Everything the
// player does on purpose saves at once anyway; this one is for the things that
// just happen, like walking about and hunger bars dropping.
const AUTOSAVE_SECONDS = 5;

function update(dt) {
  // 0. Count the frame, so save() can tell "already saved this frame" from
  //    "saved a moment ago".
  frameNumber++;
  // 1. Read the keys and the mouse: move whoever is being driven (Natalia on
  //    foot, or the horse she is riding), then place the camera.
  controls.update(dt);
  // 2. Swing Natalia's legs while she is walking. While she is in the saddle
  //    this does nothing - she is holding the sitting pose instead.
  natalia.userData.setWalking(controls.isMoving(), dt);
  // 3. Stella walks to her spot a couple of steps behind whoever she is
  //    following: her sister, or the horse her sister is on.
  //    (updateFollower runs her walk animation for us.)
  const leader = riding.isRiding() ? riding.ridingHorse() : natalia;
  updateFollower(stella, leader, dt);
  // 4. Every horse gets a little hungrier, and turns its bar to face us.
  //    Only the horse Natalia is riding swings its legs; the others stand
  //    still (and setMoving(false) eases their legs back to standing).
  const riddenHorse = riding.isRiding() ? riding.ridingHorse() : null;
  for (const h of horses) {
    updateHorse(h, dt, camera);
    h.userData.setMoving(h === riddenHorse && controls.isMoving(), dt);
  }
  // 5. The chicken coop: the flock gets hungrier, the chickens potter about
  //    the pen, and now and then one leaves an egg in the grass.
  const chickensBefore = coop.count();
  coop.update(dt, camera);
  // Chickens are not an inventory item, so the HUD only hears about them when
  // we tell it. (Nothing adds or removes chickens yet - the market stall in
  // the next slice will - but the wiring is here and ready for it.)
  if (coop.count() !== chickensBefore) hud.refresh();

  // 6. Show the "E: Ride Biscuit" prompt when she is close enough, and act on
  //    E and F. While the barn menu is open this does nothing.
  interactions.update(dt);
  // 7. The two panels get their frame too. Neither has anything to animate
  //    today, but calling them means this loop never has to change if that
  //    alters.
  barnMenu.update(dt);
  shopMenu.update(dt);
  // 8. Turn the little compass arrow at the top of the screen. While she is
  //    riding, Natalia is a child of the horse, and updateCompass reads her
  //    WORLD position, so it points the right way either way.
  updateCompass(natalia, camera, RANCH_POSITION, road.storePos);
  // 9. The quiet autosave. dt piles up until five seconds have gone by, then
  //    the ranch is written out and the count starts again (save() resets it).
  secondsSinceSave += dt;
  if (secondsSinceSave >= AUTOSAVE_SECONDS) save();
}

// While this is true the loop still DRAWS but stops updating. Only the debug
// handle below ever sets it.
let paused = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (!paused) update(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// A small handle on the game, hung off the page itself.
//
// It exists so that a test script (or a curious grown-up with the browser
// console open) can look at the ranch and step it forward by a fixed amount of
// time instead of waiting for real seconds to go by:
//
//   ranch.setPaused(true);          // stop the clock
//   ranch.update(1 / 60);           // one frame, exactly
//   ranch.inventory.get('horseFeed');
//
// The game itself never reads any of this - take the whole block out and
// nothing changes on screen.
// ---------------------------------------------------------------------------
window.ranch = {
  scene,
  camera,
  natalia,
  stella,
  horses,
  coop,
  inventory,
  hud,
  controls,
  interactions,
  riding,
  road,
  barnMenu,
  shopMenu,
  renderer,
  update,
  save,
  setPaused: (value) => { paused = !!value; },
};

animate();
