import assert from 'node:assert/strict';
import test from 'node:test';
import { HeightField } from '../src/editor/HeightField.js';
import { ObjectMap } from '../src/editor/ObjectMap.js';
import { TileMap } from '../src/editor/TileMap.js';
import { VoxelStampStore } from '../src/editor/voxel/VoxelStampStore.js';
import { createWorldDocument, loadWorldDocument } from '../src/editor/WorldDocument.js';

const catalog = [{
  key: 'tree',
  label: 'Tree',
  footprint: { width: 1, depth: 1 },
  allowedTileIds: [0],
}];

function createWorld() {
  const tileMap = new TileMap({ width: 4, height: 4, tileSize: 2, defaultTileId: 0 });
  return {
    tileMap,
    heightField: new HeightField({ width: 4, height: 4 }),
    objectMap: new ObjectMap({ tileMap, objectCatalog: catalog }),
    voxelStampStore: new VoxelStampStore({ cells: [8, 8, 8], maxStamps: 8 }),
  };
}

function createStamp() {
  return {
    operation: 'subtract',
    center: [4, 4, 4],
    radius: 2,
    strength: 0.8,
    smoothness: 0.5,
  };
}

test('world documents preserve terrain, objects, heights, and voxel stamps', () => {
  const source = createWorld();
  source.tileMap.paintSquare(0, 0, 1, 1);
  source.heightField.sculpt({
    centerX: 1,
    centerZ: 1,
    brushSize: 1,
    operation: 'raise',
    strength: 1,
    smoothFactor: 0.5,
    minHeight: -4,
    maxHeight: 4,
  });
  source.objectMap.place({ definitionKey: 'tree', x: 2, z: 2, rotation: 0 });
  source.voxelStampStore.add(createStamp());

  const target = createWorld();
  loadWorldDocument(
    createWorldDocument(
      source.tileMap,
      source.heightField,
      source.objectMap,
      source.voxelStampStore,
    ),
    target.tileMap,
    target.heightField,
    target.objectMap,
    target.voxelStampStore,
  );

  assert.deepEqual(Array.from(target.tileMap.tiles), Array.from(source.tileMap.tiles));
  assert.deepEqual(Array.from(target.heightField.heights), Array.from(source.heightField.heights));
  assert.deepEqual(target.objectMap.toDocument(), source.objectMap.toDocument());
  assert.deepEqual(target.voxelStampStore.toDocument(), source.voxelStampStore.toDocument());
});

test('legacy terrain-only documents load with empty object and voxel layers', () => {
  const target = createWorld();
  target.objectMap.place({ definitionKey: 'tree', x: 2, z: 2, rotation: 0 });
  target.voxelStampStore.add(createStamp());
  loadWorldDocument({
    version: 1,
    width: 4,
    height: 4,
    tileSize: 2,
    tiles: new Array(16).fill(0),
  }, target.tileMap, target.heightField, target.objectMap, target.voxelStampStore);

  assert.equal(target.objectMap.size, 0);
  assert.equal(target.voxelStampStore.size, 0);
});

test('invalid voxel stamps restore the previous world transactionally', () => {
  const target = createWorld();
  target.voxelStampStore.add(createStamp());
  const previous = target.voxelStampStore.toDocument();
  const document = createWorldDocument(
    target.tileMap,
    target.heightField,
    target.objectMap,
    target.voxelStampStore,
  );
  document.voxelStamps = [{ ...previous[0], center: [99, 4, 4] }];

  assert.throws(
    () => loadWorldDocument(
      document,
      target.tileMap,
      target.heightField,
      target.objectMap,
      target.voxelStampStore,
    ),
    /center\[0\] must be within the chunk/,
  );
  assert.deepEqual(target.voxelStampStore.toDocument(), previous);
});
