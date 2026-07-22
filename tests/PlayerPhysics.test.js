import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerState, stepPlayerPhysics } from '../src/editor/player/PlayerPhysics.js';

const CONFIG = Object.freeze({
  walkSpeed: 10,
  runMultiplier: 2,
  jumpSpeed: 8,
  gravity: 20,
  eyeHeight: 1.7,
});
const BOUNDS = Object.freeze({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
const FORWARD = Object.freeze({ x: 0, z: -1 });
const RIGHT = Object.freeze({ x: 1, z: 0 });
const GROUND = () => 3;

function step(state, input, deltaSeconds = 0.05) {
  return stepPlayerPhysics({
    state,
    input: { forward: 0, right: 0, running: false, jump: false, ...input },
    deltaSeconds,
    config: CONFIG,
    forward: FORWARD,
    right: RIGHT,
    getGroundHeight: GROUND,
    bounds: BOUNDS,
  });
}

test('walks and runs using real delta time', () => {
  const initial = createPlayerState({ x: 0, z: 0, groundHeight: 3, eyeHeight: 1.7 });
  const walked = step(initial, { forward: 1 });
  const ran = step(initial, { forward: 1, running: true });

  assert.equal(walked.z, -0.5);
  assert.equal(ran.z, -1);
  assert.equal(walked.y, 4.7);
});

test('normalizes diagonal movement speed', () => {
  const initial = createPlayerState({ x: 0, z: 0, groundHeight: 3, eyeHeight: 1.7 });
  const moved = step(initial, { forward: 1, right: 1 });

  assert.ok(Math.abs(Math.hypot(moved.x, moved.z) - 0.5) < 1e-9);
});

test('jumps, applies gravity, and lands on the heightfield', () => {
  let state = createPlayerState({ x: 0, z: 0, groundHeight: 3, eyeHeight: 1.7 });
  state = step(state, { jump: true });
  assert.equal(state.grounded, false);
  assert.ok(state.y > 4.7);

  for (let frame = 0; frame < 60 && !state.grounded; frame += 1) {
    state = step(state, {});
  }

  assert.equal(state.grounded, true);
  assert.equal(state.y, 4.7);
  assert.equal(state.verticalVelocity, 0);
});

test('clamps movement to the terrain bounds', () => {
  const initial = createPlayerState({ x: 99.9, z: 0, groundHeight: 3, eyeHeight: 1.7 });
  const moved = step(initial, { right: 1, running: true });
  assert.equal(moved.x, 100);
});
