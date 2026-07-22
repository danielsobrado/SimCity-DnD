import { InfiniteWorldStore } from './InfiniteWorldStore.js';
import { cellKey, chunkKey } from './WorldCoordinates.js';

function tileIndex(localX, localZ, chunkSize) {
  return localZ * chunkSize + localX;
}

function heightIndex(localX, localZ, vertexSize) {
  return localZ * vertexSize + localX;
}

export class WorkerBackedWorldStore extends InfiniteWorldStore {
  constructor({ chunkWorker, ...options }) {
    super(options);
    this.chunkWorker = chunkWorker;
    this.pendingChunks = new Map();
  }

  requestChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    const cached = this.cache.get(key);
    if (cached) {
      this.clock += 1;
      cached.lastUsed = this.clock;
      return Promise.resolve(cached);
    }
    const pending = this.pendingChunks.get(key);
    if (pending) {
      return pending;
    }

    const request = this.chunkWorker.request(chunkX, chunkZ)
      .then((page) => this.completeWorkerPage(page))
      .finally(() => {
        this.pendingChunks.delete(key);
      });
    this.pendingChunks.set(key, request);
    return request;
  }

  completeWorkerPage(page) {
    const current = this.cache.get(page.key);
    if (current) {
      return current;
    }
    const { chunkX, chunkZ, originX, originZ } = page;
    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const override = this.tileOverrides.get(cellKey(originX + localX, originZ + localZ));
        if (override !== undefined) {
          page.tiles[tileIndex(localX, localZ, this.chunkSize)] = override;
        }
      }
    }
    for (let localZ = 0; localZ <= this.chunkSize; localZ += 1) {
      for (let localX = 0; localX <= this.chunkSize; localX += 1) {
        const override = this.heightOverrides.get(cellKey(originX + localX, originZ + localZ));
        if (override !== undefined) {
          page.heights[heightIndex(localX, localZ, this.vertexSize)] = override;
        }
      }
    }

    this.clock += 1;
    const completed = {
      ...page,
      revision: this.revision,
      lastUsed: this.clock,
    };
    this.cache.set(page.key, completed);
    this.evictCache();
    return completed;
  }

  clearOverrides() {
    this.pendingChunks.clear();
    return super.clearOverrides();
  }

  restoreSnapshot(snapshot) {
    this.pendingChunks.clear();
    super.restoreSnapshot(snapshot);
  }

  loadDocument(document) {
    this.pendingChunks.clear();
    super.loadDocument(document);
  }

  dispose() {
    this.pendingChunks.clear();
    this.chunkWorker.dispose();
  }
}
