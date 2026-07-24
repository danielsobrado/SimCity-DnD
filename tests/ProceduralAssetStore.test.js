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
  topStyle: 'terracotta',
  finish: 'masonry',
  shape: 'classic',
  towerSide: 'left',
  width: 8,
  depth: 2,
  height: 5,
  roofScale: 1,
  roofOverhang: 0.35,
  seed: 1848,
  detail: 2,
  weathering: 0.35,
  windows: true,
  ivy: true,
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
  assert.throws(
    () => normalizeProceduralRecipe({ ...recipe, topStyle: 'onion-dome' }),
    /Unknown workshop top style/,
  );
});

test('older workshop recipes receive compatible quality defaults', () => {
  const normalized = normalizeProceduralRecipe({
    archetype: 'tower',
    style: 'granite',
    width: 6,
    depth: 2,
    height: 7,
    seed: 5,
    detail: 2,
    remesh: true,
    albedo: true,
  });
  assert.equal(normalized.topStyle, 'battlements');
  assert.equal(normalized.finish, 'masonry');
  assert.equal(normalized.shape, 'classic');
  assert.equal(normalized.towerSide, 'left');
  assert.equal(normalized.roofScale, 1);
  assert.equal(normalized.roofOverhang, 0.35);
  assert.equal(normalized.weathering, 0.35);
  assert.equal(normalized.windows, true);
  assert.equal(normalized.ivy, false);
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
