import * as THREE from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { materialList } from '../assets/assetUrl.js';
import { extractRockPrototypes } from './StylizedPrototypeBake.js';
import { instanceCapacity } from './scatterMath.js';
import {
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
import { createRockProxyPrototype } from './lod/StylizedProxyGeometry.js';

function cloneMaterial(mesh) {
  const source = materialList(mesh)[0];
  const material = source.clone();
  if ('roughness' in material) material.roughness = 1;
  if ('metalness' in material) material.metalness = 0;
  material.flatShading = true;
  material.needsUpdate = true;
  return material;
}

function createMatrices(prototypeCount) {
  return Array.from({ length: prototypeCount }, () => []);
}

function lodSettings(config) {
  const rock = config.lod?.rock ?? {};
  const meshRadius = rock.meshRadius ?? config.rocks.residentRadius;
  const proxyRadius = Math.max(meshRadius, rock.proxyRadius ?? 3);
  return Object.freeze({
    enabled: config.lod?.enabled !== false,
    meshRadius,
    proxyRadius,
    thresholds: {
      nearPixels: rock.nearPixels ?? 16,
      proxyPixels: rock.proxyPixels ?? 1.5,
      billboardPixels: rock.billboardPixels ?? 0.5,
      hysteresisRatio: rock.hysteresisRatio ?? 0.15,
    },
  });
}

function treePlacementRadius(config) {
  if (config.lod?.enabled === false) return config.trees.residentRadius + 1;
  return (config.lod?.tree?.billboardRadius ?? 4) + 1;
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

export class StylizedRockView {
  constructor({ terrainView, config, revisionTracker }) {
    this.terrainView = terrainView;
    this.config = config;
    this.revisionTracker = revisionTracker;
    this.prototypes = [];
    this.proxyPrototypes = [];
    this.meshes = [];
    this.proxyMeshes = [];
    this.placements = [];
    this.signature = '';
    this.manifestCache = new Map();
    this.chunkLodStates = new Map();
    this.lastUpdateKey = null;
    this.disposed = false;
    this.root = new THREE.Group();
    this.root.name = 'stylized-rocks';
    terrainView.scene.add(this.root);
  }

  async buildFromScene(scene) {
    if (!this.config.rocks.enabled || !scene || this.disposed) return;
    scene.updateMatrixWorld(true);
    const extracted = extractRockPrototypes(scene, this.config.assets.rockMaterial);
    this.prototypes = extracted.map(({ geometry, source }) => ({
      geometry,
      material: cloneMaterial(source),
      kind: 'rock',
    }));
    if (this.prototypes.length === 0) {
      throw new Error(`No rock meshes use material ${this.config.assets.rockMaterial}.`);
    }

    const settings = lodSettings(this.config);
    const capacity = instanceCapacity({
      residentRadius: settings.proxyRadius,
      perChunk: this.config.rocks.perChunk,
    });
    const proxies = this.prototypes.map((prototype) => createRockProxyPrototype(prototype));
    this.proxyPrototypes = proxies.map((prototype) => prototype.parts);
    this.prototypeHeight = Math.max(...proxies.map((prototype) => prototype.height));
    this.meshes = createInstancedRenderers({
      root: this.root,
      partsByPrototype: this.prototypes.map((prototype) => [prototype]),
      capacity,
      name: 'stylized-rock-near',
      castShadow: true,
    });
    this.proxyMeshes = createInstancedRenderers({
      root: this.root,
      partsByPrototype: this.proxyPrototypes,
      capacity,
      name: 'stylized-rock-proxy',
      castShadow: false,
    });
  }

  update(camera) {
    if (this.disposed || this.prototypes.length === 0 || !this.terrainView.focusChunkKey || !camera) return;
    const focus = this.terrainView.focusChunk;
    const origin = this.terrainView.floatingOrigin.getState();
    this.root.position.set(-origin.x, 0, -origin.z);
    const settings = lodSettings(this.config);
    const renderRadius = settings.enabled ? settings.proxyRadius : this.config.rocks.residentRadius;
    const placementRadius = Math.max(renderRadius, treePlacementRadius(this.config));
    const viewportHeight = this.terrainView.renderer.domElement.clientHeight
      || this.terrainView.renderer.domElement.height
      || 1;
    const plan = settings.enabled
      ? buildChunkLodPlan({
        focus,
        radius: renderRadius,
        chunkWorldSize: this.terrainView.chunkWorldSize,
        floatingOrigin: this.terrainView.floatingOrigin,
        camera,
        viewportHeight,
        objectHeight: this.prototypeHeight,
        thresholds: settings.thresholds,
        radii: {
          meshRadius: settings.meshRadius,
          proxyRadius: settings.proxyRadius,
          billboardRadius: settings.proxyRadius,
        },
        previousStates: this.chunkLodStates,
      })
      : {
        entries: this.createNearOnlyPlan(focus, renderRadius),
        signature: `near:${focus.chunkX}:${focus.chunkZ}:${renderRadius}`,
      };
    pruneStateMap(this.chunkLodStates, plan.entries);
    const revisionSignature = this.revisionTracker.windowSignature(focus, placementRadius, 1);
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${revisionSignature}:${plan.signature}`;
    if (updateKey === this.lastUpdateKey) return;
    this.lastUpdateKey = updateKey;
    this.rebuild(focus, placementRadius, plan);
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

  manifestForChunk(chunkX, chunkZ) {
    const key = [
      this.revisionTracker.signature(chunkX, chunkZ, 1),
      this.prototypes.length,
    ].join('|');
    const cacheKey = `${chunkX}:${chunkZ}`;
    const cached = this.manifestCache.get(cacheKey);
    if (cached?.key === key) return cached.placements;

    const placements = buildStableChunkManifest({
      kind: 'rock',
      chunkX,
      chunkZ,
      chunkSize: this.terrainView.worldStore.chunkSize,
      tileSize: this.terrainView.worldStore.tileSize,
      perChunk: this.config.rocks.perChunk,
      tileIds: this.config.rocks.tileIds,
      tileAt: (cellX, cellZ) => this.terrainView.tileMap.get(cellX, cellZ),
      heightAt: (x, z) => this.terrainView.getCanonicalHeight(x, z),
      prototypeCount: this.prototypes.length,
      minScale: this.config.rocks.minScale,
      maxScale: this.config.rocks.maxScale,
      radiusForScale: (scale) => this.config.rocks.radius * scale,
    });
    this.manifestCache.set(cacheKey, { key, placements });
    return placements;
  }

  rebuild(focus, placementRadius, plan) {
    PerfCounters.inc('rockRebuilds');
    const near = createMatrices(this.prototypes.length);
    const proxy = createMatrices(this.prototypes.length);
    const placements = [];
    const activeChunks = new Set();
    const bandByChunk = new Map(plan.entries.map((entry) => [`${entry.chunkX}:${entry.chunkZ}`, entry.band]));
    const dummy = new THREE.Object3D();

    for (let chunkZ = focus.chunkZ - placementRadius;
      chunkZ <= focus.chunkZ + placementRadius;
      chunkZ += 1) {
      for (let chunkX = focus.chunkX - placementRadius;
        chunkX <= focus.chunkX + placementRadius;
        chunkX += 1) {
        const key = `${chunkX}:${chunkZ}`;
        activeChunks.add(key);
        const manifest = this.manifestForChunk(chunkX, chunkZ);
        placements.push(...manifest);
        const band = bandByChunk.get(key) ?? 'culled';
        if (band === 'culled') continue;
        for (const placement of manifest) {
          dummy.position.set(placement.x, placement.height, placement.z);
          dummy.rotation.set(0, placement.rotationY, 0);
          dummy.scale.setScalar(placement.scale);
          dummy.updateMatrix();
          const target = band === 'near' ? near : proxy;
          target[placement.prototypeIndex].push(dummy.matrix.clone());
        }
      }
    }

    const nearCount = writeMatrices(this.meshes, near);
    const proxyCount = writeMatrices(this.proxyMeshes, proxy);
    this.placements = placements;
    this.signature = placementSignature(placements);
    PerfCounters.set('rockNearInstances', nearCount);
    PerfCounters.set('rockProxyInstances', proxyCount);
    PerfCounters.set('rockPlacementInstances', placements.length);

    for (const key of this.manifestCache.keys()) {
      if (!activeChunks.has(key)) this.manifestCache.delete(key);
    }
  }

  getPlacements() {
    return this.placements;
  }

  getSignature() {
    return this.signature;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.terrainView.scene.remove(this.root);
    disposeInstancedRenderers(this.root, this.meshes);
    disposeInstancedRenderers(this.root, this.proxyMeshes);
    for (const prototype of this.prototypes) {
      prototype.geometry?.dispose();
      prototype.material?.dispose();
    }
    this.prototypes.length = 0;
    disposePrototypeParts(this.proxyPrototypes);
    this.placements.length = 0;
    this.manifestCache.clear();
    this.chunkLodStates.clear();
  }
}
