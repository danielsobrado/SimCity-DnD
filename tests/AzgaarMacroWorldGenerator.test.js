import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMacroAtlasPayload,
} from '../src/editor/import/AzgaarMacroWorldSource.js';
import { AzgaarMacroWorldGenerator } from '../src/editor/world/AzgaarMacroWorldGenerator.js';
import { generateBaseWorldChunk } from '../src/editor/world/generateWorldChunk.js';

function createSource() {
  const width = 4;
  const height = 2;
  return {
    kind: 'azgaar-macro-v1',
    version: 1,
    source: { mapId: 'generator-test', seed: 'abc' },
    atlas: {
      width,
      height,
      ...createMacroAtlasPayload({
        heights: Uint8Array.from([
          0, 40, 80, 0,
          0, 40, 80, 0,
        ]),
        biomes: Uint8Array.from([
          0, 4, 6, 0,
          0, 4, 6, 0,
        ]),
        features: Uint16Array.from([
          2, 1, 1, 2,
          2, 1, 1, 2,
        ]),
      }),
    },
    physical: {
      widthMeters: 32,
      heightMeters: 16,
      distanceScale: 1,
      distanceUnit: 'km',
    },
    bounds: {
      minCellX: -8,
      minCellZ: -4,
      widthCells: 16,
      heightCells: 8,
    },
    oceanTransitionCells: 4,
    terrain: { minHeight: -16, maxHeight: 48, seaLevel: -1.5 },
    rivers: [],
  };
}

const metadata = {
  seed: 91,
  version: 1,
  heightScale: 12,
  seaLevel: -1.5,
};

test('macro generation is deterministic and respects ocean bounds', () => {
  const generator = new AzgaarMacroWorldGenerator(createSource(), metadata);
  assert.equal(generator.sampleTile(-7, 0), 2);
  assert.notEqual(generator.sampleTile(0, 0), 2);
  assert.equal(generator.sampleTile(20, 0), 2);
  assert.ok(generator.sampleHeight(20, 0) <= generator.sampleHeight(8, 0));
  assert.equal(generator.sampleHeight(0, 0), generator.sampleHeight(0, 0));
});

test('neighboring macro chunks share bit-identical edge heights', () => {
  const source = createSource();
  const left = generateBaseWorldChunk({
    chunkX: -1,
    chunkZ: 0,
    chunkSize: 4,
    generator: metadata,
    baseTerrain: source,
  });
  const right = generateBaseWorldChunk({
    chunkX: 0,
    chunkZ: 0,
    chunkSize: 4,
    generator: metadata,
    baseTerrain: source,
  });

  for (let z = 0; z <= 4; z += 1) {
    assert.equal(left.heights[z * 5 + 4], right.heights[z * 5]);
  }
});

test('clean macro chunks can be evicted and regenerated identically', () => {
  const request = {
    chunkX: 0,
    chunkZ: 0,
    chunkSize: 4,
    generator: metadata,
    baseTerrain: createSource(),
  };
  const first = generateBaseWorldChunk(request);
  const second = generateBaseWorldChunk(request);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.heights, second.heights);
});
