import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStylizedLodConfig } from '../src/config/validateStylizedLodConfig.js';

function config() {
  return {
    stylizedSurface: {
      enabled: true,
      grass: { outerRingDensity: 0.45 },
      flowers: { outerRingDensity: 0.5 },
      streaming: { grassCellsPerBuildSlice: 64, inactiveReleaseFrames: 30 },
      lod: {
        enabled: true,
        tree: {
          meshRadius: 1,
          proxyRadius: 3,
          billboardRadius: 4,
          nearPixels: 32,
          proxyPixels: 8,
          billboardPixels: 1.5,
          hysteresisRatio: 0.15,
        },
        rock: {
          meshRadius: 1,
          proxyRadius: 3,
          nearPixels: 16,
          proxyPixels: 1.5,
          billboardPixels: 0.5,
          hysteresisRatio: 0.15,
        },
      },
    },
  };
}

test('validates projected LOD and streaming controls', () => {
  const value = config();
  assert.equal(validateStylizedLodConfig(value), value);
});

test('rejects inverted LOD radii', () => {
  const value = config();
  value.stylizedSurface.lod.tree.proxyRadius = 0;
  assert.throws(() => validateStylizedLodConfig(value), /proxyRadius must cover meshRadius/);
});

test('rejects non-descending projected pixel thresholds', () => {
  const value = config();
  value.stylizedSurface.lod.rock.proxyPixels = 32;
  assert.throws(() => validateStylizedLodConfig(value), /thresholds must descend/);
});
