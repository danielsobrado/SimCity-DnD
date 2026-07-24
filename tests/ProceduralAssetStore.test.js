import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProceduralAssetRecord,
  normalizeProceduralRecipe,
  ProceduralAssetStore,
} from '../src/editor/workshop/ProceduralAssetStore.js';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
  surfaceTextures: {
    sources: {},
    slots: {},
  },
};

function importedSurfaceTextures() {
  return {
    sources: {
      'albedo-shared': {
        name: 'medieval-stone.png',
        dataUrl: PNG_DATA_URL,
      },
      'albedo-unused': {
        name: 'unused.png',
        dataUrl: PNG_DATA_URL,
      },
    },
    slots: {
      walls: {
        sourceId: 'albedo-shared',
        mapping: 'repeat',
        repeat: 2.5,
        rotation: 90,
        tint: '#f4e3c2',
      },
      wood: {
        sourceId: 'albedo-shared',
        mapping: 'mirror',
        repeat: 1.5,
        rotation: 0,
        tint: '#84552f',
      },
    },
  };
}

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

test('older workshop recipes receive compatible quality and texture defaults', () => {
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
  assert.deepEqual(normalized.surfaceTextures, { sources: {}, slots: {} });
});

test('imported albedo is normalized, shared across areas, and strips unused sources', () => {
  const normalized = normalizeProceduralRecipe({
    ...recipe,
    surfaceTextures: importedSurfaceTextures(),
  });
  assert.deepEqual(Object.keys(normalized.surfaceTextures.sources), ['albedo-shared']);
  assert.equal(normalized.surfaceTextures.slots.walls.rotation, 90);
  assert.equal(normalized.surfaceTextures.slots.wood.mapping, 'mirror');
  assert.equal(
    normalized.surfaceTextures.slots.walls.sourceId,
    normalized.surfaceTextures.slots.wood.sourceId,
  );
  assert.ok(Object.isFrozen(normalized.surfaceTextures));
  assert.ok(Object.isFrozen(normalized.surfaceTextures.sources['albedo-shared']));
});

test('imported albedo rejects unsafe formats and missing sources', () => {
  assert.throws(
    () => normalizeProceduralRecipe({
      ...recipe,
      surfaceTextures: {
        sources: {
          'albedo-svg': {
            name: 'unsafe.svg',
            dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
          },
        },
        slots: {},
      },
    }),
    /PNG, JPEG, or WebP/,
  );
  assert.throws(
    () => normalizeProceduralRecipe({
      ...recipe,
      surfaceTextures: {
        sources: {},
        slots: {
          roof: {
            sourceId: 'albedo-missing',
            mapping: 'repeat',
            repeat: 2,
            rotation: 0,
            tint: '#ffffff',
          },
        },
      },
    }),
    /missing albedo source/,
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

test('procedural asset documents preserve authoritative recipes and imported images', () => {
  const source = new ProceduralAssetStore();
  const record = source.add({
    label: 'Textured Gatehouse',
    recipe: { ...recipe, surfaceTextures: importedSurfaceTextures() },
  });
  const document = source.toDocument();
  assert.equal(document[0].version, 2);
  assert.equal(document[0].key, record.key);
  assert.equal('geometry' in document[0], false);
  assert.equal(
    document[0].recipe.surfaceTextures.sources['albedo-shared'].dataUrl,
    PNG_DATA_URL,
  );

  const target = new ProceduralAssetStore();
  target.replaceAll(document);
  assert.deepEqual(target.toDocument(), document);
  assert.ok(Object.isFrozen(target.list()[0].recipe));
});

test('version-one workshop records migrate to version two', () => {
  const oldRecord = createProceduralAssetRecord({ label: 'Legacy Tower', recipe });
  const store = new ProceduralAssetStore();
  store.replaceAll([{ ...oldRecord, version: 1 }]);
  const [migrated] = store.toDocument();
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.recipe.surfaceTextures, { sources: {}, slots: {} });
});
