// garden.js - Phase 7 (second half): the vegetable garden.
//
// A little fenced patch of earth with six soil plots in it, tucked into the
// south-west corner of the ranch yard. Natalia walks up to a plot, presses E to
// plant corn or F to plant carrots, waits while it grows, and presses E again to
// pick it. That is the whole thing.
//
// THE ONE RULE: nothing can go wrong. There is no watering, no weeding and no
// withering. A seed that has gone into the ground WILL become a crop, however
// long the player wanders off for. The worst that can happen is that she has to
// come back later.
//
// It is built exactly the way the chicken coop is built: one THREE.Group holding
// everything, one material per colour, one geometry per shape, and a plain
// getState()/setState() pair for the save file. It knows nothing about the
// inventory, the prompts or the coins - main.js spends the seeds, hands over the
// vegetables and writes the messages, in the same way it does for the coop.
//
// How you use it, from main.js:
//
//   const garden = createGarden({ scene, position: new THREE.Vector3(-12, 0, 9) });
//   garden.update(dt, camera);              // once a frame
//
// What it hands back:
//
//   group            the THREE.Group holding the lot (already in the scene)
//   plots            the six plots, in reading order. Each one is
//                    { index, group, crop, grown } - and plot.group is what
//                    interact.js measures its distances to.
//   position         { x, z } - the middle of the garden
//   plantAt(i, key)  -> true if a seed went into plot i ('corn' or 'carrot').
//                       It does NOT spend a seed: main.js does that first and
//                       only calls this once the spend has worked.
//   harvestAt(i)     -> the crop key that was picked ('corn'), or null if that
//                       plot was empty or still growing. The plot is left as
//                       bare soil, ready to be planted again.
//   cropAt(i)        -> 'corn' | 'carrot' | null
//   growthAt(i)      -> 0..1: how far along that plot is (1 = ready to pick)
//   isReadyAt(i)     -> true when it can be picked
//   isEmptyAt(i)     -> true when it is bare soil
//   update(dt, cam)  -> everything grows a little; ready crops sway in the breeze
//   getState()       -> a plain object for the save file
//   setState(state)  -> put a loaded save back

import * as THREE from 'three';
import { createHungerBar } from './bar.js';

// ---------------------------------------------------------------------------
// THE TWO CROPS.
//
// Everything about a crop lives in one row of this table, so adding a third one
// later (peas? pumpkins?) means writing one more row and one more little
// builder function, and nothing else in the game has to change.
//
//   key           what the save file writes down
//   name          the word the prompts and messages use ("corn", "carrots")
//   seedKey       the inventory key of the seeds it is grown from
//   seedWords     what those seeds are called on the HUD
//   harvestKey    the inventory key of what picking it gives her
//   harvestCount  how many she gets: three of either, which is a nice fat
//                 handful for the two seconds she spent planting it
//   seconds       how long it takes to grow, in seconds of PLAY time - the same
//                 idea as the chicks in chickens.js and the foals in breeding.js
//   barLow/High   how high the little growing bar floats above the plot when the
//                 plant has just gone in, and when it is nearly ready. The bar
//                 CLIMBS with the plant, so it always sits just over the leaves
//                 rather than hanging in the sky above a two-inch shoot
//   build         makes the plant's meshes
//   shape         re-sizes them for how grown-up the plant is now
// ---------------------------------------------------------------------------
export const CROPS = {
  corn: {
    key: 'corn',
    name: 'corn',
    seedKey: 'cornSeeds',
    seedWords: 'corn seeds',
    harvestKey: 'corn',
    harvestCount: 3,
    seconds: 90,
    barLow: 0.55,
    barHigh: 1.95,
    build: buildCornPlant,
    shape: shapeCornPlant,
  },
  carrot: {
    key: 'carrot',
    name: 'carrots',
    seedKey: 'carrotSeeds',
    seedWords: 'carrot seeds',
    harvestKey: 'carrots',
    harvestCount: 3,
    seconds: 60,
    barLow: 0.45,
    barHigh: 0.95,
    build: buildCarrotPlant,
    shape: shapeCarrotPlant,
  },
};

// ---------------------------------------------------------------------------
// The size and shape of the patch, all in one place.
// ---------------------------------------------------------------------------

// Six plots, three across and two deep, so the garden is wider than it is deep
// and every plot is reachable from the yard side without squeezing past one.
export const PLOT_COLUMNS = 3;
export const PLOT_ROWS = 2;
export const PLOT_COUNT = PLOT_COLUMNS * PLOT_ROWS;

const PLOT_SIZE = 1.5;    // one square of earth, in world units
const PLOT_GAP_X = 2.2;   // from the middle of one plot to the middle of the next
const PLOT_GAP_Z = 2.4;

// The low wooden edging round the outside, measured from the middle of the
// garden. It is only 22cm tall - she steps over it without noticing, which is
// the point: NOTHING about the garden is solid, so it can never get in the way.
const BORDER_X = 3.6;
const BORDER_Z = 2.8;

// How grown-up a plant has to be before it stops being a sprout and becomes a
// proper half-grown plant. Below this it is stage 0, above it stage 1, and at
// 1 (fully grown) it is stage 2 and ready to pick.
const HALF_AT = 0.4;

// How fast a ripe crop sways, and how far. It is the "come and pick me" nudge:
// a gentle lean, nothing flashing or spinning.
const SWAY_RATE = 1.6;
const SWAY_ANGLE = 0.07;

// The little bar over a growing plot is always the same happy green. bar.js
// normally paints a bar red when it is nearly empty, which is exactly right for
// a hungry horse and exactly wrong for a seed that was planted a moment ago.
const GROW_BAR_COLOR = 0x8bc34a;

// ---------------------------------------------------------------------------
// Colours and shared materials. One material per colour, reused by every mesh
// that needs it, exactly as in world.js and chickens.js.
// ---------------------------------------------------------------------------
const COLORS = {
  soil:      0x6b4a33, // freshly turned earth
  edge:      0xa1887f, // the wooden edging, the same wood as the ranch fence
  stalk:     0x6aab3c, // corn stalk
  leaf:      0x4f9a2e, // corn leaves and carrot tops
  cob:       0xffd54f, // a ripe cob of corn
  carrot:    0xff8f00, // the shoulder of a carrot peeking out of the soil
  pole:      0x8d6e63, // the scarecrow's pole and the sign post
  shirt:     0x42a5f5, // the scarecrow's shirt
  straw:     0xdcc06a, // its straw head, the same hay colour the barn uses
  hat:       0x8d6e43, // its floppy hat
  board:     0xffb300, // the sign board, the same amber as the market stall
};

const M = {};
for (const key of Object.keys(COLORS)) {
  M[key] = new THREE.MeshLambertMaterial({ color: COLORS[key] });
}

// ---------------------------------------------------------------------------
// Shapes, made once here and shared by every mesh that needs one.
//
// The two "grow upwards" shapes (the stalk and the tufts) are shifted inside
// themselves so that y = 0 is their BOTTOM. That is the same trick bar.js uses
// on its fill: once the bottom is at the origin, scaling the mesh makes it grow
// out of the ground instead of sinking half of itself into it.
// ---------------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const soilGeo = new THREE.BoxGeometry(PLOT_SIZE, 0.14, PLOT_SIZE);

const sproutGeo = new THREE.ConeGeometry(0.13, 0.4, 5);
sproutGeo.translate(0, 0.2, 0);

const stalkGeo = new THREE.BoxGeometry(0.16, 1, 0.16);
stalkGeo.translate(0, 0.5, 0);

const leafGeo = new THREE.BoxGeometry(0.8, 0.07, 0.24);
const cobGeo = new THREE.CylinderGeometry(0.12, 0.09, 0.42, 6);

const tuftGeo = new THREE.ConeGeometry(0.14, 0.72, 5);
tuftGeo.translate(0, 0.36, 0);

const rootGeo = new THREE.ConeGeometry(0.2, 0.46, 7);

const scarecrowPoleGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6);
const headGeo = new THREE.SphereGeometry(0.24, 7, 5);
const brimGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.06, 9);
const hatTopGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.26, 9);

// A box mesh of a given size at a given spot. (The same little helper world.js
// and market.js use, so the three files read the same way.)
function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

// Keep a number inside a range.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Which of the three stages a plant this grown-up is showing.
//   0 a little sprout      1 half grown      2 ready to pick
function stageFor(fraction) {
  if (fraction >= 1) return 2;
  if (fraction >= HALF_AT) return 1;
  return 0;
}

// How big the grown-up part of a plant should be drawn at this point: a little
// over half size when it first pushes past the sprout stage, full size when it
// is ready. Written as one line so both crops swell at the same gentle rate.
function topScale(fraction) {
  return 0.55 + 0.45 * clamp((fraction - HALF_AT) / (1 - HALF_AT), 0, 1);
}

// ---------------------------------------------------------------------------
// ONE CORN PLANT - a sprout, then a tall leafy stalk, then two yellow cobs.
//
// Everything above the sprout hangs off a "top" group, so making the plant
// bigger is one line (top.scale) rather than a sum for every piece.
// Six meshes in all, fully grown.
// ---------------------------------------------------------------------------
function buildCornPlant() {
  const plant = new THREE.Group();
  plant.name = 'cornPlant';

  // Stage 0: one little green shoot out of the earth.
  const sprout = new THREE.Mesh(sproutGeo, M.leaf);
  plant.add(sprout);

  // Stages 1 and 2: the stalk itself, and everything growing off it.
  const top = new THREE.Group();
  plant.add(top);

  const stalk = new THREE.Mesh(stalkGeo, M.stalk);
  stalk.scale.y = 1.6;               // a corn plant stands about knee-high here
  top.add(stalk);

  // Two long leaves, one either side, drooping the way corn leaves do.
  const leafA = new THREE.Mesh(leafGeo, M.leaf);
  leafA.position.set(0.34, 0.72, 0.04);
  leafA.rotation.set(0, 0.25, -0.5);
  top.add(leafA);

  const leafB = new THREE.Mesh(leafGeo, M.leaf);
  leafB.position.set(-0.34, 1.06, -0.04);
  leafB.rotation.set(0, -0.3, 0.5);
  top.add(leafB);

  // Stage 2 only: two fat yellow cobs leaning out from the stalk, far enough
  // out that you can see them are from right across the yard. They are the
  // whole "it is ready!" signal, so they are deliberately big.
  const cobA = new THREE.Mesh(cobGeo, M.cob);
  cobA.position.set(0.23, 0.95, 0.08);
  cobA.rotation.z = -0.4;
  top.add(cobA);

  const cobB = new THREE.Mesh(cobGeo, M.cob);
  cobB.position.set(-0.22, 1.28, -0.07);
  cobB.rotation.z = 0.4;
  top.add(cobB);

  plant.userData = { sprout, top, cobs: [cobA, cobB] };
  return plant;
}

function shapeCornPlant(plant, fraction) {
  const parts = plant.userData;
  const stage = stageFor(fraction);

  parts.sprout.visible = stage === 0;
  parts.top.visible = stage > 0;
  for (const cob of parts.cobs) cob.visible = stage === 2;

  if (stage === 0) {
    // The shoot itself gets a little taller while it is still a shoot.
    parts.sprout.scale.setScalar(0.6 + 0.4 * clamp(fraction / HALF_AT, 0, 1));
    return;
  }

  parts.top.scale.setScalar(topScale(fraction));
}

// ---------------------------------------------------------------------------
// ONE CARROT PLANT - a sprout, then a low tuft of green, then the same tuft
// with an orange shoulder pushing up out of the soil.
// Five meshes in all, fully grown.
// ---------------------------------------------------------------------------
function buildCarrotPlant() {
  const plant = new THREE.Group();
  plant.name = 'carrotPlant';

  const sprout = new THREE.Mesh(sproutGeo, M.leaf);
  sprout.scale.setScalar(0.8);       // a carrot shoot is smaller than a corn one
  plant.add(sprout);

  const top = new THREE.Group();
  plant.add(top);

  // Three feathery leaves leaning out in different directions.
  const leans = [
    { x: 0.02, z: 0.2, tilt: 0.3, roll: 0.12 },
    { x: -0.25, z: -0.12, tilt: -0.2, roll: -0.42 },
    { x: 0.24, z: -0.14, tilt: -0.25, roll: 0.45 },
  ];
  for (const lean of leans) {
    const tuft = new THREE.Mesh(tuftGeo, M.leaf);
    tuft.position.set(lean.x, 0.05, lean.z);
    tuft.rotation.set(lean.tilt, 0, lean.roll);
    top.add(tuft);
  }

  // Stage 2 only: the top of the carrot itself, pushing up out of the earth. It
  // is a cone turned upside down, so the fat orange shoulder is at the top like
  // a real one, and it is big enough to spot from across the garden - that is
  // how a child knows this row is the one to pick.
  const root = new THREE.Mesh(rootGeo, M.carrot);
  root.position.set(0, 0.17, 0.02);
  root.rotation.x = Math.PI;
  top.add(root);

  plant.userData = { sprout, top, root };
  return plant;
}

function shapeCarrotPlant(plant, fraction) {
  const parts = plant.userData;
  const stage = stageFor(fraction);

  parts.sprout.visible = stage === 0;
  parts.top.visible = stage > 0;
  parts.root.visible = stage === 2;

  if (stage === 0) {
    parts.sprout.scale.setScalar(0.5 + 0.3 * clamp(fraction / HALF_AT, 0, 1));
    return;
  }

  parts.top.scale.setScalar(topScale(fraction));
}

// ---------------------------------------------------------------------------
// THE EDGING - four low planks round the outside of the patch, so it reads as
// "a garden" and not "six brown squares somebody left on the grass".
// ---------------------------------------------------------------------------
function buildEdging() {
  const edging = new THREE.Group();
  edging.name = 'gardenEdging';

  const height = 0.22;
  const width = BORDER_X * 2 + 0.2;
  const depth = BORDER_Z * 2 + 0.2;

  edging.add(box(width, height, 0.2, 0, height / 2, -BORDER_Z, M.edge));
  edging.add(box(width, height, 0.2, 0, height / 2, BORDER_Z, M.edge));
  edging.add(box(0.2, height, depth, -BORDER_X, height / 2, 0, M.edge));
  edging.add(box(0.2, height, depth, BORDER_X, height / 2, 0, M.edge));

  return edging;
}

// ---------------------------------------------------------------------------
// THE SCARECROW - a friendly one, standing at the west end of the patch. It is
// the thing you spot from across the yard, which is its whole job.
// ---------------------------------------------------------------------------
function buildScarecrow() {
  const scarecrow = new THREE.Group();
  scarecrow.name = 'scarecrow';

  const pole = new THREE.Mesh(scarecrowPoleGeo, M.pole);
  pole.position.y = 1.05;
  scarecrow.add(pole);

  // The crossbar its sleeves hang from.
  scarecrow.add(box(1.4, 0.1, 0.1, 0, 1.42, 0, M.pole));

  // A baggy blue shirt.
  scarecrow.add(box(0.72, 0.8, 0.34, 0, 1.15, 0, M.shirt));

  // A straw head under a floppy hat.
  const head = new THREE.Mesh(headGeo, M.straw);
  head.position.y = 1.78;
  scarecrow.add(head);

  const brim = new THREE.Mesh(brimGeo, M.hat);
  brim.position.y = 1.96;
  scarecrow.add(brim);

  const hatTop = new THREE.Mesh(hatTopGeo, M.hat);
  hatTop.position.y = 2.1;
  scarecrow.add(hatTop);

  return scarecrow;
}

// ---------------------------------------------------------------------------
// THE SIGN - a little amber board on a post at the yard end of the patch, with
// a cob and a carrot painted on it. There is no writing on it: nothing in this
// game is made of text in 3D, and a picture is quicker to read anyway.
// ---------------------------------------------------------------------------
function buildSign() {
  const sign = new THREE.Group();
  sign.name = 'gardenSign';

  sign.add(box(0.12, 1.0, 0.12, 0, 0.5, 0, M.pole));
  sign.add(box(0.9, 0.5, 0.09, 0, 1.12, 0, M.board));

  // A cob and a carrot on the face of the board, so a child knows at a glance
  // what grows here. (Nothing in this game is made of text in 3D, and a picture
  // is quicker to read anyway.)
  const cob = new THREE.Mesh(cobGeo, M.cob);
  cob.scale.setScalar(0.8);
  cob.position.set(-0.2, 1.12, 0.08);
  sign.add(cob);

  const carrot = new THREE.Mesh(rootGeo, M.carrot);
  carrot.scale.setScalar(0.65);
  carrot.position.set(0.2, 1.12, 0.08);
  carrot.rotation.x = Math.PI;
  sign.add(carrot);

  return sign;
}

// ---------------------------------------------------------------------------
// createGarden - build the whole patch and hand back the controls for it.
//
//   scene     where to add the garden (optional: you can add garden.group
//             yourself instead)
//   position  the middle of the patch, e.g. new THREE.Vector3(-12, 0, 9)
// ---------------------------------------------------------------------------
export function createGarden({ scene, position } = {}) {
  const group = new THREE.Group();
  group.name = 'garden';
  if (position) group.position.set(position.x ?? 0, 0, position.z ?? 0);

  // --- the scenery round the plots ------------------------------------------
  group.add(buildEdging());

  const scarecrow = buildScarecrow();
  scarecrow.position.set(-BORDER_X - 0.7, 0, 0);
  scarecrow.rotation.y = 1.3;        // turned a little, so it is not facing a wall
  group.add(scarecrow);

  // The sign stands out beyond the south-east corner - the yard side, which is
  // where she comes from - and faces back that way. Off at the corner like this
  // rather than in the middle of a side, it is the first thing she sees and
  // never the thing that ends up between the camera and a plot.
  const sign = buildSign();
  sign.position.set(BORDER_X + 0.9, 0, BORDER_Z + 0.5);
  sign.rotation.y = 0.9;   // turned to face south-east, back towards the yard
  group.add(sign);

  // --- the six plots --------------------------------------------------------
  // Laid out in reading order: the back row left to right, then the front row,
  // so plot 0 is the far-left one as she walks up from the yard.
  const plots = [];

  for (let row = 0; row < PLOT_ROWS; row++) {
    for (let column = 0; column < PLOT_COLUMNS; column++) {
      const index = row * PLOT_COLUMNS + column;

      // Each plot is its own little group, so everything in it (the earth, the
      // plant, the growing bar) moves as one - and so interact.js has a single
      // object to measure "is she standing at this plot?" against.
      const plotGroup = new THREE.Group();
      plotGroup.name = 'plot' + index;
      plotGroup.position.set(
        (column - (PLOT_COLUMNS - 1) / 2) * PLOT_GAP_X,
        0,
        (row - (PLOT_ROWS - 1) / 2) * PLOT_GAP_Z
      );

      // The earth itself: one flat slab, sitting just proud of the grass.
      const soil = new THREE.Mesh(soilGeo, M.soil);
      soil.position.y = 0.07;
      plotGroup.add(soil);

      // The little "how far along is it?" bar. It is hidden whenever the plot
      // is empty or the crop is ready, so most of the time it is not there at
      // all - it only appears while something is actually growing.
      const bar = createHungerBar({ width: 0.8, thickness: 0.13, depth: 0.04 });
      bar.holder.visible = false;
      plotGroup.add(bar.holder);

      group.add(plotGroup);

      plots.push({
        index,
        group: plotGroup,
        soil,
        bar,
        crop: null,     // null | 'corn' | 'carrot'
        grown: 0,       // seconds of play time it has been in the ground
        plant: null,    // the THREE.Group of meshes, while something is growing
      });
    }
  }

  // --- what is in a plot right now ------------------------------------------
  function plotAt(index) {
    return plots[index] ?? null;
  }

  function cropAt(index) {
    const plot = plotAt(index);
    return plot ? plot.crop : null;
  }

  // 0 = just planted, 1 = ready to pick. An empty plot is 0.
  function growthAt(index) {
    const plot = plotAt(index);
    if (!plot || !plot.crop) return 0;
    return clamp(plot.grown / CROPS[plot.crop].seconds, 0, 1);
  }

  function isReadyAt(index) {
    return growthAt(index) >= 1;
  }

  function isEmptyAt(index) {
    const plot = plotAt(index);
    return !!plot && !plot.crop;
  }

  // --- drawing one plot for how grown-up it is ------------------------------
  function shapePlot(plot) {
    if (!plot.crop || !plot.plant) return;

    const crop = CROPS[plot.crop];
    const fraction = clamp(plot.grown / crop.seconds, 0, 1);

    crop.shape(plot.plant, fraction);

    // The bar is only there while it is growing: an empty plot has nothing to
    // measure, and a ripe one says "E: Pick the corn" instead.
    const growing = fraction < 1;
    plot.bar.holder.visible = growing;
    if (growing) {
      // The bar climbs with the plant, so it is always just over the leaves.
      plot.bar.holder.position.y =
        crop.barLow + (crop.barHigh - crop.barLow) * fraction;
      plot.bar.setValue(fraction * 100, 100);
      // Always the same happy green - see the note by GROW_BAR_COLOR.
      plot.bar.fill.material.color.setHex(GROW_BAR_COLOR);
    }

    // A ripe crop leans gently to and fro (see update below); a growing one
    // stands up straight.
    if (growing) plot.plant.rotation.z = 0;
  }

  // --- planting -------------------------------------------------------------
  // It does NOT take a seed out of her pocket: main.js does that first and only
  // calls this once the spend has worked, exactly as it does when feeding the
  // chickens. false means "that plot is busy" or "there is no such crop".
  function plantAt(index, cropKey) {
    const plot = plotAt(index);
    if (!plot) return false;
    if (plot.crop) return false;              // something is already growing here
    const crop = CROPS[cropKey];
    if (!crop) return false;

    plot.crop = crop.key;
    plot.grown = 0;

    const plant = crop.build();
    plant.position.y = 0.13;                  // standing on top of the earth
    plant.rotation.y = Math.random() * Math.PI * 2;   // no two look quite alike
    plot.group.add(plant);
    plot.plant = plant;

    shapePlot(plot);
    return true;
  }

  // --- picking --------------------------------------------------------------
  // Hands back the crop key that was picked ('corn' / 'carrot'), or null if the
  // plot was empty or not ready yet. main.js is the one that adds the three
  // vegetables to her pocket and says something cheerful.
  function harvestAt(index) {
    const plot = plotAt(index);
    if (!plot || !plot.crop) return null;
    if (growthAt(index) < 1) return null;

    const picked = plot.crop;
    clearPlot(index);
    return picked;
  }

  // Back to bare earth: the plant's meshes come out of the scene and the plot
  // forgets what was in it. The geometries and materials are SHARED, so there is
  // nothing here to dispose of - the next plant reuses every one of them.
  function clearPlot(index) {
    const plot = plotAt(index);
    if (!plot) return;

    if (plot.plant) {
      plot.group.remove(plot.plant);
      plot.plant = null;
    }
    plot.crop = null;
    plot.grown = 0;
    plot.bar.holder.visible = false;
  }

  // --- one frame ------------------------------------------------------------
  // Growth is play-time based, exactly like the chicks in the coop and the foal
  // outside the barn: a plot only grows while somebody is actually playing.
  let swayClock = 0;

  function update(dt, camera) {
    // A tab that has been in the background hands us a huge dt; cap it, the same
    // way the rest of the game does.
    const step = Math.min(dt, 0.1);
    swayClock += step * SWAY_RATE;

    for (const plot of plots) {
      if (!plot.crop) continue;

      const crop = CROPS[plot.crop];
      const wasReady = plot.grown >= crop.seconds;

      if (!wasReady) {
        plot.grown = Math.min(crop.seconds, plot.grown + step);
        shapePlot(plot);
      }

      if (plot.grown >= crop.seconds && plot.plant) {
        // Ripe: a slow lean to and fro, so the eye is drawn to it. Each plot is
        // given a different starting point, so the six of them never sway in
        // time with each other like a row of metronomes.
        plot.plant.rotation.z = Math.sin(swayClock + plot.index) * SWAY_ANGLE;
      }

      // Turn the growing bar to face the camera, so it stays readable from
      // every side. (Hidden bars have nothing to turn.)
      if (plot.bar.holder.visible) plot.bar.faceCamera(camera);
    }
  }

  // --- saving and loading ---------------------------------------------------
  function getState() {
    return {
      plots: plots.map((plot) => ({
        // null for bare earth, otherwise 'corn' or 'carrot'.
        crop: plot.crop,
        // How long it has been growing, to one decimal place. Nobody needs nine.
        grown: Math.round(plot.grown * 10) / 10,
      })),
    };
  }

  function setState(state) {
    const saved = state && Array.isArray(state.plots) ? state.plots : [];

    for (let i = 0; i < plots.length; i++) {
      // Whatever was there, take it out first: loading a save always leaves the
      // garden holding exactly what that save said and nothing else.
      clearPlot(i);

      const entry = saved[i];
      if (!entry || typeof entry !== 'object') continue;
      // A crop name we have never heard of (a hand-edited save, or a crop a
      // future phase added and then took away) simply leaves bare earth.
      if (!CROPS[entry.crop]) continue;

      plantAt(i, entry.crop);

      const seconds = Number(entry.grown);
      plots[i].grown = Number.isFinite(seconds) && seconds > 0
        ? Math.min(seconds, CROPS[entry.crop].seconds)
        : 0;
      shapePlot(plots[i]);
    }
  }

  if (scene) scene.add(group);

  return {
    group,
    plots,
    position: { x: group.position.x, z: group.position.z },
    plantAt,
    harvestAt,
    clearPlot,
    cropAt,
    growthAt,
    isReadyAt,
    isEmptyAt,
    update,
    getState,
    setState,
  };
}
