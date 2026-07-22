import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoxelChunkLayout } from '../src/editor/voxel/VoxelChunkLayout.js';

const MAP_CONFIG = Object.freeze({ width: 512, height: 512, tileSize: 2 });

function createConfig() {
  return {
    enabled: true,
    visible: true,
    cells: [24, 16, 24],
    voxelSize: 1.5,
    originCell: [280, 240],
    verticalOffset: 0.2,
    baseHeight: 7,
    surfaceAmplitude: 3,
    surfaceFrequency: 0.28,
    seed: 17,
    maxStamps: 32,
    defaultRadius: 2.5,
    defaultStrength: 0.75,
    defaultSmoothness: 0.65,
  };
}

test('derives bounded editable marching-cubes dimensions', () => {
  const layout = createVoxelChunkLayout(createConfig(), MAP_CONFIG);

  assert.equal(layout.cellCount, 9216);
  assert.equal(layout.sampleCount, 10625);
  assert.equal(layout.maxTriangles, 46080);
  assert.equal(layout.maxVertices, 138240);
  assert.equal(layout.maxStamps, 32);
  assert.equal(layout.worldWidth, 36);
  assert.equal(layout.worldHeight, 24);
  assert.equal(layout.worldDepth, 36);
  assert.deepEqual([layout.originX, layout.originZ], [280, 240]);
  assert.ok(Object.isFrozen(layout));
});

test('rejects voxel axes outside the bounded prototype range', () => {
  const config = createConfig();
  config.cells = [65, 16, 24];

  assert.throws(
    () => createVoxelChunkLayout(config, MAP_CONFIG),
    /x cells must be within 1–64/,
  );
});

test('rejects marching-cubes output beyond the GPU vertex budget', () => {
  const config = createConfig();
  config.cells = [64, 64, 64];

  assert.throws(
    () => createVoxelChunkLayout(config, MAP_CONFIG),
    /marching-cubes output exceeds/,
  );
});

test('rejects a voxel origin outside the logical map', () => {
  const config = createConfig();
  config.originCell = [512, 0];

  assert.throws(
    () => createVoxelChunkLayout(config, MAP_CONFIG),
    /originCell must be inside the map/,
  );
});

test('requires deterministic integer seeds', () => {
  const config = createConfig();
  config.seed = 1.5;

  assert.throws(
    () => createVoxelChunkLayout(config, MAP_CONFIG),
    /seed must be an integer/,
  );
});

test('rejects excessive sparse stamp capacity', () => {
  const config = createConfig();
  config.maxStamps = 65;

  assert.throws(
    () => createVoxelChunkLayout(config, MAP_CONFIG),
    /maxStamps must be within 1–64/,
  );
});
