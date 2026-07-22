import { GpuVoxelChunk } from './GpuVoxelChunk.js';
import { selectVoxelStampsForChunk } from './VoxelWorldLayout.js';

function signatureFor(stamps) {
  return JSON.stringify(stamps.map((stamp) => [
    stamp.id,
    stamp.operation,
    ...stamp.center,
    stamp.radius,
    stamp.strength,
    stamp.smoothness,
  ]));
}

function aggregateStatus(chunks, layout, stampStore) {
  const chunkStates = chunks.map((chunk) => chunk.getStatus());
  const failed = chunkStates.find((state) => state.code === 'failed');
  const unsupported = chunkStates.find((state) => state.code === 'unsupported');
  const readyCount = chunkStates.filter((state) => state.ready).length;
  const rebuilding = chunkStates.some((state) => state.rebuilding);
  let code = 'pending';
  let error = null;

  if (!layout.enabled) {
    code = 'disabled';
  } else if (failed) {
    code = 'failed';
    error = failed.error;
  } else if (unsupported) {
    code = 'unsupported';
    error = unsupported.error;
  } else if (readyCount === chunks.length) {
    code = 'ready';
  }

  return Object.freeze({
    code,
    enabled: layout.enabled,
    supported: code !== 'unsupported',
    ready: code === 'ready',
    visible: chunkStates.some((state) => state.visible),
    rebuilding,
    algorithm: 'marching-cubes',
    chunkCount: chunks.length,
    readyChunkCount: readyCount,
    chunkGrid: Object.freeze([layout.chunksX, layout.chunksZ]),
    chunkCells: Object.freeze([
      layout.chunkCellsX,
      layout.chunkCellsY,
      layout.chunkCellsZ,
    ]),
    cells: Object.freeze([
      layout.totalCellsX,
      layout.totalCellsY,
      layout.totalCellsZ,
    ]),
    stampCount: stampStore?.size ?? 0,
    maxStamps: layout.maxStamps,
    error,
  });
}

export class GpuVoxelWorld {
  constructor({ terrainView, layout, stampStore }) {
    this.terrainView = terrainView;
    this.layout = layout;
    this.stampStore = stampStore;
    this.chunks = layout.chunks.map((descriptor) => new GpuVoxelChunk({
      terrainView,
      worldLayout: layout,
      descriptor,
    }));
    this.stampSignatures = new Map();
    this.unsubscribeStamps = null;
    this.disposed = false;
  }

  getStatus() {
    return aggregateStatus(this.chunks, this.layout, this.stampStore);
  }

  async initialize() {
    this.applyStampSnapshot(this.stampStore?.list() ?? [], false);
    for (const chunk of this.chunks) {
      await chunk.initialize();
    }
    this.unsubscribeStamps = this.stampStore?.subscribe((stamps) => {
      this.applyStampSnapshot(stamps, true);
    });
    return this.getStatus();
  }

  applyStampSnapshot(stamps, regenerate) {
    for (let index = 0; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index];
      const descriptor = this.layout.chunks[index];
      const selected = selectVoxelStampsForChunk(stamps, descriptor, this.layout);
      const signature = signatureFor(selected);
      if (this.stampSignatures.get(descriptor.key) === signature) {
        continue;
      }
      this.stampSignatures.set(descriptor.key, signature);
      if (regenerate) {
        chunk.setStamps(selected);
      } else {
        chunk.stamps = selected;
      }
    }
  }

  mapCellToVoxel(cellX, cellZ) {
    const world = this.terrainView.cellToWorld(cellX, cellZ);
    const origin = this.terrainView.cellToWorld(this.layout.originX, this.layout.originZ);
    const x = (world.x - origin.x) / this.layout.voxelSize + this.layout.totalCellsX * 0.5;
    const z = (world.z - origin.z) / this.layout.voxelSize + this.layout.totalCellsZ * 0.5;
    if (x < 0 || z < 0 || x > this.layout.totalCellsX || z > this.layout.totalCellsZ) {
      return null;
    }
    return Object.freeze({ x, z });
  }

  setVisible(visible) {
    if (!this.getStatus().ready) {
      return false;
    }
    for (const chunk of this.chunks) {
      chunk.setVisible(visible);
    }
    return Boolean(visible);
  }

  toggle() {
    return this.setVisible(!this.getStatus().visible);
  }

  update() {
    for (const chunk of this.chunks) {
      chunk.update();
    }
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribeStamps?.();
    this.unsubscribeStamps = null;
    for (const chunk of this.chunks) {
      chunk.dispose();
    }
  }
}
