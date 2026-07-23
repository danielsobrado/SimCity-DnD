import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { StylizedBuildQueue } from './StylizedBuildQueue.js';
import {
  blockersForChunk,
  buildStableChunkManifest,
  placementSignature,
} from './StableScatterManifest.js';

export class TreeManifestStore {
  constructor({ terrainView, config, revisionTracker, prototypeCount, onBuilt }) {
    this.terrainView = terrainView;
    this.config = config;
    this.revisionTracker = revisionTracker;
    this.prototypeCount = prototypeCount;
    this.onBuilt = onBuilt;
    this.cache = new Map();
    this.pendingKeys = new Set();
    this.activeKeys = new Set();
    this.queue = new StylizedBuildQueue({
      buildsPerFrame: config.streaming?.treeManifestBuildsPerFrame ?? 4,
      budgetMs: config.streaming?.manifestBuildBudgetMs ?? 3,
    });
  }

  context(chunkX, chunkZ, rockSource) {
    const clearRadius = this.config.trees.clearRadius ?? this.terrainView.worldStore.tileSize;
    const rocks = Array.isArray(rockSource)
      ? rockSource
      : rockSource?.getBlockersForChunk?.(chunkX, chunkZ, 1) ?? [];
    const blockers = blockersForChunk({
      placements: rocks,
      chunkX,
      chunkZ,
      chunkWorldSize: this.terrainView.chunkWorldSize,
      expand: clearRadius,
    });
    return {
      clearRadius,
      blockers,
      signature: [
        this.revisionTracker.signature(chunkX, chunkZ, 1),
        placementSignature(blockers),
        this.prototypeCount,
      ].join('|'),
    };
  }

  get(chunkX, chunkZ, rockSource) {
    const key = `${chunkX}:${chunkZ}`;
    const cached = this.cache.get(key);
    if (!cached) return null;
    return cached.signature === this.context(chunkX, chunkZ, rockSource).signature
      ? cached.placements
      : null;
  }

  build(chunkX, chunkZ, rockSource) {
    const context = this.context(chunkX, chunkZ, rockSource);
    const placements = buildStableChunkManifest({
      kind: 'tree',
      chunkX,
      chunkZ,
      chunkSize: this.terrainView.worldStore.chunkSize,
      tileSize: this.terrainView.worldStore.tileSize,
      perChunk: this.config.trees.perChunk,
      tileIds: this.config.trees.tileIds,
      tileAt: (cellX, cellZ) => this.terrainView.tileMap.get(cellX, cellZ),
      heightAt: (x, z) => this.terrainView.getCanonicalHeight(x, z),
      prototypeCount: this.prototypeCount,
      minScale: this.config.trees.minScale,
      maxScale: this.config.trees.maxScale,
      radiusForScale: () => context.clearRadius,
      blockers: context.blockers,
    });
    this.cache.set(`${chunkX}:${chunkZ}`, {
      signature: context.signature,
      placements,
    });
    PerfCounters.inc('treeManifestBuilds');
    return placements;
  }

  schedule(chunkX, chunkZ, rockSource) {
    const key = `${chunkX}:${chunkZ}`;
    if (this.pendingKeys.has(key)) return;
    this.pendingKeys.add(key);
    this.queue.enqueue({ key, chunkX, chunkZ, rockSource });
  }

  getOrSchedule(chunkX, chunkZ, rockSource) {
    const placements = this.get(chunkX, chunkZ, rockSource);
    if (!placements) this.schedule(chunkX, chunkZ, rockSource);
    return placements;
  }

  setActive(keys) {
    this.activeKeys = keys;
    for (const key of this.cache.keys()) {
      if (!keys.has(key)) this.cache.delete(key);
    }
  }

  flush() {
    const result = this.queue.flush((job) => {
      this.pendingKeys.delete(job.key);
      if (!this.activeKeys.has(job.key)) return false;
      this.build(job.chunkX, job.chunkZ, job.rockSource);
      this.onBuilt?.();
      return true;
    });
    PerfCounters.set('treeManifestQueueDepth', result.remaining);
    return result;
  }

  dispose() {
    this.queue.clear();
    this.pendingKeys.clear();
    this.activeKeys.clear();
    this.cache.clear();
  }
}
