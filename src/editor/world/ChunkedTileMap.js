import { cellKey, parseCellKey } from './WorldCoordinates.js';
import { WORLD_MAX_SAFE_CELL_COORDINATE } from './worldConstants.js';

export class ChunkedTileMap {
  constructor({ worldStore, defaultTileId }) {
    this.worldStore = worldStore;
    this.tileSize = worldStore.tileSize;
    this.chunkSize = worldStore.chunkSize;
    this.defaultTileId = defaultTileId;
  }

  get tileCount() {
    return Number.POSITIVE_INFINITY;
  }

  inBounds(x, z) {
    return Number.isSafeInteger(x)
      && Number.isSafeInteger(z)
      && Math.abs(x) <= WORLD_MAX_SAFE_CELL_COORDINATE
      && Math.abs(z) <= WORLD_MAX_SAFE_CELL_COORDINATE;
  }

  indexOf(x, z) {
    if (!this.inBounds(x, z)) {
      throw new Error('Cell coordinate is outside the supported infinite-world range.');
    }
    return cellKey(x, z);
  }

  coordinatesOf(index) {
    const { chunkX: x, chunkZ: z } = parseCellKey(index);
    return { x, z };
  }

  get(x, z) {
    return this.inBounds(x, z) ? this.worldStore.getTile(x, z) : null;
  }

  paintSquare(centerX, centerZ, brushSize, tileId, canPaint = null) {
    return this.worldStore.paintSquare(centerX, centerZ, brushSize, tileId, canPaint);
  }

  applyPatch(patch, direction) {
    this.worldStore.applyTilePatch(patch, direction);
  }

  getChunk(chunkX, chunkZ) {
    return this.worldStore.getChunk(chunkX, chunkZ);
  }

  requestChunk(chunkX, chunkZ) {
    return this.worldStore.requestChunk(chunkX, chunkZ);
  }
}
