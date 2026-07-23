import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMacroAtlasPayload,
} from '../src/editor/import/AzgaarMacroWorldSource.js';
import { createAzgaarBiomeDefinitions } from '../src/editor/AzgaarBiomeCatalog.js';
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
    biomes: createAzgaarBiomeDefinitions(),
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

test('river vectors become local water channels without rasterizing the world', () => {
  const source = createSource();
  source.rivers = [{
    id: 1,
    widthAtlas: 0.75,
    points: [[1, 0], [1, 2]],
  }];
  const generator = new AzgaarMacroWorldGenerator(source, metadata);
  assert.equal(generator.sampleTile(-4, 0), 2);
  assert.notEqual(generator.sampleTile(0, 0), 2);
});

test('all standard Azgaar biome ids remain distinct regardless of mountain elevation', () => {
  const width = 13;
  const source = createSource();
  source.atlas = {
    width,
    height: 1,
    ...createMacroAtlasPayload({
      heights: Uint8Array.from([
        5, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 90, 40,
      ]),
      biomes: Uint8Array.from(Array.from({ length: width }, (_, index) => index)),
      features: new Uint16Array(width),
    }),
  };
  source.bounds = {
    minCellX: 0,
    minCellZ: 0,
    widthCells: width,
    heightCells: 1,
  };

  const generator = new AzgaarMacroWorldGenerator(source, metadata);
  const tileIds = Array.from({ length: width }, (_, x) => generator.sampleTile(x, 0));
  assert.deepEqual(tileIds, source.biomes.map((biome) => biome.tileId));
  assert.equal(new Set(tileIds).size, 13);
});

test('custom Azgaar biome tiles retain their exported render color', () => {
  const source = createSource();
  source.biomes = createAzgaarBiomeDefinitions({
    name: [
      'Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland',
      'Tropical seasonal forest', 'Temperate deciduous forest', 'Tropical rainforest',
      'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland',
      'Crystal barrens',
    ],
    color: Array.from({ length: 14 }, (_, index) => (
      index === 13 ? '#7f5ac6' : undefined
    )),
  });
  source.atlas = {
    width: 1,
    height: 1,
    ...createMacroAtlasPayload({
      heights: Uint8Array.of(40),
      biomes: Uint8Array.of(13),
      features: Uint16Array.of(1),
    }),
  };
  source.bounds = {
    minCellX: 0,
    minCellZ: 0,
    widthCells: 4,
    heightCells: 4,
  };

  const chunk = generateBaseWorldChunk({
    chunkX: 0,
    chunkZ: 0,
    chunkSize: 4,
    generator: metadata,
    baseTerrain: source,
  });
  assert.deepEqual([...chunk.tiles], Array(16).fill(32));
  assert.deepEqual([...chunk.tilePixels.slice(0, 4)], [127, 90, 198, 32]);
});
