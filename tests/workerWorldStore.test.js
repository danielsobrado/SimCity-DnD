import assert from 'node:assert/strict';
import test from 'node:test';
import { generateBaseWorldChunk } from '../src/editor/world/generateWorldChunk.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { WorkerBackedWorldStore } from '../src/editor/world/WorkerBackedWorldStore.js';

class FakeChunkWorker {
  constructor({ chunkSize, generator }) {
    this.chunkSize = chunkSize;
    this.generator = generator.toMetadata();
    this.requestCount = 0;
    this.disposed = false;
  }

  request(chunkX, chunkZ) {
    this.requestCount += 1;
    return Promise.resolve(generateBaseWorldChunk({
      chunkX,
      chunkZ,
      chunkSize: this.chunkSize,
      generator: this.generator,
    }));
  }

  dispose() {
    this.disposed = true;
  }
}

function createStore(seed = 73) {
  const generator = new ProceduralWorldGenerator({ seed });
  const chunkWorker = new FakeChunkWorker({ chunkSize: 4, generator });
  return {
    chunkWorker,
    store: new WorkerBackedWorldStore({
      chunkWorker,
      chunkSize: 4,
      tileSize: 2,
      cacheLimit: 3,
      generator,
    }),
  };
}

test('base chunk generation is deterministic and transferable', () => {
  const request = {
    chunkX: -2,
    chunkZ: 3,
    chunkSize: 4,
    generator: new ProceduralWorldGenerator({ seed: 73 }).toMetadata(),
  };
  const left = generateBaseWorldChunk(request);
  const right = generateBaseWorldChunk(request);
  assert.deepEqual(left.tiles, right.tiles);
  assert.deepEqual(left.heights, right.heights);
  assert.equal(left.tiles.length, 16);
  assert.equal(left.heights.length, 25);
});

test('concurrent requests for one chunk share a single worker job', async () => {
  const { store, chunkWorker } = createStore();
  const [left, right] = await Promise.all([
    store.requestChunk(4, -3),
    store.requestChunk(4, -3),
  ]);
  assert.equal(chunkWorker.requestCount, 1);
  assert.equal(left, right);
  store.dispose();
  assert.equal(chunkWorker.disposed, true);
});

test('sparse overrides are applied after worker generation', async () => {
  const { store } = createStore();
  store.setTile(1, 1, 9);
  store.setHeight(2, 2, 18.5);
  const page = await store.requestChunk(0, 0);
  assert.equal(page.tiles[5], 9);
  assert.equal(page.heights[12], 18.5);
  store.dispose();
});

test('dense modified chunks use binary encoding and round trip', () => {
  const { store } = createStore();
  for (let z = 0; z < 4; z += 1) {
    for (let x = 0; x < 4; x += 1) {
      store.setTile(x, z, 9, { silent: true });
    }
  }
  for (let z = 0; z <= 4; z += 1) {
    for (let x = 0; x <= 4; x += 1) {
      store.setHeight(x, z, 100 + z * 5 + x, { silent: true });
    }
  }

  const document = store.toDocument();
  assert.equal(document.chunks.length, 4);
  const primary = document.chunks.find((chunk) => chunk.x === 0 && chunk.z === 0);
  assert.equal(primary.encoding, 'base64-le-v1');
  assert.equal(typeof primary.tileData, 'string');
  assert.equal(typeof primary.heightData, 'string');
  assert.equal(primary.tiles, undefined);

  const { store: restored } = createStore();
  restored.loadDocument(document);
  assert.equal(restored.getTile(3, 3), 9);
  assert.equal(restored.getHeight(4, 4), 124);
  store.dispose();
  restored.dispose();
});

test('native documents reject a mismatched procedural generator', () => {
  const { store } = createStore();
  store.setTile(0, 0, 9);
  const document = store.toDocument();
  const { store: mismatched } = createStore(74);
  assert.throws(
    () => mismatched.loadDocument(document),
    /generator seed does not match/,
  );
  store.dispose();
  mismatched.dispose();
});

test('older dense native documents are rejected', () => {
  const { store } = createStore();
  assert.throws(
    () => store.loadDocument({
      version: 5,
      width: 2,
      height: 2,
      tileSize: 2,
      tiles: [0, 0, 0, 0],
      heightfield: {
        width: 2,
        height: 2,
        values: [[4, 7]],
      },
    }),
    /older dense map format/,
  );
  store.dispose();
});
