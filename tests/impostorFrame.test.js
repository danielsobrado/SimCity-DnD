import assert from 'node:assert/strict';
import test from 'node:test';
import { createCaptureDirections, selectImpostorFrame } from '../src/editor/stylized/impostor/impostorFrame.js';

const settings = {
  columns: 8,
  rows: 2,
  lowElevationDegrees: 12,
  highElevationDegrees: 58,
};

test('capture directions cover every atlas cell', () => {
  const directions = createCaptureDirections(settings);
  assert.equal(directions.length, 16);
  assert.deepEqual(directions.map((direction) => direction.frame), [...Array(16).keys()]);
});

test('frame selection respects instance yaw', () => {
  const placement = { x: 0, z: 0, height: 0, rotationY: 0 };
  const front = selectImpostorFrame({ camera: { x: 0, y: 4, z: 20 }, placement, ...settings });
  const rotated = selectImpostorFrame({
    camera: { x: 0, y: 4, z: 20 },
    placement: { ...placement, rotationY: Math.PI / 2 },
    ...settings,
  });
  assert.notEqual(front, rotated);
});

test('high cameras select the upper elevation row', () => {
  const frame = selectImpostorFrame({
    camera: { x: 0, y: 100, z: 10 },
    placement: { x: 0, z: 0, height: 0, rotationY: 0 },
    ...settings,
  });
  assert.ok(frame >= settings.columns);
});
