import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVoxelWorldLayout,
  selectVoxelStampsForChunk,
  toGlobalVoxelSample,
} from '../src/editor/voxel/VoxelWorldLayout.js';

const MAP_CONFIG = Object.freeze({ width: 512, height: 512, tileSize: 2 });

function createConfig() {
  return {
    enabled: true,
    visible: true,
    chunkGrid: [2, 2],
    cells: [24, 16, 24],
    voxelSize: 1.5,
    originCell: [280, 240],
    verticalOffset: 0.2,
    baseHeight: 7,
    surfaceAmplitude: 3,
    surfaceFrequency: 0.28,
    seed: 17,
    maxStamps: 64,
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

test('creates a fixed resident grid with deterministic chunk offsets', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);

  assert.equal(layout.chunkCount, 4);
  assert.deepEqual([layout.totalCellsX, layout.totalCellsY, layout.totalCellsZ], [48, 16, 48]);
  assert.deepEqual(layout.chunks.map((chunk) => chunk.key), ['0:0', '1:0', '0:1', '1:1']);
  assert.deepEqual([layout.chunks[3].offsetX, layout.chunks[3].offsetZ], [24, 24]);
  assert.equal(layout.sampleHalo, 1);
  assert.equal(layout.sampleCountX, 27);
});

test('adjacent chunks map their shared sample plane to identical global coordinates', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const left = layout.chunks[0];
  const right = layout.chunks[1];

  assert.deepEqual(
    toGlobalVoxelSample(left, { x: layout.chunkCellsX, y: 8, z: 10 }),
    toGlobalVoxelSample(right, { x: 0, y: 8, z: 10 }),
  );
});

test('filters a border-crossing stamp into both affected chunks with local centers', () => {
  const layout = createVoxelWorldLayout(createConfig(), MAP_CONFIG);
  const stamps = [stamp([24, 7, 12], 3)];
  const left = selectVoxelStampsForChunk(stamps, layout.chunks[0], layout);
  const right = selectVoxelStampsForChunk(stamps, layout.chunks[1], layout);
  const distant = selectVoxelStampsForChunk(stamps, layout.chunks[3], layout);

  assert.equal(left.length, 1);
  assert.equal(right.length, 1);
  assert.deepEqual(left[0].center, [24, 7, 12]);
  assert.deepEqual(right[0].center, [0, 7, 12]);
  assert.equal(distant.length, 0);
});

test('rejects resident grids that do not fit inside the map', () => {
  const config = createConfig();
  config.originCell = [4, 4];
  assert.throws(
    () => createVoxelWorldLayout(config, MAP_CONFIG),
    /must fit inside the logical map/,
  );
});
