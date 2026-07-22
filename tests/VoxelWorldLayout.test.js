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
    maxStamps: 256,
    maxStampsPerChunk: 32,
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

test('derives a map-scale voxel world and fixed resident slot count', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);

  assert.deepEqual([layout.chunksX, layout.chunksZ], [29, 29]);
  assert.deepEqual([layout.totalCellsX, layout.totalCellsY, layout.totalCellsZ], [696, 16, 696]);
  assert.equal(layout.worldChunkCount, 841);
  assert.equal(layout.slotCount, 9);
  assert.equal(layout.sampleHalo, 1);
});

test('selects the nearest deterministic chunk window around the camera', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const selection = selectResidentChunkDescriptors(layout, { x: 0, z: 0 });

  assert.deepEqual(selection.focusChunk, { chunkX: 14, chunkZ: 14 });
  assert.equal(selection.descriptors.length, 9);
  assert.equal(selection.descriptors[0].key, '14:14');
  assert.deepEqual(
    selection.descriptors.map((descriptor) => descriptor.key),
    ['14:14', '14:13', '13:14', '15:14', '14:15', '13:13', '15:13', '13:15', '15:15'],
  );
});

test('keeps the slot pool full at map edges', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const selection = selectResidentChunkDescriptors(layout, { x: -512, z: 512 });

  assert.deepEqual(selection.focusChunk, { chunkX: 0, chunkZ: 0 });
  assert.equal(selection.descriptors.length, 9);
  assert.equal(new Set(selection.descriptors.map((descriptor) => descriptor.key)).size, 9);
});

test('adjacent chunks map their shared sample plane to identical global coordinates', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const left = createVoxelChunkDescriptor(layout, 4, 6);
  const right = createVoxelChunkDescriptor(layout, 5, 6);

  assert.deepEqual(
    toGlobalVoxelSample(left, { x: layout.chunkCellsX, y: 8, z: 10 }),
    toGlobalVoxelSample(right, { x: 0, y: 8, z: 10 }),
  );
});

test('filters a border-crossing stamp into both affected chunks with local centers', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const left = createVoxelChunkDescriptor(layout, 0, 0);
  const right = createVoxelChunkDescriptor(layout, 1, 0);
  const distant = createVoxelChunkDescriptor(layout, 3, 3);
  const stamps = [stamp([24, 7, 12], 3)];

  assert.deepEqual(selectVoxelStampsForChunk(stamps, left, layout)[0].center, [24, 7, 12]);
  assert.deepEqual(selectVoxelStampsForChunk(stamps, right, layout)[0].center, [0, 7, 12]);
  assert.equal(selectVoxelStampsForChunk(stamps, distant, layout).length, 0);
});

test('maps world positions to stable voxel chunk coordinates', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  assert.deepEqual(worldToVoxelChunk(layout, 0, 0), { chunkX: 14, chunkZ: 14 });
  assert.deepEqual(worldToVoxelChunk(layout, -512, 512), { chunkX: 0, chunkZ: 0 });
});

test('requires enough slots for the configured streaming radius', () => {
  const config = createConfig();
  config.slotCount = 8;
  assert.throws(
    () => createVoxelWorldLayout(config, MAP_CONFIG),
    /slotCount must be at least 9/,
  );
});
