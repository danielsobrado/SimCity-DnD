import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { createStylizedFlowerMaterial } from './StylizedFlowerMaterial.js';
import { sampleHeight, scatterRandom01 } from './scatterMath.js';

function createCrossGeometry(maxInstances) {
  const positions = new Float32Array([
    -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 0, 1, 1, 1,
    0, 0, 1, 0, 0, 1, 1, 1,
  ]);
  const indices = [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7];
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setAttribute(
    'instanceBase',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3),
  );
  geometry.setAttribute(
    'instanceParams',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4),
  );
  geometry.instanceCount = 0;
  return geometry;
}

function densityForDistance(distance, radius, farDensity) {
  if (radius <= 0 || distance <= 0) return 1;
  const amount = Math.min(1, distance / radius);
  return 1 + (farDensity - 1) * amount;
}

function setGeometryBounds(geometry, chunkWorldSize, minimumHeight, maximumHeight, maximumSize) {
  if (!Number.isFinite(minimumHeight) || !Number.isFinite(maximumHeight)) return;
  const half = chunkWorldSize / 2 + maximumSize + 1;
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-half, minimumHeight - 1, -half),
    new THREE.Vector3(half, maximumHeight + maximumSize + 2, half),
  );
  geometry.boundingSphere = new THREE.Sphere();
  geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);
}

export class StylizedFlowerSlot {
  constructor({ terrainSlot, terrainView, config, textures, variantIndex }) {
    this.terrainSlot = terrainSlot;
    this.terrainView = terrainView;
    this.config = config;
    this.textures = textures;
    this.variantIndex = variantIndex;
    this.chunkSize = terrainView.worldStore.chunkSize;
    this.tileSize = terrainView.worldStore.tileSize;
    this.chunkWorldSize = this.chunkSize * this.tileSize;
    this.maxInstances = Math.ceil(config.flowers.perChunk / 2);
    this.chunkCenter = uniform(new THREE.Vector2());
    this.time = uniform(0);
    this.geometry = createCrossGeometry(this.maxInstances);
    this.material = createStylizedFlowerMaterial({
      textures,
      surfaceMaskTexture: terrainSlot.surfaceMaskTexture,
      chunkCenter: this.chunkCenter,
      chunkWorldSize: this.chunkWorldSize,
      time: this.time,
      config,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = true;
    this.mesh.visible = false;
    this.mesh.name = `stylized-flowers-${terrainSlot.slotIndex}-${variantIndex}`;
    terrainView.scene.add(this.mesh);
    this.readyKey = null;
    this.readyRevision = -1;
    this.readySampleLimit = 0;
    this.pendingRebuild = null;
  }

  update(timestamp, focusChunk) {
    this.time.value = timestamp / 1000;
    const descriptor = this.terrainSlot.descriptor;
    const distance = descriptor && focusChunk
      ? Math.max(
        Math.abs(descriptor.chunkX - focusChunk.chunkX),
        Math.abs(descriptor.chunkZ - focusChunk.chunkZ),
      )
      : Number.POSITIVE_INFINITY;
    const withinRadius = distance <= this.config.flowers.residentRadius;
    const active = Boolean(this.terrainSlot.mesh.visible && withinRadius && descriptor && this.terrainSlot.page);
    this.mesh.visible = Boolean(active && this.readyKey === descriptor?.key);
    if (!active) {
      this.pendingRebuild = null;
      return;
    }

    this.mesh.position.copy(this.terrainSlot.mesh.position);
    this.chunkCenter.value.set(descriptor.centerWorldX, descriptor.centerWorldZ);
    const farDensity = this.config.flowers.outerRingDensity ?? 0.5;
    const density = densityForDistance(distance, this.config.flowers.residentRadius, farDensity);
    const sampleLimit = Math.max(2, Math.round(this.config.flowers.perChunk * density));
    const needsBuild = this.readyKey !== descriptor.key
      || this.readyRevision !== this.terrainSlot.pageRevision
      || this.readySampleLimit !== sampleLimit;
    if (!needsBuild) return;

    const signature = `${descriptor.key}:${this.terrainSlot.pageRevision}:${sampleLimit}`;
    if (this.pendingRebuild?.signature === signature) return;
    this.pendingRebuild = {
      key: `flower:${this.terrainSlot.slotIndex}:${this.variantIndex}`,
      page: this.terrainSlot.page,
      descriptor,
      revision: this.terrainSlot.pageRevision,
      sampleLimit,
      signature,
    };
  }

  applyPendingRebuild() {
    if (!this.pendingRebuild) return false;
    const job = this.pendingRebuild;
    this.pendingRebuild = null;
    this.rebuild(job.page, job.descriptor, job.sampleLimit);
    this.readyKey = job.descriptor.key;
    this.readyRevision = job.revision;
    this.readySampleLimit = job.sampleLimit;
    this.mesh.visible = Boolean(
      this.terrainSlot.mesh.visible
      && this.terrainSlot.descriptor?.key === this.readyKey,
    );
    return true;
  }

  rebuild(page, descriptor, sampleLimit) {
    PerfCounters.inc('flowerRebuilds');
    const baseAttribute = this.geometry.getAttribute('instanceBase');
    const parameterAttribute = this.geometry.getAttribute('instanceParams');
    const base = baseAttribute.array;
    const parameters = parameterAttribute.array;
    const eligible = new Set(this.config.flowers.tileIds);
    let count = 0;
    let minimumHeight = Number.POSITIVE_INFINITY;
    let maximumHeight = Number.NEGATIVE_INFINITY;

    for (let index = this.variantIndex; index < sampleLimit; index += 2) {
      const localX = scatterRandom01(descriptor.chunkX, descriptor.chunkZ, index, 0) * this.chunkSize;
      const localZ = scatterRandom01(descriptor.chunkX, descriptor.chunkZ, index, 1) * this.chunkSize;
      const cellX = Math.min(this.chunkSize - 1, Math.floor(localX));
      const cellZ = Math.min(this.chunkSize - 1, Math.floor(localZ));
      const cellIndex = cellZ * this.chunkSize + cellX;
      if (!eligible.has(page.tiles[cellIndex])) continue;
      const localWorldX = -this.chunkWorldSize / 2 + localX * this.tileSize;
      const localWorldZ = this.chunkWorldSize / 2 - localZ * this.tileSize;
      const height = sampleHeight(page, localX, localZ, this.chunkSize);
      const baseOffset = count * 3;
      base[baseOffset] = localWorldX;
      base[baseOffset + 1] = height;
      base[baseOffset + 2] = localWorldZ;
      const parameterOffset = count * 4;
      parameters[parameterOffset] = scatterRandom01(descriptor.chunkX, descriptor.chunkZ, index, 2) * Math.PI * 2;
      parameters[parameterOffset + 1] = this.config.flowers.minSize
        + scatterRandom01(descriptor.chunkX, descriptor.chunkZ, index, 3)
          * (this.config.flowers.maxSize - this.config.flowers.minSize);
      parameters[parameterOffset + 2] = scatterRandom01(descriptor.chunkX, descriptor.chunkZ, index, 4);
      parameters[parameterOffset + 3] = this.variantIndex;
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
      count += 1;
    }

    this.geometry.instanceCount = count;
    baseAttribute.needsUpdate = true;
    parameterAttribute.needsUpdate = true;
    setGeometryBounds(
      this.geometry,
      this.chunkWorldSize,
      minimumHeight,
      maximumHeight,
      this.config.flowers.maxSize,
    );
    PerfCounters.set('flowerLastChunkInstances', count);
  }

  dispose() {
    this.terrainView.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
