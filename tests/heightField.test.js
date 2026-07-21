import assert from 'node:assert/strict';
import test from 'node:test';
import { HeightField } from '../src/editor/HeightField.js';

const SCULPT_OPTIONS = Object.freeze({
  strength: 2,
  smoothFactor: 0.6,
  minHeight: -10,
  maxHeight: 20,
});

test('raise edits the shared vertex lattice and supports undo', () => {
  const heightField = new HeightField({ width: 4, height: 4 });
  const patch = heightField.sculpt({
    centerX: 1,
    centerZ: 1,
    brushSize: 1,
    operation: 'raise',
    ...SCULPT_OPTIONS,
  });

  assert.ok(patch.indices.length > 0);
  assert.ok(heightField.getCellHeight(1, 1) > 0);

  heightField.applyPatch(patch, 'undo');
  assert.equal(heightField.getCellHeight(1, 1), 0);

  heightField.applyPatch(patch, 'redo');
  assert.ok(heightField.getCellHeight(1, 1) > 0);
});

test('sculpting respects protected shared vertices', () => {
  const heightField = new HeightField({ width: 4, height: 4 });
  const protectedIndex = heightField.indexOf(2, 2);
  heightField.sculpt({
    centerX: 1,
    centerZ: 1,
    brushSize: 3,
    operation: 'raise',
    canEdit: (_x, _z, index) => index !== protectedIndex,
    ...SCULPT_OPTIONS,
  });

  assert.equal(heightField.heights[protectedIndex], 0);
  assert.ok(heightField.heights.some((value) => value > 0));
});

test('smooth reduces a local spike', () => {
  const heightField = new HeightField({ width: 4, height: 4 });
  const centerIndex = heightField.indexOf(2, 2);
  heightField.heights[centerIndex] = 10;

  const patch = heightField.sculpt({
    centerX: 1.5,
    centerZ: 1.5,
    brushSize: 3,
    operation: 'smooth',
    ...SCULPT_OPTIONS,
  });

  assert.ok(patch.indices.includes(centerIndex));
  assert.ok(heightField.heights[centerIndex] < 10);
  assert.ok(heightField.heights[centerIndex] > 0);
});

test('heightfield documents are sparse and round-trip', () => {
  const source = new HeightField({ width: 8, height: 8 });
  source.heights[source.indexOf(2, 3)] = 4.25;
  source.heights[source.indexOf(7, 1)] = -2.5;

  const document = source.toDocument();
  assert.equal(document.values.length, 2);

  const target = new HeightField({ width: 8, height: 8 });
  target.loadDocument(document);
  assert.deepEqual(Array.from(target.heights), Array.from(source.heights));
});

test('missing legacy heightfield data resets to flat terrain', () => {
  const heightField = new HeightField({ width: 2, height: 2 });
  heightField.heights.fill(3);
  heightField.loadDocument(undefined);
  assert.ok(heightField.heights.every((value) => value === 0));
});
