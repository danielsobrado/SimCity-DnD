import { floorDiv } from '../world/WorldCoordinates.js';

function keyFor(chunkX, chunkZ) {
  return `${chunkX}:${chunkZ}`;
}

export class StylizedChunkRevisionTracker {
  constructor({ worldStore }) {
    this.worldStore = worldStore;
    this.chunkSize = worldStore.chunkSize;
    this.epoch = 0;
    this.revisions = new Map();
    this.unsubscribe = worldStore.subscribe((change) => this.onWorldChange(change));
  }

  onWorldChange(change) {
    if (change.kind === 'reset') {
      this.epoch += 1;
      this.revisions.clear();
      return;
    }

    for (const coordinate of change.cells ?? []) {
      this.touch(
        floorDiv(coordinate.x, this.chunkSize),
        floorDiv(coordinate.z, this.chunkSize),
      );
    }

    for (const coordinate of change.vertices ?? []) {
      const primaryX = floorDiv(coordinate.x, this.chunkSize);
      const primaryZ = floorDiv(coordinate.z, this.chunkSize);
      for (let offsetZ = -1; offsetZ <= 0; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 0; offsetX += 1) {
          const chunkX = primaryX + offsetX;
          const chunkZ = primaryZ + offsetZ;
          const localX = coordinate.x - chunkX * this.chunkSize;
          const localZ = coordinate.z - chunkZ * this.chunkSize;
          if (localX >= 0 && localX <= this.chunkSize
              && localZ >= 0 && localZ <= this.chunkSize) {
            this.touch(chunkX, chunkZ);
          }
        }
      }
    }
  }

  touch(chunkX, chunkZ) {
    const key = keyFor(chunkX, chunkZ);
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
  }

  signature(chunkX, chunkZ, halo = 0) {
    const values = [`e${this.epoch}`];
    for (let offsetZ = -halo; offsetZ <= halo; offsetZ += 1) {
      for (let offsetX = -halo; offsetX <= halo; offsetX += 1) {
        values.push(this.revisions.get(keyFor(chunkX + offsetX, chunkZ + offsetZ)) ?? 0);
      }
    }
    return values.join(':');
  }

  windowSignature(focus, radius, halo = 0) {
    const values = [`e${this.epoch}`];
    for (let chunkZ = focus.chunkZ - radius; chunkZ <= focus.chunkZ + radius; chunkZ += 1) {
      for (let chunkX = focus.chunkX - radius; chunkX <= focus.chunkX + radius; chunkX += 1) {
        values.push(this.signature(chunkX, chunkZ, halo));
      }
    }
    return values.join('|');
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.revisions.clear();
  }
}
