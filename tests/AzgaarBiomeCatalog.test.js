import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AZGAAR_STANDARD_BIOMES,
  createAzgaarBiomeDefinitions,
} from '../src/editor/AzgaarBiomeCatalog.js';

const STANDARD_NAMES = [
  'Marine',
  'Hot desert',
  'Cold desert',
  'Savanna',
  'Grassland',
  'Tropical seasonal forest',
  'Temperate deciduous forest',
  'Tropical rainforest',
  'Temperate rainforest',
  'Taiga',
  'Tundra',
  'Glacier',
  'Wetland',
];

test('defines all 13 standard Azgaar biomes as distinct terrain types', () => {
  assert.equal(AZGAAR_STANDARD_BIOMES.length, 13);
  assert.deepEqual(AZGAAR_STANDARD_BIOMES.map((biome) => biome.name), STANDARD_NAMES);
  assert.deepEqual(AZGAAR_STANDARD_BIOMES.map((biome) => biome.sourceId), [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
  assert.equal(new Set(AZGAAR_STANDARD_BIOMES.map((biome) => biome.tileId)).size, 13);
  assert.equal(AZGAAR_STANDARD_BIOMES[0].tileId, 2);
});

test('preserves exported standard colors and allocates deterministic custom biome ids', () => {
  const definitions = createAzgaarBiomeDefinitions({
    name: [...STANDARD_NAMES, 'Crystal barrens', 'Fungal jungle'],
    color: [
      '#123456',
      ...Array.from({ length: 12 }, () => undefined),
      '#7f5ac6',
      '#244d32',
    ],
  });

  assert.equal(definitions[0].standard, true);
  assert.equal(definitions[0].color, '#123456');
  assert.deepEqual(
    definitions.slice(13).map(({ sourceId, tileId, name, color, standard }) => ({
      sourceId, tileId, name, color, standard,
    })),
    [
      {
        sourceId: 13,
        tileId: 32,
        name: 'Crystal barrens',
        color: '#7f5ac6',
        standard: false,
      },
      {
        sourceId: 14,
        tileId: 33,
        name: 'Fungal jungle',
        color: '#244d32',
        standard: false,
      },
    ],
  );
});

test('creates definitions for custom biome ids used by cells even when metadata is sparse', () => {
  const definitions = createAzgaarBiomeDefinitions(
    { name: STANDARD_NAMES, color: [] },
    [19],
  );
  const custom = definitions.find((definition) => definition.sourceId === 19);
  assert.equal(custom.tileId, 32);
  assert.equal(custom.name, 'Custom biome 19');
  assert.match(custom.color, /^#[0-9a-f]{6}$/);
});
