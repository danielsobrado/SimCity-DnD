import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectMap } from '../src/editor/ObjectMap.js';
import { VoxelStampStore } from '../src/editor/voxel/VoxelStampStore.js';
import { ChunkedHeightField } from '../src/editor/world/ChunkedHeightField.js';
import { ChunkedTileMap } from '../src/editor/world/ChunkedTileMap.js';
import { InfiniteWorldStore } from '../src/editor/world/InfiniteWorldStore.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { INFINITE_WORLD_FORMAT_VERSION } from '../src/editor/world/worldConstants.js';
import { createWorldDocument, loadWorldDocument } from '../src/editor/WorldDocument.js';

const catalog = [{
  key: 'tree',
  label: 'Tree',
  footprint: { width: 1, depth: 1 },
  allowedTileIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
}];

function createWorld() {
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
    objectMap: new ObjectMap({ tileMap, objectCatalog: catalog }),
    voxelStampStore: new VoxelStampStore({
      cells: [16, 8, 16],
      maxStamps: 8,
    }),
  };
}

function createStamp() {
  return {
    operation: 'subtract',
    center: [8, 4, 8],
    radius: 2,
    strength: 0.8,
    smoothness: 0.5,
  };
}

test('world documents preserve terrain, objects, heights, voxel metadata, and stamps', () => {
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

  const document = createWorldDocument(
    source.tileMap,
    source.heightField,
    source.objectMap,
    source.voxelStampStore,
  );
  assert.equal(document.version, INFINITE_WORLD_FORMAT_VERSION);
  assert.deepEqual(document.voxelWorld, { cells: [16, 8, 16] });

  const target = createWorld();
  loadWorldDocument(
    document,
    target.tileMap,
    target.heightField,
    target.objectMap,
    target.voxelStampStore,
  );

  assert.equal(target.worldStore.getTile(0, 0), 1);
  assert.equal(target.worldStore.getHeight(1, 1), source.worldStore.getHeight(1, 1));
  assert.deepEqual(target.objectMap.toDocument(), source.objectMap.toDocument());
  assert.deepEqual(target.voxelStampStore.toDocument(), source.voxelStampStore.toDocument());
});

test('older dense native documents are rejected', () => {
  const target = createWorld();
  assert.throws(
    () => loadWorldDocument({
      version: 5,
      width: 4,
      height: 4,
      tileSize: 2,
      tiles: new Array(16).fill(0),
    }, target.tileMap, target.heightField, target.objectMap, target.voxelStampStore),
    /older dense map format/,
  );
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
    /center\[0\] must be within the voxel world/,
  );
  assert.deepEqual(target.voxelStampStore.toDocument(), previous);
});
