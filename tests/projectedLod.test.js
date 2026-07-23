import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampLodToRadii,
  projectedPixelHeight,
  selectProjectedLod,
} from '../src/editor/stylized/lod/projectedLod.js';

const thresholds = {
  nearPixels: 32,
  proxyPixels: 8,
  billboardPixels: 1.5,
};

test('orthographic projected size responds to zoom', () => {
  const camera = {
    isOrthographicCamera: true,
    top: 90,
    bottom: -90,
    zoom: 1,
  };
  const normal = projectedPixelHeight({ camera, worldPosition: {}, worldHeight: 10, viewportHeight: 900 });
  camera.zoom = 2;
  const zoomed = projectedPixelHeight({ camera, worldPosition: {}, worldHeight: 10, viewportHeight: 900 });
  assert.equal(normal, 50);
  assert.equal(zoomed, 100);
});

test('perspective projected size falls with distance', () => {
  const camera = {
    isOrthographicCamera: false,
    fov: 60,
    position: { x: 0, y: 0, z: 0 },
  };
  const near = projectedPixelHeight({ camera, worldPosition: { x: 0, y: 0, z: 10 }, worldHeight: 5, viewportHeight: 1000 });
  const far = projectedPixelHeight({ camera, worldPosition: { x: 0, y: 0, z: 100 }, worldHeight: 5, viewportHeight: 1000 });
  assert.ok(near > far * 9.9);
});

test('LOD hysteresis prevents immediate boundary oscillation', () => {
  assert.equal(selectProjectedLod({ pixels: 31, previous: 'near', hysteresisRatio: 0.15, ...thresholds }), 'near');
  assert.equal(selectProjectedLod({ pixels: 26, previous: 'near', hysteresisRatio: 0.15, ...thresholds }), 'proxy');
  assert.equal(selectProjectedLod({ pixels: 33, previous: 'proxy', hysteresisRatio: 0.15, ...thresholds }), 'proxy');
  assert.equal(selectProjectedLod({ pixels: 38, previous: 'proxy', hysteresisRatio: 0.15, ...thresholds }), 'near');
});

test('LOD radii cap expensive representations', () => {
  assert.equal(clampLodToRadii({ band: 'near', chunkDistance: 2, meshRadius: 1, proxyRadius: 3, billboardRadius: 5 }), 'proxy');
  assert.equal(clampLodToRadii({ band: 'proxy', chunkDistance: 4, meshRadius: 1, proxyRadius: 3, billboardRadius: 5 }), 'billboard');
  assert.equal(clampLodToRadii({ band: 'billboard', chunkDistance: 6, meshRadius: 1, proxyRadius: 3, billboardRadius: 5 }), 'culled');
});
