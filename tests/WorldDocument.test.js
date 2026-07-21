import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectMap } from '../src/editor/ObjectMap.js';
import { TileMap } from '../src/editor/TileMap.js';
import { createWorldDocument, loadWorldDocument } from '../src/editor/WorldDocument.js';

const catalog = [{
  key: 'tree',
  label: 'Tree',
  footprint: { width: 1, depth: 1 },
  allowedTileIds: [0],
}];

function createWorld() {
  const tileMap = new TileMap({ width: 4, height: 4, tileSize: 2, defaultTileId: 0 });
  return { tileMap, objectMap: new ObjectMap({ tileMap, objectCatalog: catalog }) };
}

test('world documents preserve terrain and objects', () => {
  const source = createWorld();
  source.tileMap.paintSquare(0, 0, 1, 1);
  source.objectMap.place({ definitionKey: 'tree', x: 2, z: 2, rotation: 0 });

  const target = createWorld();
  loadWorldDocument(createWorldDocument(source.tileMap, source.objectMap), target.tileMap, target.objectMap);

  assert.deepEqual(Array.from(target.tileMap.tiles), Array.from(source.tileMap.tiles));
  assert.deepEqual(target.objectMap.toDocument(), source.objectMap.toDocument());
});

test('legacy terrain-only documents load with an empty object layer', () => {
  const target = createWorld();
  target.objectMap.place({ definitionKey: 'tree', x: 2, z: 2, rotation: 0 });
  loadWorldDocument({
    version: 1,
    width: 4,
    height: 4,
    tileSize: 2,
    tiles: new Array(16).fill(0),
  }, target.tileMap, target.objectMap);

  assert.equal(target.objectMap.size, 0);
});
