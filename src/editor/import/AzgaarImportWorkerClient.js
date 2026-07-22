import { importAzgaarFullJson } from './AzgaarJsonImporter.js';

export class AzgaarImportWorkerClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.worker = typeof Worker === 'function'
      ? new Worker(new URL('./azgaarImport.worker.js', import.meta.url), { type: 'module' })
      : null;
    if (this.worker) {
      this.worker.addEventListener('message', (event) => this.onMessage(event));
      this.worker.addEventListener('error', (event) => this.onError(event));
    }
  }

  convert(document, config) {
    if (!this.worker) {
      return Promise.resolve(importAzgaarFullJson(document, config));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, document, config });
    });
  }

  onMessage(event) {
    const { id, world, error } = event.data ?? {};
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    error ? pending.reject(new Error(error)) : pending.resolve(world);
  }

  onError(event) {
    const error = new Error(event.message || 'Azgaar import worker failed.');
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    const error = new Error('Azgaar import worker was disposed.');
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
