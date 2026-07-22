import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { cellCenterToWorld } from '../world/WorldCoordinates.js';
import { createStylizedGrassMaterial } from './StylizedGrassMaterial.js';
import { cellSampleRandom01, sampleHeight } from './scatterMath.js';

const BLADE_SEGMENTS = 3;
const TWO_PI = Math.PI * 2;

function bladeHalfWidth(t) {
  return 0.5 * ((1 - t) ** 1.2);
}

function createBladeGeometry(maxInstances) {
  const positions = new Float32Array((BLADE_SEGMENTS * 2 + 1) * 3);
  for (let index = 0; index < BLADE_SEGMENTS; index += 1) {
    const t = index / BLADE_SEGMENTS;
    const width = bladeHalfWidth(t);
    positions[index * 6] = -width;
    positions[index * 6 + 1] = t;
    positions[index * 6 + 3] = width;
    positions[index * 6 + 4] = t;
  }
  positions[BLADE_SEGMENTS * 6 + 1] = 1;

  const indices = [];
  for (let index = 0; index < BLADE_SEGMENTS - 1; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = right + 2;
    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }
  const lastLeft = (BLADE_SEGMENTS - 1) * 2;
  indices.push(lastLeft, BLADE_SEGMENTS * 2, lastLeft + 1);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute(
    'instanceBase',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3),
  );
  geometry.setAttribute(
    'instanceParams',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4),
  );
  geometry.setAttribute(
    'instanceTrample',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3),
  );
  geometry.instanceCount = 0;
  geometry.computeVertexNormals();
  return geometry;
}

function findTrample(worldX, worldZ, boulders, defaultRadius, falloff) {
  let strongest = 0;
  let directionX = 1;
  let directionZ = 0;
  for (const boulder of boulders) {
    const deltaX = worldX - boulder.x;
    const deltaZ = worldZ - boulder.z;
    const distance = Math.hypot(deltaX, deltaZ);
    const radius = boulder.radius ?? defaultRadius;
    const influence = 1 - Math.min(1, Math.max(0, (distance - radius) / Math.max(0.001, falloff)));
    if (influence <= strongest) continue;
    strongest = influence;
    if (distance > 0.0001) {
      directionX = deltaX / distance;
      directionZ = deltaZ / distance;
    }
  }
  return { directionX, directionZ, influence: strongest };
}

function collectPlacedBoulders(objectMap, tileSize, radius) {
  return objectMap.list()
    .filter((object) => object.definitionKey === 'boulder')
    .map((object) => {
      const world = cellCenterToWorld(object.x, object.z, tileSize);
      return { x: world.x, z: world.z, radius };
    });
}

export class StylizedGrassSlot {
  constructor({ terrainSlot, terrainView, objectMap, config, sunDirection }) {
    this.terrainSlot = terrainSlot;
    this.terrainView = terrainView;
    this.objectMap = objectMap;
    this.config = config;
    this.sunDirection = sunDirection;
    this.chunkSize = terrainView.worldStore.chunkSize;
    this.tileSize = terrainView.worldStore.tileSize;
    this.chunkWorldSize = this.chunkSize * this.tileSize;
    this.bladesPerCell = config.grass.bladesPerCell;
    this.maxInstances = this.chunkSize * this.chunkSize * this.bladesPerCell;
    this.chunkCenter = uniform(new THREE.Vector2());
    this.time = uniform(0);
    this.geometry = null;
    this.material = null;
    this.mesh = new THREE.Mesh();
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = `stylized-grass-${terrainSlot.slotIndex}`;
    terrainView.scene.add(this.mesh);
    this.lastKey = null;
    this.lastRevision = -1;
    this.lastObjectSignature = '';
  }

  ensureResources() {
    if (this.geometry) return;
    this.geometry = createBladeGeometry(this.maxInstances);
    this.material = createStylizedGrassMaterial({
      surfaceMaskTexture: this.terrainSlot.surfaceMaskTexture,
      chunkCenter: this.chunkCenter,
      chunkWorldSize: this.chunkWorldSize,
      time: this.time,
      sunDirection: this.sunDirection,
      config: this.config,
    });
    this.mesh.geometry = this.geometry;
    this.mesh.material = this.material;
    this.mesh.receiveShadow = true;
  }

  update(timestamp, focusChunk, objectSignature, streamedRocks) {
    this.time.value = timestamp / 1000;
    const descriptor = this.terrainSlot.descriptor;
    const withinRadius = descriptor && focusChunk
      ? Math.max(
        Math.abs(descriptor.chunkX - focusChunk.chunkX),
        Math.abs(descriptor.chunkZ - focusChunk.chunkZ),
      ) <= this.config.grass.residentRadius
      : false;
    this.mesh.visible = Boolean(this.terrainSlot.mesh.visible && withinRadius);
    if (!this.mesh.visible || !descriptor || !this.terrainSlot.page) return;

    this.ensureResources();
    this.mesh.position.copy(this.terrainSlot.mesh.position);
    this.chunkCenter.value.set(descriptor.centerWorldX, descriptor.centerWorldZ);
    if (this.lastKey !== descriptor.key
        || this.lastRevision !== this.terrainSlot.pageRevision
        || this.lastObjectSignature !== objectSignature) {
      this.rebuild(this.terrainSlot.page, descriptor, streamedRocks);
      this.lastKey = descriptor.key;
      this.lastRevision = this.terrainSlot.pageRevision;
      this.lastObjectSignature = objectSignature;
    }
  }

  rebuild(page, descriptor, streamedRocks) {
    PerfCounters.inc('grassRebuilds');
    const baseAttribute = this.geometry.getAttribute('instanceBase');
    const parameterAttribute = this.geometry.getAttribute('instanceParams');
    const trampleAttribute = this.geometry.getAttribute('instanceTrample');
    const base = baseAttribute.array;
    const parameters = parameterAttribute.array;
    const trample = trampleAttribute.array;
    const eligible = new Set(this.config.grass.tileIds);
    const boulders = [
      ...collectPlacedBoulders(this.objectMap, this.tileSize, this.config.rocks.radius),
      ...streamedRocks,
    ];
    let count = 0;

    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const cellIndex = localZ * this.chunkSize + localX;
        if (!eligible.has(page.tiles[cellIndex])) continue;
        for (let sampleIndex = 0; sampleIndex < this.bladesPerCell; sampleIndex += 1) {
          const jitterX = cellSampleRandom01(descriptor.chunkX, descriptor.chunkZ, cellIndex, sampleIndex, 0);
          const jitterZ = cellSampleRandom01(descriptor.chunkX, descriptor.chunkZ, cellIndex, sampleIndex, 1);
          const sampleX = localX + jitterX;
          const sampleZ = localZ + jitterZ;
          const localWorldX = -this.chunkWorldSize / 2 + sampleX * this.tileSize;
          const localWorldZ = this.chunkWorldSize / 2 - sampleZ * this.tileSize;
          const worldX = descriptor.centerWorldX + localWorldX;
          const worldZ = descriptor.centerWorldZ + localWorldZ;
          const height = sampleHeight(page, sampleX, sampleZ, this.chunkSize);
          const width = this.config.grass.minWidth
            + cellSampleRandom01(descriptor.chunkX, descriptor.chunkZ, cellIndex, sampleIndex, 2)
              * (this.config.grass.maxWidth - this.config.grass.minWidth);
          const length = this.config.grass.minLength
            + cellSampleRandom01(descriptor.chunkX, descriptor.chunkZ, cellIndex, sampleIndex, 3)
              * (this.config.grass.maxLength - this.config.grass.minLength);
          const angle = cellSampleRandom01(descriptor.chunkX, descriptor.chunkZ, cellIndex, sampleIndex, 4) * TWO_PI;
          const rock = findTrample(
            worldX,
            worldZ,
            boulders,
            this.config.rocks.radius,
            this.config.rocks.falloff,
          );

          const baseOffset = count * 3;
          base[baseOffset] = localWorldX;
          base[baseOffset + 1] = height;
          base[baseOffset + 2] = localWorldZ;
          const parameterOffset = count * 4;
          parameters[parameterOffset] = width;
          parameters[parameterOffset + 1] = length;
          parameters[parameterOffset + 2] = angle;
          parameters[parameterOffset + 3] = cellSampleRandom01(
            descriptor.chunkX,
            descriptor.chunkZ,
            cellIndex,
            sampleIndex,
            5,
          );
          trample[baseOffset] = rock.directionX;
          trample[baseOffset + 1] = rock.directionZ;
          trample[baseOffset + 2] = rock.influence;
          count += 1;
        }
      }
    }

    this.geometry.instanceCount = count;
    baseAttribute.needsUpdate = true;
    parameterAttribute.needsUpdate = true;
    trampleAttribute.needsUpdate = true;
  }

  dispose() {
    this.terrainView.scene.remove(this.mesh);
    this.geometry?.dispose();
    this.material?.dispose();
  }
}
