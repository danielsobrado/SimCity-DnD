import { InfiniteWorldStore } from './InfiniteWorldStore.js';
import {
  decodeChunkDocument,
  encodeChunkDocument,
} from './ChunkDocumentCodec.js';
import {
  createSurfaceMaskConfig,
  enrichPageRenderPixels,
  getSurfaceMaskSearchRadius,
} from './ChunkRenderPixels.js';
import { cellKey, chunkKey, parseCellKey } from './WorldCoordinates.js';

function tileIndex(localX, localZ, chunkSize) {
  return localZ * chunkSize + localX;
}

function heightIndex(localX, localZ, vertexSize) {
  return localZ * vertexSize + localX;
}

function assertGeneratorMetadata(actual, expected) {
  const fields = ['seed', 'version', 'heightScale', 'seaLevel'];
  for (const field of fields) {
    if (actual?.[field] !== expected[field]) {
      throw new Error(`World generator ${field} does not match the active editor configuration.`);
    }
  }
}

export class WorkerBackedWorldStore extends InfiniteWorldStore {
  constructor({ chunkWorker, surfaceMaskConfig = null, ...options }) {
    super(options);
    this.chunkWorker = chunkWorker;
    this.surfaceMaskConfig = surfaceMaskConfig ?? createSurfaceMaskConfig(null);
    this.pendingChunks = new Map();
  }

  requestChunk(chunkX, chunkZ, { priority = 0 } = {}) {
    const key = chunkKey(chunkX, chunkZ);
    const cached = this.cache.get(key);
    if (cached) {
      this.clock += 1;
      cached.lastUsed = this.clock;
      return Promise.resolve(cached);
    }
    const pending = this.pendingChunks.get(key);
    if (pending) {
      // Already in flight — nudge its priority in case it became more urgent.
      this.chunkWorker.reprioritize?.(chunkX, chunkZ, priority);
      return pending;
    }

    const request = this.chunkWorker.request(chunkX, chunkZ, { priority })
      .then((page) => this.completeWorkerPage(page))
      .finally(() => {
        this.pendingChunks.delete(key);
      });
    this.pendingChunks.set(key, request);
    return request;
  }

  /** Drop a not-yet-started generation request for a chunk leaving residency. */
  cancelChunk(chunkX, chunkZ) {
    return this.chunkWorker.cancel?.(chunkX, chunkZ) ?? false;
  }

  refreshPageRenderPixels(page) {
    return enrichPageRenderPixels(
      page,
      (cellX, cellZ) => this.getTile(cellX, cellZ),
      this.surfaceMaskConfig,
    );
  }

  hasHaloTileOverrides(originX, originZ) {
    if (this.tileOverrides.size === 0) {
      return false;
    }
    const searchRadius = getSurfaceMaskSearchRadius(this.surfaceMaskConfig.blendCells);
    const minX = originX - searchRadius;
    const maxX = originX + this.chunkSize - 1 + searchRadius;
    const minZ = originZ - searchRadius;
    const maxZ = originZ + this.chunkSize - 1 + searchRadius;
    for (const key of this.tileOverrides.keys()) {
      const { chunkX: cellX, chunkZ: cellZ } = parseCellKey(key);
      if (cellX >= minX && cellX <= maxX && cellZ >= minZ && cellZ <= maxZ) {
        return true;
      }
    }
    return false;
  }

  completeWorkerPage(page) {
    const current = this.cache.get(page.key);
    if (current) {
      return current;
    }
    const { originX, originZ } = page;
    let appliedOverrides = false;
    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const override = this.tileOverrides.get(cellKey(originX + localX, originZ + localZ));
        if (override !== undefined) {
          page.tiles[tileIndex(localX, localZ, this.chunkSize)] = override;
          appliedOverrides = true;
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

    const pixelsMissing = !page.tilePixels || !page.surfaceMaskPixels;
    // Neighbor painted roads/water sit outside this page's tiles but inside the path halo.
    const neighborHaloDirty = this.hasHaloTileOverrides(originX, originZ);
    if (appliedOverrides || pixelsMissing || page.renderPixelsDirty || neighborHaloDirty) {
      this.refreshPageRenderPixels(page);
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

  toDocument() {
    const document = super.toDocument();
    return {
      ...document,
      chunks: document.chunks.map((chunk) => encodeChunkDocument(chunk, this.chunkSize)),
    };
  }

  loadInfiniteDocument(document) {
    assertGeneratorMetadata(document.world?.generator, this.generator.toMetadata());
    super.loadInfiniteDocument({
      ...document,
      chunks: document.chunks?.map((chunk) => decodeChunkDocument(chunk, this.chunkSize)),
    });
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
