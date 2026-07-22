export class ChunkedHeightField {
  constructor({ worldStore }) {
    this.worldStore = worldStore;
    this.chunkSize = worldStore.chunkSize;
  }

  getVertex(x, z) {
    return this.worldStore.getHeight(x, z);
  }

  sample(cellX, cellZ) {
    return this.worldStore.sampleHeight(cellX, cellZ);
  }

  getCellHeight(x, z) {
    return this.worldStore.getCellHeight(x, z);
  }

  sculpt(options) {
    return this.worldStore.sculpt(options);
  }

  applyPatch(patch, direction) {
    this.worldStore.applyHeightPatch(patch, direction);
  }

  getChunk(chunkX, chunkZ) {
    return this.worldStore.getChunk(chunkX, chunkZ);
  }

  requestChunk(chunkX, chunkZ) {
    return this.worldStore.requestChunk(chunkX, chunkZ);
  }
}
