import { parseChunkKey } from '../world/WorldCoordinates.js';
import { StylizedGrassSlot } from './StylizedGrassSlot.js';
import { StylizedRockView } from './StylizedRockView.js';

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
    this.ready = this.rockView?.ready.catch((error) => {
      console.warn('Stylized rock assets failed to load; grass and ground remain active.', error);
      return null;
    }) ?? Promise.resolve();
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

  update(timestamp) {
    if (!this.enabled) return;
    this.rockView.update();
    if (timestamp >= this.lastObjectCheckAt) {
      this.lastObjectSignature = createObjectSignature(this.objectMap);
      this.lastObjectCheckAt = timestamp + 250;
    }
    const focusKey = this.terrainView.focusChunkKey;
    const focusChunk = focusKey ? parseChunkKey(focusKey) : null;
    const signature = `${this.lastObjectSignature}|${this.rockView.getSignature()}`;
    const placements = this.rockView.getPlacements();
    for (const slot of this.slots) {
      slot.update(timestamp, focusChunk, signature, placements);
    }
  }

  dispose() {
    this.rockView?.dispose();
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
  }
}
