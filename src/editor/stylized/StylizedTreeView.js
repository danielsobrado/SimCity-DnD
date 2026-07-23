import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { materialList, normalizeBaseUrl, resolveAssetUrl } from '../assets/assetUrl.js';
import {
  extractPrototypeParts,
  findPrototypeRoots,
} from './StylizedTreePrototypes.js';
import {
  createStylizedLeafMaterial,
  createStylizedTrunkMaterial,
} from './StylizedTreeMaterials.js';
import { instanceCapacity } from './scatterMath.js';
import {
  blockersForChunk,
  buildStableChunkManifest,
  placementSignature,
} from './StableScatterManifest.js';
import {
  buildChunkLodPlan,
  createInstancedRenderers,
  disposeInstancedRenderers,
  pruneStateMap,
  writeMatrices,
} from './lod/StylizedLodRuntime.js';
import { createTreeProxyPrototype } from './lod/StylizedProxyGeometry.js';

function firstMaterial(mesh, name) {
  return materialList(mesh).find((material) => material?.name === name) ?? materialList(mesh)[0];
}

function configureBarkTexture(texture, colorSpace) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createMatrices(prototypeCount) {
  return Array.from({ length: prototypeCount }, () => []);
}

function lodSettings(config) {
  const tree = config.lod?.tree ?? {};
  const meshRadius = tree.meshRadius ?? config.trees.residentRadius;
  const proxyRadius = Math.max(meshRadius, tree.proxyRadius ?? 3);
  const billboardRadius = Math.max(proxyRadius, tree.billboardRadius ?? 4);
  return Object.freeze({
    enabled: config.lod?.enabled !== false,
    meshRadius,
    proxyRadius,
    billboardRadius,
    thresholds: {
      nearPixels: tree.nearPixels ?? 32,
      proxyPixels: tree.proxyPixels ?? 8,
      billboardPixels: tree.billboardPixels ?? 1.5,
      hysteresisRatio: tree.hysteresisRatio ?? 0.15,
    },
  });
}

function disposePrototypeParts(prototypes) {
  for (const parts of prototypes) {
    for (const part of parts) {
      part.geometry?.dispose();
      part.material?.dispose();
    }
  }
  prototypes.length = 0;
}

export class StylizedTreeView {
  constructor({ terrainView, config, revisionTracker, baseUrl = '/' }) {
    this.terrainView = terrainView;
    this.config = config;
    this.revisionTracker = revisionTracker;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.textureLoader = new THREE.TextureLoader();
    this.time = uniform(0);
    this.prototypes = [];
    this.proxyPrototypes = [];
    this.billboardPrototypes = [];
    this.renderers = [];
    this.proxyRenderers = [];
    this.billboardRenderers = [];
    this.textures = [];
    this.manifestCache = new Map();
    this.chunkLodStates = new Map();
    this.lastUpdateKey = null;
    this.disposed = false;
    this.root = new THREE.Group();
    this.root.name = 'stylized-trees';
    terrainView.scene.add(this.root);
  }

  resolveUrl(path) {
    return resolveAssetUrl(this.baseUrl, path);
  }

  async loadBarkTextures() {
    const [color, ao, height] = await Promise.all([
      this.textureLoader.loadAsync(this.resolveUrl(this.config.assets.barkColor)),
      this.textureLoader.loadAsync(this.resolveUrl(this.config.assets.barkAo)),
      this.textureLoader.loadAsync(this.resolveUrl(this.config.assets.barkHeight)),
    ]);
    configureBarkTexture(color, THREE.SRGBColorSpace);
    configureBarkTexture(ao, THREE.NoColorSpace);
    configureBarkTexture(height, THREE.NoColorSpace);
    this.textures.push(color, ao, height);
    return { color, ao, height };
  }

  async buildFromScene(scene) {
    if (!this.config.trees.enabled || !scene || this.disposed) return;
    const barkTextures = await this.loadBarkTextures();
    if (this.disposed) return;
    scene.updateMatrixWorld(true);
    const roots = scene.children.flatMap((child) => findPrototypeRoots(child, this.config));
    if (roots.length === 0) {
      throw new Error('No pine prototype contains both configured trunk and leaf materials.');
    }

    for (const root of roots) {
      const baked = extractPrototypeParts(root, this.config);
      if (!baked) continue;
      const parts = baked.map((part) => {
        const source = firstMaterial(
          part.source,
          part.kind === 'leaf' ? this.config.assets.leafMaterial : this.config.assets.trunkMaterial,
        );
        let leafMap = null;
        if (part.kind === 'leaf' && source?.map) {
          leafMap = source.map.clone();
          leafMap.needsUpdate = true;
          this.textures.push(leafMap);
        }
        const material = part.kind === 'leaf'
          ? createStylizedLeafMaterial({
            source,
            leafMap,
            bounds: {
              minY: part.geometry.boundingBox.min.y,
              maxY: part.geometry.boundingBox.max.y,
            },
            time: this.time,
            config: this.config,
          })
          : createStylizedTrunkMaterial({ textures: barkTextures, config: this.config });
        return { geometry: part.geometry, material, kind: part.kind };
      });
      if (parts.length > 0) this.prototypes.push(parts);
    }
    if (this.prototypes.length === 0) {
      throw new Error('Pine prototype extraction produced no upright renderable parts.');
    }

    const settings = lodSettings(this.config);
    const capacity = instanceCapacity({
      residentRadius: settings.billboardRadius,
      perChunk: this.config.trees.perChunk,
    });
    const proxies = this.prototypes.map((parts) => createTreeProxyPrototype(parts, this.config));
    this.proxyPrototypes = proxies.map((prototype) => prototype.proxyParts);
    this.billboardPrototypes = proxies.map((prototype) => prototype.billboardParts);
    this.prototypeHeight = Math.max(...proxies.map((prototype) => prototype.height));

    this.renderers = createInstancedRenderers({
      root: this.root,
      partsByPrototype: this.prototypes,
      capacity,
      name: 'stylized-pine-near',
      castShadow: true,
    });
    this.proxyRenderers = createInstancedRenderers({
      root: this.root,
      partsByPrototype: this.proxyPrototypes,
      capacity,
      name: 'stylized-pine-proxy',
      castShadow: false,
    });
    this.billboardRenderers = createInstancedRenderers({
      root: this.root,
      partsByPrototype: this.billboardPrototypes,
      capacity,
      name: 'stylized-pine-billboard',
      castShadow: false,
    });
  }

  update(timestamp, camera, rockPlacements = [], rockSignature = '') {
    this.time.value = timestamp / 1000;
    if (this.disposed || this.renderers.length === 0 || !this.terrainView.focusChunkKey || !camera) return;
    const focus = this.terrainView.focusChunk;
    const origin = this.terrainView.floatingOrigin.getState();
    this.root.position.set(-origin.x, 0, -origin.z);
    const settings = lodSettings(this.config);
    const radius = settings.enabled ? settings.billboardRadius : this.config.trees.residentRadius;
    const viewportHeight = this.terrainView.renderer.domElement.clientHeight
      || this.terrainView.renderer.domElement.height
      || 1;
    const plan = settings.enabled
      ? buildChunkLodPlan({
        focus,
        radius,
        chunkWorldSize: this.terrainView.chunkWorldSize,
        floatingOrigin: this.terrainView.floatingOrigin,
        camera,
        viewportHeight,
        objectHeight: this.prototypeHeight,
        thresholds: settings.thresholds,
        radii: {
          meshRadius: settings.meshRadius,
          proxyRadius: settings.proxyRadius,
          billboardRadius: settings.billboardRadius,
        },
        previousStates: this.chunkLodStates,
      })
      : {
        entries: this.createNearOnlyPlan(focus, radius),
        signature: `near:${focus.chunkX}:${focus.chunkZ}:${radius}`,
      };
    pruneStateMap(this.chunkLodStates, plan.entries);
    const revisionSignature = this.revisionTracker.windowSignature(focus, radius, 1);
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${revisionSignature}:${rockSignature}:${plan.signature}`;
    if (updateKey === this.lastUpdateKey) return;
    this.lastUpdateKey = updateKey;
    this.rebuild(plan, rockPlacements);
  }

  createNearOnlyPlan(focus, radius) {
    const entries = [];
    for (let chunkZ = focus.chunkZ - radius; chunkZ <= focus.chunkZ + radius; chunkZ += 1) {
      for (let chunkX = focus.chunkX - radius; chunkX <= focus.chunkX + radius; chunkX += 1) {
        entries.push({ chunkX, chunkZ, band: 'near' });
      }
    }
    return entries;
  }

  manifestForChunk(chunkX, chunkZ, rockPlacements) {
    const clearRadius = this.config.trees.clearRadius ?? this.terrainView.worldStore.tileSize;
    const localBlockers = blockersForChunk({
      placements: rockPlacements,
      chunkX,
      chunkZ,
      chunkWorldSize: this.terrainView.chunkWorldSize,
      expand: clearRadius,
    });
    const key = [
      this.revisionTracker.signature(chunkX, chunkZ, 1),
      placementSignature(localBlockers),
      this.prototypes.length,
    ].join('|');
    const cacheKey = `${chunkX}:${chunkZ}`;
    const cached = this.manifestCache.get(cacheKey);
    if (cached?.key === key) return cached.placements;

    const placements = buildStableChunkManifest({
      kind: 'tree',
      chunkX,
      chunkZ,
      chunkSize: this.terrainView.worldStore.chunkSize,
      tileSize: this.terrainView.worldStore.tileSize,
      perChunk: this.config.trees.perChunk,
      tileIds: this.config.trees.tileIds,
      tileAt: (cellX, cellZ) => this.terrainView.tileMap.get(cellX, cellZ),
      heightAt: (x, z) => this.terrainView.getCanonicalHeight(x, z),
      prototypeCount: this.prototypes.length,
      minScale: this.config.trees.minScale,
      maxScale: this.config.trees.maxScale,
      radiusForScale: () => clearRadius,
      blockers: localBlockers,
    });
    this.manifestCache.set(cacheKey, { key, placements });
    return placements;
  }

  rebuild(plan, rockPlacements = []) {
    PerfCounters.inc('treeRebuilds');
    const near = createMatrices(this.prototypes.length);
    const proxy = createMatrices(this.prototypes.length);
    const billboard = createMatrices(this.prototypes.length);
    const dummy = new THREE.Object3D();
    const activeChunks = new Set();

    for (const entry of plan.entries) {
      if (entry.band === 'culled') continue;
      activeChunks.add(`${entry.chunkX}:${entry.chunkZ}`);
      const placements = this.manifestForChunk(entry.chunkX, entry.chunkZ, rockPlacements);
      for (const placement of placements) {
        dummy.position.set(placement.x, placement.height, placement.z);
        dummy.rotation.set(0, placement.rotationY, 0);
        dummy.scale.setScalar(placement.scale);
        dummy.updateMatrix();
        const target = entry.band === 'near'
          ? near
          : entry.band === 'proxy' ? proxy : billboard;
        target[placement.prototypeIndex].push(dummy.matrix.clone());
      }
    }

    const nearCount = writeMatrices(this.renderers, near);
    const proxyCount = writeMatrices(this.proxyRenderers, proxy);
    const billboardCount = writeMatrices(this.billboardRenderers, billboard);
    PerfCounters.set('treeNearInstances', nearCount);
    PerfCounters.set('treeProxyInstances', proxyCount);
    PerfCounters.set('treeBillboardInstances', billboardCount);

    for (const key of this.manifestCache.keys()) {
      if (!activeChunks.has(key)) this.manifestCache.delete(key);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.terrainView.scene.remove(this.root);
    disposeInstancedRenderers(this.root, this.renderers);
    disposeInstancedRenderers(this.root, this.proxyRenderers);
    disposeInstancedRenderers(this.root, this.billboardRenderers);
    disposePrototypeParts(this.prototypes);
    disposePrototypeParts(this.proxyPrototypes);
    disposePrototypeParts(this.billboardPrototypes);
    this.textures.forEach((texture) => texture.dispose());
    this.textures.length = 0;
    this.manifestCache.clear();
    this.chunkLodStates.clear();
  }
}
