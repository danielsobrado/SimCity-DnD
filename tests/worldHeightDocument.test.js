import assert from 'node:assert/strict';
import test from 'node:test';
import { HeightField } from '../src/editor/HeightField.js';
import { TileMap } from '../src/editor/TileMap.js';
import { createWorldDocument, loadWorldDocument } from '../src/editor/WorldDocument.js';

class ObjectMapStub {
  constructor() {
    this.objects = [];
  }

  toDocument() {
    return this.objects.map((object) => ({ ...object }));
  }

  loadDocument(objects) {
    if (!Array.isArray(objects)) {
      throw new Error('Object payload must be an array.');
    }
    this.objects = objects.map((object) => ({ ...object }));
  }

  replaceAll(objects) {
    this.loadDocument(objects);
  }
}

function createModels() {
  return {
    tileMap: new TileMap({ width: 4, height: 4, tileSize: 2, defaultTileId: 0 }),
    heightField: new HeightField({ width: 4, height: 4 }),
    objectMap: new ObjectMapStub(),
  };
}

test('world documents include sparse heightfield state', () => {
  const source = createModels();
  source.tileMap.paintSquare(1, 1, 1, 2);
  source.heightField.heights[source.heightField.indexOf(2, 2)] = 3.5;
  source.objectMap.objects = [{ id: 1, definitionKey: 'tree', x: 0, z: 0, rotation: 0 }];

  const document = createWorldDocument(source.tileMap, source.heightField, source.objectMap);
  const target = createModels();
  loadWorldDocument(document, target.tileMap, target.heightField, target.objectMap);

  assert.deepEqual(Array.from(target.tileMap.tiles), Array.from(source.tileMap.tiles));
  assert.deepEqual(Array.from(target.heightField.heights), Array.from(source.heightField.heights));
  assert.deepEqual(target.objectMap.objects, source.objectMap.objects);
});

test('version two worlds load with a flat heightfield', () => {
  const target = createModels();
  target.heightField.heights.fill(5);
  loadWorldDocument({
    version: 2,
    width: 4,
    height: 4,
    tileSize: 2,
    tiles: Array(16).fill(0),
    objects: [],
  }, target.tileMap, target.heightField, target.objectMap);

  assert.ok(target.heightField.heights.every((value) => value === 0));
});

test('failed heightfield loading restores all world models', () => {
  const target = createModels();
  target.tileMap.paintSquare(0, 0, 1, 3);
  target.heightField.heights[target.heightField.indexOf(1, 1)] = 2;
  target.objectMap.objects = [{ id: 7 }];
  const previousTiles = Array.from(target.tileMap.tiles);
  const previousHeights = Array.from(target.heightField.heights);
  const previousObjects = target.objectMap.toDocument();

  assert.throws(() => loadWorldDocument({
    version: 3,
    width: 4,
    height: 4,
    tileSize: 2,
    tiles: Array(16).fill(1),
    heightfield: { width: 99, height: 99, values: [] },
    objects: [],
  }, target.tileMap, target.heightField, target.objectMap), /Heightfield dimensions/);

  assert.deepEqual(Array.from(target.tileMap.tiles), previousTiles);
  assert.deepEqual(Array.from(target.heightField.heights), previousHeights);
  assert.deepEqual(target.objectMap.objects, previousObjects);
});
