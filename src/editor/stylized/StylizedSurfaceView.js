import { parseChunkKey } from '../world/WorldCoordinates.js';
import { StylizedGrassSlot } from './StylizedGrassSlot.js';

function createObjectSignature(objectMap) {
  return objectMap.list()
    .filter((object) => object.definitionKey === 'boulder')
    .map((object) => `${object.id}:${object.x}:${object.z}`)
    .sort()
    .join('|');
}

export class StylizedSurfaceView {
  constructor({ terrainView, objectMap, config }) {
    this.terrainView = terrainView;
    this.objectMap = objectMap;
    this.config = config;
    this.enabled = Boolean(config?.enabled);
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
    if (timestamp >= this.lastObjectCheckAt) {
      this.lastObjectSignature = createObjectSignature(this.objectMap);
      this.lastObjectCheckAt = timestamp + 250;
    }
    const focusKey = this.terrainView.focusChunkKey;
    const focusChunk = focusKey ? parseChunkKey(focusKey) : null;
    for (const slot of this.slots) {
      slot.update(timestamp, focusChunk, this.lastObjectSignature);
    }
  }

  dispose() {
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
  }
}
