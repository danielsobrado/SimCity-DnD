import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { CpuTreeImpostorBatch } from './CpuTreeImpostorBatch.js';
import { GpuTreeImpostorBatch } from './GpuTreeImpostorBatch.js';

export class TreeImpostorBatch {
  constructor({ renderer, scene, atlas, capacity, name, gpuCulling }) {
    this.mode = 'cpu';
    this.batch = null;
    if (gpuCulling && renderer.backend?.isWebGPUBackend) {
      try {
        this.batch = new GpuTreeImpostorBatch({ renderer, scene, atlas, capacity, name });
        this.mode = 'gpu';
      } catch (error) {
        console.warn('GPU tree impostor batch unavailable; using CPU culling.', error);
      }
    }
    if (!this.batch) {
      this.batch = new CpuTreeImpostorBatch({ scene, atlas, capacity, name });
    }
  }

  setRecords(records) {
    this.batch.setRecords(records);
    PerfCounters.set(`treeImpostorRecords.${this.mode}`, records.length);
  }

  update(camera, origin) {
    const visible = this.batch.update(camera, origin);
    PerfCounters.set(`treeImpostorSubmitted.${this.mode}`, visible);
    return visible;
  }

  dispose() {
    this.batch.dispose();
  }
}
