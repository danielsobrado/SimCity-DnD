import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoxelStreamingPlan } from '../src/editor/voxel/VoxelStreamingPlan.js';

function descriptor(chunkX, chunkZ) {
  return { key: `${chunkX}:${chunkZ}`, chunkX, chunkZ };
}

test('retains resident targets and fills empty slots first', () => {
  const slots = [
    { slotIndex: 0, key: '4:4', descriptor: descriptor(4, 4), lastUsed: 3 },
    { slotIndex: 1, key: null, descriptor: null, lastUsed: 0 },
    { slotIndex: 2, key: '2:2', descriptor: descriptor(2, 2), lastUsed: 1 },
  ];
  const targets = [descriptor(4, 4), descriptor(4, 5), descriptor(5, 4)];
  const plan = createVoxelStreamingPlan({
    slots,
    targets,
    focusChunk: { chunkX: 4, chunkZ: 4 },
  });

  assert.deepEqual(plan.retained, [0]);
  assert.deepEqual(plan.assignments.map((entry) => entry.slotIndex), [1, 2]);
  assert.deepEqual(plan.assignments.map((entry) => entry.descriptor.key), ['4:5', '5:4']);
});

test('evicts the farthest stale slot deterministically', () => {
  const slots = [
    { slotIndex: 0, key: '3:3', descriptor: descriptor(3, 3), lastUsed: 9 },
    { slotIndex: 1, key: '1:1', descriptor: descriptor(1, 1), lastUsed: 2 },
    { slotIndex: 2, key: '0:0', descriptor: descriptor(0, 0), lastUsed: 1 },
  ];
  const targets = [descriptor(3, 3), descriptor(3, 4), descriptor(4, 3)];
  const plan = createVoxelStreamingPlan({
    slots,
    targets,
    focusChunk: { chunkX: 3, chunkZ: 3 },
  });

  assert.deepEqual(plan.retained, [0]);
  assert.equal(plan.assignments[0].slotIndex, 2);
  assert.equal(plan.assignments[0].evictedKey, '0:0');
  assert.equal(plan.assignments[1].slotIndex, 1);
});

test('rejects a resident set larger than the fixed slot pool', () => {
  assert.throws(
    () => createVoxelStreamingPlan({
      slots: [{ slotIndex: 0, key: null, descriptor: null, lastUsed: 0 }],
      targets: [descriptor(0, 0), descriptor(1, 0)],
      focusChunk: { chunkX: 0, chunkZ: 0 },
    }),
    /cannot satisfy the requested resident set/,
  );
});
