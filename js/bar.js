// bar.js - the little floating "how full is it?" bar.
//
// Phase 2 gave every horse a hunger bar. Phase 5 gives the chicken coop one
// too, so the drawing code moved out here where both can share it instead of
// being copied twice.
//
// It is made of two flat boxes and no HTML at all:
//   * a dark slab for the background, and
//   * a coloured slab in front of it that we shrink from the right as the
//     value drops, exactly like a health bar in a real game.
//
// The trick with the fill: its shape is shifted inside itself so that its LEFT
// edge sits at the mesh origin. Then the mesh is parked at the left end of the
// bar, and shrinking it with scale.x pulls it in from the right.
//
// How you use it:
//
//   const bar = createHungerBar();          // or createHungerBar({ width: 1.1 })
//   bar.holder.position.y = 2.2;            // float it above something
//   parent.add(bar.holder);
//   bar.setValue(hunger);                   // 0..100: redraw it
//   bar.faceCamera(camera);                 // once a frame, so it stays readable
//
// It hands back:
//   holder            the group to add to your object and to move about
//   fill              the coloured mesh (handy for tests)
//   setValue(v, max)  redraw for a value; max is 100 unless you say otherwise
//   faceCamera(cam)   turn the bar towards the camera ("billboarding")

import * as THREE from 'three';

// Default size, in world units. These are the numbers Phase 2 used for the
// horse bar, so passing nothing gives exactly the old horse bar back.
const DEFAULT_WIDTH = 1.6;
const DEFAULT_THICKNESS = 0.22;
const DEFAULT_DEPTH = 0.05;

// Bar colours: full and happy, getting peckish, really hungry.
export const BAR_GREEN = 0x4caf50;
export const BAR_YELLOW = 0xffc107;
export const BAR_RED = 0xe53935;
export const BAR_BACKGROUND = 0x2b2b2b; // dark grey, so the fill stands out

// Where the colour changes, as a fraction of a full bar.
const YELLOW_BELOW = 0.6;
const RED_BELOW = 0.3;

// Pick the bar colour for a fraction between 0 (empty) and 1 (full).
export function barColorFor(fraction) {
  if (fraction >= YELLOW_BELOW) return BAR_GREEN;
  if (fraction >= RED_BELOW) return BAR_YELLOW;
  return BAR_RED;
}

// A scratch vector, made once and re-used, so we are not creating new objects
// sixty times a second.
const cameraWorldPosition = new THREE.Vector3();

// ---------------------------------------------------------------------------
// createHungerBar - build one bar.
//   width / thickness / depth  how big it is, in world units (all optional)
// ---------------------------------------------------------------------------
export function createHungerBar({
  width = DEFAULT_WIDTH,
  thickness = DEFAULT_THICKNESS,
  depth = DEFAULT_DEPTH,
} = {}) {
  // "holder" is the part we spin each frame so the bar faces the camera.
  const holder = new THREE.Group();
  holder.name = 'hungerBar';

  // MeshBasicMaterial ignores the lights, so the bar keeps the same bright
  // colour no matter which way the sun is shining.
  const background = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, depth),
    new THREE.MeshBasicMaterial({ color: BAR_BACKGROUND })
  );
  holder.add(background);

  // The fill is a little smaller than the background, so a thin dark border
  // shows all the way round it.
  const fillWidth = width - 0.1;
  const fillGeo = new THREE.BoxGeometry(fillWidth, thickness - 0.07, depth);
  // Move the shape sideways inside itself: now x = 0 is its left edge.
  fillGeo.translate(fillWidth / 2, 0, 0);

  const fill = new THREE.Mesh(
    fillGeo,
    new THREE.MeshBasicMaterial({ color: BAR_GREEN })
  );
  // Park it at the left end of the background, a hair in front of it.
  fill.position.set(-fillWidth / 2, 0, depth * 0.6);
  holder.add(fill);

  // Redraw the bar for a value: how long the coloured part is, and its colour.
  function setValue(value, max = 100) {
    const fraction = Math.max(0, Math.min(1, value / max));
    // Never scale all the way down to zero: a zero-wide shape upsets the maths
    // Three.js does behind the scenes, so we always leave a sliver.
    fill.scale.x = Math.max(0.001, fraction);
    fill.material.color.setHex(barColorFor(fraction));
  }

  // Turn the bar towards the camera, so it stays readable from every side.
  // lookAt points an object's +Z at the target, and it takes the parent's own
  // turn into account for us.
  function faceCamera(camera) {
    if (!camera) return;
    camera.getWorldPosition(cameraWorldPosition);
    holder.lookAt(cameraWorldPosition);
  }

  return { holder, fill, setValue, faceCamera };
}
