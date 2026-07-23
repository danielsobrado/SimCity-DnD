import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { cellCenterToWorld } from '../world/WorldCoordinates.js';
import { materialList, normalizeBaseUrl, resolveAssetUrl } from '../assets/assetUrl.js';
import {
  extractPrototypeParts,
  findPrototypeRoots,
} from './StylizedTreePrototypes.js';
import {
  createStylizedLeafMaterial,
  createStylizedTrunkMaterial,
} from './StylizedTreeMaterials.js';
import {
  instanceCapacity,
  overlaps,
  scatterRandom01,
} from './scatterMath.js';

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

export class StylizedTreeView {
  constructor({ terrainView, config, baseUrl = '/' }) {
    this.terrainView = terrainView;
    this.config = config;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.textureLoader = new THREE.TextureLoader();
    this.time = uniform(0);
    this.prototypes = [];
    this.renderers = [];
    this.textures = [];
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

    const capacity = instanceCapacity({
      residentRadius: this.config.trees.residentRadius,
      perChunk: this.config.trees.perChunk,
    });
    this.renderers = this.prototypes.map((parts, prototypeIndex) => parts.map((part, partIndex) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = part.kind === 'trunk';
      mesh.receiveShadow = true;
      mesh.name = `stylized-pine-${prototypeIndex}-${partIndex}`;
      this.root.add(mesh);
      return mesh;
    }));
  }

  update(timestamp, rockPlacements = [], rockSignature = '') {
    this.time.value = timestamp / 1000;
    if (this.disposed || this.renderers.length === 0 || !this.terrainView.focusChunkKey) return;
    const focus = this.terrainView.focusChunk;
    const origin = this.terrainView.floatingOrigin.getState();
    this.root.position.set(-origin.x, 0, -origin.z);
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${this.terrainView.worldStore.revision}:${rockSignature}`;
    if (updateKey === this.lastUpdateKey) return;
    this.lastUpdateKey = updateKey;
    this.rebuild(focus, rockPlacements);
  }

  rebuild(focus, rockPlacements = []) {
    PerfCounters.inc('treeRebuilds');
    const matrices = this.prototypes.map(() => []);
    const tileIds = new Set(this.config.trees.tileIds);
    const chunkSize = this.terrainView.worldStore.chunkSize;
    const tileSize = this.terrainView.worldStore.tileSize;
    const clearRadius = this.config.trees.clearRadius ?? tileSize;
    const placedTrees = [];
    const dummy = new THREE.Object3D();

    for (let chunkZ = focus.chunkZ - this.config.trees.residentRadius;
      chunkZ <= focus.chunkZ + this.config.trees.residentRadius;
      chunkZ += 1) {
      for (let chunkX = focus.chunkX - this.config.trees.residentRadius;
        chunkX <= focus.chunkX + this.config.trees.residentRadius;
        chunkX += 1) {
        for (let index = 0; index < this.config.trees.perChunk; index += 1) {
          const cellX = chunkX * chunkSize + Math.floor(scatterRandom01(chunkX, chunkZ, index, 0) * chunkSize);
          const cellZ = chunkZ * chunkSize + Math.floor(scatterRandom01(chunkX, chunkZ, index, 1) * chunkSize);
          if (!tileIds.has(this.terrainView.tileMap.get(cellX, cellZ))) continue;
          const canonical = cellCenterToWorld(cellX, cellZ, tileSize);
          const jitterX = (scatterRandom01(chunkX, chunkZ, index, 2) - 0.5) * tileSize;
          const jitterZ = (scatterRandom01(chunkX, chunkZ, index, 3) - 0.5) * tileSize;
          const canonicalX = canonical.x + jitterX;
          const canonicalZ = canonical.z + jitterZ;
          if (overlaps(canonicalX, canonicalZ, rockPlacements, clearRadius)) continue;
          if (overlaps(canonicalX, canonicalZ, placedTrees, clearRadius)) continue;
          const height = this.terrainView.getCanonicalHeight(canonicalX, canonicalZ);
          const prototypeIndex = Math.floor(scatterRandom01(chunkX, chunkZ, index, 4) * this.prototypes.length)
            % this.prototypes.length;
          const scale = this.config.trees.minScale
            + scatterRandom01(chunkX, chunkZ, index, 5)
              * (this.config.trees.maxScale - this.config.trees.minScale);
          dummy.position.set(canonicalX, height, canonicalZ);
          dummy.rotation.set(0, scatterRandom01(chunkX, chunkZ, index, 6) * Math.PI * 2, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          matrices[prototypeIndex].push(dummy.matrix.clone());
          placedTrees.push({ x: canonicalX, z: canonicalZ, radius: clearRadius });
        }
      }
    }

    this.renderers.forEach((parts, prototypeIndex) => {
      const values = matrices[prototypeIndex];
      for (const mesh of parts) {
        mesh.count = values.length;
        for (let index = 0; index < values.length; index += 1) {
          mesh.setMatrixAt(index, values[index]);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.terrainView.scene.remove(this.root);
    for (const parts of this.renderers) {
      for (const mesh of parts) {
        this.root.remove(mesh);
        mesh.dispose();
      }
    }
    this.renderers.length = 0;
    for (const parts of this.prototypes) {
      for (const part of parts) {
        part.geometry?.dispose();
        part.material?.dispose();
      }
    }
    this.prototypes.length = 0;
    this.textures.forEach((texture) => texture.dispose());
    this.textures.length = 0;
  }
}
