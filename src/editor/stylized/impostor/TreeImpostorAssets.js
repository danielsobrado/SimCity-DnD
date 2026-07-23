import * as THREE from 'three/webgpu';
import { normalizeBaseUrl, resolveAssetUrl } from '../../assets/assetUrl.js';

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
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export class TreeImpostorAssetLoader {
  constructor({ baseUrl = '/', loader = new THREE.TextureLoader() } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.loader = loader;
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
    const manifest = await response.json();
    if (!Array.isArray(manifest.prototypes) || manifest.prototypes.length === 0) {
      throw new Error('Tree impostor manifest contains no prototypes.');
    }

    const atlases = await Promise.all(manifest.prototypes.map(async (prototype, prototypeIndex) => {
      const [albedo, normal] = await Promise.all([
        this.loader.loadAsync(this.resolve(prototype.albedo)),
        this.loader.loadAsync(this.resolve(prototype.normal)),
      ]);
      return Object.freeze({
        ...prototype,
        prototypeIndex,
        albedo: configureTexture(albedo, THREE.SRGBColorSpace),
        normal: configureTexture(normal, THREE.NoColorSpace),
        source: 'asset',
      });
    }));
    return Object.freeze(atlases);
  }
}

export async function createTreeImpostorBundle(atlases) {
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
    version: 1,
    generatedAt: new Date().toISOString(),
    prototypes,
  });
}

export async function downloadTreeImpostorBundle(atlases) {
  const bundle = await createTreeImpostorBundle(atlases);
  triggerDownload('tree-impostors.bundle.json', JSON.stringify(bundle));
  return bundle;
}

export function disposeTreeImpostorAtlases(atlases) {
  for (const atlas of atlases ?? []) {
    atlas.albedo?.dispose?.();
    atlas.normal?.dispose?.();
  }
}
