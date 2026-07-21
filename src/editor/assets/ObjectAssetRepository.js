import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extractStaticParts } from './glbParts.js';

function normalizeBaseUrl(baseUrl) {
  const value = typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function disposeScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  scene.traverse((node) => {
    if (!node.isMesh) {
      return;
    }
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) {
          textures.add(value);
        }
      }
    }
  });

  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export class ObjectAssetRepository {
  constructor({ catalog, tileSize, loader = new GLTFLoader(), baseUrl = '/' }) {
    this.catalog = catalog;
    this.tileSize = tileSize;
    this.loader = loader;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.scenePromises = new Map();
    this.definitionPromises = new Map();
    this.loadedScenes = new Set();
    this.disposed = false;
  }

  resolveAssetUrl(assetPath) {
    return `${this.baseUrl}${assetPath.replace(/^\/+/, '')}`;
  }

  loadScene(assetPath) {
    let promise = this.scenePromises.get(assetPath);
    if (promise) {
      return promise;
    }

    promise = this.loader.loadAsync(this.resolveAssetUrl(assetPath)).then((gltf) => {
      if (!gltf?.scene) {
        throw new Error(`GLB ${assetPath} contains no default scene.`);
      }
      if (this.disposed) {
        disposeScene(gltf.scene);
        throw new Error('Object asset repository was disposed while loading.');
      }
      this.loadedScenes.add(gltf.scene);
      return gltf.scene;
    }).catch((error) => {
      this.scenePromises.delete(assetPath);
      throw error;
    });

    this.scenePromises.set(assetPath, promise);
    return promise;
  }

  load(definition) {
    let promise = this.definitionPromises.get(definition.key);
    if (promise) {
      return promise;
    }

    promise = this.loadScene(definition.asset.path).then((scene) => {
      const root = scene.getObjectByName(definition.asset.node);
      if (!root) {
        throw new Error(
          `Object ${definition.key} GLB node ${definition.asset.node} was not found.`,
        );
      }
      return extractStaticParts(root, definition, this.tileSize);
    }).catch((error) => {
      this.definitionPromises.delete(definition.key);
      throw error;
    });

    this.definitionPromises.set(definition.key, promise);
    return promise;
  }

  async loadAll({ onLoaded, onProgress } = {}) {
    const report = {
      total: this.catalog.length,
      completed: 0,
      loaded: 0,
      fallback: 0,
      failures: [],
    };

    await Promise.all(this.catalog.map(async (definition) => {
      try {
        const parts = await this.load(definition);
        report.loaded += 1;
        onLoaded?.({ definitionKey: definition.key, parts });
      } catch (error) {
        report.fallback += 1;
        report.failures.push({
          definitionKey: definition.key,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        report.completed += 1;
        onProgress?.(Object.freeze({ ...report, failures: [...report.failures] }));
      }
    }));

    return Object.freeze({
      ...report,
      failures: Object.freeze(report.failures.map((failure) => Object.freeze(failure))),
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.loadedScenes.forEach((scene) => disposeScene(scene));
    this.loadedScenes.clear();
    this.scenePromises.clear();
    this.definitionPromises.clear();
  }
}
