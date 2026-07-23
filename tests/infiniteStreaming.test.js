import assert from 'node:assert/strict';
import test from 'node:test';
import { FloatingOrigin } from '../src/editor/world/FloatingOrigin.js';
import {
  createTerrainSlotPlan,
  selectTerrainResidentDescriptors,
  worldToTerrainChunk,
} from '../src/editor/world/TerrainStreamingPlan.js';
import { parseChunkKey } from '../src/editor/world/WorldCoordinates.js';

function createSlots(count) {
  return Array.from({ length: count }, (_, slotIndex) => ({
    slotIndex,
    key: null,
    descriptor: null,
    lastUsed: 0,
  }));
}

test('terrain chunk coordinates remain stable for negative world positions', () => {
  assert.deepEqual(worldToTerrainChunk(-0.1, 0.1, 2, 64), {
    chunkX: -1,
    chunkZ: -1,
  });
  assert.deepEqual(worldToTerrainChunk(128, -128, 2, 64), {
    chunkX: 1,
    chunkZ: 1,
  });
});

test('predictive streaming includes current and forward chunk neighborhoods', () => {
  const selection = selectTerrainResidentDescriptors({
    focusWorld: { x: 0, z: 0 },
    velocity: { x: 256, z: 0 },
    tileSize: 2,
    chunkSize: 64,
    loadRadius: 1,
    unloadRadius: 2,
    prefetchSeconds: 1,
    slotCount: 25,
  });

  assert.deepEqual(selection.currentChunk, { chunkX: 0, chunkZ: 0 });
  assert.deepEqual(selection.predictedChunk, { chunkX: 2, chunkZ: 0 });
  const keys = new Set(selection.descriptors.map((descriptor) => descriptor.key));
  assert.ok(keys.has('0:0'));
  assert.ok(keys.has('2:0'));
  assert.equal(selection.descriptors.length, 25);
});

test('terrain slot planning retains matching chunks and fills empty slots first', () => {
  const slots = createSlots(3);
  slots[0].key = '0:0';
  slots[0].descriptor = { key: '0:0', chunkX: 0, chunkZ: 0 };
  slots[0].lastUsed = 10;
  slots[1].key = '8:8';
  slots[1].descriptor = { key: '8:8', chunkX: 8, chunkZ: 8 };
  slots[1].lastUsed = 1;
  const targets = [
    { key: '0:0', chunkX: 0, chunkZ: 0 },
    { key: '1:0', chunkX: 1, chunkZ: 0 },
    { key: '0:1', chunkX: 0, chunkZ: 1 },
  ];

  const plan = createTerrainSlotPlan({
    slots,
    targets,
    focusChunk: { chunkX: 0, chunkZ: 0 },
  });
  assert.deepEqual(plan.retained, [0]);
  assert.equal(plan.assignments[0].slotIndex, 2);
  assert.equal(plan.assignments[0].evictedKey, null);
  assert.equal(plan.assignments[1].slotIndex, 1);
  assert.equal(plan.assignments[1].evictedKey, '8:8');
});

test('floating origin preserves canonical coordinates across rebases', () => {
  const origin = new FloatingOrigin({ threshold: 100, snapSize: 64 });
  assert.equal(origin.update({ x: 99, z: -99 }), null);
  const event = origin.update({ x: 150, z: -130 });
  assert.deepEqual(event, {
    shiftX: 128,
    shiftZ: -128,
    originX: 128,
    originZ: -128,
  });
  assert.deepEqual(origin.toCanonical(22, -2), { x: 150, z: -130 });
  assert.deepEqual(origin.toRender(150, -130), { x: 22, z: -2 });
});

test('streaming focus dirty key is not a parseable world chunk key', () => {
  // InfiniteTerrainView stores focusChunkKey as `${current}|${predicted}` so the
  // resident-set rebuild can skip when neither chunk moved. Stylized layers must
  // read terrainView.focusChunk for coordinates, not parseChunkKey(focusChunkKey).
  const currentChunk = { chunkX: 0, chunkZ: 0 };
  const predictedChunk = { chunkX: 0, chunkZ: 0 };
  const focusChunkKey = `${currentChunk.chunkX}:${currentChunk.chunkZ}`
    + `|${predictedChunk.chunkX}:${predictedChunk.chunkZ}`;
  assert.equal(focusChunkKey, '0:0|0:0');
  assert.throws(() => parseChunkKey(focusChunkKey), /Invalid world chunk key/);
  assert.deepEqual(parseChunkKey(`${currentChunk.chunkX}:${currentChunk.chunkZ}`), currentChunk);
});
