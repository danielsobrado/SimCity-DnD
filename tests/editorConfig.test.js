import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEditorConfig } from '../src/config/validateEditorConfig.js';

function createValidConfig() {
  return {
    map: {
      width: 512,
      height: 512,
      tileSize: 2,
      chunkSize: 32,
    },
    camera: {
      viewSize: 180,
    },
    renderer: {
      antialias: true,
      forceWebGL: false,
      maxPixelRatio: 2,
    },
    terrain: {
      minHeight: -16,
      maxHeight: 48,
      sculptStrength: 1.25,
      smoothFactor: 0.45,
    },
    brush: {
      sizes: [1, 3, 5],
      defaultSize: 3,
    },
  };
}

test('accepts positive nested map, camera, renderer, and terrain values', () => {
  const config = createValidConfig();
  assert.equal(validateEditorConfig(config), config);
});

test('reads map.width through nested object paths', () => {
  const config = createValidConfig();
  config.map.width = 0;

  assert.throws(
    () => validateEditorConfig(config),
    /map\.width must be positive/,
  );
});

test('rejects invalid renderer configuration', () => {
  const config = createValidConfig();
  config.renderer.forceWebGL = 'false';

  assert.throws(
    () => validateEditorConfig(config),
    /renderer\.forceWebGL must be boolean/,
  );
});

test('rejects invalid terrain limits', () => {
  const config = createValidConfig();
  config.terrain.maxHeight = config.terrain.minHeight;

  assert.throws(
    () => validateEditorConfig(config),
    /terrain\.maxHeight must exceed terrain\.minHeight/,
  );
});

test('rejects invalid terrain smoothing', () => {
  const config = createValidConfig();
  config.terrain.smoothFactor = 1.5;

  assert.throws(
    () => validateEditorConfig(config),
    /terrain\.smoothFactor must be within/,
  );
});

test('rejects a default brush size outside the configured sizes', () => {
  const config = createValidConfig();
  config.brush.defaultSize = 9;

  assert.throws(
    () => validateEditorConfig(config),
    /brush\.defaultSize must be listed/,
  );
});
