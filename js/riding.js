// riding.js - climbing onto a horse and getting down again.
//
// The trick is simple: while Natalia is riding she stops being her own object
// in the scene and becomes a CHILD of the horse. Anything a parent does, its
// children do too, so the horse carries her along for free - we never have to
// copy its position onto her every frame.
//
// Meanwhile controls.js is told to drive the horse instead of Natalia (it is
// faster, turns more lazily, and wants a camera further back and higher up),
// and interact.js is told to measure distances from the horse, so the horse she
// is sitting on is always the thing E acts on and E gets her down again.
//
//   const riding = createRiding({ natalia, stella, controls, interactions, scene });
//   riding.mount(horse);     // climb on
//   riding.dismount();       // hop off
//   riding.isRiding();       // true while she is up there
//   riding.ridingHorse();    // which horse, or null

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// How Natalia handles on her own two feet.
// ---------------------------------------------------------------------------
const WALKING = {
  speed: 4.5,           // units per second
  turnSpeed: 10,        // she spins on the spot quite happily
  cameraDistance: 7,
  cameraHeight: 1.2,
  collisionRadius: 0.35,
};

// ---------------------------------------------------------------------------
// How a horse handles. Roughly 2.4x Natalia's walking speed, which is what
// makes the ride from the house to the barn feel like a proper gallop.
// ---------------------------------------------------------------------------
const RIDING = {
  speed: 11,            // units per second
  turnSpeed: 6,         // a horse swings round more slowly than a girl
  cameraDistance: 10,   // further back, because the horse is big
  cameraHeight: 2.2,    // and higher up, so we look over its head
  collisionRadius: 1.2, // a horse is wide: stop further from the walls
};

// How high above the horse's feet Natalia sits.
// The horse's barrel (horse.js) is centred at y = 1.6 and is 0.85 tall, so its
// back is at y = 2.025. Natalia's hip joints are 0.62 above her own feet, so
// 1.6 puts her hips at 2.22 - just clear of the back, like a saddle.
const SADDLE_Y = 1.6;

// How far to the side of the horse she lands when she gets off, and how far
// behind it she lands if both sides are up against a wall.
const DISMOUNT_SIDE = 1.8;
const DISMOUNT_BACK = 2.4;

// If Stella is standing closer than this to the landing spot, hop off the
// other side instead of stepping straight through her.
const STELLA_SPACE = 1.2;

// How wide Natalia is when we ask "would she fit here?" - the same number
// controls.js uses to keep her out of walls while she is walking.
const NATALIA_RADIUS = 0.35;

// Scratch vector, made once and re-used.
const horseWorldPosition = new THREE.Vector3();

export function createRiding({ natalia, stella, controls, interactions, scene }) {
  // The horse she is on, or null when she is on her own two feet.
  let horse = null;

  function isRiding() {
    return horse !== null;
  }

  function ridingHorse() {
    return horse;
  }

  // -------------------------------------------------------------------------
  // mount - climb onto a horse.
  // -------------------------------------------------------------------------
  function mount(nextHorse) {
    if (!nextHorse) return false;
    if (horse) return false;         // already riding something

    horse = nextHorse;

    // Stop the walk animation and put her into the sitting pose before we move
    // her, so she never appears mid-stride in the saddle.
    natalia.userData.setWalking(false, 0);
    if (natalia.userData.setSitting) natalia.userData.setSitting(true);

    // Sit her on the horse's back. Once she is a child of the horse, her
    // position and rotation are measured FROM the horse, so (0, SADDLE_Y, 0)
    // means "right on its back" and rotation.y = 0 means "facing the same way
    // as the horse" - and the horse's head is its +Z, the same forward the
    // girls use.
    natalia.position.set(0, SADDLE_Y, 0);
    natalia.rotation.y = 0;
    horse.add(natalia);

    // Hand the keyboard and the camera over to the horse. Adding the horse to
    // the subject config here keeps all the handling numbers in one place.
    controls.setSubject({ object: horse, ...RIDING });

    // Measure "am I close enough to press E?" from the horse from now on. The
    // horse she is sitting on is zero units away, so it always wins, and its E
    // action is the one that gets her down again.
    interactions.setPlayer(horse);

    return true;
  }

  // -------------------------------------------------------------------------
  // dismount - hop down beside the horse.
  // The horse itself does not move at all: it stays exactly where it stopped.
  // We try a few landing spots and take the first one that is not inside the
  // house, the barn or the fence, so she can get off next to a wall safely.
  // -------------------------------------------------------------------------
  function dismount() {
    if (!horse) return false;

    const dismountedFrom = horse;
    horse = null;

    // Which way is the horse facing, and which way is its left?
    // rotation.y = 0 means facing +Z, the same as the girls.
    const facing = dismountedFrom.rotation.y;
    const forwardX = Math.sin(facing);
    const forwardZ = Math.cos(facing);
    const leftX = forwardZ;
    const leftZ = -forwardX;

    dismountedFrom.getWorldPosition(horseWorldPosition);

    // Three places she could land, in the order we would like them: the
    // horse's left (the way riders really get off), then its right, then
    // straight out behind it.
    const candidates = [
      {
        x: horseWorldPosition.x + leftX * DISMOUNT_SIDE,
        z: horseWorldPosition.z + leftZ * DISMOUNT_SIDE,
      },
      {
        x: horseWorldPosition.x - leftX * DISMOUNT_SIDE,
        z: horseWorldPosition.z - leftZ * DISMOUNT_SIDE,
      },
      {
        x: horseWorldPosition.x - forwardX * DISMOUNT_BACK,
        z: horseWorldPosition.z - forwardZ * DISMOUNT_BACK,
      },
    ];

    // Is this spot clear of the house, the barn and the edge of the ranch?
    // controls.js owns those shapes, so it is the one we ask.
    const isFree = (spot) => controls.isSpotFree(spot.x, spot.z, NATALIA_RADIUS);

    // Is Stella standing in the way?
    const stellaIsThere = (spot) =>
      !!stella &&
      Math.hypot(stella.position.x - spot.x, stella.position.z - spot.z) < STELLA_SPACE;

    // First choice: somewhere with no wall AND no sister in it.
    let spot = candidates.find((c) => isFree(c) && !stellaIsThere(c));
    // Second choice: no wall, even if Stella is standing there - she can budge.
    if (!spot) spot = candidates.find(isFree);
    // Last resort (boxed in on every side): take the first spot and shove it
    // out of whatever it is stuck in, so she never ends up inside a wall.
    if (!spot) spot = controls.resolveSpot(candidates[0].x, candidates[0].z, NATALIA_RADIUS);

    // Put her back in the scene as her own object. scene.add() takes her off
    // the horse for us, and from here her position is a world position again.
    scene.add(natalia);
    natalia.position.set(
      spot.x,
      0,                                  // feet back on the grass
      spot.z
    );
    natalia.rotation.y = facing;          // still looking the way they were going

    // Stand her back up out of the sitting pose.
    if (natalia.userData.setSitting) natalia.userData.setSitting(false);
    natalia.userData.setWalking(false, 0);

    // The keyboard, the camera and the E prompt all go back to Natalia.
    controls.setSubject({ object: natalia, ...WALKING });
    interactions.setPlayer(natalia);

    return true;
  }

  // Start the game on foot, so the walking numbers are in place from frame one.
  controls.setSubject({ object: natalia, ...WALKING });

  return { mount, dismount, isRiding, ridingHorse };
}
