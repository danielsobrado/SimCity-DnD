import * as THREE from 'three/webgpu';
import { normalizeBaseUrl, resolveAssetUrl } from '../../assets/assetUrl.js';
import {
  TREE_IMPOSTOR_MANIFEST_VERSION,
  validateTreeImpostorManifest,
} from './TreeImpostorManifest.js';

function configureTexture(texture, colorSpace) {
  texture.colorSpace = colorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function canvasToDataUrl(canvas) {
  if (typeof canvas.toDataURL === 'function') return canvas.toDataURL('image/png');
  return canvas.convertToBlob({ type: 'image/png' }).then((blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  }));
}

function triggerDownload(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadAtlasTextures(loader, resolvePath, prototype) {
  const albedo = await loader.loadAsync(resolvePath(prototype.albedo));
  try {
    const normal = await loader.loadAsync(resolvePath(prototype.normal));
    return {
      albedo: configureTexture(albedo, THREE.SRGBColorSpace),
      normal: configureTexture(normal, THREE.NoColorSpace),
    };
  } catch (error) {
    albedo.dispose?.();
    throw error;
  }
}

export class TreeImpostorAssetLoader {
  constructor({
    baseUrl = '/',
    loader = new THREE.TextureLoader(),
    expectedPrototypeCount = null,
    expectedSourceSignature = null,
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.loader = loader;
    this.expectedPrototypeCount = expectedPrototypeCount;
    this.expectedSourceSignature = expectedSourceSignature;
  }

  resolve(path) {
    return resolveAssetUrl(this.baseUrl, path);
  }

  async load(manifestPath) {
    if (!manifestPath) return null;
    const response = await fetch(this.resolve(manifestPath), { cache: 'no-cache' });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Tree impostor manifest failed with HTTP ${response.status}.`);
    }
    const manifest = validateTreeImpostorManifest(await response.json(), {
      expectedPrototypeCount: this.expectedPrototypeCount,
      expectedSourceSignature: this.expectedSourceSignature,
    });
    const atlases = [];
    try {
      for (const prototype of manifest.prototypes) {
        const textures = await loadAtlasTextures(
          this.loader,
          (path) => this.resolve(path),
          prototype,
        );
        atlases.push(Object.freeze({
          ...prototype,
          ...textures,
          source: 'asset',
        }));
      }
      return Object.freeze(atlases);
    } catch (error) {
      disposeTreeImpostorAtlases(atlases);
      throw error;
    }
  }
}

export async function createTreeImpostorBundle(atlases, sourceSignature) {
  if (typeof sourceSignature !== 'string' || sourceSignature.length < 8) {
    throw new Error('Tree impostor export requires a source signature.');
  }
  const prototypes = [];
  for (const atlas of atlases) {
    if (!atlas.albedoCanvas || !atlas.normalCanvas) {
      throw new Error('Only runtime-baked impostors can be exported as a bundle.');
    }
    prototypes.push({
      prototypeIndex: atlas.prototypeIndex,
      columns: atlas.columns,
      rows: atlas.rows,
      tileSize: atlas.tileSize,
      gutter: atlas.gutter ?? 0,
      lowElevationDegrees: atlas.lowElevationDegrees,
      highElevationDegrees: atlas.highElevationDegrees,
      width: atlas.width,
      height: atlas.height,
      depth: atlas.depth,
      centerY: atlas.centerY,
      radius: atlas.radius,
      albedoDataUrl: await canvasToDataUrl(atlas.albedoCanvas),
      normalDataUrl: await canvasToDataUrl(atlas.normalCanvas),
    });
  }
  return Object.freeze({
    version: TREE_IMPOSTOR_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    sourceSignature,
    prototypes,
  });
}

export async function downloadTreeImpostorBundle(atlases, sourceSignature) {
  const bundle = await createTreeImpostorBundle(atlases, sourceSignature);
  triggerDownload('tree-impostors.bundle.json', JSON.stringify(bundle));
  return bundle;
}

export function disposeTreeImpostorAtlases(atlases) {
  for (const atlas of atlases ?? []) {
    atlas.albedo?.dispose?.();
    atlas.normal?.dispose?.();
  }
}
