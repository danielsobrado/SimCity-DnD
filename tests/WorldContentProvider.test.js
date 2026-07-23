import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LocalFirstWorldContentProvider,
  MemoryWorldContentProvider,
  UrlWorldContentProvider,
} from '../src/editor/world/WorldContentProvider.js';

test('local-first content returns local data without calling the URL provider', async () => {
  const local = new MemoryWorldContentProvider();
  await local.putChunk('world-a', 3, -2, { settlements: [{ id: 'local' }] });
  let remoteCalls = 0;
  const remote = {
    async getChunk() {
      remoteCalls += 1;
      return { settlements: [{ id: 'remote' }] };
    },
  };
  const provider = new LocalFirstWorldContentProvider({ local, remote });
  assert.deepEqual(
    await provider.getChunk('world-a', 3, -2),
    { settlements: [{ id: 'local' }] },
  );
  assert.equal(remoteCalls, 0);
});

test('local-first content caches URL results locally and falls back cleanly offline', async () => {
  const local = new MemoryWorldContentProvider();
  const remote = {
    async getChunk() {
      return { encounters: [{ id: 'remote-encounter' }] };
    },
  };
  const provider = new LocalFirstWorldContentProvider({ local, remote });
  const result = await provider.getChunk('world-a', 1, 2);
  assert.deepEqual(result, { encounters: [{ id: 'remote-encounter' }] });
  assert.deepEqual(await local.getChunk('world-a', 1, 2), result);

  provider.remote = { getChunk: async () => { throw new TypeError('offline'); } };
  assert.deepEqual(await provider.getChunk('world-a', 1, 2), result);
  assert.equal(await provider.getChunk('world-a', 8, 9), null);
});

test('URL content provider treats 404 as an empty chunk', async () => {
  const provider = new UrlWorldContentProvider({
    baseUrl: 'https://world.example/content',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(await provider.getChunk('world-a', -1, 4), null);
});

