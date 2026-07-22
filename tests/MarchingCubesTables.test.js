import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MC_CASE_COUNT,
  MC_MAX_TRIANGLES_PER_CELL,
  MC_TABLE_WIDTH,
  MC_TRIANGLE_COUNTS,
  MC_TRIANGLE_EDGES,
  validateMarchingCubesTables,
} from '../src/editor/voxel/MarchingCubesTables.js';

test('contains a complete and valid classic marching-cubes table', () => {
  assert.equal(MC_CASE_COUNT, 256);
  assert.equal(MC_TABLE_WIDTH, 16);
  assert.equal(MC_TRIANGLE_COUNTS.length, 256);
  assert.equal(MC_TRIANGLE_EDGES.length, 4096);
  assert.equal(Math.max(...MC_TRIANGLE_COUNTS), MC_MAX_TRIANGLES_PER_CELL);
  assert.equal(validateMarchingCubesTables(), true);
});

test('keeps empty and full density cases triangle-free', () => {
  assert.equal(MC_TRIANGLE_COUNTS[0], 0);
  assert.equal(MC_TRIANGLE_COUNTS[255], 0);
});
