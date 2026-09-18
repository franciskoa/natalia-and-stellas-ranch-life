// characters.js - builds the two girls, Natalia and Stella, out of simple shapes.
//
// Every character is a THREE.Group whose origin sits between her feet, so
// group.position.set(x, 0, z) always stands her on the grass.
// The model looks along +Z, which means rotation.y = 0 faces +Z.
//
// Each group also gets a tiny walk animation:
//   group.userData.setWalking(isWalking, dt)
// Call it once per frame and the legs swing and the body bobs while walking.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Colours. Natalia and Stella are deliberately very different so a young
// player can tell them apart from across the field.
// ---------------------------------------------------------------------------
const SKIN = 0xf3c9a0;
const EYE = 0x3b2a20;
const BOOT = 0x6d4c41;

const NATALIA = {
  height: 1.6,
  dress: 0xe91e63,  // bright pink dress
  hair: 0x4e342e,   // dark brown hair
  hat: 0xdcc06a,    // straw sun hat
};

const STELLA = {
  height: 1.4,
  dress: 0x7e57c2,  // purple dress
  hair: 0xffc107,   // golden blonde hair
  pigtails: true,
};

// One material per colour, made once and shared by every mesh that needs it.
const materials = {};
function mat(color) {
  if (!materials[color]) {
    materials[color] = new THREE.MeshLambertMaterial({ color });
  }
  return materials[color];
}

// ---------------------------------------------------------------------------
// Small shape helpers, so the body code below stays short and readable.
// ---------------------------------------------------------------------------
function capsule(radius, length, color) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 2, 7), mat(color));
}

function ball(radius, color) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), mat(color));
}

function tube(topRadius, bottomRadius, height, color) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, height, 9),
    mat(color)
  );
}

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

// A limb that can swing: a pivot group at the joint with the limb hanging
// below it. Rotating the pivot around X swings the limb back and forth.
function limb(x, jointY, radius, length, color) {
  const pivot = new THREE.Group();
  pivot.position.set(x, jointY, 0);
  const mesh = capsule(radius, length, color);
  mesh.position.y = -(length / 2 + radius);
  pivot.add(mesh);
  return pivot;
}

// ---------------------------------------------------------------------------
// makeGirl - the shared body. Built 1.6 units tall, then scaled to the height
// we asked for. Scaling the whole group keeps her feet on the ground, because
// the group's origin is at her feet.
// ---------------------------------------------------------------------------
function makeGirl(look, kind) {
  const group = new THREE.Group();
  group.name = kind;

  // Everything hangs off "root" so the walking bob can lift the body a little
  // without moving the group itself away from ground level.
  const root = new THREE.Group();
  group.add(root);

  // Legs (these swing) with a boot on the bottom of each one.
  const legL = limb(-0.12, 0.62, 0.085, 0.4, SKIN);
  const legR = limb(0.12, 0.62, 0.085, 0.4, SKIN);
  for (const leg of [legL, legR]) {
    const boot = box(0.19, 0.12, 0.26, BOOT);
    boot.position.set(0, -0.56, 0.03);
    leg.add(boot);
    root.add(leg);
  }

  // Dress: a cylinder that is narrow at the shoulders and wide at the hem.
  const dress = tube(0.17, 0.33, 0.62, look.dress);
  dress.position.y = 0.91;
  root.add(dress);

  // Arms (these swing the opposite way to the legs).
  const armL = limb(-0.21, 1.16, 0.06, 0.26, look.dress);
  const armR = limb(0.21, 1.16, 0.06, 0.26, look.dress);
  for (const arm of [armL, armR]) {
    const hand = ball(0.065, SKIN);
    hand.position.y = -0.38;
    arm.add(hand);
    root.add(arm);
  }

  // Neck and head.
  const neck = tube(0.06, 0.06, 0.12, SKIN);
  neck.position.y = 1.25;
  root.add(neck);

  const head = ball(0.17, SKIN);
  head.position.y = 1.44;
  root.add(head);

  // Two little eyes on the +Z side, which is the way she faces.
  for (const ex of [-0.062, 0.062]) {
    const eye = ball(0.024, EYE);
    eye.position.set(ex, 1.47, 0.155);
    root.add(eye);
  }

  // Hair: a half-sphere cap sitting over the top of the head.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.187, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(look.hair)
  );
  hair.position.y = 1.44;
  root.add(hair);

  // A short fringe at the back so her head is not bald from behind.
  const backHair = box(0.3, 0.26, 0.12, look.hair);
  backHair.position.set(0, 1.36, -0.12);
  root.add(backHair);

  if (look.pigtails) {
    for (const px of [-0.2, 0.2]) {
      const tail = ball(0.095, look.hair);
      tail.position.set(px, 1.38, -0.03);
      root.add(tail);
    }
  }

  if (look.hat) {
    const brim = tube(0.33, 0.33, 0.04, look.hat);
    brim.position.y = 1.55;
    root.add(brim);
    const crown = tube(0.16, 0.185, 0.17, look.hat);
    crown.position.y = 1.65;
    root.add(crown);
  }

  // Scale the finished 1.6-tall body to the height we want.
  group.scale.setScalar(look.height / 1.6);

  // -------------------------------------------------------------------------
  // Walk animation. "phase" is where we are in the step cycle, and "swing"
  // fades the animation in and out so she never stops mid-stride.
  // -------------------------------------------------------------------------
  let phase = 0;
  let swing = 0;

  // While she is sitting on a horse the walk animation is switched off and the
  // legs are held in the sitting pose instead.
  let sitting = false;

  function setWalking(isWalking, dt) {
    if (sitting) return;  // frozen in the saddle: nothing to swing
    if (isWalking) phase += dt * 9;
    // Ease "swing" towards 1 while walking and towards 0 while standing still.
    const goal = isWalking ? 1 : 0;
    swing += (goal - swing) * Math.min(1, dt * 8);

    const a = Math.sin(phase) * 0.55 * swing;
    legL.rotation.x = a;
    legR.rotation.x = -a;
    armL.rotation.x = -a * 0.7;
    armR.rotation.x = a * 0.7;
    root.position.y = Math.abs(Math.sin(phase)) * 0.035 * swing;
  }

  // -------------------------------------------------------------------------
  // Sitting pose, used when she climbs onto a horse. Her thighs swing forward
  // so they lie along the horse's back, and her hands come up to hold the
  // reins. A negative rotation.x swings a limb forwards, the same way the walk
  // animation does it.
  // -------------------------------------------------------------------------
  const SIT_LEG_ANGLE = -1.3;  // radians: thighs almost straight out in front
  const SIT_ARM_ANGLE = -0.5;  // hands forward, holding the reins

  function setSitting(isSitting) {
    sitting = isSitting;

    // Start the walk cycle from scratch next time she gets down.
    phase = 0;
    swing = 0;
    root.position.y = 0;

    const legAngle = isSitting ? SIT_LEG_ANGLE : 0;
    const armAngle = isSitting ? SIT_ARM_ANGLE : 0;
    legL.rotation.x = legAngle;
    legR.rotation.x = legAngle;
    armL.rotation.x = armAngle;
    armR.rotation.x = armAngle;
  }

  group.userData = { kind, setWalking, setSitting };
  return group;
}

// ---------------------------------------------------------------------------
// The two characters the game uses.
// ---------------------------------------------------------------------------
export function makeNatalia() {
  return makeGirl(NATALIA, 'natalia');
}

export function makeStella() {
  return makeGirl(STELLA, 'stella');
}

// ---------------------------------------------------------------------------
// Follower behaviour - Stella walking a couple of steps behind Natalia.
// ---------------------------------------------------------------------------
// Her spot is behind the leader AND off to one side. The sideways part matters:
// the camera sits straight behind Natalia, so a follower directly behind her
// would stand in the way and hide the player.
const FOLLOW_BACK = 1.8;    // how far behind the leader her spot is
const FOLLOW_SIDE = 1.4;    // how far to the leader's left her spot is
const FOLLOW_SPEED = 5.6;   // a bit faster than the player, so she can catch up
const ARRIVE = 0.3;         // close enough: stop completely (no jitter)
const PERSONAL_SPACE = 1.2; // never crowd the leader closer than this
const TURN_SPEED = 7;       // how quickly she swivels to face a new direction

// Keeping up with a horse. A galloping horse does 11 units a second, so a
// flat 5.6 would leave Stella further behind with every stride. Instead, the
// further she falls behind her spot, the faster she runs:
//
//   gap up to CATCH_UP_GAP  ->  her normal FOLLOW_SPEED
//   beyond that             ->  FOLLOW_SPEED + (gap - CATCH_UP_GAP) * GAIN,
//                               never faster than MAX_FOLLOW_SPEED
//
// With these numbers she settles about 3.7 units behind her spot at a full
// gallop (that is where her speed works out at the horse's 11), which keeps
// her in the picture just behind the horse. CATCH_UP_GAP is comfortably wider
// than any gap she opens up while walking, so ordinary following is unchanged.
const CATCH_UP_GAP = 3;       // start hurrying once she is this far from her spot
const CATCH_UP_GAIN = 8;      // extra units a second for every unit of extra gap
const MAX_FOLLOW_SPEED = 14;  // her flat-out sprint

// If something has left her this far behind - a long gallop across the ranch -
// there is no catching up in a sensible time, so she quietly pops to her spot.
const TELEPORT_GAP = 40;

// Turn "current" towards "target" the short way round, at most "maxStep".
function turnTowards(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

// Flat (ground-level) distance between two points.
function distance2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function updateFollower(follower, leader, dt) {
  // The leader's facing direction. rotation.y = 0 means facing +Z.
  const forwardX = Math.sin(leader.rotation.y);
  const forwardZ = Math.cos(leader.rotation.y);

  // The leader's left-hand direction: "forward" turned a quarter turn.
  const leftX = forwardZ;
  const leftZ = -forwardX;

  // Her spot: a step and a half behind the leader and a step to her left, so
  // she walks beside the camera's view instead of standing in front of it.
  const targetX = leader.position.x - forwardX * FOLLOW_BACK + leftX * FOLLOW_SIDE;
  const targetZ = leader.position.z - forwardZ * FOLLOW_BACK + leftZ * FOLLOW_SIDE;

  const dx = targetX - follower.position.x;
  const dz = targetZ - follower.position.z;
  const gap = Math.hypot(dx, dz);

  // Hopelessly far behind? Put her straight on her spot, facing the same way
  // as the leader, with no walk animation: nobody sees it happen, because she
  // is miles off screen when it does.
  if (gap > TELEPORT_GAP) {
    follower.position.x = targetX;
    follower.position.z = targetZ;
    follower.rotation.y = leader.rotation.y;
    if (follower.userData.setWalking) follower.userData.setWalking(false, dt);
    return;
  }

  let walking = false;

  if (gap > ARRIVE) {
    // Her speed for this frame: the normal amble, plus a bit more for every
    // unit she has fallen behind, up to a flat-out sprint.
    let speed = FOLLOW_SPEED;
    if (gap > CATCH_UP_GAP) {
      speed = Math.min(
        MAX_FOLLOW_SPEED,
        FOLLOW_SPEED + (gap - CATCH_UP_GAP) * CATCH_UP_GAIN
      );
    }

    // Never step further than the gap itself, so she cannot overshoot her spot
    // and wobble back and forth on it.
    const step = Math.min(speed * dt, gap);
    const nextX = follower.position.x + (dx / gap) * step;
    const nextZ = follower.position.z + (dz / gap) * step;

    // Don't squeeze into her sister: only take the step if it leaves enough
    // room, or if it is actually moving her further away from the leader.
    const nowNear = distance2D(
      follower.position.x, follower.position.z,
      leader.position.x, leader.position.z
    );
    const nextNear = distance2D(
      nextX, nextZ,
      leader.position.x, leader.position.z
    );

    if (nextNear >= PERSONAL_SPACE || nextNear > nowNear) {
      follower.position.x = nextX;
      follower.position.z = nextZ;
      walking = true;
      // Face the way she is walking.
      const facing = Math.atan2(dx, dz);
      follower.rotation.y = turnTowards(follower.rotation.y, facing, TURN_SPEED * dt);
    }
  }

  if (!walking) {
    // Standing beside her sister: look the same way Natalia is looking.
    follower.rotation.y = turnTowards(follower.rotation.y, leader.rotation.y, TURN_SPEED * dt);
  }

  if (follower.userData.setWalking) follower.userData.setWalking(walking, dt);
}
