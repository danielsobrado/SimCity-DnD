import assert from 'node:assert/strict';
import test from 'node:test';
import { clumpsPerCell, densityForDistance, grassInstanceAttributeBytes } from '../src/editor/stylized/grassLodMath.js';

test('grass clumping preserves effective blade density with fewer instances', () => {
  assert.equal(clumpsPerCell(48, 8), 6);
  const bytes = grassInstanceAttributeBytes({
    chunkSize: 64,
    bladesPerCell: 48,
    bladesPerClump: 8,
  });
  assert.equal(bytes, 64 * 64 * 6 * 7 * 4);
  assert.ok(bytes < 1024 * 1024);
});

test('outer-ring density is monotonic', () => {
  assert.equal(densityForDistance(0, 2, 0.4), 1);
  assert.equal(densityForDistance(2, 2, 0.4), 0.4);
  assert.ok(densityForDistance(1, 2, 0.4) < 1);
});
