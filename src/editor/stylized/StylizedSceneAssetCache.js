import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene, normalizeBaseUrl, resolveAssetUrl } from '../assets/assetUrl.js';

/**
 * Reference-counted GLB scene cache so rocks and trees share one parse of
 * grass-scene.glb instead of loading it twice (Flyweight + acquire/release).
 */
export class StylizedSceneAssetCache {
  constructor({ loader = new GLTFLoader(), baseUrl = '/' } = {}) {
    this.loader = loader;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.entries = new Map();
  }

  resolveUrl(path) {
    return resolveAssetUrl(this.baseUrl, path);
  }

  async acquire(path) {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = {
        promise: null,
        scene: null,
        refs: 0,
      };
      entry.promise = this.loader.loadAsync(this.resolveUrl(path)).then((gltf) => {
        if (!gltf?.scene) {
          throw new Error(`GLB ${path} contains no default scene.`);
        }
        entry.scene = gltf.scene;
        return gltf.scene;
      }).catch((error) => {
        this.entries.delete(path);
        throw error;
      });
      this.entries.set(path, entry);
    }

    entry.refs += 1;
    try {
      return await entry.promise;
    } catch (error) {
      entry.refs -= 1;
      if (entry.refs <= 0) this.entries.delete(path);
      throw error;
    }
  }

  release(path) {
    const entry = this.entries.get(path);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    this.entries.delete(path);
    if (entry.scene) disposeScene(entry.scene);
    entry.scene = null;
  }

  dispose() {
    for (const entry of this.entries.values()) {
      if (entry.scene) disposeScene(entry.scene);
    }
    this.entries.clear();
  }
}
