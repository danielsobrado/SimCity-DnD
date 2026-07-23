import assert from 'node:assert/strict';
import test from 'node:test';
import { ChunkedHeightField } from '../src/editor/world/ChunkedHeightField.js';
import { ChunkedTileMap } from '../src/editor/world/ChunkedTileMap.js';
import { InfiniteWorldStore } from '../src/editor/world/InfiniteWorldStore.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { INFINITE_WORLD_FORMAT_VERSION } from '../src/editor/world/worldConstants.js';
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
  const worldStore = new InfiniteWorldStore({
    chunkSize: 4,
    tileSize: 2,
    cacheLimit: 16,
    generator: new ProceduralWorldGenerator({ seed: 42 }),
  });
  const tileMap = new ChunkedTileMap({ worldStore, defaultTileId: 0 });
  return {
    worldStore,
    tileMap,
    heightField: new ChunkedHeightField({ worldStore }),
    objectMap: new ObjectMapStub(),
  };
}

test('world documents include sparse height overrides', () => {
  const source = createModels();
  source.tileMap.paintSquare(1, 1, 1, 2);
  source.worldStore.setHeight(2, 2, 3.5);
  source.objectMap.objects = [{ id: 1, definitionKey: 'tree', x: 0, z: 0, rotation: 0 }];

  const document = createWorldDocument(source.tileMap, source.heightField, source.objectMap);
  assert.equal(document.version, INFINITE_WORLD_FORMAT_VERSION);

  const target = createModels();
  loadWorldDocument(document, target.tileMap, target.heightField, target.objectMap);

  assert.equal(target.worldStore.getTile(1, 1), 2);
  assert.equal(target.worldStore.getHeight(2, 2), 3.5);
  assert.deepEqual(target.objectMap.objects, source.objectMap.objects);
});

test('older dense native documents are rejected', () => {
  const target = createModels();
  assert.throws(
    () => loadWorldDocument({
      version: 2,
      width: 4,
      height: 4,
      tileSize: 2,
      tiles: Array(16).fill(0),
      objects: [],
    }, target.tileMap, target.heightField, target.objectMap),
    /older dense map format/,
  );
});

test('failed infinite load restores all world models', () => {
  const target = createModels();
  target.tileMap.paintSquare(0, 0, 1, 3);
  target.worldStore.setHeight(1, 1, 2);
  target.objectMap.objects = [{ id: 7 }];
  const previousTile = target.worldStore.getTile(0, 0);
  const previousHeight = target.worldStore.getHeight(1, 1);
  const previousObjects = target.objectMap.toDocument();

  assert.throws(
    () => loadWorldDocument({
      version: INFINITE_WORLD_FORMAT_VERSION,
      world: {
        chunkSize: 99,
        tileSize: 2,
        generator: target.worldStore.generator.toMetadata(),
      },
      chunks: [],
      objects: [],
    }, target.tileMap, target.heightField, target.objectMap),
    /chunk or tile size does not match/,
  );

  assert.equal(target.worldStore.getTile(0, 0), previousTile);
  assert.equal(target.worldStore.getHeight(1, 1), previousHeight);
  assert.deepEqual(target.objectMap.objects, previousObjects);
});
