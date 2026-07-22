import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { createStylizedFlowerMaterial } from './StylizedFlowerMaterial.js';

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

function hash32(value) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

function random01(chunkX, chunkZ, index, channel) {
  const seed = Math.imul(chunkX, 73856093)
    ^ Math.imul(chunkZ, 19349663)
    ^ Math.imul(index + 1, 83492791)
    ^ Math.imul(channel + 1, 1597334677);
  return hash32(seed) / 0xffffffff;
}

function sampleHeight(page, localX, localZ, chunkSize) {
  const x0 = Math.floor(localX);
  const z0 = Math.floor(localZ);
  const x1 = Math.min(chunkSize, x0 + 1);
  const z1 = Math.min(chunkSize, z0 + 1);
  const tx = localX - x0;
  const tz = localZ - z0;
  const vertexSize = chunkSize + 1;
  const value = (x, z) => page.heights[z * vertexSize + x];
  const north = value(x0, z0) + (value(x1, z0) - value(x0, z0)) * tx;
  const south = value(x0, z1) + (value(x1, z1) - value(x0, z1)) * tx;
  return north + (south - north) * tz;
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
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = `stylized-flowers-${terrainSlot.slotIndex}-${variantIndex}`;
    terrainView.scene.add(this.mesh);
    this.lastKey = null;
    this.lastRevision = -1;
  }

  update(timestamp, focusChunk) {
    this.time.value = timestamp / 1000;
    const descriptor = this.terrainSlot.descriptor;
    const withinRadius = descriptor && focusChunk
      ? Math.max(
        Math.abs(descriptor.chunkX - focusChunk.chunkX),
        Math.abs(descriptor.chunkZ - focusChunk.chunkZ),
      ) <= this.config.flowers.residentRadius
      : false;
    this.mesh.visible = Boolean(this.terrainSlot.mesh.visible && withinRadius);
    if (!this.mesh.visible || !descriptor || !this.terrainSlot.page) return;

    this.mesh.position.copy(this.terrainSlot.mesh.position);
    this.chunkCenter.value.set(descriptor.centerWorldX, descriptor.centerWorldZ);
    if (this.lastKey !== descriptor.key || this.lastRevision !== this.terrainSlot.pageRevision) {
      this.rebuild(this.terrainSlot.page, descriptor);
      this.lastKey = descriptor.key;
      this.lastRevision = this.terrainSlot.pageRevision;
    }
  }

  rebuild(page, descriptor) {
    const baseAttribute = this.geometry.getAttribute('instanceBase');
    const parameterAttribute = this.geometry.getAttribute('instanceParams');
    const base = baseAttribute.array;
    const parameters = parameterAttribute.array;
    const eligible = new Set(this.config.grass.tileIds);
    let count = 0;

    for (let index = this.variantIndex; index < this.config.flowers.perChunk; index += 2) {
      const localX = random01(descriptor.chunkX, descriptor.chunkZ, index, 0) * this.chunkSize;
      const localZ = random01(descriptor.chunkX, descriptor.chunkZ, index, 1) * this.chunkSize;
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
      parameters[parameterOffset] = random01(descriptor.chunkX, descriptor.chunkZ, index, 2) * Math.PI * 2;
      parameters[parameterOffset + 1] = this.config.flowers.minSize
        + random01(descriptor.chunkX, descriptor.chunkZ, index, 3)
          * (this.config.flowers.maxSize - this.config.flowers.minSize);
      parameters[parameterOffset + 2] = random01(descriptor.chunkX, descriptor.chunkZ, index, 4);
      parameters[parameterOffset + 3] = this.variantIndex;
      count += 1;
    }

    this.geometry.instanceCount = count;
    baseAttribute.needsUpdate = true;
    parameterAttribute.needsUpdate = true;
  }

  dispose() {
    this.terrainView.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
