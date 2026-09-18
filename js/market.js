// market.js - the market stall just outside the ranch gate.
//
// This is where Natalia finds her chickens a happy new home and sells her
// spare eggs. It is a MARKET STALL, never anything less cheerful: a friendly
// buyer takes a chicken away to live somewhere new, and every word in the game
// says exactly that.
//
// This file only builds the STALL - the wooden counter, the four posts, the
// striped cloth roof, the crates and the little sign board. What is for sale,
// and what happens when something is sold, lives in main.js and is shown by the
// same panel the feed store uses (shop.js, with mode: 'sell').
//
// How main.js uses it:
//
//   const market = buildMarketStall({ scene });
//   controls.addBlockBox(market.box);                      // nobody walks through it
//   interactions.register({ object: market.anchor, radius: 3.5, ... });
//
// What buildMarketStall hands back:
//
//   group     the THREE.Group holding the whole stall (already in the scene)
//   box       { minX, maxX, minZ, maxZ } - its footprint, for controls.addBlockBox
//   anchor    an empty Object3D on the road side of the counter, for interact.js
//   position  { x, z } - the middle of the stall
//
// WHERE IT STANDS, and why
//
// The ranch's front fence runs along z = 14 with a gap at x -4..4, and the road
// to the feed store leaves that gap heading north (+Z) along x = 0. The road is
// 5 units wide, so its corridor is x -2.5..2.5, and the gate signpost is over
// on the east side at (6, 17).
//
// So the stall stands on the WEST side of the road at (-9, 0, 20), turned a
// quarter turn so its counter faces east, back towards the road. Its footprint
// is x -10.8..-7.2, which leaves a clear four and a half units between the edge
// of the stall and the edge of the road: nothing here can ever block the way to
// the store.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The size of the stall, measured from the front of the counter:
//   WIDTH   along the counter, left to right as you walk up to it
//   DEPTH   from the front of the counter to the back of the stall
// ---------------------------------------------------------------------------
export const STALL_WIDTH = 5;
export const STALL_DEPTH = 3;

// The footprint is grown by this much all round before it becomes the no-go
// rectangle, so nobody's nose ends up inside the paintwork.
const FOOTPRINT_PAD = 0.3;

// How far out in front of the counter the "press E here" spot sits.
const ANCHOR_OFFSET = 3.0;

// Where the stall stands, and which way it looks. A quarter turn (90 degrees)
// takes the stall's own "forward" (+Z, the way everything in this game is
// built) round to +X - which is the direction of the road.
const DEFAULT_POSITION = { x: -9, z: 20 };
const FACING_EAST = Math.PI / 2;

// ---------------------------------------------------------------------------
// Colours and shared materials - one material per colour, reused by every mesh
// that needs it, exactly as in world.js and road.js.
//
// The stall is meant to look CHEERFUL, and it stands on the west side of the
// road with the sun coming from behind it, so plain Lambert paint would read
// as grey. Every material here is given a little "emissive" glow of its own
// colour (about 15% of it), which is the cheapest possible way to keep a
// surface bright no matter which way it faces. No extra lights, no shadows,
// nothing for the graphics card to think about.
// ---------------------------------------------------------------------------
const COLORS = {
  post:      0xb98b5e, // the four corner posts and the counter front
  counter:   0xd8b98a, // the counter top: a lighter, scrubbed plank
  stripeA:   0xe53935, // the two colours of the cloth roof
  stripeB:   0xfaf6ef,
  valance:   0xe53935, // the little hanging edge under the front of the roof
  crate:     0xc99a5b,
  crateEdge: 0x8d6e43,
  sign:      0xffb300, // the board over the counter: warm amber
  signLeg:   0x8d6e43,
  basket:    0x8d6e43,
  egg:       0xfffaf0,
};

// How much of its own colour a material gives off by itself. 15% lifts the
// shady side without making anything look like a lamp.
const LIT_FRACTION = 0.15;

const M = {};
for (const key of Object.keys(COLORS)) {
  M[key] = new THREE.MeshLambertMaterial({
    color: COLORS[key],
    emissive: COLORS[key],
    emissiveIntensity: LIT_FRACTION,
  });
}

// One box geometry, scaled by every mesh that uses it. (The same trick road.js
// uses for its road slabs: one shape, dozens of meshes.)
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const eggGeo = new THREE.SphereGeometry(0.075, 7, 5);
const basketGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.22, 10);

// A box mesh of a given size at a given spot.
function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// buildStall - the stall itself, built around (0, 0, 0) with its counter facing
// +Z. buildMarketStall below turns the whole group to face the road.
// ---------------------------------------------------------------------------
function buildStall() {
  const stall = new THREE.Group();
  stall.name = 'marketStall';

  const halfW = STALL_WIDTH / 2;   // 2.5
  const halfD = STALL_DEPTH / 2;   // 1.5

  // --- the counter ---------------------------------------------------------
  // A waist-high front of planks with a scrubbed top plank overhanging it, set
  // just inside the front edge so the top does not stick out of the footprint.
  stall.add(box(STALL_WIDTH, 1.0, 0.7, 0, 0.5, halfD - 0.4, M.post));
  stall.add(box(STALL_WIDTH + 0.2, 0.14, 0.94, 0, 1.07, halfD - 0.4, M.counter));

  // --- the four corner posts ------------------------------------------------
  for (const px of [-halfW + 0.15, halfW - 0.15]) {
    for (const pz of [-halfD + 0.25, halfD - 0.25]) {
      stall.add(box(0.16, 2.6, 0.16, px, 1.3, pz, M.post));
    }
  }

  // --- the striped cloth roof ------------------------------------------------
  // Six boxes side by side in two alternating colours. They are tipped forward
  // a little so the roof slopes down towards the front, the way a real market
  // awning does.
  const stripes = 6;
  const stripeWidth = (STALL_WIDTH - 0.3) / stripes;
  for (let i = 0; i < stripes; i++) {
    const stripe = box(
      stripeWidth, 0.14, STALL_DEPTH + 0.5,
      -halfW + 0.15 + stripeWidth * (i + 0.5),
      2.72,
      0,
      i % 2 === 0 ? M.stripeA : M.stripeB
    );
    stripe.rotation.x = 0.12;   // the slope: the +Z (front) end dips down
    stall.add(stripe);
  }

  // The scalloped edge hanging under the front of the roof - one strip of
  // cloth, which is what makes a stall look like a stall from a distance.
  stall.add(box(STALL_WIDTH - 0.3, 0.32, 0.1, 0, 2.5, halfD + 0.22, M.valance));

  // --- the sign board over the counter ---------------------------------------
  // A big plain amber board on two little legs, standing on the roof. There is
  // no writing on it: nothing in this game is made of text in 3D.
  stall.add(box(2.6, 0.9, 0.14, 0, 3.55, 0.6, M.sign));
  for (const px of [-0.95, 0.95]) {
    stall.add(box(0.14, 0.7, 0.14, px, 2.95, 0.6, M.signLeg));
  }

  // --- two crates of produce behind the counter ------------------------------
  const crateA = box(0.75, 0.75, 0.75, -1.7, 0.38, -0.85, M.crate);
  crateA.rotation.y = 0.28;
  stall.add(crateA);

  const crateB = box(0.62, 0.62, 0.62, -0.95, 0.31, -1.05, M.crateEdge);
  crateB.rotation.y = -0.4;
  stall.add(crateB);

  // A small crate up on the counter, so there is something to look at at
  // eye height.
  const crateC = box(0.5, 0.45, 0.5, -1.7, 1.36, halfD - 0.45, M.crate);
  crateC.rotation.y = 0.2;
  stall.add(crateC);

  // --- a basket of eggs on the counter ---------------------------------------
  const basket = new THREE.Mesh(basketGeo, M.basket);
  basket.position.set(1.4, 1.24, halfD - 0.45);
  stall.add(basket);

  for (const [ex, ez] of [[1.28, -0.08], [1.5, 0.02], [1.4, 0.12]]) {
    const egg = new THREE.Mesh(eggGeo, M.egg);
    egg.scale.set(0.9, 1.15, 0.9);
    egg.position.set(ex, 1.38, halfD - 0.45 + ez);
    stall.add(egg);
  }

  return stall;
}

// ---------------------------------------------------------------------------
// buildMarketStall - the one function main.js calls.
//
//   scene     where to put the stall (optional: you can add market.group yourself)
//   position  the middle of the stall, defaulting to (-9, 20)
// ---------------------------------------------------------------------------
export function buildMarketStall({ scene, position = DEFAULT_POSITION } = {}) {
  const x = position.x ?? DEFAULT_POSITION.x;
  const z = position.z ?? DEFAULT_POSITION.z;

  const group = buildStall();
  group.position.set(x, 0, z);
  group.rotation.y = FACING_EAST;   // the counter now looks at the road
  group.userData = { kind: 'marketStall' };

  // The footprint, in WORLD numbers. The stall has been turned a quarter turn,
  // so what was its WIDTH (5, along its own X) now runs along the world's Z,
  // and its DEPTH (3) runs along the world's X. Hence the swap here.
  const halfAcross = STALL_DEPTH / 2 + FOOTPRINT_PAD;   // 1.8, along world X
  const halfAlong = STALL_WIDTH / 2 + FOOTPRINT_PAD;    // 2.8, along world Z
  const footprint = {
    minX: x - halfAcross,
    maxX: x + halfAcross,
    minZ: z - halfAlong,
    maxZ: z + halfAlong,
  };

  // The spot in front of the counter, on the road side, that interact.js
  // measures distances to. It is an empty object: nothing to draw, just a
  // position in the world.
  const anchor = new THREE.Object3D();
  anchor.name = 'marketStallFront';
  anchor.position.set(x + ANCHOR_OFFSET, 0, z);

  if (scene) {
    scene.add(group);
    scene.add(anchor);
  }

  return { group, box: footprint, anchor, position: { x, z } };
}
