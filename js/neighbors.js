// neighbors.js - the four neighbour farms along the road out of the ranch.
//
// Phase 6 asks for "a small community of neighbour families, each with a
// distinct house and barn specializing in a different animal or crop". This
// file builds the WORLD side of that: the farms, their lanes, their signposts
// and the neighbours standing outside waiting to be talked to. The trading
// itself is wired up in main.js.
//
// The four farms are:
//
//   corn   The Garcia farm    Mrs. Garcia    golden barn, rows of sweetcorn
//   dairy  The Miller farm    Mr. Miller     white-and-blue barn, cows, churns
//   sheep  The Nguyen farm    Mr. Nguyen     sage-green barn, a flock of sheep
//   apple  The Okafor orchard Mrs. Okafor    red barn with a white X, apple trees
//
// HOW A FARM IS PUT TOGETHER
//
// Every farm is built from the SAME plan, in its own little "local" coordinate
// system where the farm centre is (0, 0) and +Z points back down the lane
// towards the road. So in local numbers, every farm has:
//
//        z = +12  the yard fence, with a gap in the middle for the lane
//        z = +5   the neighbour, standing in the yard facing the lane
//        z = -2   the house (on the left) and the barn (on the right)
//        z = -8 to -19   the paddock or the field, behind the buildings
//
// Each farm then gets a QUARTER TURN ("turn" below: 0, 1, 2 or 3 quarter turns)
// so its front faces whichever way its lane comes in from. Quarter turns are
// used on purpose: turning a rectangle by a quarter turn leaves it a rectangle
// lined up with the world, which means the no-go boxes controls.js works with
// stay simple.
//
// HOW main.js USES IT
//
//   const neighbors = buildNeighbors(scene);
//   for (const farm of neighbors.farms) {
//     for (const b of farm.blockBoxes) controls.addBlockBox(b);
//     controls.addObstacle(farm.person, 0.6);
//     interactions.register({ object: farm.person, radius: 3.5, actions: [...] });
//   }
//   // once a frame:
//   farm.person.userData.update(dt, nataliaWorldPosition);
//   farm.updateAnimals(dt);
//
// WHAT EACH ENTRY OF farms LOOKS LIKE
//
//   id           'corn' | 'dairy' | 'sheep' | 'apple'
//   name         the neighbour's name, e.g. 'Mrs. Garcia'
//   family       the farm's name, e.g. 'The Garcia farm'
//   specialty    'corn' | 'milk' | 'wool' | 'apples'
//   position     { x, z } - the middle of the farm yard
//   junction     { x, z } - where its lane leaves the main road
//   anchor       an empty Object3D in the yard, a step in front of the
//                neighbour: a handy "stand here" spot
//   person       the neighbour (a THREE.Group from characters.js makePerson)
//   signpost     the signpost group standing at the junction
//   blockBoxes   [{ minX, maxX, minZ, maxZ }] - house, barn, paddock/field
//   group        the THREE.Group holding this whole farm
//   colors       the farm's palette, including colors.family (its signpost /
//                name-board colour) - handy for trade panels later on
//   updateAnimals(dt)  bob the animals' heads; call once a frame

import * as THREE from 'three';
import { buildRoadSurface, buildSignpost, buildFenceRun } from './road.js';
import { makePerson } from './characters.js';

// ---------------------------------------------------------------------------
// THE FOUR FARMS, as plain data. No Three.js objects in here at all, so this
// array can be read by anything - a trade panel, a test, a map screen.
//
// center     the middle of the farm yard, in world numbers
// turn       quarter turns: 0 faces north (+Z), 1 east (+X), 2 south (-Z),
//            3 west (-X). A farm always faces the way its lane comes in.
// junction   where its lane leaves the main road (a point ON the road)
// lane       the lane's corners, from the junction to inside the farm yard
// ---------------------------------------------------------------------------
export const NEIGHBORS = [
  {
    id: 'corn',
    family: 'The Garcia farm',
    name: 'Mrs. Garcia',
    specialty: 'corn',
    // West of road corner 2 (-8, 80). A straight lane due west across the grass.
    center: { x: -58, z: 80 },
    turn: 1,                           // its front faces east, back up the lane
    junction: { x: -8, z: 80 },
    lane: [{ x: -8, z: 80 }, { x: -48, z: 80 }],
    colors: {
      family:    0xf9a825,  // golden yellow: the signpost board and name board
      houseWall: 0xfff3d6,
      houseRoof: 0xc0654a,
      door:      0x6d4c41,
      barnWall:  0xf4b731,  // golden-yellow barn...
      barnRoof:  0x2e7d32,  // ...with a green roof
      barnTrim:  0xfaf6ef,
      barnDoor:  0x8d6e43,
    },
    person: {
      height: 1.68,
      skin: 0xd9a066,
      shirt: 0xffd54f,
      trousers: 0x5d4037,
      apron: 0xc62828,
      hair: 0x2b1b12,
      hat: 0xdcc06a,
      hatStyle: 'sun',
    },
  },
  {
    id: 'dairy',
    family: 'The Miller farm',
    name: 'Mr. Miller',
    specialty: 'milk',
    // East of road corner 1 (0, 48), the nearest farm to home.
    center: { x: 50, z: 58 },
    turn: 3,                           // its front faces west, back up the lane
    junction: { x: 0, z: 48 },
    lane: [{ x: 0, z: 48 }, { x: 20, z: 53 }, { x: 40, z: 58 }],
    colors: {
      family:    0x1e88e5,  // bright blue
      houseWall: 0xeceff1,
      houseRoof: 0x37474f,
      door:      0x1e88e5,
      barnWall:  0xfafafa,  // white barn...
      barnRoof:  0x1e88e5,  // ...with a blue roof...
      barnTrim:  0x1e88e5,  // ...and blue trim round the door
      barnDoor:  0x90a4ae,
    },
    person: {
      height: 1.82,
      skin: 0xf0c49b,
      shirt: 0xfafafa,
      trousers: 0x1e88e5,
      overalls: true,
      hair: 0x8d6e63,
      hat: 0x263238,
      hatStyle: 'cap',
    },
  },
  {
    id: 'sheep',
    family: 'The Nguyen farm',
    name: 'Mr. Nguyen',
    specialty: 'wool',
    // North-west of road corner 4 (32, 136), out past the big bend.
    center: { x: -6, z: 170 },
    turn: 2,                           // its front faces south, back up the lane
    junction: { x: 32, z: 136 },
    lane: [{ x: 32, z: 136 }, { x: 10, z: 148 }, { x: -6, z: 160 }],
    colors: {
      family:    0x8aa06b,  // sage green
      houseWall: 0xf0ead6,
      houseRoof: 0x5d4037,
      door:      0x5d4037,
      barnWall:  0x9bb07a,  // sage-green barn...
      barnRoof:  0x37474f,  // ...with a dark roof
      barnTrim:  0xf0ead6,
      barnDoor:  0x6d5b45,
    },
    person: {
      height: 1.76,
      skin: 0xe8c39e,
      shirt: 0x37474f,
      trousers: 0x8aa06b,
      hair: 0x1a1a1a,
      hat: 0x546e7a,
      hatStyle: 'cap',
    },
  },
  {
    id: 'apple',
    family: 'The Okafor orchard',
    name: 'Mrs. Okafor',
    specialty: 'apples',
    // South of road corner 6 (110, 158), the furthest of the four.
    center: { x: 124, z: 116 },
    turn: 0,                           // its front faces north, back up the lane
    junction: { x: 110, z: 158 },
    lane: [{ x: 110, z: 158 }, { x: 118, z: 140 }, { x: 124, z: 126 }],
    colors: {
      family:    0xd32f2f,  // orchard red
      houseWall: 0xfff2cc,
      houseRoof: 0x8d4030,
      door:      0x6d4c41,
      barnWall:  0xd23b32,  // red barn...
      barnRoof:  0x7b3f2e,  // ...with a white X on the doors (below)
      barnTrim:  0xfaf6ef,
      barnDoor:  0xb03228,
    },
    person: {
      height: 1.7,
      skin: 0x8d5524,
      shirt: 0xd32f2f,
      trousers: 0x455a64,
      apron: 0xfaf6ef,
      hair: 0x241610,
      hat: 0xe8a33d,
      hatStyle: 'cap',
    },
  },
];

// ---------------------------------------------------------------------------
// The farm plan, in local numbers. Everything below is measured from the middle
// of the farm yard, with +Z pointing back down the lane towards the road.
// ---------------------------------------------------------------------------
const HOUSE_SPOT = { x: -9, z: -2 };    // the house sits on the left
const BARN_SPOT = { x: 8, z: -2 };      // the barn on the right
const PERSON_SPOT = { x: 2, z: 5 };     // the neighbour, out in the yard
const ANCHOR_SPOT = { x: 2, z: 7.5 };   // a step in front of them, well inside
                                        // TALK_RADIUS so standing here always
                                        // brings the "Talk to..." prompt up
const BOARD_SPOT = { x: 4, z: 11 };     // the name board, beside the lane
const FENCE_Z = 12;                     // the yard fence, with a gap for the lane
const LANE_HALF_GAP = 3;                // half the width of the gap in that fence

// The three no-go rectangles, in local numbers. Each is the building's real
// footprint with half a unit of breathing room added all round.
const HOUSE_BOX = { minX: -12.5, maxX: -5.5, minZ: -5.5, maxZ: 1.5 };
const BARN_BOX = { minX: 3.5, maxX: 12.5, minZ: -6, maxZ: 2 };
const FIELD_BOX = { minX: -11.5, maxX: 9.5, minZ: -19.5, maxZ: -7.5 };

// The paddock fence runs along the inside of FIELD_BOX.
const FIELD = { minX: -11, maxX: 9, minZ: -19, maxZ: -8 };

// How wide the farm lanes are. The main road is 5; a lane is narrower, so it
// reads as a side turning rather than a second highway.
const LANE_WIDTH = 3.5;
// How high above the grass a lane is painted. The main road is at 0.03, so a
// lane laid a little higher never flickers against it at the junction.
const LANE_Y = 0.045;

// How far round a neighbour nobody may walk, and how close you have to stand
// to talk to them. main.js uses both.
export const PERSON_BLOCK_RADIUS = 0.6;
export const TALK_RADIUS = 3.5;

// ---------------------------------------------------------------------------
// Shared materials and geometries. As everywhere else in this game there is ONE
// material per colour and one geometry per shape, reused by every mesh that
// needs it: that is what keeps a scene with four whole farms in it cheap.
// ---------------------------------------------------------------------------
const materials = {};
function mat(color) {
  if (!materials[color]) {
    materials[color] = new THREE.MeshLambertMaterial({ color });
  }
  return materials[color];
}

// THE SHADY-SIDE PROBLEM, and the same cheap fix road.js and market.js use.
//
// The sun in main.js comes from the north-west. Two of these four farms have
// their front doors pointing the other way, so their whole front face was in
// shadow - a cream farmhouse came out looking grey and unfriendly.
//
// "emissive" is a colour a material gives off by itself, on top of whatever
// light lands on it. Here it is the paint's OWN colour turned down to 17%,
// which reads as a wall in daylight rather than a glowing one, and it costs
// the graphics card nothing at all: no second light, no shadows, no extra
// passes. Walls, roofs, doors and the animals' woolly coats use it; grass,
// soil, fences and crops keep their ordinary paint, because they look better
// with real shading on them.
const LIT_FRACTION = 0.17;
const litMaterials = {};
function litMat(color) {
  if (!litMaterials[color]) {
    litMaterials[color] = new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: LIT_FRACTION,
    });
  }
  return litMaterials[color];
}

// Colours used by more than one farm.
const TRIM = 0xfaf6ef;       // white window / door trim
const WOOD = 0xa1887f;       // fence-and-signpost wood
const DARK_WOOD = 0x8d6e43;  // crates, cart beds, scarecrow poles
const SOIL = 0x8d6a45;       // bare earth in a ploughed field
const YARD_GRASS = 0x8bc34a; // the lighter grass of a farmyard
const PADDOCK_GRASS = 0x86b544;
const METAL = 0xcfd8dc;      // milk churns

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const unitBall = new THREE.SphereGeometry(1, 8, 6);
const unitTube = new THREE.CylinderGeometry(1, 1, 1, 8);
const houseRoofGeo = new THREE.ConeGeometry(4.6, 2.6, 4);
const stalkGeo = new THREE.CylinderGeometry(0.03, 0.095, 1, 4);   // 1 unit tall, scaled
const cobGeo = new THREE.CylinderGeometry(0.02, 0.07, 0.34, 4);
const cowLegGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
const sheepLegGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.9, 6);
const canopyGeo = new THREE.SphereGeometry(1.5, 8, 6);
const appleGeo = new THREE.SphereGeometry(0.16, 6, 5);
const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.14, 10);
const coneGeo = new THREE.ConeGeometry(0.4, 0.35, 8);

// A box mesh of any size at any spot, sharing the one unit box.
function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

// A ball of any size, sharing the one unit sphere.
function ball(rx, ry, rz, x, y, z, material) {
  const mesh = new THREE.Mesh(unitBall, material);
  mesh.scale.set(rx, ry, rz);
  mesh.position.set(x, y, z);
  return mesh;
}

// A cylinder of any size, sharing the one unit cylinder.
function tube(radius, height, x, y, z, material) {
  const mesh = new THREE.Mesh(unitTube, material);
  mesh.scale.set(radius, height, radius);
  mesh.position.set(x, y, z);
  return mesh;
}

// A flat patch of ground (grass, soil) lying on the field.
function patch(w, d, x, y, z, material) {
  const mesh = new THREE.Mesh(unitPlane, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(w, d, 1);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// ONE MESH, MANY COPIES.
//
// A field of sixty corn stalks drawn as sixty separate meshes would be sixty
// jobs for the graphics card. THREE.InstancedMesh draws all sixty in ONE job:
// you give it the shape, the colour and a list of places to put a copy, and it
// stamps the shape out at each one. To the rest of the game it looks like a
// single mesh, which is exactly what we want.
//
// Each spot is { x, y, z, ry, s, sy }: where to put it, how far to turn it
// round, and how much to scale it (sy scales the height on its own, so corn
// stalks can be different heights without getting fatter).
// ---------------------------------------------------------------------------
const stamp = new THREE.Object3D();   // a scratch object for working out matrices

function instanced(geometry, material, spots) {
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  spots.forEach((spot, i) => {
    stamp.position.set(spot.x, spot.y, spot.z);
    stamp.rotation.set(0, spot.ry ?? 0, 0);
    const s = spot.s ?? 1;
    stamp.scale.set(s, spot.sy ?? s, s);
    stamp.updateMatrix();
    mesh.setMatrixAt(i, stamp.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  // Work out the bubble that holds every copy, so the whole field is hidden
  // properly when the player is looking the other way.
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------------------------------------------------------------------------
// A tiny "random" number generator that always gives the SAME sequence, so the
// farms look identical every time the page is loaded. (road.js uses the same
// trick for its roadside trees.)
// ---------------------------------------------------------------------------
let seed = 776619;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

// ---------------------------------------------------------------------------
// QUARTER TURNS.
//
// turn 0 = no turn (the farm faces +Z), 1 = a quarter turn (faces +X),
// 2 = a half turn (faces -Z), 3 = three quarters (faces -X).
//
// Turning a point (x, z) around the farm centre by angle a gives
//   (x*cos(a) + z*sin(a),  -x*sin(a) + z*cos(a))
// which for quarter turns is just swapping and flipping - no wonky decimals.
// ---------------------------------------------------------------------------
const QUARTERS = [
  { cos: 1, sin: 0 },
  { cos: 0, sin: 1 },
  { cos: -1, sin: 0 },
  { cos: 0, sin: -1 },
];

function localToWorld(spec, x, z) {
  const q = QUARTERS[spec.turn];
  return {
    x: spec.center.x + x * q.cos + z * q.sin,
    z: spec.center.z - x * q.sin + z * q.cos,
  };
}

// The same for a rectangle. A quarter turn keeps a rectangle lined up with the
// world, so turning two opposite corners and sorting the numbers is enough.
function localBoxToWorld(spec, b) {
  const a = localToWorld(spec, b.minX, b.minZ);
  const c = localToWorld(spec, b.maxX, b.maxZ);
  return {
    minX: Math.min(a.x, c.x),
    maxX: Math.max(a.x, c.x),
    minZ: Math.min(a.z, c.z),
    maxZ: Math.max(a.z, c.z),
  };
}

// ---------------------------------------------------------------------------
// THE HOUSE - the same shape as the ranch house in world.js (box walls, a
// pyramid roof, a door, two windows and a chimney), painted in this family's
// own colours so no two farms look alike.
// ---------------------------------------------------------------------------
function buildFarmHouse(colors) {
  const house = new THREE.Group();
  house.name = 'farmHouse';

  house.add(box(6, 5, 6, 0, 2.5, 0, litMat(colors.houseWall)));

  const roof = new THREE.Mesh(houseRoofGeo, litMat(colors.houseRoof));
  roof.position.y = 6.3;
  roof.rotation.y = Math.PI / 4;   // line the pyramid's flat sides up with the walls
  house.add(roof);

  // The front faces +Z, which is the way the lane comes in.
  house.add(box(1.2, 2.2, 0.15, 0, 1.1, 3.02, litMat(colors.door)));
  house.add(box(1.1, 1.1, 0.12, -1.7, 3.1, 3.02, litMat(TRIM)));
  house.add(box(1.1, 1.1, 0.12, 1.7, 3.1, 3.02, litMat(TRIM)));
  house.add(box(0.8, 1.6, 0.8, -1.6, 5.9, -1.2, litMat(colors.houseRoof)));

  return house;
}

// ---------------------------------------------------------------------------
// THE BARN - 8 wide, about 6 tall and 7 deep, with a two-slab gambrel roof like
// the ranch barn. Each family paints it differently, and two of them get an
// extra flourish: the Millers' blue door posts and the Okafors' white X.
// ---------------------------------------------------------------------------
function buildFarmBarn(id, colors) {
  const barn = new THREE.Group();
  barn.name = 'farmBarn';

  const wall = litMat(colors.barnWall);
  const roof = litMat(colors.barnRoof);
  const trim = litMat(colors.barnTrim);

  barn.add(box(8, 4.2, 7, 0, 2.1, 0, wall));        // body
  barn.add(box(8.6, 1.2, 7.4, 0, 4.8, 0, roof));    // lower roof slab
  barn.add(box(5.8, 1.0, 7.4, 0, 5.9, 0, roof));    // upper roof slab

  // The big door on the front (+Z) face, which is at z = 3.5.
  barn.add(box(3.6, 3.3, 0.12, 0, 1.65, 3.52, trim));
  barn.add(box(3.0, 2.9, 0.1, 0, 1.45, 3.6, litMat(colors.barnDoor)));
  barn.add(box(1.1, 0.8, 0.1, 0, 3.6, 3.56, trim));  // hayloft window

  if (id === 'dairy') {
    // A blue post each side of the door: the Millers' barn is white with blue
    // everywhere else, and this is what makes that read from a distance.
    barn.add(box(0.28, 3.3, 0.12, -2.05, 1.65, 3.54, trim));
    barn.add(box(0.28, 3.3, 0.12, 2.05, 1.65, 3.54, trim));
  }

  if (id === 'apple') {
    // A white X across the doors, the classic orchard barn.
    for (const lean of [0.77, -0.77]) {
      const bar = box(4.0, 0.22, 0.08, 0, 1.45, 3.66, litMat(TRIM));
      bar.rotation.z = lean;
      barn.add(bar);
    }
  }

  return barn;
}

// ---------------------------------------------------------------------------
// THE NAME BOARD by the lane - a post with a board in the family's colour and
// a pale plate across it. No writing: the colour and the signpost icon at the
// junction are what tell the farms apart.
// ---------------------------------------------------------------------------
function buildNameBoard(colors) {
  const board = new THREE.Group();
  board.name = 'nameBoard';
  board.add(box(0.16, 1.6, 0.16, 0, 0.8, 0, mat(WOOD)));
  board.add(box(1.7, 0.75, 0.12, 0, 1.75, 0, litMat(colors.family)));
  board.add(box(1.3, 0.22, 0.06, 0, 1.75, 0.1, litMat(TRIM)));
  return board;
}

// ---------------------------------------------------------------------------
// THE SIGNPOST ICON - a little model on top of the post at the junction, so an
// eight-year-old can tell the lanes apart without reading a word: a corn cob, a
// milk churn, a sheep or an apple.
// ---------------------------------------------------------------------------
function buildSignIcon(id) {
  const icon = new THREE.Group();
  icon.name = `signIcon-${id}`;

  if (id === 'corn') {
    icon.add(tube(0.13, 0.52, 0, 0.26, 0, mat(0xfdd835)));           // the cob
    const leaf = new THREE.Mesh(coneGeo, mat(0x2e7d32));             // its husk
    leaf.scale.set(0.55, 0.9, 0.55);
    leaf.position.y = 0.66;
    icon.add(leaf);
  } else if (id === 'dairy') {
    icon.add(tube(0.17, 0.46, 0, 0.23, 0, mat(METAL)));              // the churn
    icon.add(tube(0.1, 0.12, 0, 0.52, 0, mat(0x1e88e5)));            // its lid
  } else if (id === 'sheep') {
    icon.add(ball(0.24, 0.2, 0.3, 0, 0.3, 0, mat(0xf7f5ef)));        // fluffy body
    icon.add(ball(0.12, 0.12, 0.12, 0, 0.36, 0.3, mat(0x3e3a35)));   // dark face
  } else {
    icon.add(ball(0.22, 0.21, 0.22, 0, 0.28, 0, mat(0xd32f2f)));     // the apple
    icon.add(box(0.05, 0.18, 0.05, 0, 0.53, 0, mat(0x5d4037)));      // its stalk
  }

  icon.position.y = 2.4;   // sitting on top of the 2.3-unit signpost
  return icon;
}

// ---------------------------------------------------------------------------
// THE CORN FIELD - five rows of stalks, all drawn in two jobs thanks to
// InstancedMesh, plus a scarecrow keeping an eye on them.
// ---------------------------------------------------------------------------
function buildCornField(farm) {
  const field = new THREE.Group();
  field.name = 'cornField';

  // The ploughed earth the rows stand in.
  field.add(patch(21, 12, -1, 0.025, -13.5, mat(SOIL)));

  const stalks = [];
  const cobs = [];
  const rows = [-9.5, -11.8, -14.1, -16.4, -18.7];
  for (const rowZ of rows) {
    for (let i = 0; i < 13; i++) {
      const x = -10 + i * 1.55;
      const z = rowZ + (rand() - 0.5) * 0.5;
      const height = 1.5 + rand() * 0.5;
      stalks.push({ x, y: height / 2, z, sy: height, ry: rand() * 3 });
      cobs.push({ x, y: height + 0.1, z, ry: rand() * 3 });
    }
  }
  field.add(instanced(stalkGeo, mat(0x4f9a3a), stalks));   // 65 green stalks, one job
  field.add(instanced(cobGeo, mat(0xf6d53c), cobs));       // 65 yellow tips, one job

  // The scarecrow: a post, a crossbar, a red shirt, a straw head and a hat.
  const crow = new THREE.Group();
  crow.add(box(0.14, 2.3, 0.14, 0, 1.15, 0, mat(DARK_WOOD)));
  crow.add(box(1.9, 0.12, 0.12, 0, 1.78, 0, mat(DARK_WOOD)));
  crow.add(box(0.85, 1.0, 0.35, 0, 1.45, 0.06, mat(0xc62828)));
  crow.add(ball(0.2, 0.2, 0.2, 0, 2.12, 0, mat(0xdcc06a)));
  const hat = new THREE.Mesh(coneGeo, mat(0x6d4c41));
  hat.position.y = 2.42;
  crow.add(hat);
  crow.position.set(-1.5, 0, -13.2);
  crow.rotation.y = 0.2;
  field.add(crow);

  farm.animals = [];   // a corn field has nothing to bob its head
  return field;
}

// ---------------------------------------------------------------------------
// A FENCED PADDOCK - the grass patch and a fence right round it. Used by the
// dairy farm and the sheep farm. Posts stand 5 units apart out here: a long
// farm fence with a post every 4 units would cost far more meshes than it is
// worth at this distance.
// ---------------------------------------------------------------------------
function buildPaddock(group) {
  group.add(patch(
    FIELD.maxX - FIELD.minX, FIELD.maxZ - FIELD.minZ,
    (FIELD.minX + FIELD.maxX) / 2, 0.022, (FIELD.minZ + FIELD.maxZ) / 2,
    mat(PADDOCK_GRASS)
  ));
  group.add(buildFenceRun(FIELD.minX, FIELD.minZ, FIELD.maxX, FIELD.minZ, 5));
  group.add(buildFenceRun(FIELD.minX, FIELD.maxZ, FIELD.maxX, FIELD.maxZ, 5));
  group.add(buildFenceRun(FIELD.minX, FIELD.minZ, FIELD.minX, FIELD.maxZ, 5));
  group.add(buildFenceRun(FIELD.maxX, FIELD.minZ, FIELD.maxX, FIELD.maxZ, 5));
}

// ---------------------------------------------------------------------------
// THE DAIRY FARM'S COWS - four black-and-white cows in the paddock, and two
// milk churns waiting by the barn door.
//
// Every cow's four legs go into ONE instanced mesh shared by the whole herd,
// because legs never move. The body, the patch and the head are ordinary
// meshes, so the head can bob.
// ---------------------------------------------------------------------------
const COW_SPOTS = [
  { x: -6.5, z: -11.5, ry: 0.5 },
  { x: -0.5, z: -15.5, ry: 2.2 },
  { x: 4.5, z: -10.5, ry: -0.9 },
  { x: 5.5, z: -16.5, ry: 1.4 },
];

function buildCows(farm, group) {
  const white = litMat(0xfafafa);
  const black = mat(0x2f2a26);
  const legSpots = [];

  for (const spot of COW_SPOTS) {
    const cow = new THREE.Group();
    cow.add(box(1.15, 1.1, 2.2, 0, 1.28, 0, white));        // body
    cow.add(box(0.75, 0.6, 0.95, 0.24, 1.5, -0.2, black));  // a big black patch
    const head = box(0.66, 0.66, 0.8, 0, 1.5, 1.42, black);
    cow.add(head);
    cow.position.set(spot.x, 0, spot.z);
    cow.rotation.y = spot.ry;
    group.add(cow);

    // The four legs, turned with the cow and dropped into the shared list.
    const c = Math.cos(spot.ry);
    const s = Math.sin(spot.ry);
    for (const [lx, lz] of [[-0.4, 0.75], [0.4, 0.75], [-0.4, -0.75], [0.4, -0.75]]) {
      legSpots.push({
        x: spot.x + lx * c + lz * s,
        y: 0.375,
        z: spot.z - lx * s + lz * c,
        ry: spot.ry,
      });
    }

    farm.animals.push({ group: cow, head, baseY: head.position.y, phase: rand() * 6 });
  }

  group.add(instanced(cowLegGeo, black, legSpots));   // 16 legs, one job

  // Two milk churns standing just outside the barn door.
  for (const [cx, cz] of [[5.2, 2.6], [6.1, 2.9]]) {
    group.add(tube(0.24, 0.8, cx, 0.4, cz, litMat(METAL)));
    group.add(tube(0.15, 0.14, cx, 0.86, cz, litMat(0x1e88e5)));
  }
}

// ---------------------------------------------------------------------------
// THE SHEEP FARM'S FLOCK - five fluffy sheep in the paddock (a white blob body
// with a dark face and dark legs), plus a little wool cart and some bales.
// ---------------------------------------------------------------------------
const SHEEP_SPOTS = [
  { x: -7.5, z: -10.5, ry: 0.4 },
  { x: -3.5, z: -14, ry: 2.6 },
  { x: 1, z: -10.8, ry: -1.1 },
  { x: 4.5, z: -15.5, ry: 1.7 },
  { x: 6.5, z: -11, ry: -2.4 },
];

function buildSheep(farm, group) {
  const wool = litMat(0xf7f5ef);
  const face = mat(0x3e3a35);
  const legSpots = [];

  for (const spot of SHEEP_SPOTS) {
    const sheep = new THREE.Group();
    sheep.add(ball(0.55, 0.45, 0.7, 0, 0.8, 0, wool));      // the fluffy body
    const head = ball(0.2, 0.2, 0.22, 0, 0.88, 0.66, face); // the dark face
    sheep.add(head);
    sheep.position.set(spot.x, 0, spot.z);
    sheep.rotation.y = spot.ry;
    group.add(sheep);

    const c = Math.cos(spot.ry);
    const s = Math.sin(spot.ry);
    for (const [lx, lz] of [[-0.26, 0.32], [0.26, 0.32], [-0.26, -0.32], [0.26, -0.32]]) {
      legSpots.push({
        x: spot.x + lx * c + lz * s,
        y: 0.25,
        z: spot.z - lx * s + lz * c,
        ry: spot.ry,
      });
    }

    farm.animals.push({ group: sheep, head, baseY: head.position.y, phase: rand() * 6 });
  }

  group.add(instanced(sheepLegGeo, face, legSpots));   // 20 legs, one job

  // The wool cart, parked by the barn: a plank bed on two wheels with a handle.
  const cart = new THREE.Group();
  cart.add(box(1.9, 0.3, 1.1, 0, 0.62, 0, mat(DARK_WOOD)));
  for (const wx of [-0.75, 0.75]) {
    const wheel = new THREE.Mesh(wheelGeo, mat(0x6d4c41));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, 0.62);
    cart.add(wheel);
  }
  cart.add(box(0.12, 0.12, 1.2, 0, 0.7, -1.05, mat(DARK_WOOD)));
  cart.add(ball(0.55, 0.42, 0.42, 0, 1.0, 0, litMat(0xf7f5ef)));   // a load of wool
  cart.position.set(4.6, 0, 4.2);
  cart.rotation.y = -0.5;
  group.add(cart);

  // Two woolsacks dropped on the grass beside it.
  group.add(ball(0.5, 0.42, 0.5, 6.8, 0.42, 3.2, litMat(0xefece2)));
  group.add(ball(0.45, 0.38, 0.45, 7.6, 0.38, 4.1, litMat(0xf7f5ef)));
}

// ---------------------------------------------------------------------------
// THE ORCHARD - a 3 x 4 grid of round apple trees with little red apples in
// them, and two crates of picked fruit by the barn.
//
// The whole orchard is three jobs for the graphics card: one for every trunk,
// one for every canopy, one for every apple.
// ---------------------------------------------------------------------------
function buildOrchard(farm) {
  const orchard = new THREE.Group();
  orchard.name = 'orchard';

  orchard.add(patch(21, 12, -1, 0.022, -13.5, mat(0x7fae3f)));

  const trunks = [];
  const canopies = [];
  const apples = [];
  const columns = [-9, -3.3, 2.4, 8];
  const rows = [-9.8, -13.5, -17.5];

  for (const cx of columns) {
    for (const rz of rows) {
      const size = 0.82 + rand() * 0.25;
      trunks.push({ x: cx, y: 0.95 * size, z: rz, s: size });
      canopies.push({ x: cx, y: 2.55 * size, z: rz, s: size, ry: rand() * 3 });
      // Four apples hanging round the outside of each canopy.
      for (let a = 0; a < 4; a++) {
        const angle = (a / 4) * Math.PI * 2 + rand();
        apples.push({
          x: cx + Math.sin(angle) * 1.25 * size,
          y: (2.35 + rand() * 0.5) * size,
          z: rz + Math.cos(angle) * 1.25 * size,
        });
      }
    }
  }

  orchard.add(instanced(trunkGeo, mat(0x795548), trunks));      // 12 trunks, one job
  orchard.add(instanced(canopyGeo, mat(0x4f9a3a), canopies));   // 12 canopies, one job
  orchard.add(instanced(appleGeo, mat(0xd32f2f), apples));      // 48 apples, one job

  // Two crates of picked apples by the barn door.
  for (const [cx, cz] of [[5.2, 3.2], [6.6, 3.6]]) {
    orchard.add(box(0.95, 0.7, 0.95, cx, 0.35, cz, mat(DARK_WOOD)));
    orchard.add(box(1.05, 0.14, 1.05, cx, 0.74, cz, mat(0xd32f2f)));
  }

  farm.animals = [];   // an orchard has nothing to bob its head
  return orchard;
}

// ---------------------------------------------------------------------------
// ONE WHOLE FARM.
// ---------------------------------------------------------------------------
function buildFarm(spec) {
  const group = new THREE.Group();
  group.name = `farm-${spec.id}`;
  group.position.set(spec.center.x, 0, spec.center.z);
  group.rotation.y = spec.turn * (Math.PI / 2);

  const colors = spec.colors;

  // The farmyard: a lighter patch of grass round the buildings.
  group.add(patch(30, 34, 0, 0.02, -3, mat(YARD_GRASS)));

  // The house and the barn, facing the lane.
  const house = buildFarmHouse(colors);
  house.position.set(HOUSE_SPOT.x, 0, HOUSE_SPOT.z);
  group.add(house);

  const barn = buildFarmBarn(spec.id, colors);
  barn.position.set(BARN_SPOT.x, 0, BARN_SPOT.z);
  group.add(barn);

  // A short fence across the front of the yard, with a gap for the lane.
  group.add(buildFenceRun(-13, FENCE_Z, -LANE_HALF_GAP, FENCE_Z, 5));
  group.add(buildFenceRun(LANE_HALF_GAP, FENCE_Z, 13, FENCE_Z, 5));

  // The name board beside the lane, in the family's colour.
  const nameBoard = buildNameBoard(colors);
  nameBoard.position.set(BOARD_SPOT.x, 0, BOARD_SPOT.z);
  nameBoard.rotation.y = -0.35;   // turned a little towards whoever walks up
  group.add(nameBoard);

  // The farm object we are filling in. The scenery builders below push their
  // head-bobbing animals into farm.animals.
  const farm = {
    id: spec.id,
    name: spec.name,
    family: spec.family,
    specialty: spec.specialty,
    position: { x: spec.center.x, z: spec.center.z },
    junction: { x: spec.junction.x, z: spec.junction.z },
    lane: spec.lane.map((point) => ({ x: point.x, z: point.z })),
    colors,
    group,
    animals: [],
  };

  // The specialty: what this family actually farms.
  if (spec.id === 'corn') {
    group.add(buildCornField(farm));
  } else if (spec.id === 'apple') {
    group.add(buildOrchard(farm));
  } else {
    const paddock = new THREE.Group();
    paddock.name = 'paddock';
    buildPaddock(paddock);
    if (spec.id === 'dairy') buildCows(farm, paddock);
    else buildSheep(farm, paddock);
    group.add(paddock);
  }

  // The neighbour, standing in the yard facing back down the lane.
  const person = makePerson({ ...spec.person, name: spec.id });
  person.position.set(PERSON_SPOT.x, 0, PERSON_SPOT.z);
  group.add(person);
  farm.person = person;

  // A "stand here to talk" spot, a step in front of them. Nothing to draw:
  // it is just a position, like the barn door marker in main.js.
  const anchor = new THREE.Object3D();
  anchor.name = `farmAnchor-${spec.id}`;
  anchor.position.set(ANCHOR_SPOT.x, 0, ANCHOR_SPOT.z);
  group.add(anchor);
  farm.anchor = anchor;

  // The three rectangles nobody may walk into, turned into world numbers.
  farm.blockBoxes = [
    localBoxToWorld(spec, HOUSE_BOX),
    localBoxToWorld(spec, BARN_BOX),
    localBoxToWorld(spec, FIELD_BOX),
  ];

  // Bob every animal's head, very gently, so the paddock looks alive without
  // anything actually wandering off.
  const animals = farm.animals;
  let clock = 0;
  farm.updateAnimals = (dt) => {
    clock += Math.min(dt ?? 0, 0.1);
    for (const animal of animals) {
      animal.head.position.y = animal.baseY + Math.sin(clock * 1.3 + animal.phase) * 0.045;
    }
  };

  return farm;
}

// ---------------------------------------------------------------------------
// THE LANE AND ITS SIGNPOST.
//
// The lane is paved with the very same slabs as the main road (road.js's
// buildRoadSurface), only 3.5 units wide instead of 5.
//
// The signpost stands a few steps down the lane and off to one side, so it is
// clear of BOTH the main road and the lane itself. Its board and arrow tip are
// painted in the family's colour, and a little model of what the farm produces
// sits on top of the post.
// ---------------------------------------------------------------------------
function buildLane(spec) {
  const group = new THREE.Group();
  group.name = `lane-${spec.id}`;

  const lane = buildRoadSurface(spec.lane, LANE_WIDTH, LANE_Y);
  lane.name = `laneSurface-${spec.id}`;
  group.add(lane);

  // Which way the lane sets off from the junction.
  const a = spec.lane[0];
  const b = spec.lane[1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const dirX = dx / length;
  const dirZ = dz / length;
  // "Sideways" is that direction turned a quarter turn.
  const sideX = dirZ;
  const sideZ = -dirX;

  // Five steps down the lane and three and a half to the side: clear of the
  // 5-wide road behind it and of the 3.5-wide lane beside it.
  const signpost = buildSignpost(
    a.x + dirX * 5 + sideX * 3.5,
    a.z + dirZ * 5 + sideZ * 3.5,
    Math.atan2(dx, dz),                 // the arrow points down the lane
    mat(spec.colors.family)             // the board wears the family's colour
    // ...and the arrow tip keeps road.js's orange, so every signpost in the
    // game still has the same "follow the point" arrowhead.
  );
  signpost.name = `signpost-${spec.id}`;
  signpost.add(buildSignIcon(spec.id));
  group.add(signpost);

  return { group, signpost };
}

// ---------------------------------------------------------------------------
// buildNeighbors - the one function main.js calls.
// ---------------------------------------------------------------------------
export function buildNeighbors(scene) {
  // Start the make-believe randomness from the same place every time, so the
  // corn rows and the apples land in exactly the same spots on every load.
  seed = 776619;

  const group = new THREE.Group();
  group.name = 'neighbors';

  const farms = NEIGHBORS.map((spec) => {
    const farm = buildFarm(spec);
    const lane = buildLane(spec);
    farm.signpost = lane.signpost;
    group.add(lane.group);
    group.add(farm.group);
    return farm;
  });

  if (scene) scene.add(group);

  return { farms, group };
}
