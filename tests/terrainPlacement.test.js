import assert from 'node:assert/strict';
import test from 'node:test';
import { HeightField } from '../src/editor/HeightField.js';
import { evaluateObjectSurface } from '../src/editor/TerrainPlacement.js';

const BOUNDS = Object.freeze({ minX: 0, minZ: 0, maxX: 0, maxZ: 0, width: 1, depth: 1 });

function definition(foundation) {
  return { key: 'test', foundation };
}

function setCellCorners(heightField, northWest, northEast, southWest, southEast) {
  heightField.heights[heightField.indexOf(0, 0)] = northWest;
  heightField.heights[heightField.indexOf(1, 0)] = northEast;
  heightField.heights[heightField.indexOf(0, 1)] = southWest;
  heightField.heights[heightField.indexOf(1, 1)] = southEast;
}

test('grounds terrace buildings on a flat elevated surface', () => {
  const heightField = new HeightField({ width: 2, height: 2 });
  setCellCorners(heightField, 4, 4, 4, 4);

  const result = evaluateObjectSurface({
    definition: definition({ mode: 'terrace', maxSlopeDegrees: 10, maxDepth: 2 }),
    heightField,
    bounds: BOUNDS,
    tileSize: 2,
  });

  assert.equal(result.valid, true);
  assert.equal(result.surface.baseHeight, 4);
  assert.equal(result.surface.foundationDepth, 0);
  assert.equal(result.surface.maximumSlopeDegrees, 0);
});

test('rejects terrain steeper than the object slope limit', () => {
  const heightField = new HeightField({ width: 2, height: 2 });
  setCellCorners(heightField, 0, 2, 0, 2);

  const result = evaluateObjectSurface({
    definition: definition({ mode: 'conform', maxSlopeDegrees: 30, maxDepth: 0 }),
    heightField,
    bounds: BOUNDS,
    tileSize: 2,
  });

  assert.equal(result.valid, false);
  assert.match(result.reason, /slope/i);
  assert.equal(Math.round(result.surface.maximumSlopeDegrees), 45);
});

test('rejects terrace foundations deeper than their configured limit', () => {
  const heightField = new HeightField({ width: 2, height: 2 });
  setCellCorners(heightField, 0, 1.5, 0, 1.5);

  const result = evaluateObjectSurface({
    definition: definition({ mode: 'terrace', maxSlopeDegrees: 60, maxDepth: 1 }),
    heightField,
    bounds: BOUNDS,
    tileSize: 2,
  });

  assert.equal(result.valid, false);
  assert.match(result.reason, /foundation depth/i);
  assert.equal(result.surface.baseHeight, 1.5);
  assert.equal(result.surface.foundationDepth, 1.5);
});

test('conforming props use the center height and a normalized surface normal', () => {
  const heightField = new HeightField({ width: 2, height: 2 });
  setCellCorners(heightField, 0, 1, 0, 1);

  const result = evaluateObjectSurface({
    definition: definition({ mode: 'conform', maxSlopeDegrees: 30, maxDepth: 0 }),
    heightField,
    bounds: BOUNDS,
    tileSize: 2,
  });

  assert.equal(result.valid, true);
  assert.equal(result.surface.baseHeight, 0.5);
  assert.ok(result.surface.normal.x < 0);
  assert.ok(Math.abs(Math.hypot(
    result.surface.normal.x,
    result.surface.normal.y,
    result.surface.normal.z,
  ) - 1) < 1e-6);
});
