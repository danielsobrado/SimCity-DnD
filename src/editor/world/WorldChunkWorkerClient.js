import { generateBaseWorldChunk } from './generateWorldChunk.js';

export class WorldChunkWorkerClient {
  constructor({ chunkSize, generator }) {
    this.chunkSize = chunkSize;
    this.generator = generator.toMetadata();
    this.nextId = 1;
    this.pending = new Map();
    this.disposed = false;
    this.worker = typeof Worker === 'function'
      ? new Worker(new URL('./worldChunk.worker.js', import.meta.url), { type: 'module' })
      : null;

    if (this.worker) {
      this.worker.addEventListener('message', (event) => this.onMessage(event));
      this.worker.addEventListener('error', (event) => this.onError(event));
    }
  }

  request(chunkX, chunkZ) {
    if (this.disposed) {
      return Promise.reject(new Error('World chunk worker is disposed.'));
    }
    const request = {
      chunkX,
      chunkZ,
      chunkSize: this.chunkSize,
      generator: this.generator,
    };
    if (!this.worker) {
      return Promise.resolve(generateBaseWorldChunk(request));
    }

    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, request });
    });
  }

  onMessage(event) {
    const { id, page, error } = event.data ?? {};
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    if (error) {
      pending.reject(new Error(error));
      return;
    }
    pending.resolve(page);
  }

  onError(event) {
    const error = new Error(event.message || 'World chunk worker failed.');
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    const error = new Error('World chunk worker was disposed.');
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
