import * as THREE from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { cellCenterToWorld } from '../world/WorldCoordinates.js';
import { materialList } from '../assets/assetUrl.js';
import { extractRockPrototypes } from './StylizedPrototypeBake.js';
import {
  instanceCapacity,
  overlaps,
  scatterRandom01,
} from './scatterMath.js';

function cloneMaterial(mesh) {
  const source = materialList(mesh)[0];
  const material = source.clone();
  if ('roughness' in material) material.roughness = 1;
  if ('metalness' in material) material.metalness = 0;
  material.flatShading = true;
  material.needsUpdate = true;
  return material;
}

export class StylizedRockView {
  constructor({ terrainView, config }) {
    this.terrainView = terrainView;
    this.config = config;
    this.prototypes = [];
    this.meshes = [];
    this.placements = [];
    this.signature = '';
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
    }));
    if (this.prototypes.length === 0) {
      throw new Error(`No rock meshes use material ${this.config.assets.rockMaterial}.`);
    }

    const capacity = instanceCapacity({
      residentRadius: this.config.rocks.residentRadius,
      perChunk: this.config.rocks.perChunk,
    });
    this.meshes = this.prototypes.map((prototype, index) => {
      const mesh = new THREE.InstancedMesh(prototype.geometry, prototype.material, capacity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `stylized-rocks-${index}`;
      this.root.add(mesh);
      return mesh;
    });
  }

  update() {
    if (this.disposed || this.prototypes.length === 0 || !this.terrainView.focusChunkKey) return;
    const focus = this.terrainView.focusChunk;
    const origin = this.terrainView.floatingOrigin.getState();
    this.root.position.set(-origin.x, 0, -origin.z);
    const updateKey = `${focus.chunkX}:${focus.chunkZ}:${this.terrainView.worldStore.revision}`;
    if (updateKey === this.lastUpdateKey) return;
    this.lastUpdateKey = updateKey;
    this.rebuild(focus);
  }

  rebuild(focus) {
    PerfCounters.inc('rockRebuilds');
    const matrices = this.prototypes.map(() => []);
    const placements = [];
    const tileIds = new Set(this.config.rocks.tileIds);
    const chunkSize = this.terrainView.worldStore.chunkSize;
    const tileSize = this.terrainView.worldStore.tileSize;
    const dummy = new THREE.Object3D();

    for (let chunkZ = focus.chunkZ - this.config.rocks.residentRadius;
      chunkZ <= focus.chunkZ + this.config.rocks.residentRadius;
      chunkZ += 1) {
      for (let chunkX = focus.chunkX - this.config.rocks.residentRadius;
        chunkX <= focus.chunkX + this.config.rocks.residentRadius;
        chunkX += 1) {
        for (let index = 0; index < this.config.rocks.perChunk; index += 1) {
          const cellX = chunkX * chunkSize + Math.floor(scatterRandom01(chunkX, chunkZ, index, 0) * chunkSize);
          const cellZ = chunkZ * chunkSize + Math.floor(scatterRandom01(chunkX, chunkZ, index, 1) * chunkSize);
          if (!tileIds.has(this.terrainView.tileMap.get(cellX, cellZ))) continue;
          const center = cellCenterToWorld(cellX, cellZ, tileSize);
          const jitterX = (scatterRandom01(chunkX, chunkZ, index, 2) - 0.5) * tileSize;
          const jitterZ = (scatterRandom01(chunkX, chunkZ, index, 3) - 0.5) * tileSize;
          const canonicalX = center.x + jitterX;
          const canonicalZ = center.z + jitterZ;
          const scale = this.config.rocks.minScale
            + scatterRandom01(chunkX, chunkZ, index, 5)
              * (this.config.rocks.maxScale - this.config.rocks.minScale);
          const radius = this.config.rocks.radius * scale;
          if (overlaps(canonicalX, canonicalZ, placements, radius * 0.65)) continue;
          const height = this.terrainView.getCanonicalHeight(canonicalX, canonicalZ);
          const prototypeIndex = Math.floor(scatterRandom01(chunkX, chunkZ, index, 4) * this.prototypes.length)
            % this.prototypes.length;
          dummy.position.set(canonicalX, height, canonicalZ);
          dummy.rotation.set(0, scatterRandom01(chunkX, chunkZ, index, 6) * Math.PI * 2, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          matrices[prototypeIndex].push(dummy.matrix.clone());
          placements.push({
            x: canonicalX,
            z: canonicalZ,
            radius,
          });
        }
      }
    }

    this.meshes.forEach((mesh, prototypeIndex) => {
      const values = matrices[prototypeIndex];
      mesh.count = values.length;
      for (let index = 0; index < values.length; index += 1) {
        mesh.setMatrixAt(index, values[index]);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.placements = placements;
    this.signature = `${this.lastUpdateKey}:${placements.length}`;
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
    for (const mesh of this.meshes) {
      this.root.remove(mesh);
      mesh.dispose();
    }
    this.meshes.length = 0;
    for (const prototype of this.prototypes) {
      prototype.geometry?.dispose();
      prototype.material?.dispose();
    }
    this.prototypes.length = 0;
    this.placements.length = 0;
  }
}
