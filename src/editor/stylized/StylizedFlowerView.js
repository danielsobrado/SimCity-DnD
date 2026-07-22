import * as THREE from 'three/webgpu';
import { normalizeBaseUrl, resolveAssetUrl } from '../assets/assetUrl.js';
import { parseChunkKey } from '../world/WorldCoordinates.js';
import { StylizedFlowerSlot } from './StylizedFlowerSlot.js';

function configureTexture(texture, colorSpace = THREE.NoColorSpace) {
  texture.colorSpace = colorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export class StylizedFlowerView {
  constructor({ terrainView, config, baseUrl = '/', loader = new THREE.TextureLoader() }) {
    this.terrainView = terrainView;
    this.config = config;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.loader = loader;
    this.textures = [];
    this.slots = [];
    this.disposed = false;
    this.ready = this.load();
  }

  resolveUrl(path) {
    return resolveAssetUrl(this.baseUrl, path);
  }

  async loadTexture(path) {
    return configureTexture(await this.loader.loadAsync(this.resolveUrl(path)));
  }

  async loadSet(definition) {
    const [mask, zones, gradient] = await Promise.all([
      this.loadTexture(definition.mask),
      this.loadTexture(definition.zones),
      this.loadTexture(definition.gradient),
    ]);
    this.textures.push(mask, zones, gradient);
    return { mask, zones, gradient };
  }

  async load() {
    if (!this.config.flowers.enabled) return;
    const [variantA, variantB] = await Promise.all([
      this.loadSet(this.config.assets.flowerA),
      this.loadSet(this.config.assets.flowerB),
    ]);
    if (this.disposed) return;
    this.slots = this.terrainView.slots.flatMap((terrainSlot) => [
      new StylizedFlowerSlot({
        terrainSlot,
        terrainView: this.terrainView,
        config: this.config,
        textures: variantA,
        variantIndex: 0,
      }),
      new StylizedFlowerSlot({
        terrainSlot,
        terrainView: this.terrainView,
        config: this.config,
        textures: variantB,
        variantIndex: 1,
      }),
    ]);
  }

  update(timestamp) {
    if (this.disposed || this.slots.length === 0 || !this.terrainView.focusChunkKey) return;
    const focusChunk = parseChunkKey(this.terrainView.focusChunkKey);
    for (const slot of this.slots) slot.update(timestamp, focusChunk);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) slot.dispose();
    this.slots.length = 0;
    for (const texture of this.textures) texture.dispose();
    this.textures.length = 0;
  }
}
