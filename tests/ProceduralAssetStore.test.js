import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProceduralAssetRecord,
  normalizeProceduralRecipe,
  ProceduralAssetStore,
} from '../src/editor/workshop/ProceduralAssetStore.js';

const recipe = {
  archetype: 'gatehouse',
  style: 'granite',
  width: 8,
  depth: 2,
  height: 5,
  seed: 1848,
  detail: 2,
  remesh: true,
  albedo: true,
};

test('procedural asset recipes are normalized and bounded', () => {
  const normalized = normalizeProceduralRecipe(recipe);
  assert.deepEqual(normalized, recipe);
  assert.throws(
    () => normalizeProceduralRecipe({ ...recipe, width: 100 }),
    /Width must be between/,
  );
  assert.throws(
    () => normalizeProceduralRecipe({ ...recipe, archetype: 'castle' }),
    /Unknown workshop archetype/,
  );
});

test('procedural object keys are stable and collision safe', () => {
  const first = createProceduralAssetRecord({ label: 'Granite Gatehouse', recipe });
  const repeat = createProceduralAssetRecord({ label: 'Granite Gatehouse', recipe });
  const collision = createProceduralAssetRecord(
    { label: 'Granite Gatehouse', recipe },
    new Set([first.key]),
  );
  assert.equal(first.key, repeat.key);
  assert.equal(collision.key, `${first.key}-2`);
});

test('procedural asset documents preserve only authoritative recipes', () => {
  const source = new ProceduralAssetStore();
  const record = source.add({ label: 'Granite Gatehouse', recipe });
  const document = source.toDocument();
  assert.equal(document[0].key, record.key);
  assert.equal('geometry' in document[0], false);

  const target = new ProceduralAssetStore();
  target.replaceAll(document);
  assert.deepEqual(target.toDocument(), document);
  assert.ok(Object.isFrozen(target.list()[0].recipe));
});
