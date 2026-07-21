import { MAP_FORMAT_VERSION, SUPPORTED_MAP_FORMAT_VERSIONS } from './constants.js';

export class TileMap {
  constructor({ width, height, tileSize, defaultTileId }) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.tiles = new Uint8Array(width * height);
    this.tiles.fill(defaultTileId);
  }

  get tileCount() {
    return this.tiles.length;
  }

  inBounds(x, z) {
    return x >= 0 && z >= 0 && x < this.width && z < this.height;
  }

  indexOf(x, z) {
    return z * this.width + x;
  }

  coordinatesOf(index) {
    return { x: index % this.width, z: Math.floor(index / this.width) };
  }

  get(x, z) {
    return this.inBounds(x, z) ? this.tiles[this.indexOf(x, z)] : null;
  }

  paintSquare(centerX, centerZ, brushSize, tileId, canPaint = null) {
    const radius = Math.floor(brushSize / 2);
    const indices = [];
    const before = [];
    const after = [];

    for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (!this.inBounds(x, z)) {
          continue;
        }
        const index = this.indexOf(x, z);
        if (canPaint && !canPaint(x, z, index, tileId)) {
          continue;
        }
        const previous = this.tiles[index];
        if (previous === tileId) {
          continue;
        }
        this.tiles[index] = tileId;
        indices.push(index);
        before.push(previous);
        after.push(tileId);
      }
    }

    return { indices, before, after };
  }

  fill(tileId, canPaint = null) {
    const indices = [];
    const before = [];
    const after = [];

    for (let index = 0; index < this.tiles.length; index += 1) {
      const { x, z } = this.coordinatesOf(index);
      if (canPaint && !canPaint(x, z, index, tileId)) {
        continue;
      }
      const previous = this.tiles[index];
      if (previous === tileId) {
        continue;
      }
      this.tiles[index] = tileId;
      indices.push(index);
      before.push(previous);
      after.push(tileId);
    }

    return { indices, before, after };
  }

  applyPatch(patch, direction) {
    const values = direction === 'undo' ? patch.before : patch.after;
    for (let offset = 0; offset < patch.indices.length; offset += 1) {
      this.tiles[patch.indices[offset]] = values[offset];
    }
  }

  replaceTiles(tileValues) {
    if (!(tileValues instanceof Uint8Array) || tileValues.length !== this.tileCount) {
      throw new Error('Map tile payload has an invalid size.');
    }
    this.tiles.set(tileValues);
  }

  toDocument() {
    return {
      version: MAP_FORMAT_VERSION,
      width: this.width,
      height: this.height,
      tileSize: this.tileSize,
      tiles: Array.from(this.tiles),
      savedAt: new Date().toISOString(),
    };
  }

  loadDocument(document) {
    if (!SUPPORTED_MAP_FORMAT_VERSIONS.includes(document?.version)) {
      throw new Error(`Unsupported map version: ${document?.version ?? 'missing'}.`);
    }
    if (document.width !== this.width || document.height !== this.height) {
      throw new Error(`Map dimensions must be ${this.width} × ${this.height}.`);
    }
    this.replaceTiles(Uint8Array.from(document.tiles));
  }
}
