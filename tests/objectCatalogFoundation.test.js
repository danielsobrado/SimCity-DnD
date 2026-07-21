import assert from 'node:assert/strict';
import test from 'node:test';
import { createObjectCatalog } from '../src/editor/objectCatalogSchema.js';

const TILE_BY_KEY = new Map([['plains', { id: 0 }]]);

function createDefinition() {
  return {
    key: 'cottage',
    label: 'Cottage',
    icon: 'house',
    category: 'building',
    color: '#ffffff',
    model: 'cottage',
    footprint: { width: 2, depth: 2 },
    foundation: {
      mode: 'terrace',
      maxSlopeDegrees: 15,
      maxDepth: 3,
      alignToNormal: false,
      color: '#777777',
    },
    allowedTerrain: ['plains'],
  };
}

test('normalizes valid foundation metadata', () => {
  const [definition] = createObjectCatalog([createDefinition()], TILE_BY_KEY);

  assert.deepEqual(definition.foundation, {
    mode: 'terrace',
    maxSlopeDegrees: 15,
    maxDepth: 3,
    alignToNormal: false,
    color: '#777777',
  });
});

test('rejects unsupported foundation modes', () => {
  const rawDefinition = createDefinition();
  rawDefinition.foundation.mode = 'floating';

  assert.throws(
    () => createObjectCatalog([rawDefinition], TILE_BY_KEY),
    /foundation mode/,
  );
});

test('rejects invalid slope limits', () => {
  const rawDefinition = createDefinition();
  rawDefinition.foundation.maxSlopeDegrees = 90;

  assert.throws(
    () => createObjectCatalog([rawDefinition], TILE_BY_KEY),
    /maximum slope/,
  );
});
