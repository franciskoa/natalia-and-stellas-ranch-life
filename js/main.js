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
// Phase 5 (last slice): a market stall just outside the ranch gate, where a
// friendly buyer finds her chickens a happy new home for 10 coins each and
// takes her spare eggs off her hands at 2 coins apiece. The chicks the store
// sells now have to GROW UP before they can be sold or lay anything, so buying
// a chick for 8 and selling it for 10 is not a way to print money.
//
// Phase 7 (earlier slice): foals. Two grown-up horses, two sacks of horse feed
// and the big "Have a foal!" button in the barn menu, and a little foal is
// standing outside the barn door - in a coat colour nobody chose. It cannot be
// ridden until it has spent four minutes growing up, but it can be fed and it
// gets hungry like every other horse. The ranch holds eight horses in all.
//
// Phase 7 (this slice): the vegetable garden. Six plots of earth behind a low
// wooden edging in the south-west corner of the yard, with a scarecrow at one
// end and a painted sign at the other. E plants corn in a bare plot and F plants
// carrots; a minute or so later (ninety seconds for corn, sixty for carrots)
// the plant is grown and E picks three of them. There is no watering and no
// withering: a seed that goes into the ground always becomes a crop, however
// long she wanders off for. The store sells both kinds of seed, the market stall
// buys carrots, and a carrot is also a nice treat for a hungry horse.
//
// Phase 6: four neighbour farms out along the road - the Garcias' corn, the
// Millers' cows, the Nguyens' sheep and the Okafors' apples - and a trade panel
// at each farm gate. Press E next to a neighbour and swap a basket of eggs for
// sweetcorn, milk, wool or apples, or for feed for the animals at home. No
// coins change hands: a trade is goods for goods, and the market stall back at
// the ranch gate is where the new goods turn into money.
//
// Phase 5 (earlier slices): a pocket with coins and two different kinds of feed,
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
import { buildMarketStall } from './market.js';
import { buildNeighbors, PERSON_BLOCK_RADIUS, TALK_RADIUS } from './neighbors.js';
import { makeNatalia, makeStella, updateFollower } from './characters.js';
import { createControls } from './controls.js';
import { createHorse, updateHorse, feedHorse, treatHorse, isHungry } from './horse.js';
import { createInteractions } from './interact.js';
import { createRiding } from './riding.js';
import { createBarnMenu } from './menu.js';
import { createBreeding } from './breeding.js';
import { createShopMenu } from './shop.js';
import { createTradeMenu } from './trade.js';
import { createInventory, createHud, ITEM_ICONS } from './inventory.js';
import { createCoop, MAX_CHICKENS } from './chickens.js';
import { createGarden, CROPS } from './garden.js';
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

// ---------------------------------------------------------------------------
// The market stall, just outside the ranch gate on the west side of the road.
// market.js builds the stall itself and hands back its footprint (for the
// collision list) and the spot in front of the counter (for the E prompt); the
// panel of things to sell is further down, next to the store's.
// ---------------------------------------------------------------------------
const market = buildMarketStall({ scene });

// ---------------------------------------------------------------------------
// Phase 6: the four neighbour farms. neighbors.js builds a whole little
// community - the Garcias' corn, the Millers' cows, the Nguyens' sheep and the
// Okafors' apples - each with its own house, barn, scenery, lane off the main
// road and a signpost at the junction with a picture of what they farm on top.
//
// It hands back a plain "farms" list; everything main.js does with it (no-go
// boxes, the neighbours themselves, the E prompt) is driven by that list, so
// adding a fifth family never means touching this file again.
// ---------------------------------------------------------------------------
const neighbors = buildNeighbors(scene);

// Where "home" is, for the compass: the patch of yard the game starts on.
const RANCH_POSITION = { x: 0, z: 8 };

// ---------------------------------------------------------------------------
// The horses. It starts empty and is filled in further down, once the controls
// and the interaction system exist: every horse - the three the ranch starts
// with, and every foal born later - goes into the world through the one helper
// addHorseToWorld(), so a horse added in the middle of a game is set up exactly
// like one that was there from the first frame.
//
// The array itself is handed to the barn menu and the save code, so a foal born
// at half past four shows up in both without anybody being told.
// ---------------------------------------------------------------------------
const horses = [];

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
// THE VEGETABLE GARDEN (Phase 7): six plots of earth in the south-west corner
// of the yard, at (-12, 0, 9).
//
// WHY THERE. The yard is a busy place, and the garden had to stay out of the
// way of every single thing that already happens in it:
//
//   the house          x -15.5..-8.5, z -11.5..-4.5
//   the dirt path      z -7.1..-3.9, running house door -> barn door
//   the chicken pen    x -16..-8, z -1..5, with its gate at (-8, 2)
//   the barn           x 8.5..19.5, z -14.5..-5.5, its door spot at (14, -4.5)
//   the foal spots     all six of them east of x = 9 (see breeding.js)
//   the three horses   (6, 4), (12, 2) and (16, 6)
//   the gate and road  the gap in the front fence at x -4..4, z 14
//   the market stall   x -10.8..-7.2, z 17.2..22.8, outside the fence
//
// The patch of grass south of the chicken pen is the one big empty corner left,
// and it is a fourteen-second walk from the house door - so the garden sits
// there, from x -15.6..-8.4 and z 6.2..11.8, with the scarecrow a little
// further west and the sign a little further east.
//
// NOTHING ABOUT IT IS SOLID. There is no addBlockBox call here and there never
// should be: she walks straight over the edging and stands on the earth itself
// to plant. That is what makes it impossible for the garden to block anything.
// ---------------------------------------------------------------------------
const GARDEN_POSITION = new THREE.Vector3(-12, 0, 9);
const garden = createGarden({ scene, position: GARDEN_POSITION });

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

// Every horse is a round thing nobody can walk through (see addHorseToWorld
// below). The circle is read from the horse's own position each frame, so once
// a horse has been ridden to a new spot the no-go area is there too, not back
// where it started. (A horse never bumps into itself while it is the one being
// ridden.) A small horse gets a small circle, so you can stand closer to the
// pony - and closer still to a foal, until it grows.
const HORSE_BLOCK_RADIUS = 1.6;

// How much of a horse's hunger bar one carrot puts back. A sack of oats fills
// the whole thing (100), so a carrot is worth about a third of a meal: three
// carrots do the job of one sack. That keeps the ride to the store worth making
// - a sack costs 5 coins and three carrots would fetch 9 at the market stall -
// while making sure that a child who has run out of oats is never stuck with a
// hungry horse and nothing to do about it.
const CARROT_TREAT = 34;

// The chicken pen is a rectangle nobody may walk into - not Natalia, and not a
// horse she is riding. She talks to the chickens over the gate.
controls.addBlockBox(coop.penBox);

// The store at the end of the road is solid too, so nobody rides in through
// the shop window. This goes in BEFORE the save file is loaded further down,
// because loading uses the same list to shove Natalia out of anything she
// would have been standing inside.
controls.addBlockBox(road.storeBox);

// The market stall is solid too. Its footprint is x -10.8..-7.2, z 17.2..22.8,
// which leaves the road corridor (x -2.5..2.5) completely clear - so no matter
// how the stall is drawn, it can never get in the way of the ride to the store.
controls.addBlockBox(market.box);

// Every neighbour farm's house, barn and paddock is solid, and each neighbour
// is a round thing you walk around rather than through. Like the store above,
// this happens BEFORE the save file is loaded, so a saved position that is now
// inside somebody's new barn gets shoved back out onto the grass.
for (const farm of neighbors.farms) {
  for (const farmBox of farm.blockBoxes) controls.addBlockBox(farmBox);
  controls.addObstacle(farm.person, PERSON_BLOCK_RADIUS);
}

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

// ===========================================================================
// PUTTING A HORSE IN THE WORLD
//
// One helper does the whole job, and both the three starting horses and every
// foal born later go through it. That is the only way a horse that turns up in
// the middle of a game can be sure of everything a horse needs:
//
//   1. it is in the scene, so it is drawn;
//   2. it is in the "horses" array, so the game loop makes it hungry, the barn
//      menu lists it and the save file remembers it;
//   3. it is a round thing nobody can walk through;
//   4. E and F work on it.
//
// Nothing else in this file loops over the horses at startup, so there is no
// second place to remember.
// ===========================================================================

// Every horse Natalia can ride (E) and feed (F). The radius of 3 units is
// comfortably outside the 1.6-unit circle controls.js keeps her out of, so
// there is a wide band where she is close enough but not stuck on it.
function registerHorseInteractions(horse) {
  const data = horse.userData;

  interactions.register({
    object: horse,
    radius: 3.0,
    actions: [
      {
        key: 'KeyE',
        // Sitting on this horse? Then E is how you get down again. A foal is
        // far too little to carry anybody, and says so.
        getLabel: () => {
          if (riding.isRiding() && riding.ridingHorse() === horse) return 'Get off';
          if (data.isFoal) return `${data.name} is too little to ride`;
          return `Ride ${data.name}`;
        },
        onPress: () => {
          if (riding.isRiding()) {
            // Only the horse she is actually on can put her down.
            if (riding.ridingHorse() === horse) {
              riding.dismount();
              interactions.showMessage('Natalia hops off.');
              // Where she got off - and where the horse ended up - is worth
              // keeping straight away.
              saveAndShow();
            }
            return;
          }

          if (data.isFoal) {
            interactions.showMessage(
              `${data.name} is too little to ride. Give ${data.name} time to grow!`
            );
            return;
          }

          riding.mount(horse);
          interactions.showMessage(`Giddy up, ${data.name}!`);
          saveAndShow();
        },
      },
      {
        key: 'KeyF',
        // An empty label means "nothing to say about F right now", so a full
        // horse simply does not show the feeding line. The number in brackets
        // is how many sacks of horse feed are left in her pocket. A foal eats
        // exactly like a grown horse - being little is no excuse for being
        // hungry.
        //
        // OUT OF OATS? Then F offers a CARROT from the garden instead, if she
        // has one (see the note by CARROT_TREAT below). The oats always come
        // first, because a sack is a proper meal and a carrot is a nibble.
        getLabel: () => {
          if (!isHungry(horse)) return '';
          if (inventory.get('horseFeed') > 0) {
            return `Feed ${data.name} (🌾 ${inventory.get('horseFeed')})`;
          }
          if (inventory.get('carrots') > 0) {
            return `Give ${data.name} a carrot (🥕 ${inventory.get('carrots')})`;
          }
          return `Feed ${data.name} (🌾 0)`;
        },
        onPress: () => {
          // Feeding from the saddle is allowed - she can lean down.
          if (!isHungry(horse)) {
            interactions.showMessage(`${data.name} isn't hungry right now.`);
            return;
          }

          // One sack of horse feed per meal. spend() refuses - and changes
          // nothing - when the sack cupboard is empty, so we fall through to
          // the carrots below rather than feeding anything.
          if (inventory.spend('horseFeed', 1)) {
            feedHorse(horse);
            interactions.showMessage(
              `Yum! ${data.name} is happy. (🌾 ${inventory.get('horseFeed')} left)`
            );
            // A full hunger bar and one fewer sack are both worth remembering.
            saveAndShow();
            return;
          }

          // No oats, but a carrot out of her own garden will cheer him up for
          // a while - about a third of the bar's worth.
          if (inventory.spend('carrots', 1)) {
            treatHorse(horse, CARROT_TREAT);
            interactions.showMessage(
              `Crunch! ${data.name} loves carrots. (🥕 ${inventory.get('carrots')} left)`
            );
            saveAndShow();
            return;
          }

          interactions.showMessage(
            'No horse feed! Buy some at the store, or grow carrots.'
          );
        },
      },
    ],
  });
}

// A growing foal gets wider every frame, so the circle nobody may walk through
// has to keep up. controls.addObstacle handed us the entry it stores; writing a
// new radius into it is all it takes.
function updateHorseCircle(horse) {
  const entry = horse.userData.obstacle;
  if (entry) entry.radius = HORSE_BLOCK_RADIUS * horse.userData.scale;
}

function addHorseToWorld(horse) {
  scene.add(horse);
  horses.push(horse);
  horse.userData.obstacle = controls.addObstacle(
    horse, HORSE_BLOCK_RADIUS * horse.userData.scale
  );
  registerHorseInteractions(horse);
  return horse;
}

// The three horses the ranch starts with.
for (const spec of STARTING_HORSES) addHorseToWorld(createHorse(spec));

// ===========================================================================
// FOALS (Phase 7)
//
// breeding.js owns the whole idea: which coats a foal can be born with, what it
// costs, how long it takes to grow up and what it is called. All it asks of
// this file is somewhere to put the new horse (addHorseToWorld, just above), a
// way to find a free patch of grass, and somewhere to say the happy news.
//
// The barn menu further down is what the player actually presses.
// ===========================================================================
const breeding = createBreeding({
  horses,
  inventory,
  addHorse: addHorseToWorld,
  isSpotFree: (x, z, radius) => controls.isSpotFree(x, z, radius),
  onResize: updateHorseCircle,
  announce: (text) => interactions.showMessage(text, 3),
  onChange: () => save(),
});

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
  saveGame(collectState({ natalia, horses, inventory, coop, garden }));
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
    natalia, horses, controls, bounds: world.bounds, inventory, coop, garden,
    // A horse in the save file that this ranch has never heard of is a foal
    // born in an earlier visit, so applyState asks breeding.js to build it and
    // then puts it back where it was standing, half grown up and all.
    addHorse: (entry) => breeding.fromSave(entry),
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

// ---------------------------------------------------------------------------
// The barn menu: the panel of big buttons for choosing a horse and painting
// its saddle and blanket. menu.js builds it out of ordinary HTML and hangs it
// over the game.
//
// onChange runs after every colour change, so a new saddle is written to the
// browser the instant it is chosen - even if the tab is closed the moment
// after.
//
// The panel also holds the Foals section, where two grown-up horses and two
// sacks of feed become a foal. It asks breeding.js what it may and may not do,
// so the rules live in one place rather than in the buttons.
//
// onReset runs when the player has tapped "Start over" AND confirmed it - see
// startOver just below.
// ---------------------------------------------------------------------------

// startOver - throw the save file away and build a brand new ranch.
//
// The new ranch comes from reloading the page: the game builds itself from
// STARTING_HORSES again, with no tack, full hunger bars and - because every
// foal ever born lived in the save file - three horses again.
//
// savingStopped makes sure nothing writes the old ranch back out while the page
// is on its way down (the autosave, or the save that closing the page sets off).
//
// reload is only ever false in a test, which wants to check the save really was
// thrown away without the page disappearing from under it.
function startOver(reload = true) {
  savingStopped = true;
  clearSave();
  if (reload) location.reload();
}

const barnMenu = createBarnMenu({
  horses,
  controls,
  interactions,
  breeding,
  onChange: () => saveAndShow(),
  onReset: () => startOver(),
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
      // A CHICK, not a chicken: it arrives small and yellow and spends a minute
      // and a half growing up before it can lay an egg or find a new home.
      // addChicken hands back null when there is no room, and then nothing is
      // charged (see the note above).
      if (!coop.addChicken({ chick: true })) return false;
      // Chickens are not an inventory item, so the HUD has to be told.
      hud.refresh();
      return `A fluffy new chick! It needs time to grow. (🐔 ${coop.count()})`;
    },
  },
  // The two packets of seed for the garden back home. They are cheap on purpose:
  // two coins buys one planting, and one planting comes back as three corn
  // (worth 6 at the stall) or three carrots (worth 9). Growing things should
  // always be worth doing.
  {
    key: 'cornSeeds',
    label: 'Corn seeds',
    icon: ITEM_ICONS.cornSeeds,
    price: 2,
    give: () => {
      inventory.add('cornSeeds', 1);
      return `Corn seeds! Plant them in the garden. (${ITEM_ICONS.cornSeeds} ${inventory.get('cornSeeds')})`;
    },
  },
  {
    key: 'carrotSeeds',
    label: 'Carrot seeds',
    icon: ITEM_ICONS.carrotSeeds,
    price: 2,
    give: () => {
      inventory.add('carrotSeeds', 1);
      return `Carrot seeds! Plant them in the garden. (${ITEM_ICONS.carrotSeeds} ${inventory.get('carrotSeeds')})`;
    },
  },
];

const shopMenu = createShopMenu({
  title: 'The Feed Store',
  name: 'store',
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
// THE MARKET STALL, just outside the ranch gate.
//
// It is the same panel as the store, built by the same file, with mode: 'sell'
// - so instead of checking she can afford a row and taking coins off her, it
// takes the goods away and PAYS her, and every button says "Sell".
//
// One thing matters more here than anywhere else in the game: this is a market
// stall and nothing else. A chicken sold here is a chicken a family takes home
// with them, and the words on the screen say exactly that.
//
// The prices:
//   chicken  10 coins   (a chick from the store costs 8, but has to grow first)
//   egg       2 coins   (one at a time, or the whole basket at once)
//   corn      2 coins   \
//   apples    2 coins    |  what the neighbours grow (Phase 6). This is what
//   milk      6 coins    |  makes the walk down a lane worth it: two eggs
//   wool     12 coins   /   (4 coins) come back as three corn (6 coins).
//
// The four goods are sold one at a time, so the row says exactly what one of
// them is worth. A row for something she has none of greys itself out and says
// so, the same way the egg rows do before the hens have laid anything.
// ---------------------------------------------------------------------------
const CHICKEN_PRICE = 10;
const EGG_PRICE = 2;

// One row of the market stall for one of the neighbours' goods.
//   key    the inventory key ('corn')
//   label  the words on the row ('Corn')
//   icon   its emoji, the same one the HUD and the trade panel use
//   price  what one of them fetches, in coins
function goodsRow(key, label, icon, price) {
  return {
    key,
    icon,
    // The number in brackets is how many she is carrying, so the row is worth
    // reading even when the button is greyed out.
    label: () => `${label} (${inventory.get(key)})`,
    price,
    canBuy: () => (inventory.get(key) >= 1 ? true : `No ${label.toLowerCase()} yet`),
    refused: `No ${label.toLowerCase()} yet`,
    give: () => {
      if (!inventory.spend(key, 1)) return false;
      return `Sold ${label.toLowerCase()}! (${icon} ${inventory.get(key)} left)`;
    },
  };
}

const MARKET_ITEMS = [
  {
    key: 'chicken',
    label: 'Chicken',
    icon: '🐔',
    price: CHICKEN_PRICE,
    // She must always keep at least one grown chicken, or the coop would stand
    // empty and there would be no more eggs. Chicks do not count: they are far
    // too young to go and live anywhere else.
    canBuy: () =>
      coop.adultCount() >= 2 ? true : 'Keep at least one chicken!',
    refused: 'Keep at least one chicken!',
    give: () => {
      // removeChicken only ever takes a GROWN chicken, and says false if there
      // are none - in which case nothing is paid (see the note by the store).
      if (!coop.removeChicken()) return false;
      // Chickens are not an inventory item, so the HUD has to be told.
      hud.refresh();
      return `A family took a chicken home! (🐔 ${coop.count()} left)`;
    },
  },
  {
    key: 'egg',
    label: '1 egg',
    icon: '🥚',
    price: EGG_PRICE,
    canBuy: () => (inventory.get('eggs') >= 1 ? true : 'No eggs yet'),
    refused: 'No eggs yet',
    give: () => {
      if (!inventory.spend('eggs', 1)) return false;
      return `Sold an egg! (🥚 ${inventory.get('eggs')} left)`;
    },
  },
  {
    key: 'eggsAll',
    icon: '🥚',
    // Both the words and the price are FUNCTIONS here, because they change
    // every time an egg is collected or sold. shop.js reads the price once,
    // before the eggs change hands, so the whole basket is paid for.
    label: () => `All eggs (${inventory.get('eggs')})`,
    price: () => inventory.get('eggs') * EGG_PRICE,
    canBuy: () => (inventory.get('eggs') >= 1 ? true : 'No eggs yet'),
    refused: 'No eggs yet',
    buttonLabel: 'Sell all',
    give: () => {
      const eggs = inventory.get('eggs');
      if (eggs < 1) return false;
      if (!inventory.spend('eggs', eggs)) return false;
      return `The baker took all ${eggs} of them! (🪙 +${eggs * EGG_PRICE})`;
    },
  },
  // What the neighbours grow, plus the carrots out of her own garden. The icons
  // come from inventory.js, so a bottle of milk is the same 🥛 on the HUD, in
  // the trade panel and here.
  //
  // A carrot fetches 3, a corn 2. Carrots take sixty seconds to grow and corn
  // takes ninety, so by the clock corn is the better earner - which is the
  // small, quiet reason to plant some of each rather than six of one.
  goodsRow('corn', 'Corn', ITEM_ICONS.corn, 2),
  goodsRow('carrots', 'Carrots', ITEM_ICONS.carrots, 3),
  goodsRow('apples', 'Apples', ITEM_ICONS.apples, 2),
  goodsRow('milk', 'Milk', ITEM_ICONS.milk, 6),
  goodsRow('wool', 'Wool', ITEM_ICONS.wool, 12),
];

const marketMenu = createShopMenu({
  title: 'The Market Stall',
  name: 'market',
  intro: 'Find your chickens a happy new home.',
  items: MARKET_ITEMS,
  inventory,
  controls,
  interactions,
  mode: 'sell',
  // After every sale: redraw the row of numbers and write the ranch out, so a
  // sold chicken never comes back because the tab was closed a second later.
  onBuy: () => {
    hud.refresh();
    saveAndShow();
  },
});

// The spot in front of the counter, on the road side of the stall. market.js
// made it for us; it is an empty object with nothing to draw, exactly like the
// barn door and shop door markers.
//
// A radius of 3.5 gives her a comfortable patch of grass between the road and
// the counter: the stall's own footprint stops her 1.2 units short of the
// marker, and the edge of the road is 3.5 units the other way, so the prompt
// appears just as she steps off the road towards the stall.
interactions.register({
  object: market.anchor,
  radius: 3.5,
  actions: [
    {
      key: 'KeyE',
      getLabel: () => 'Visit the market stall',
      onPress: () => {
        // You cannot lean down from a horse to hand over a chicken. (While she
        // is in the saddle the horse itself is the nearest thing anyway, so
        // what she actually sees is "E: Get off".)
        if (riding.isRiding()) return;
        marketMenu.open();
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

// ===========================================================================
// THE VEGETABLE GARDEN - PLANTING AND PICKING (Phase 7)
// ===========================================================================
//
// One registration per plot, so each square of earth has its own prompt and its
// own two keys. What she sees standing at a plot is one of three things:
//
//   bare earth     E: Plant corn (🌱 2)
//                  F: Plant carrots (🌿 2)
//   growing        E: Corn is growing...          (and a little green bar
//                                                  floating over the plot)
//   ready          E: Pick the corn
//
// ...which is the same shape as everything else on the ranch: E is "do the main
// thing here", F is "the other thing", and a line that has nothing to say about
// a key simply is not shown.
//
// The rules, all of them:
//   * she has to be on her own two feet, like the barn, the store and the
//     neighbours - you cannot lean out of the saddle to plant a seed;
//   * a seed is only spent if it actually goes into the ground;
//   * NOTHING can go wrong. There is no watering, no weeds and no withering, so
//     the only thing a plot ever needs is time.
// ===========================================================================

// How close she has to stand. The plots are 2.2 units apart across the garden
// and 2.4 apart front to back, so 1.5 leaves a comfortable circle round each one
// without ever making it hard to tell which plot she means: the interaction
// system always picks the NEAREST thing in range, and the nearest plot is
// simply the one she is standing on.
const PLOT_RADIUS = 1.5;

// "corn" -> "Corn", for the start of a sentence.
function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// One plot's worth of planting: spend a seed, put it in the ground, say so.
// It is written once and used by both keys, because the only thing that differs
// between corn and carrots is which row of the CROPS table we are looking at.
function plantInPlot(index, cropKey) {
  const crop = CROPS[cropKey];
  const icon = ITEM_ICONS[crop.seedKey];

  if (!garden.isEmptyAt(index)) {
    // She pressed a key on a plot that is already busy. The prompt said so, but
    // say it out loud too rather than doing nothing at all.
    interactions.showMessage(
      garden.isReadyAt(index)
        ? 'Pick this one first!'
        : 'Something is already growing here.'
    );
    return;
  }

  // spend() refuses - and changes nothing - when the packet is empty, so the
  // plot stays bare and she is told where to get more.
  if (!inventory.spend(crop.seedKey, 1)) {
    interactions.showMessage(`No ${crop.seedWords}! Buy some at the store.`);
    return;
  }

  garden.plantAt(index, cropKey);
  interactions.showMessage(
    `You planted ${crop.name}! It will be ready soon. (${icon} ${inventory.get(crop.seedKey)} left)`
  );
  saveAndShow();
}

for (const plot of garden.plots) {
  const index = plot.index;

  interactions.register({
    object: plot.group,
    radius: PLOT_RADIUS,
    actions: [
      {
        key: 'KeyE',
        // E is "plant corn" on bare earth, "pick it" once something is ready,
        // and a patient little note in between.
        getLabel: () => {
          if (riding.isRiding()) return 'Get off your horse first';

          const growing = garden.cropAt(index);
          if (!growing) {
            return `Plant corn (${ITEM_ICONS.cornSeeds} ${inventory.get('cornSeeds')})`;
          }
          if (garden.isReadyAt(index)) return `Pick the ${CROPS[growing].name}`;
          return `${capitalise(CROPS[growing].name)} is growing...`;
        },
        onPress: () => {
          if (riding.isRiding()) return;   // the label already said why

          const growing = garden.cropAt(index);

          if (!growing) {
            plantInPlot(index, 'corn');
            return;
          }

          if (!garden.isReadyAt(index)) {
            // Nothing to do but wait, and the bar over the plot is already
            // showing how long. This is the friendly version of "not yet".
            interactions.showMessage(
              `The ${CROPS[growing].name} needs a little more time. Come back soon!`
            );
            return;
          }

          const picked = garden.harvestAt(index);
          if (!picked) return;             // cannot happen, but never crash

          const crop = CROPS[picked];
          inventory.add(crop.harvestKey, crop.harvestCount);
          interactions.showMessage(
            `You picked ${crop.harvestCount} ${crop.name}! `
            + `(${ITEM_ICONS[crop.harvestKey]} ${inventory.get(crop.harvestKey)})`,
            2
          );
          hud.refresh();
          saveAndShow();
        },
      },
      {
        key: 'KeyF',
        // F is the second seed packet, and only that: once something is in the
        // ground this line has nothing to say and disappears.
        getLabel: () => {
          if (riding.isRiding()) return '';
          if (garden.cropAt(index)) return '';
          return `Plant carrots (${ITEM_ICONS.carrotSeeds} ${inventory.get('carrotSeeds')})`;
        },
        onPress: () => {
          if (riding.isRiding()) return;
          if (garden.cropAt(index)) return;   // E deals with a busy plot
          plantInPlot(index, 'carrot');
        },
      },
    ],
  });
}

// ===========================================================================
// THE NEIGHBOURS - TRADING
// ===========================================================================
//
// One panel serves all four families: tradeMenu.open(farm) fills it in with
// that family's name, their greeting and their two or three swaps. Who offers
// what is a plain data table in trade.js (TRADE_OFFERS), so changing a price -
// or adding a fifth family - never means touching this file.
//
// Every farm entry from neighbors.js already carries what the panel needs:
//
//   farm.id         'corn' | 'dairy' | 'sheep' | 'apple'  (which offers to show)
//   farm.name       'Mrs. Garcia'          (what the prompt and greeting say)
//   farm.family     'The Garcia farm'      (the panel title)
//   farm.specialty  'corn' | 'milk' | 'wool' | 'apples'
//   farm.person     the neighbour themself (what we measure distances to)
//
// Trading is on foot only, the same rule as the barn, the store and the market
// stall: you cannot lean down out of the saddle to swap a basket of eggs.
// ===========================================================================
const tradeMenu = createTradeMenu({
  inventory,
  controls,
  interactions,
  // After every swap: redraw the row of numbers and write the ranch out, so a
  // bundle of wool never vanishes because the tab was closed a second later.
  // (This is the same pair of lines the store and the market stall use.)
  onTrade: () => {
    hud.refresh();
    saveAndShow();
  },
});

for (const farm of neighbors.farms) {
  interactions.register({
    object: farm.person,
    radius: TALK_RADIUS,
    actions: [
      {
        key: 'KeyE',
        getLabel: () =>
          riding.isRiding() ? 'Get off your horse first' : `Trade with ${farm.name}`,
        onPress: () => {
          if (riding.isRiding()) return;   // the label already said why
          tradeMenu.open(farm);
        },
      },
    ],
  });
}

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

// Where Natalia really is, worked out fresh each frame. While she is riding she
// is a child of the horse, so her own position is a seat on its back - the
// neighbours need her WORLD position to know when to wave.
const nataliaWorld = new THREE.Vector3();

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
  // 4b. A foal, if one is growing up, gets a little bigger - and when its four
  //     minutes are up it becomes an ordinary horse and the game says so.
  breeding.update(dt);
  // 5. The chicken coop: the flock gets hungrier, the chickens potter about
  //    the pen, and now and then one leaves an egg in the grass.
  const chickensBefore = coop.count();
  coop.update(dt, camera);
  // Chickens are not an inventory item, so the HUD only hears about them when
  // we tell it. (The store and the market stall tell it themselves; this is
  // the safety net for anything else that changes the flock.)
  if (coop.count() !== chickensBefore) hud.refresh();

  // 5c. The vegetable garden: whatever is in the ground grows a little, and
  //     anything that is ripe sways gently to say "come and pick me". Growth is
  //     play-time based, exactly like the chicks above and the foal below.
  garden.update(dt, camera);

  // 5b. The neighbour farms. Each neighbour sways gently on the spot and lifts
  //     a hand to wave once Natalia is within six units, and the cows and sheep
  //     bob their heads in their paddocks.
  natalia.getWorldPosition(nataliaWorld);
  for (const farm of neighbors.farms) {
    farm.person.userData.update(dt, nataliaWorld);
    farm.updateAnimals(dt);
  }

  // 6. Show the "E: Ride Biscuit" prompt when she is close enough, and act on
  //    E and F. While the barn menu is open this does nothing.
  interactions.update(dt);
  // 7. The panels get their frame too. None of them has anything to animate
  //    today, but calling them means this loop never has to change if that
  //    alters.
  barnMenu.update(dt);
  shopMenu.update(dt);
  marketMenu.update(dt);
  tradeMenu.update(dt);
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
  garden,
  inventory,
  hud,
  controls,
  interactions,
  riding,
  road,
  market,
  neighbors,
  breeding,
  addHorseToWorld,
  startOver,
  barnMenu,
  shopMenu,
  marketMenu,
  tradeMenu,
  renderer,
  update,
  save,
  setPaused: (value) => { paused = !!value; },
};

animate();
