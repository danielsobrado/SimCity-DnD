import { parseChunkKey } from '../world/WorldCoordinates.js';
import { StylizedFlowerView } from './StylizedFlowerView.js';
import { StylizedGrassSlot } from './StylizedGrassSlot.js';
import { StylizedRockView } from './StylizedRockView.js';
import { StylizedSkyView } from './StylizedSkyView.js';
import { StylizedTreeView } from './StylizedTreeView.js';

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
    this.rockView = this.enabled
      ? new StylizedRockView({ terrainView, config, baseUrl })
      : null;
    this.treeView = this.enabled
      ? new StylizedTreeView({ terrainView, config, baseUrl })
      : null;
    this.flowerView = this.enabled
      ? new StylizedFlowerView({ terrainView, config, baseUrl })
      : null;
    this.skyView = this.enabled && config.sky.enabled
      ? new StylizedSkyView({ terrainView, config })
      : null;
    this.ready = Promise.all([
      this.rockView?.ready,
      this.treeView?.ready,
      this.flowerView?.ready,
    ].filter(Boolean)).catch((error) => {
      console.warn('Some stylized assets failed to load; remaining layers stay active.', error);
      return null;
    });
    this.slots = this.enabled
      ? terrainView.slots.map((terrainSlot) => new StylizedGrassSlot({
        terrainSlot,
        terrainView,
        objectMap,
        config,
      }))
      : [];
    this.lastObjectSignature = '';
    this.lastObjectCheckAt = 0;
  }

  update(timestamp, camera) {
    if (!this.enabled) return;
    this.skyView?.update(timestamp, camera);
    this.rockView?.update();
    this.treeView?.update(timestamp);
    this.flowerView?.update(timestamp);
    if (timestamp >= this.lastObjectCheckAt) {
      this.lastObjectSignature = createObjectSignature(this.objectMap);
      this.lastObjectCheckAt = timestamp + 250;
    }
    const focusKey = this.terrainView.focusChunkKey;
    const focusChunk = focusKey ? parseChunkKey(focusKey) : null;
    const rockSignature = this.rockView?.getSignature() ?? '';
    const signature = `${this.lastObjectSignature}|${rockSignature}`;
    const placements = this.rockView?.getPlacements() ?? [];
    for (const slot of this.slots) {
      slot.update(timestamp, focusChunk, signature, placements);
    }
  }

  dispose() {
    this.skyView?.dispose();
    this.flowerView?.dispose();
    this.treeView?.dispose();
    this.rockView?.dispose();
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
  }
}
