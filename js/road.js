// road.js - the scenic road out of the ranch, everything you see along it,
// and the feed store at the far end of it.
//
// Phase 5 asks for a store "roughly a 60-second horse ride away". A ride is
// only fun if there is something to look at on the way, so this file builds:
//
//   * a tan road, drawn as a chain of flat boxes with round patches at the
//     corners, running from the gap in the ranch fence out to the store;
//   * trees down both sides, close enough together that there is always one
//     in view inside the fog;
//   * a pond with reeds, some rolling hills in the distance, a little wooden
//     bridge over a stream, a meadow with cows, and hay bales by the store;
//   * wooden signposts with arrow boards at the gate and at every big bend,
//     each one pointing at the next stretch of road;
//   * the store itself: a cream shop with a striped awning and a hitching rail.
//
// It also holds the little compass arrow at the top of the screen, because
// the compass only exists to point at one of these two places.
//
// How main.js uses it:
//
//   const road = buildRoad(scene);
//   controls.addBlockBox(road.storeBox);          // nobody walks through the shop
//   interactions.register({ object: road.storeAnchor, radius: 4, ... });
//   updateCompass(natalia, camera, RANCH, road.storePos);   // once a frame
//
// What buildRoad hands back:
//
//   points       the road as a list of { x, z } corners, in order
//   length       how long that chain of corners is, in world units (~548)
//   storeAnchor  an empty Object3D in front of the shop door, for interact.js
//   storePos     { x, z } - the middle of the shop, for the compass
//   storeBox     { minX, maxX, minZ, maxZ } - the shop's footprint, for controls
//   signposts    the array of signpost groups, so a test can count them
//   group        the THREE.Group holding the lot (already added to the scene)

import * as THREE from 'three';
import { buildTree } from './world.js';

// ---------------------------------------------------------------------------
// THE ROAD ITSELF - every corner, in order, as flat { x, z } ground positions.
//
// It leaves the ranch through the gap in the front fence (x -4..4, z = 14),
// heads north (+Z) with a gentle wiggle, swings east (+X) across the middle of
// the map, then curves back north again to arrive at the store door.
//
// The last two corners share the same x, so the final stretch runs straight at
// the shop front - which makes the building easy to line up and easy to spot.
//
// Measured end to end this chain is about 548 units. At Biscuit's 11 units a
// second that is a fraction under 50 seconds; the pony Coco does it in about
// 69; walking at 4.5 takes over two minutes. Riding matters.
// ---------------------------------------------------------------------------
export const ROAD_POINTS = [
  { x: 0, z: 16 },     // 0 - just outside the ranch gate
  { x: 0, z: 48 },     // 1
  { x: -8, z: 80 },    // 2 - a lazy lean to the west
  { x: 4, z: 112 },    // 3 - and back again: the top of the S
  { x: 32, z: 136 },   // 4 - the big turn east begins
  { x: 70, z: 152 },   // 5 - the pond sits just north of this bend
  { x: 110, z: 158 },  // 6
  { x: 150, z: 166 },  // 7 - the stream and the bridge are along here
  { x: 188, z: 182 },  // 8
  { x: 222, z: 206 },  // 9 - swinging north-east now
  { x: 250, z: 238 },  // 10
  { x: 274, z: 274 },  // 11
  { x: 300, z: 312 },  // 12
  { x: 330, z: 342 },  // 13 - the last bend, the store comes into view
  { x: 336, z: 374 },  // 14 - the road ends on the shop's doorstep
];

// The shop stands squarely at the end of the road. Its body is 11 wide and 8
// deep, and the door is in the middle of the south (-Z) wall, facing back down
// the road the player has just ridden up.
const STORE_X = 336;
const STORE_Z = 383;
const STORE_WIDTH = 11;   // along X
const STORE_DEPTH = 8;    // along Z

// How wide the road is, and how far above the grass it is painted. The ranch's
// own dirt path is at 0.02, so 0.03 keeps the two from flickering where they
// might overlap.
const ROAD_WIDTH = 5;
const ROAD_Y = 0.03;

// ---------------------------------------------------------------------------
// Colours and shared materials. As everywhere else in this game there is ONE
// material per colour, reused by every mesh that needs it: a few hundred road
// meshes sharing eight materials is far kinder to the graphics card than a few
// hundred materials.
// ---------------------------------------------------------------------------
const COLORS = {
  road:      0xc9a878, // tan, a touch lighter than the ranch's dirt path
  water:     0x4fc3f7, // the pond and the stream
  reed:      0x2e7d32, // dark green reeds round the pond
  hill:      0x6fa93c, // the hills on the horizon
  wood:      0xa1887f, // signposts, fences, bridge rails
  plank:     0x8d6e43, // the bridge deck: a slightly darker wood
  arrow:     0xf4e6c3, // the pale arrow board on a signpost
  arrowTip:  0xe64a19, // the orange tip of the arrow, so it reads at a glance
  shopWall:  0xfff2cc, // cream, the same warm colour as the house
  shopRoof:  0x5d6d7e, // slate blue-grey
  shopDoor:  0x6d4c41,
  shopTrim:  0xfaf6ef,
  awningA:   0xe53935, // the two stripes of the awning
  awningB:   0xfaf6ef,
  sign:      0x2e86c1, // the big plain board on the roof
  hay:       0xdcc06a,
  cow:       0xf2efe9, // a cream cow...
  cowSpot:   0x4e4038, // ...with dark legs and head
};

const M = {};
for (const key of Object.keys(COLORS)) {
  M[key] = new THREE.MeshLambertMaterial({ color: COLORS[key] });
}

// TWO EXTRA MATERIALS, FOR THE FRONT OF THE SHOP.
//
// The sun in main.js comes from the south-west and the shop's door faces north
// up the road, away from it - so the whole shop front was in shade, and a warm
// cream wall came out looking grey and unwelcoming.
//
// The cheap fix is "emissive": a colour a material gives off by itself, on top
// of whatever light lands on it. Here it is the wall's OWN colour turned down
// to 15% (that is what emissiveIntensity does), which reads as a wall in bright
// daylight rather than a glowing one, and it costs the graphics card nothing at
// all - no second light, no shadows, no extra passes. (Turning the sky light up
// instead would have brightened the whole world, including all the sunny sides
// that already looked right.)
const LIT_FRACTION = 0.15;

function litVersion(color) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: LIT_FRACTION,
  });
}

M.shopWallLit = litVersion(COLORS.shopWall);
M.shopTrimLit = litVersion(COLORS.shopTrim);

// ---------------------------------------------------------------------------
// Shared geometries. Every one of these is made exactly once and then used by
// dozens of meshes. The road slabs use a plain 1x1x1 box that each mesh simply
// SCALES to the length it needs, which means one geometry covers every slab.
// ---------------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
// A unit-wide round patch (radius 0.5). Every corner patch SCALES it to the
// width of the road it belongs to, so the main road and the narrower farm
// lanes in neighbors.js can share this one shape.
const jointGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 8);
const postGeo = new THREE.CylinderGeometry(0.13, 0.15, 2.3, 6);   // signpost posts
const fencePostGeo = new THREE.BoxGeometry(0.22, 1.3, 0.22);      // fence posts
const arrowTipGeo = new THREE.ConeGeometry(0.42, 0.9, 4);         // signpost arrow point
const reedGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.5, 5);
const hillGeo = new THREE.SphereGeometry(1, 10, 6);               // scaled flat per hill
const pondGeo = new THREE.CircleGeometry(7, 20);
const baleGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8);
const cowLegGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);

// A box mesh at a position, the same little helper world.js uses.
function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// A tiny "random" number generator that always produces the SAME sequence.
//
// The scenery is scattered about with random offsets, but a road that looked
// different every time you refreshed the page would be confusing - and it
// would make the screenshots in the test report meaningless. So instead of
// Math.random() we use this little counter, which is random-looking but
// completely predictable.
// ---------------------------------------------------------------------------
let seed = 20260918;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

// A random number between low and high.
function between(low, high) {
  return low + rand() * (high - low);
}

// ---------------------------------------------------------------------------
// Measuring the road.
// ---------------------------------------------------------------------------

// How long the whole chain of corners is, added up segment by segment.
export function measureRoad(points = ROAD_POINTS) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

// Where you are after walking "distance" units along the road, and which way
// you are facing when you get there. Used to scatter the scenery evenly.
function sampleRoad(points, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (left <= length || i === points.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, left / length);
      return {
        x: a.x + dx * t,
        z: a.z + dz * t,
        dirX: dx / length,
        dirZ: dz / length,
      };
    }
    left -= length;
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z, dirX: 0, dirZ: 1 };
}

// ---------------------------------------------------------------------------
// DRAWING THE ROAD - one flat slab per straight stretch, plus a round patch at
// every corner so the joins look rounded instead of showing a notch.
// ---------------------------------------------------------------------------
// It is exported because Phase 6 paves the little lanes out to the neighbour
// farms with exactly the same slabs, only narrower: buildRoadSurface(lane, 3.5).
// "y" is how high above the grass the surface is painted - a lane sits a hair
// higher than the main road so the two never flicker where they meet.
export function buildRoadSurface(points, width = ROAD_WIDTH, y = ROAD_Y) {
  const group = new THREE.Group();
  group.name = 'roadSurface';

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);

    // The slab is a unit box stretched to the length of this stretch, made
    // paper-thin, and as wide as the road.
    const slab = new THREE.Mesh(unitBox, M.road);
    slab.scale.set(length, 0.05, width);
    slab.position.set(a.x + dx / 2, y, a.z + dz / 2);
    // Turn it so its long side (its local X) lies along the stretch. A box's
    // +X points at (cos, 0, -sin) once it has been turned by rotation.y, so
    // the angle we want is atan2(-dz, dx).
    slab.rotation.y = Math.atan2(-dz, dx);
    group.add(slab);
  }

  // A round patch at every corner (including the two ends) fills the little
  // wedge the straight slabs leave on the outside of a bend.
  for (const point of points) {
    const patch = new THREE.Mesh(jointGeo, M.road);
    patch.scale.set(width, 1, width);   // the shared patch is 1 unit across
    patch.position.set(point.x, y, point.z);
    group.add(patch);
  }

  return group;
}

// ---------------------------------------------------------------------------
// SIGNPOSTS - a post with a pale board on top and an orange arrow point on the
// end of it. No writing anywhere: an eight-year-old follows the point.
//
// "angle" is the compass direction the arrow should point, as the usual
// atan2(dx, dz) of the way the road goes next.
// ---------------------------------------------------------------------------
// It is exported because Phase 6 stands one of these at every farm lane
// junction. Those get the family's own colour on the board and on the arrow
// tip, which is what the two optional material arguments are for - leave them
// out and you get the ordinary pale road sign.
export function buildSignpost(x, z, angle, boardMaterial = M.arrow, tipMaterial = M.arrowTip) {
  const sign = new THREE.Group();
  sign.name = 'signpost';

  const post = new THREE.Mesh(postGeo, M.wood);
  post.position.y = 1.15;
  sign.add(post);

  // The board: a flat plank lying along the group's +Z, with the cone stuck on
  // the far end of it. Turning the whole group then aims the whole arrow.
  sign.add(box(0.18, 0.5, 2.0, 0, 2.1, 0.7, boardMaterial));

  const tip = new THREE.Mesh(arrowTipGeo, tipMaterial);
  tip.position.set(0, 2.1, 1.95);
  // A cone points up its own +Y, so tipping it a quarter turn forward makes it
  // point along +Z instead - the same way the board is lying.
  tip.rotation.x = Math.PI / 2;
  sign.add(tip);

  sign.position.set(x, 0, z);
  sign.rotation.y = angle;
  return sign;
}

// ---------------------------------------------------------------------------
// FENCE RUN - posts and two rails between two points on the ground. A smaller
// copy of the one in world.js, kept here so the store's fences can share this
// file's materials.
// ---------------------------------------------------------------------------
// It is exported because the neighbour farms in Phase 6 fence their yards and
// their paddocks the same way. "spacing" is how far apart the posts stand: the
// road's own fences keep the original 4, while a long farm paddock asks for a
// wider spacing so a big field does not cost a hundred little posts.
export function buildFenceRun(x1, z1, x2, z2, spacing = 4) {
  const run = new THREE.Group();
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);

  const count = Math.max(2, Math.round(length / spacing) + 1);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const post = new THREE.Mesh(fencePostGeo, M.wood);
    post.position.set(x1 + dx * t, 0.65, z1 + dz * t);
    run.add(post);
  }

  for (const y of [0.5, 1.0]) {
    const rail = box(0.1, 0.16, length, x1 + dx / 2, y, z1 + dz / 2, M.wood);
    rail.rotation.y = angle;
    run.add(rail);
  }

  return run;
}

// ---------------------------------------------------------------------------
// TREES DOWN BOTH SIDES - one every 15 to 25 units, alternating left and right,
// standing 6 to 14 units back from the middle of the road. Near the bridge and
// the shop they are skipped, so nothing grows through the scenery.
// ---------------------------------------------------------------------------
function buildRoadsideTrees(points, totalLength, skipSpots) {
  const trees = new THREE.Group();
  trees.name = 'roadsideTrees';

  let along = 18;          // the first one, just past the ranch gate
  let side = 1;            // +1 is the left of the road, -1 the right
  let index = 0;

  while (along < totalLength - 12) {
    const spot = sampleRoad(points, along);

    // "Sideways" is the road direction turned a quarter turn.
    const sideX = -spot.dirZ * side;
    const sideZ = spot.dirX * side;
    const offset = between(6, 14);
    const x = spot.x + sideX * offset;
    const z = spot.z + sideZ * offset;

    // Leave a clearing round the bridge, the pond and the shop.
    let blocked = false;
    for (const skip of skipSpots) {
      if (Math.hypot(x - skip.x, z - skip.z) < skip.r) blocked = true;
    }

    if (!blocked) {
      // Round blobs and pointy pines take turns, and each one is a slightly
      // different size, so the roadside never looks stamped out.
      trees.add(buildTree(x, z, index % 2 === 0, 0.8 + rand() * 0.55));
      index++;
    }

    along += between(15, 25);
    side = -side;
  }

  return trees;
}

// ---------------------------------------------------------------------------
// THE POND - a flat blue disc with a handful of reeds round its edge, tucked
// just off the bend at road corner 5.
// ---------------------------------------------------------------------------
function buildPond(x, z) {
  const pond = new THREE.Group();
  pond.name = 'pond';

  // A circle is made standing up, like a plane, so it is tipped flat.
  const water = new THREE.Mesh(pondGeo, M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.04, z);
  pond.add(water);

  // Six reeds spaced round the rim.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const reed = new THREE.Mesh(reedGeo, M.reed);
    reed.position.set(
      x + Math.sin(angle) * 6.6,
      0.75,
      z + Math.cos(angle) * 6.6
    );
    reed.rotation.z = (rand() - 0.5) * 0.3;   // leaning slightly, as reeds do
    pond.add(reed);
  }

  return pond;
}

// ---------------------------------------------------------------------------
// THE HILLS - big flattened balls of green, set 40 to 80 units back from the
// road. They are pure backdrop: you can walk straight through one, and at that
// distance the fog has already softened them into shapes on the horizon.
// ---------------------------------------------------------------------------
function buildHills() {
  const hills = new THREE.Group();
  hills.name = 'hills';

  // x, z, how wide, how tall (as a fraction of the width).
  const spots = [
    [-55, 118, 34, 0.35],
    [152, 248, 40, 0.32],
    [246, 120, 36, 0.38],
    [412, 330, 44, 0.3],
  ];

  for (const [x, z, width, flatness] of spots) {
    const hill = new THREE.Mesh(hillGeo, M.hill);
    hill.scale.set(width, width * flatness, width);
    // Sunk a little, so the ball reads as a rounded hill rather than a bubble
    // resting on the grass.
    hill.position.set(x, -width * flatness * 0.25, z);
    hills.add(hill);
  }

  return hills;
}

// ---------------------------------------------------------------------------
// THE STREAM AND THE BRIDGE - a thin blue ribbon crossing the road about
// half-way along, with a little plank bridge carrying the road over it.
//
// The bridge is pure decoration: it has no collision at all, and the road is
// painted straight over the top of it, so a galloping horse simply rides
// across without anything getting in the way.
// ---------------------------------------------------------------------------
function buildBridge(spot) {
  const bridge = new THREE.Group();
  bridge.name = 'bridge';

  // Which way the road is going here, and which way is "across" it.
  const alongAngle = Math.atan2(spot.dirX, spot.dirZ);
  const acrossAngle = alongAngle + Math.PI / 2;

  // The stream: a long thin flat box lying across the road, just under the
  // road surface so the road wins wherever the two overlap.
  const stream = box(90, 0.04, 6, spot.x, 0.02, spot.z, M.water);
  stream.rotation.y = acrossAngle - Math.PI / 2;
  bridge.add(stream);

  // The deck: five planks laid across the road, side by side along it.
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 1.5;
    const plank = box(
      ROAD_WIDTH + 1.4, 0.12, 1.1,
      spot.x + spot.dirX * offset,
      0.09,
      spot.z + spot.dirZ * offset,
      M.plank
    );
    plank.rotation.y = acrossAngle - Math.PI / 2;
    bridge.add(plank);
  }

  // A low rail down each side: two little posts and a top rail each.
  for (const side of [1, -1]) {
    const sideX = -spot.dirZ * side;
    const sideZ = spot.dirX * side;
    const railX = spot.x + sideX * (ROAD_WIDTH / 2 + 0.5);
    const railZ = spot.z + sideZ * (ROAD_WIDTH / 2 + 0.5);

    for (const offset of [-3, 3]) {
      const post = box(
        0.22, 1.0, 0.22,
        railX + spot.dirX * offset, 0.5, railZ + spot.dirZ * offset,
        M.wood
      );
      bridge.add(post);
    }

    const rail = box(0.14, 0.16, 7.4, railX, 0.95, railZ, M.wood);
    rail.rotation.y = alongAngle;
    bridge.add(rail);
  }

  return bridge;
}

// ---------------------------------------------------------------------------
// COWS - a box body on four legs with a box head. Three of them stand in the
// meadow beside the road, which gives the middle of the ride something alive
// to look at.
// ---------------------------------------------------------------------------
function buildCow(x, z, angle) {
  const cow = new THREE.Group();

  cow.add(box(1.1, 1.1, 2.2, 0, 1.25, 0, M.cow));           // body
  cow.add(box(0.7, 0.7, 0.8, 0, 1.5, 1.4, M.cowSpot));      // head

  for (const [lx, lz] of [[-0.38, 0.75], [0.38, 0.75], [-0.38, -0.75], [0.38, -0.75]]) {
    const leg = new THREE.Mesh(cowLegGeo, M.cowSpot);
    leg.position.set(lx, 0.37, lz);
    cow.add(leg);
  }

  cow.position.set(x, 0, z);
  cow.rotation.y = angle;
  return cow;
}

// ---------------------------------------------------------------------------
// THE STORE - a friendly little shop at the end of the road.
//
// The door faces -Z, which is the way the player arrives, and the striped
// awning sticks out over it. Everything is built around (0,0,0) inside its own
// group and then the group is moved into place, the same way world.js builds
// the house and the barn.
// ---------------------------------------------------------------------------
function buildStore(x, z) {
  const store = new THREE.Group();
  store.name = 'store';

  const halfW = STORE_WIDTH / 2;    // 5.5
  const halfD = STORE_DEPTH / 2;    // 4
  const wallHeight = 4.6;
  const front = -halfD;             // the z of the front wall

  // Body and a flat roof slab that overhangs it a little all round.
  store.add(box(STORE_WIDTH, wallHeight, STORE_DEPTH, 0, wallHeight / 2, 0, M.shopWall));
  store.add(box(STORE_WIDTH + 1, 0.5, STORE_DEPTH + 1, 0, wallHeight + 0.25, 0, M.shopRoof));

  // The front wall gets a paper-thin panel of the "lit" cream laid over it, so
  // the face the player always sees is bright and welcoming while the other
  // three walls keep their ordinary paint. (See litVersion above.)
  store.add(box(STORE_WIDTH, wallHeight, 0.04, 0, wallHeight / 2, front - 0.02, M.shopWallLit));

  // The door, big and obvious, in the middle of the front wall.
  store.add(box(2.4, 3.1, 0.14, 0, 1.55, front - 0.05, M.shopDoor));
  store.add(box(2.8, 3.5, 0.08, 0, 1.75, front - 0.01, M.shopTrimLit));  // white surround

  // A window each side of the door.
  store.add(box(1.6, 1.3, 0.1, -3.4, 2.6, front - 0.05, M.shopTrimLit));
  store.add(box(1.6, 1.3, 0.1, 3.4, 2.6, front - 0.05, M.shopTrimLit));

  // The awning: eight thin boxes in two alternating colours, tilted so they
  // slope down away from the wall like a real shop blind.
  for (let i = 0; i < 8; i++) {
    const stripe = box(
      1.35, 0.14, 2.6,
      -4.72 + i * 1.35, 3.85, front - 1.2,
      i % 2 === 0 ? M.awningA : M.awningB
    );
    stripe.rotation.x = 0.22;
    store.add(stripe);
  }

  // Two posts holding the outer edge of the awning up.
  for (const px of [-4.9, 4.9]) {
    store.add(box(0.2, 3.6, 0.2, px, 1.8, front - 2.3, M.wood));
  }

  // The porch / counter: a low wooden step running along the shop front, with
  // a waist-high counter on top of it at one end.
  store.add(box(STORE_WIDTH, 0.25, 2.6, 0, 0.12, front - 1.3, M.plank));
  store.add(box(3.2, 0.9, 0.6, 3.2, 0.7, front - 2.0, M.plank));

  // The sign on the roof: a big plain coloured board on two little legs. There
  // is no writing on it - nothing in this game is made of text in 3D.
  store.add(box(6.4, 1.7, 0.3, 0, 6.0, front + 1.6, M.sign));
  for (const px of [-2.4, 2.4]) {
    store.add(box(0.2, 1.0, 0.2, px, 5.35, front + 1.6, M.wood));
  }

  store.position.set(x, 0, z);
  store.userData = { kind: 'store' };
  return store;
}

// ---------------------------------------------------------------------------
// buildRoad - the one function main.js calls.
// ---------------------------------------------------------------------------
export function buildRoad(scene) {
  const group = new THREE.Group();
  group.name = 'road';

  const points = ROAD_POINTS;
  const length = measureRoad(points);

  // Where the bridge goes: half-way along the road, whichever corner that
  // happens to land between.
  const bridgeSpot = sampleRoad(points, length / 2);

  // Where the pond goes: just north of the bend at corner 5.
  const pondX = 70;
  const pondZ = 176;

  // 1. the road surface itself
  group.add(buildRoadSurface(points));

  // 2. the trees down both sides, keeping clear of the bridge, the pond and
  //    the shop
  group.add(buildRoadsideTrees(points, length, [
    { x: bridgeSpot.x, z: bridgeSpot.z, r: 16 },
    { x: pondX, z: pondZ, r: 13 },
    { x: STORE_X, z: STORE_Z, r: 22 },
  ]));

  // 3. the big scenery
  group.add(buildPond(pondX, pondZ));
  group.add(buildHills());
  group.add(buildBridge(bridgeSpot));

  // 4. three cows grazing in the meadow on the south side of the long eastward
  //    stretch, well clear of the road
  group.add(buildCow(96, 138, 0.6));
  group.add(buildCow(104, 132, 1.9));
  group.add(buildCow(90, 129, -0.8));

  // 5. the store, its hitching rail, its paddock fence and a stack of hay
  group.add(buildStore(STORE_X, STORE_Z));

  // Hitching rail: a short fence run beside the shop, where a horse waits.
  group.add(buildFenceRun(STORE_X + 8, STORE_Z - 6, STORE_X + 8, STORE_Z + 1));
  // A longer run behind and beside the shop, so the place looks lived in.
  group.add(buildFenceRun(STORE_X - 20, STORE_Z + 6, STORE_X + 14, STORE_Z + 6));
  group.add(buildFenceRun(STORE_X - 20, STORE_Z - 8, STORE_X - 20, STORE_Z + 6));

  for (const [bx, bz] of [[STORE_X - 13, STORE_Z - 2], [STORE_X - 14.2, STORE_Z - 1.2],
                          [STORE_X - 13.6, STORE_Z + 0.2]]) {
    const bale = new THREE.Mesh(baleGeo, M.hay);
    bale.position.set(bx, 0.55, bz);
    bale.rotation.z = Math.PI / 2;
    group.add(bale);
  }

  // 6. the signposts. One at the ranch gate and one at each big bend, each
  //    turned to point at the NEXT corner; plus one at the store pointing back
  //    the way the player came.
  const signposts = [];

  // Which corners get a sign. Corner 0 is the gate itself.
  const signCorners = [0, 3, 5, 7, 9, 11, 13];

  for (const i of signCorners) {
    const here = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const angle = Math.atan2(next.x - here.x, next.z - here.z);

    // Stand it just off the edge of the road, on the right-hand side, so the
    // road stays clear.
    const dx = next.x - here.x;
    const dz = next.z - here.z;
    const d = Math.hypot(dx, dz) || 1;
    const offX = (dz / d) * (ROAD_WIDTH / 2 + 1.4);
    const offZ = (-dx / d) * (ROAD_WIDTH / 2 + 1.4);

    let postX = here.x + offX;
    let postZ = here.z + offZ;

    // The gate sign is a special case. The gap in the ranch fence runs from
    // x -4 to x +4, and the working-out above would stand the post at x 3.9 -
    // right in the middle of the gateway. So it is moved clear of the gap and
    // a step past the fence line instead, where it is the first thing you see
    // on the way out without being something you walk into.
    if (i === 0) {
      postX = 6;
      postZ = 17;
    }

    const sign = buildSignpost(postX, postZ, angle);
    signposts.push(sign);
    group.add(sign);
  }

  // The sign at the store, pointing back down the road towards home.
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2];
  const homeAngle = Math.atan2(secondLast.x - last.x, secondLast.z - last.z);
  const homeSign = buildSignpost(STORE_X - 8, STORE_Z - 8, homeAngle);
  signposts.push(homeSign);
  group.add(homeSign);

  // 7. the spot in front of the door that interact.js measures distances to.
  //    It is an empty object: nothing to draw, just a position in the world.
  const storeAnchor = new THREE.Object3D();
  storeAnchor.name = 'storeDoor';
  storeAnchor.position.set(STORE_X, 0, STORE_Z - STORE_DEPTH / 2 - 2.5);
  group.add(storeAnchor);

  // The shop's footprint, half a unit bigger than the walls so nobody's nose
  // ends up inside the paintwork.
  const storeBox = {
    minX: STORE_X - STORE_WIDTH / 2 - 0.5,
    maxX: STORE_X + STORE_WIDTH / 2 + 0.5,
    minZ: STORE_Z - STORE_DEPTH / 2 - 0.5,
    maxZ: STORE_Z + STORE_DEPTH / 2 + 0.5,
  };

  if (scene) scene.add(group);

  return {
    group,
    points,
    length,
    storeAnchor,
    storePos: { x: STORE_X, z: STORE_Z },
    storeBox,
    signposts,
    bridgeSpot,
    pondPos: { x: pondX, z: pondZ },
  };
}

// ---------------------------------------------------------------------------
// THE COMPASS - the little arrow at the top of the screen.
//
// It is one character, a ▲, in a small round badge, and all it ever does is
// turn. While the player is nearer home than the shop it points AT the shop
// ("the store is that way"); once she is past half-way it flips round and
// points home again. Between the arrow and the signposts, nobody gets lost.
//
// It expects two elements in index.html:
//
//   <div id="compass">▲</div>       the badge we rotate, and whose data-target
//                                   we set to 'store' or 'home'
//   <div id="compass-label"></div>  its next-door neighbour, whose word the CSS
//                                   picks from that data-target
//
// If either is missing nothing happens and nothing breaks.
//
// Working out which way to turn it is the only fiddly bit:
//
//   1. "camYaw" is the direction the camera is looking, flat on the ground:
//      the way from the camera towards the player.
//   2. "targetAngle" is the direction from the player to whatever we are
//      pointing at.
//   3. The angle between the two is how far clockwise from straight-up the
//      arrow has to sit on the screen. CSS rotates clockwise, which is why
//      the subtraction is that way round.
// ---------------------------------------------------------------------------

// Scratch vectors, made once and re-used sixty times a second.
const playerWorld = new THREE.Vector3();

// Looked up once, the first time updateCompass runs.
let compassElement;
let compassLooked = false;

export function updateCompass(player, camera, ranchPos, storePos) {
  if (!compassLooked) {
    compassElement = typeof document !== 'undefined'
      ? document.getElementById('compass')
      : null;
    compassLooked = true;
  }
  if (!compassElement || !player || !camera) return;

  // While Natalia is riding she is a child of the horse, so her WORLD position
  // is the one that matters, not her position inside the saddle.
  player.getWorldPosition(playerWorld);
  const px = playerWorld.x;
  const pz = playerWorld.z;

  // Nearer the shop than the ranch? Then point home instead.
  const toRanch = Math.hypot(ranchPos.x - px, ranchPos.z - pz);
  const toStore = Math.hypot(storePos.x - px, storePos.z - pz);
  const pointingHome = toStore < toRanch;
  const target = pointingHome ? ranchPos : storePos;

  const camYaw = Math.atan2(px - camera.position.x, pz - camera.position.z);
  const targetAngle = Math.atan2(target.x - px, target.z - pz);
  const degrees = ((camYaw - targetAngle) * 180) / Math.PI;

  compassElement.style.transform = `rotate(${degrees.toFixed(1)}deg)`;
  // A word of explanation under the badge, so the arrow is never a mystery.
  compassElement.title = pointingHome ? 'Home is this way' : 'The store is this way';
  compassElement.dataset.target = pointingHome ? 'home' : 'store';
}
