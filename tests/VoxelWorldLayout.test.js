import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVoxelChunkDescriptor,
  createVoxelWorldLayout,
  selectResidentChunkDescriptors,
  selectVoxelStampsForChunk,
  toGlobalVoxelSample,
  worldToVoxelChunk,
} from '../src/editor/voxel/VoxelWorldLayout.js';

const MAP_CONFIG = Object.freeze({ width: 512, height: 512, tileSize: 2 });

function createConfig() {
  return {
    enabled: true,
    visible: true,
    streamRadius: 1,
    slotCount: 9,
    cells: [24, 16, 24],
    voxelSize: 1.5,
    verticalOffset: 0.2,
    baseHeight: 7,
    surfaceAmplitude: 3,
    surfaceFrequency: 0.28,
    seed: 17,
    maxStamps: 64,
    maxStampsPerChunk: 64,
    defaultRadius: 2.5,
    defaultStrength: 0.75,
    defaultSmoothness: 0.65,
  };
}

function stamp(center, radius = 2.5) {
  return {
    id: 1,
    operation: 'subtract',
    center,
    radius,
    strength: 0.75,
    smoothness: 0.65,
  };
}

test('derives an unbounded voxel world with a fixed resident slot count', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);

  assert.equal(layout.unboundedXZ, true);
  assert.equal(layout.chunksX, Number.POSITIVE_INFINITY);
  assert.equal(layout.chunksZ, Number.POSITIVE_INFINITY);
  assert.equal(layout.totalCellsX, Number.POSITIVE_INFINITY);
  assert.equal(layout.totalCellsY, 16);
  assert.equal(layout.totalCellsZ, Number.POSITIVE_INFINITY);
  assert.equal(layout.worldChunkCount, Number.POSITIVE_INFINITY);
  assert.equal(layout.slotCount, 9);
  assert.equal(layout.sampleHalo, 1);
});

test('selects the nearest deterministic chunk window around the world origin', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const selection = selectResidentChunkDescriptors(layout, { x: 0, z: 0 });

  assert.deepEqual(selection.focusChunk, { chunkX: 0, chunkZ: 0 });
  assert.equal(selection.descriptors.length, 9);
  assert.equal(selection.descriptors[0].key, '0:0');
  assert.deepEqual(
    selection.descriptors.map((descriptor) => descriptor.key),
    ['0:0', '0:-1', '-1:0', '1:0', '0:1', '-1:-1', '1:-1', '-1:1', '1:1'],
  );
});

test('keeps the slot pool full for distant negative coordinates', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const selection = selectResidentChunkDescriptors(layout, { x: -1080, z: 720 });

  assert.deepEqual(selection.focusChunk, { chunkX: -30, chunkZ: -20 });
  assert.equal(selection.descriptors.length, 9);
  assert.equal(new Set(selection.descriptors.map((descriptor) => descriptor.key)).size, 9);
});

test('adjacent chunks share scalar samples and world-space border positions', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const left = createVoxelChunkDescriptor(layout, 4, 6);
  const right = createVoxelChunkDescriptor(layout, 5, 6);
  const near = createVoxelChunkDescriptor(layout, 4, 6);
  const far = createVoxelChunkDescriptor(layout, 4, 7);
  const halfWidth = layout.chunkWorldWidth / 2;
  const halfDepth = layout.chunkWorldDepth / 2;

  assert.deepEqual(
    toGlobalVoxelSample(left, { x: layout.chunkCellsX, y: 8, z: 10 }),
    toGlobalVoxelSample(right, { x: 0, y: 8, z: 10 }),
  );
  assert.deepEqual(
    toGlobalVoxelSample(near, { x: 10, y: 8, z: layout.chunkCellsZ }),
    toGlobalVoxelSample(far, { x: 10, y: 8, z: 0 }),
  );
  assert.equal(left.centerWorldX + halfWidth, right.centerWorldX - halfWidth);
  assert.equal(near.centerWorldZ - halfDepth, far.centerWorldZ + halfDepth);
});

test('filters a border-crossing stamp into both affected chunks with local centers', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const left = createVoxelChunkDescriptor(layout, -1, 0);
  const right = createVoxelChunkDescriptor(layout, 0, 0);
  const distant = createVoxelChunkDescriptor(layout, 3, 3);
  const stamps = [stamp([0, 7, 12], 3)];

  assert.deepEqual(selectVoxelStampsForChunk(stamps, left, layout)[0].center, [24, 7, 12]);
  assert.deepEqual(selectVoxelStampsForChunk(stamps, right, layout)[0].center, [0, 7, 12]);
  assert.equal(selectVoxelStampsForChunk(stamps, distant, layout).length, 0);
});

test('maps world positions to stable positive and negative voxel chunks', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  assert.deepEqual(worldToVoxelChunk(layout, 0, 0), { chunkX: 0, chunkZ: 0 });
  assert.deepEqual(worldToVoxelChunk(layout, -512, 512), { chunkX: -15, chunkZ: -15 });
  assert.deepEqual(worldToVoxelChunk(layout, 512, -512), { chunkX: 14, chunkZ: 14 });
});

test('requires enough slots for the configured streaming radius', () => {
  const config = createConfig();
  config.slotCount = 8;
  assert.throws(
    () => createVoxelWorldLayout(config, MAP_CONFIG),
    /slotCount must be at least 9/,
  );
});
