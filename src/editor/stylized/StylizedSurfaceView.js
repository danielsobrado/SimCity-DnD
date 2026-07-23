import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { vec3 } from 'three/tsl';
import {
  collectObjectBoulderPlacements,
  objectBoulderSignatureForChunk,
  rockSignatureForChunk,
  rocksInfluencingChunk,
} from './chunkRockSignature.js';
import { StylizedBuildQueue } from './StylizedBuildQueue.js';
import { StylizedChunkRevisionTracker } from './StylizedChunkRevisionTracker.js';
import { StylizedFlowerView } from './StylizedFlowerView.js';
import { StylizedGrassSlot } from './StylizedGrassSlot.js';
import { StylizedRockView } from './StylizedRockView.js';
import { StylizedSceneAssetCache } from './StylizedSceneAssetCache.js';
import { StylizedSkyView } from './StylizedSkyView.js';
import { StylizedTreeView } from './StylizedTreeView.js';
import { StylizedWaterSlot } from './StylizedWaterSlot.js';

export class StylizedSurfaceView {
  constructor({ terrainView, objectMap, config, baseUrl = '/' }) {
    this.terrainView = terrainView;
    this.objectMap = objectMap;
    this.config = config;
    this.enabled = Boolean(config?.enabled);
    this.sceneAssets = this.enabled
      ? new StylizedSceneAssetCache({ baseUrl })
      : null;
    this.sharedScenePath = null;
    this.revisionTracker = this.enabled
      ? new StylizedChunkRevisionTracker({ worldStore: terrainView.worldStore })
      : null;
    if (this.enabled) {
      for (const terrainSlot of terrainView.slots) terrainSlot.mesh.receiveShadow = true;
    }
    this.skyView = this.enabled && config.sky.enabled
      ? new StylizedSkyView({ terrainView, config })
      : null;
    const sunDirection = this.skyView?.sunDirection ?? vec3(0.35, 0.85, 0.25);
    this.rockView = this.enabled
      ? new StylizedRockView({ terrainView, config, revisionTracker: this.revisionTracker })
      : null;
    this.treeView = this.enabled
      ? new StylizedTreeView({
        terrainView,
        config,
        revisionTracker: this.revisionTracker,
        baseUrl,
      })
      : null;
    this.flowerView = this.enabled
      ? new StylizedFlowerView({ terrainView, config, baseUrl })
      : null;
    this.ready = this.bootstrapLayers();
    this.ready.then(() => this.maybeHandleImpostorBake()).catch((error) => {
      console.error('Tree impostor export request failed.', error);
    });
    this.slots = this.enabled
      ? terrainView.slots.map((terrainSlot) => new StylizedGrassSlot({
        terrainSlot,
        terrainView,
        objectMap,
        config,
        sunDirection,
      }))
      : [];
    this.waterSlots = this.enabled && config.water?.enabled
      ? terrainView.slots.map((terrainSlot) => new StylizedWaterSlot({
        terrainSlot,
        terrainView,
        config,
      }))
      : [];
    for (const slot of this.slots) slot.mesh.receiveShadow = true;
    this.grassBuildQueue = new StylizedBuildQueue({
      buildsPerFrame: config.streaming?.grassBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.flowerBuildQueue = new StylizedBuildQueue({
      buildsPerFrame: config.streaming?.flowerBuildsPerFrame ?? 1,
      budgetMs: config.streaming?.heavyBuildBudgetMs ?? 3,
    });
    this.chunkWorldSize = terrainView.worldStore.chunkSize * terrainView.worldStore.tileSize;
    this.tileSize = terrainView.worldStore.tileSize;
  }

  async bootstrapLayers() {
    if (!this.enabled) return null;
    const needsScene = this.config.rocks.enabled || this.config.trees.enabled;
    try {
      let sharedScene = null;
      if (needsScene) {
        this.sharedScenePath = this.config.assets.scene;
        sharedScene = await this.sceneAssets.acquire(this.sharedScenePath);
      }
      await Promise.all([
        this.rockView?.buildFromScene(sharedScene),
        this.treeView?.buildFromScene(sharedScene),
        this.flowerView?.ready,
      ].filter(Boolean));
      return null;
    } catch (error) {
      console.warn('Some stylized assets failed to load; remaining layers stay active.', error);
      return null;
    }
  }

  async maybeHandleImpostorBake() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('bakeImpostors') !== '1') return;
    window.__treeImpostorBakeStatus = 'baking';
    try {
      const bundle = await this.exportImpostors();
      window.__treeImpostorBakeBundle = bundle;
      window.__treeImpostorBakeStatus = 'done';
      document.documentElement.dataset.impostorBake = 'done';
    } catch (error) {
      window.__treeImpostorBakeStatus = 'failed';
      window.__treeImpostorBakeError = error instanceof Error ? error.message : String(error);
      document.documentElement.dataset.impostorBake = 'failed';
      throw error;
    }
  }

  get impostorReady() {
    return this.treeView?.impostorReady ?? Promise.resolve(null);
  }

  async exportImpostors() {
    if (!this.treeView) throw new Error('Tree rendering is disabled.');
    return this.treeView.exportImpostors();
  }

  updateRendererCounters() {
    const info = this.terrainView.renderer.info;
    if (!info) return;
    for (const [name, value] of [
      ['rendererDrawCalls', info.render?.calls],
      ['rendererTriangles', info.render?.triangles],
      ['rendererLines', info.render?.lines],
      ['rendererPoints', info.render?.points],
      ['rendererGeometries', info.memory?.geometries],
      ['rendererTextures', info.memory?.textures],
    ]) {
      if (Number.isFinite(value)) PerfCounters.set(name, value);
    }
  }

  update(timestamp, camera) {
    if (!this.enabled) return;
    this.updateRendererCounters();
    this.skyView?.update(timestamp, camera);
    this.rockView?.update(timestamp, camera);
    const rockPlacements = this.rockView?.getPlacements() ?? [];
    const rockSignature = this.rockView?.getSignature() ?? '';
    this.treeView?.update(timestamp, camera, this.rockView, rockSignature);
    this.flowerView?.update(timestamp);
    for (const slot of this.waterSlots) slot.update(timestamp);

    const focusChunk = this.terrainView.focusChunkKey ? this.terrainView.focusChunk : null;
    const rockRadius = this.config.rocks.radius;
    const rockFalloff = this.config.rocks.falloff;
    const objectBoulders = collectObjectBoulderPlacements({
      objectMap: this.objectMap,
      tileSize: this.tileSize,
      radius: rockRadius,
    });

    for (const slot of this.slots) {
      const descriptor = slot.terrainSlot.descriptor;
      if (!descriptor) {
        slot.update(timestamp, focusChunk, '', []);
        continue;
      }
      const localRocks = rocksInfluencingChunk({
        descriptor,
        rockPlacements,
        chunkWorldSize: this.chunkWorldSize,
        radius: rockRadius,
        falloff: rockFalloff,
      });
      const localObjectBoulders = rocksInfluencingChunk({
        descriptor,
        rockPlacements: objectBoulders,
        chunkWorldSize: this.chunkWorldSize,
        radius: rockRadius,
        falloff: rockFalloff,
      });
      const signature = [
        objectBoulderSignatureForChunk({
          objectMap: this.objectMap,
          objectPlacements: objectBoulders,
          descriptor,
          tileSize: this.tileSize,
          chunkWorldSize: this.chunkWorldSize,
          radius: rockRadius,
          falloff: rockFalloff,
        }),
        rockSignatureForChunk({
          descriptor,
          rockPlacements,
          chunkWorldSize: this.chunkWorldSize,
          radius: rockRadius,
          falloff: rockFalloff,
        }),
      ].join('|');
      slot.update(timestamp, focusChunk, signature, [
        ...localObjectBoulders,
        ...localRocks,
      ]);
      if (slot.pendingRebuild) {
        this.grassBuildQueue.enqueue({
          key: slot.pendingRebuild.key,
          slot,
        });
      }
    }

    for (const flowerSlot of this.flowerView?.slots ?? []) {
      if (flowerSlot.pendingRebuild) {
        this.flowerBuildQueue.enqueue({
          key: flowerSlot.pendingRebuild.key,
          slot: flowerSlot,
        });
      }
    }

    this.grassBuildQueue.flush((job) => job.slot.applyPendingRebuild());
    this.flowerBuildQueue.flush((job) => job.slot.applyPendingRebuild());
  }

  dispose() {
    this.skyView?.dispose();
    this.flowerView?.dispose();
    this.treeView?.dispose();
    this.rockView?.dispose();
    if (this.sharedScenePath) {
      this.sceneAssets?.release(this.sharedScenePath);
      this.sharedScenePath = null;
    }
    this.sceneAssets?.dispose();
    this.sceneAssets = null;
    this.grassBuildQueue.clear();
    this.flowerBuildQueue.clear();
    for (const slot of this.waterSlots) slot.dispose();
    this.waterSlots.length = 0;
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
    this.revisionTracker?.dispose();
    this.revisionTracker = null;
  }
}
