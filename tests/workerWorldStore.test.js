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

function createStore() {
  const generator = new ProceduralWorldGenerator({ seed: 73 });
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

test('legacy sparse height documents keep implicit vertices flat', () => {
  const { store } = createStore();
  store.loadDocument({
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
  });
  assert.equal(store.getHeight(0, 0), 7);
  assert.equal(store.getHeight(-1, -1), 0);
  assert.equal(store.getHeight(1, 1), 0);
  store.dispose();
});
