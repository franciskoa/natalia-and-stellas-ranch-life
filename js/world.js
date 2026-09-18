// world.js - builds the ranch scenery: ground, house, barn, horse, fence, trees.
//
// Everything is made from simple Three.js shapes (boxes, cylinders, cones) with
// flat colours, so it stays low-poly and runs fast on a normal laptop.
//
// Call buildWorld(scene) once from main.js. It returns the important objects so
// other modules (player, camera, interactions) can find them later.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Colours - all in one place so they are easy to tweak.
// ---------------------------------------------------------------------------
const COLORS = {
  grass:      0x7cb342, // main field green
  yard:       0x8bc34a, // slightly lighter green near the buildings
  dirt:       0xc2a26a, // tan path
  houseWall:  0xfff2cc, // warm cream
  houseRoof:  0xb5533c, // terracotta red
  barnWall:   0xc0392b, // classic barn red
  barnRoof:   0x7b3f2e, // dark brown
  trim:       0xfaf6ef, // white-ish trim / window glass
  door:       0x6d4c41, // brown door
  wood:       0xa1887f, // fence wood
  trunk:      0x795548, // tree trunk
  leaves:     0x4caf50, // tree canopy
  leaves2:    0x66bb6a, // second canopy green for variety
  horseCoat:  0x9c6b3a, // chestnut brown
  horseDark:  0x3e2723, // mane, tail, hooves
  water:      0x4fc3f7, // trough water
  hay:        0xdcc06a, // hay bales
};

// One material per colour, reused by every mesh that needs it.
// Sharing materials keeps the game light on the graphics card.
const M = {};
for (const key of Object.keys(COLORS)) {
  M[key] = new THREE.MeshLambertMaterial({ color: COLORS[key] });
}

// ---------------------------------------------------------------------------
// Tiny helper: make a box mesh at a position. Keeps the code below short.
// ---------------------------------------------------------------------------
function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// GROUND - a big flat plane plus a lighter "yard" patch and a dirt path.
// ---------------------------------------------------------------------------
function buildGround(scene) {
  // A plane is created standing up, so we tip it flat with a -90 degree turn.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.name = 'ground';
  scene.add(ground);

  // Lighter grass square around the buildings, lifted a hair so it does not
  // flicker against the ground underneath it.
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(38, 30), M.yard);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(0, 0.01, 1);
  scene.add(yard);

  // Dirt path running from the house door across to the barn door.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(27, 3.2), M.dirt);
  path.rotation.x = -Math.PI / 2;
  path.position.set(1, 0.02, -5.5);
  scene.add(path);

  return ground;
}

// ---------------------------------------------------------------------------
// HOUSE - box walls, pyramid roof, a door, two windows and a chimney.
// Built around (0,0,0) inside its own group, then the group is moved into place.
// ---------------------------------------------------------------------------
function buildHouse(x, z) {
  const house = new THREE.Group();
  house.name = 'house';

  // Walls: 6 wide, 5 tall, 6 deep. Sitting on the ground, so centre is y = 2.5.
  house.add(box(6, 5, 6, 0, 2.5, 0, M.houseWall));

  // Roof: a cone with only 4 sides is a pyramid. Turning it 45 degrees lines
  // its flat sides up with the walls.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 4), M.houseRoof);
  roof.position.y = 6.3;
  roof.rotation.y = Math.PI / 4;
  house.add(roof);

  // The front of the house faces +Z (towards the yard and the camera).
  house.add(box(1.2, 2.2, 0.15, 0, 1.1, 3.02, M.door));        // door
  house.add(box(1.1, 1.1, 0.12, -1.7, 3.1, 3.02, M.trim));     // left window
  house.add(box(1.1, 1.1, 0.12, 1.7, 3.1, 3.02, M.trim));      // right window
  house.add(box(0.8, 1.6, 0.8, -1.6, 5.9, -1.2, M.houseRoof)); // chimney

  house.position.set(x, 0, z);
  house.userData = { kind: 'house' };
  return house;
}

// ---------------------------------------------------------------------------
// BARN - red box body, two stacked roof boxes for a gambrel look, and a big
// white-trimmed door on the front facing the yard.
// ---------------------------------------------------------------------------
function buildBarn(x, z) {
  const barn = new THREE.Group();
  barn.name = 'barn';

  // Body: 10 wide, 4.6 tall, 8 deep.
  barn.add(box(10, 4.6, 8, 0, 2.3, 0, M.barnWall));

  // Roof in two slabs, the top one narrower, which reads as a gambrel roof.
  barn.add(box(10.6, 1.4, 8.4, 0, 5.3, 0, M.barnRoof));
  barn.add(box(7.4, 1.2, 8.4, 0, 6.6, 0, M.barnRoof));

  // The front face is at z = +4, so the door sits just in front of it.
  barn.add(box(4.6, 3.8, 0.12, 0, 1.9, 4.02, M.trim)); // white trim
  barn.add(box(3.9, 3.2, 0.1, 0, 1.6, 4.1, M.door));   // door itself
  barn.add(box(1.3, 1.0, 0.1, 0, 4.2, 4.06, M.trim));  // little hayloft window

  barn.position.set(x, 0, z);
  barn.userData = { kind: 'barn' };
  return barn;
}

// ---------------------------------------------------------------------------
// HORSE - all boxes. The group origin is on the ground between its hooves,
// so horse.position.set(x, 0, z) always puts the feet flat on the grass.
// ---------------------------------------------------------------------------
function buildHorse(x, z) {
  const horse = new THREE.Group();
  horse.name = 'horse';

  // Four legs with darker hooves. Front legs at z = +0.7, back legs at z = -0.7.
  for (const sx of [-0.33, 0.33]) {
    for (const sz of [0.7, -0.7]) {
      horse.add(box(0.22, 1.0, 0.22, sx, 0.75, sz, M.horseCoat)); // leg
      horse.add(box(0.28, 0.26, 0.3, sx, 0.13, sz, M.horseDark)); // hoof
    }
  }

  // Barrel of the body, long in the Z direction.
  horse.add(box(0.9, 0.85, 2.1, 0, 1.6, 0, M.horseCoat));

  // Neck: a box tilted forward so it rises towards the head.
  const neck = box(0.55, 1.0, 0.55, 0, 2.05, 0.85, M.horseCoat);
  neck.rotation.x = 0.45;
  horse.add(neck);

  // Mane: a thin dark slab lying along the back of the neck.
  const mane = box(0.14, 1.05, 0.2, 0, 2.05, 0.6, M.horseDark);
  mane.rotation.x = 0.45;
  horse.add(mane);

  // Head, tipped slightly nose-down.
  const head = box(0.45, 0.45, 0.95, 0, 2.62, 1.25, M.horseCoat);
  head.rotation.x = 0.35;
  horse.add(head);

  // Two small ears on top of the head.
  horse.add(box(0.12, 0.24, 0.12, -0.14, 2.92, 1.02, M.horseCoat));
  horse.add(box(0.12, 0.24, 0.12, 0.14, 2.92, 1.02, M.horseCoat));

  // Tail hanging off the back.
  const tail = box(0.18, 0.8, 0.18, 0, 1.75, -1.1, M.horseDark);
  tail.rotation.x = 0.35;
  horse.add(tail);

  horse.position.set(x, 0, z);
  horse.rotation.y = -0.35; // turned a little so it looks towards the camera
  horse.userData = { kind: 'horse' };
  return horse;
}

// ---------------------------------------------------------------------------
// FENCE - posts plus two long rails. One "run" is one straight stretch,
// described by where it starts and where it ends on the ground.
// ---------------------------------------------------------------------------
const postGeo = new THREE.BoxGeometry(0.22, 1.3, 0.22); // shared by every post

function buildFenceRun(x1, z1, x2, z2) {
  const run = new THREE.Group();
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz); // how far this run is turned around Y

  // Posts roughly every 4 metres, always including both ends.
  const count = Math.max(2, Math.round(length / 4) + 1);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const post = new THREE.Mesh(postGeo, M.wood);
    post.position.set(x1 + dx * t, 0.65, z1 + dz * t);
    run.add(post);
  }

  // Two rails: single long boxes turned to follow the run.
  const railGeo = new THREE.BoxGeometry(0.1, 0.16, length);
  for (const y of [0.5, 1.0]) {
    const rail = new THREE.Mesh(railGeo, M.wood);
    rail.position.set(x1 + dx / 2, y, z1 + dz / 2);
    rail.rotation.y = angle;
    run.add(rail);
  }

  return run;
}

function buildFence() {
  const fence = new THREE.Group();
  fence.name = 'fence';
  // Left side, right side, and the front split in two so there is a gap in the
  // middle (x = -4 to +4) that the player can walk through.
  fence.add(buildFenceRun(-20, -12, -20, 14)); // left side
  fence.add(buildFenceRun(20, -12, 20, 14));   // right side
  fence.add(buildFenceRun(-20, 14, -4, 14));   // front, left of the gap
  fence.add(buildFenceRun(4, 14, 20, 14));     // front, right of the gap
  return fence;
}

// ---------------------------------------------------------------------------
// TREES - a cylinder trunk with either a cone or a round canopy.
// The geometries are made once here and shared by every tree.
// ---------------------------------------------------------------------------
const trunkGeo = new THREE.CylinderGeometry(0.28, 0.38, 2.6, 6);
const coneGeo = new THREE.ConeGeometry(1.9, 4.2, 7);
const blobGeo = new THREE.SphereGeometry(1.8, 7, 5);

function buildTree(x, z, round, scale) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeo, M.trunk);
  trunk.position.y = 1.3;
  tree.add(trunk);

  const canopy = round
    ? new THREE.Mesh(blobGeo, M.leaves2)
    : new THREE.Mesh(coneGeo, M.leaves);
  canopy.position.y = round ? 3.9 : 4.6;
  tree.add(canopy);

  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  return tree;
}

function buildTrees() {
  const trees = new THREE.Group();
  trees.name = 'trees';

  // Scattered outside the fenced yard so they never block the walking area.
  const spots = [
    [-30, 10], [-26, -18], [-35, -4], [-40, 16],
    [28, 14], [33, -6], [26, -24], [38, 20],
    [-10, 26], [12, 28], [-20, -28], [6, -30],
  ];

  spots.forEach(([x, z], i) => {
    trees.add(buildTree(x, z, i % 3 === 0, 0.85 + (i % 4) * 0.12));
  });

  return trees;
}

// ---------------------------------------------------------------------------
// Small props for charm and a sense of scale: a water trough and hay bales.
// ---------------------------------------------------------------------------
function buildProps() {
  const props = new THREE.Group();
  props.name = 'props';

  // Water trough between the yard and the barn.
  props.add(box(1.2, 0.6, 2.4, 11, 0.3, -1, M.wood));
  props.add(box(1.0, 0.1, 2.2, 11, 0.58, -1, M.water));

  // Three hay bales lying on their sides beside the barn.
  const baleGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8);
  const balePositions = [[17.5, -2.5], [18.6, -2.2], [18.0, -1.2]];
  for (const [bx, bz] of balePositions) {
    const bale = new THREE.Mesh(baleGeo, M.hay);
    bale.position.set(bx, 0.55, bz);
    bale.rotation.z = Math.PI / 2; // tip it over so it rolls like a hay bale
    props.add(bale);
  }

  return props;
}

// ---------------------------------------------------------------------------
// buildWorld - the one function main.js calls.
// Returns the pieces other modules will want to look at later.
// ---------------------------------------------------------------------------
export function buildWorld(scene) {
  const ground = buildGround(scene);

  const house = buildHouse(-12, -8);
  const barn = buildBarn(14, -10);
  const horse = buildHorse(6, 4);

  scene.add(house);
  scene.add(barn);
  scene.add(horse);
  scene.add(buildFence());
  scene.add(buildTrees());
  scene.add(buildProps());

  // How far the player is allowed to wander. The next agent can clamp
  // the player position to these numbers so she never walks off the ground.
  const bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };

  return { ground, house, barn, horse, bounds };
}
