import { vec3 } from 'three/tsl';
import { parseChunkKey } from '../world/WorldCoordinates.js';
import { StylizedFlowerView } from './StylizedFlowerView.js';
import { StylizedGrassSlot } from './StylizedGrassSlot.js';
import { StylizedRockView } from './StylizedRockView.js';
import { StylizedSceneAssetCache } from './StylizedSceneAssetCache.js';
import { StylizedSkyView } from './StylizedSkyView.js';
import { StylizedTreeView } from './StylizedTreeView.js';
import { StylizedWaterSlot } from './StylizedWaterSlot.js';

function createObjectSignature(objectMap) {
  return objectMap.list()
    .filter((object) => object.definitionKey === 'boulder')
    .map((object) => `${object.id}:${object.x}:${object.z}`)
    .sort()
    .join('|');
}

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
    if (this.enabled) {
      for (const terrainSlot of terrainView.slots) terrainSlot.mesh.receiveShadow = true;
    }
    this.skyView = this.enabled && config.sky.enabled
      ? new StylizedSkyView({ terrainView, config })
      : null;
    const sunDirection = this.skyView?.sunDirection ?? vec3(0.35, 0.85, 0.25);
    this.rockView = this.enabled
      ? new StylizedRockView({ terrainView, config })
      : null;
    this.treeView = this.enabled
      ? new StylizedTreeView({ terrainView, config, baseUrl })
      : null;
    this.flowerView = this.enabled
      ? new StylizedFlowerView({ terrainView, config, baseUrl })
      : null;
    this.ready = this.bootstrapLayers();
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
    this.lastObjectSignature = '';
    this.lastObjectCheckAt = 0;
  }

  /**
   * Load grass-scene.glb once, keep it alive while rock/tree materials may still
   * share source textures, then build both layers from the same parse.
   */
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

  update(timestamp, camera) {
    if (!this.enabled) return;
    this.skyView?.update(timestamp, camera);
    this.rockView?.update();
    const rockPlacements = this.rockView?.getPlacements() ?? [];
    const rockSignature = this.rockView?.getSignature() ?? '';
    this.treeView?.update(timestamp, rockPlacements, rockSignature);
    this.flowerView?.update(timestamp);
    for (const slot of this.waterSlots) slot.update(timestamp);
    if (timestamp >= this.lastObjectCheckAt) {
      this.lastObjectSignature = createObjectSignature(this.objectMap);
      this.lastObjectCheckAt = timestamp + 250;
    }
    const focusKey = this.terrainView.focusChunkKey;
    const focusChunk = focusKey ? parseChunkKey(focusKey) : null;
    const signature = `${this.lastObjectSignature}|${rockSignature}`;
    for (const slot of this.slots) {
      slot.update(timestamp, focusChunk, signature, rockPlacements);
    }
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
    for (const slot of this.waterSlots) slot.dispose();
    this.waterSlots.length = 0;
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
  }
}
