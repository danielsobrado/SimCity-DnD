import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { createStylizedGrassMaterial } from './StylizedGrassMaterial.js';
import { cellSampleRandom01, sampleHeight } from './scatterMath.js';

const BLADE_SEGMENTS = 3;
const TWO_PI = Math.PI * 2;
const DEFAULT_BUILD_SLICE_CELLS = 64;
const DEFAULT_INACTIVE_RELEASE_FRAMES = 30;

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

function densityForDistance(distance, radius, farDensity) {
  if (radius <= 0 || distance <= 0) return 1;
  const amount = Math.min(1, distance / radius);
  return 1 + (farDensity - 1) * amount;
}

function setGeometryBounds(geometry, chunkWorldSize, minimumHeight, maximumHeight, maximumLength) {
  if (!Number.isFinite(minimumHeight) || !Number.isFinite(maximumHeight)) return;
  const half = chunkWorldSize / 2 + maximumLength + 1;
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-half, minimumHeight - 1, -half),
    new THREE.Vector3(half, maximumHeight + maximumLength + 2, half),
  );
  geometry.boundingSphere = new THREE.Sphere();
  geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);
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
    this.emptyGeometry = new THREE.BufferGeometry();
    this.geometry = null;
    this.material = null;
    this.mesh = new THREE.Mesh(this.emptyGeometry, null);
    this.mesh.frustumCulled = true;
    this.mesh.visible = false;
    this.mesh.name = `stylized-grass-${terrainSlot.slotIndex}`;
    terrainView.scene.add(this.mesh);
    this.readyKey = null;
    this.readyRevision = -1;
    this.readyObjectSignature = '';
    this.readyBladesPerCell = 0;
    this.pendingRebuild = null;
    this.buildState = null;
    this.inactiveFrames = 0;
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

  releaseResources() {
    if (!this.geometry) return;
    this.geometry.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
    this.mesh.geometry = this.emptyGeometry;
    this.mesh.material = null;
    this.readyKey = null;
    this.readyRevision = -1;
    this.readyObjectSignature = '';
    this.readyBladesPerCell = 0;
    this.pendingRebuild = null;
    this.buildState = null;
    PerfCounters.inc('grassResourceReleases');
  }

  update(timestamp, focusChunk, objectSignature, localBoulders) {
    this.time.value = timestamp / 1000;
    const descriptor = this.terrainSlot.descriptor;
    const distance = descriptor && focusChunk
      ? Math.max(
        Math.abs(descriptor.chunkX - focusChunk.chunkX),
        Math.abs(descriptor.chunkZ - focusChunk.chunkZ),
      )
      : Number.POSITIVE_INFINITY;
    const withinRadius = distance <= this.config.grass.residentRadius;
    const active = Boolean(this.terrainSlot.mesh.visible && withinRadius && descriptor && this.terrainSlot.page);
    if (!active) {
      this.mesh.visible = false;
      this.pendingRebuild = null;
      this.buildState = null;
      this.inactiveFrames += 1;
      const releaseFrames = this.config.streaming?.inactiveReleaseFrames
        ?? DEFAULT_INACTIVE_RELEASE_FRAMES;
      if (this.inactiveFrames >= releaseFrames) this.releaseResources();
      return;
    }

    this.inactiveFrames = 0;
    this.ensureResources();
    this.mesh.position.copy(this.terrainSlot.mesh.position);
    this.chunkCenter.value.set(descriptor.centerWorldX, descriptor.centerWorldZ);
    const farDensity = this.config.grass.outerRingDensity ?? 0.45;
    const density = densityForDistance(distance, this.config.grass.residentRadius, farDensity);
    const targetBladesPerCell = Math.max(1, Math.round(this.bladesPerCell * density));
    const isReadyForDescriptor = this.readyKey === descriptor.key;
    this.mesh.visible = Boolean(this.terrainSlot.mesh.visible && isReadyForDescriptor);

    const needsBuild = this.readyKey !== descriptor.key
      || this.readyRevision !== this.terrainSlot.pageRevision
      || this.readyObjectSignature !== objectSignature
      || this.readyBladesPerCell !== targetBladesPerCell;
    if (!needsBuild) return;

    const buildSignature = [
      descriptor.key,
      this.terrainSlot.pageRevision,
      objectSignature,
      targetBladesPerCell,
    ].join('|');
    if (this.pendingRebuild?.signature === buildSignature) return;
    this.pendingRebuild = {
      key: `grass:${this.terrainSlot.slotIndex}`,
      page: this.terrainSlot.page,
      descriptor,
      boulders: localBoulders,
      objectSignature,
      revision: this.terrainSlot.pageRevision,
      bladesPerCell: targetBladesPerCell,
      signature: buildSignature,
    };
    this.buildState = null;
  }

  startBuild(job) {
    PerfCounters.inc('grassRebuilds');
    this.buildState = {
      signature: job.signature,
      cellCursor: 0,
      count: 0,
      eligible: new Set(this.config.grass.tileIds),
      minimumHeight: Number.POSITIVE_INFINITY,
      maximumHeight: Number.NEGATIVE_INFINITY,
    };
  }

  applyPendingRebuild() {
    const job = this.pendingRebuild;
    if (!job) return false;
    this.ensureResources();
    if (!this.buildState || this.buildState.signature !== job.signature) {
      this.startBuild(job);
    }
    const state = this.buildState;
    const cellsPerSlice = this.config.streaming?.grassCellsPerBuildSlice
      ?? DEFAULT_BUILD_SLICE_CELLS;
    const totalCells = this.chunkSize * this.chunkSize;
    const endCell = Math.min(totalCells, state.cellCursor + cellsPerSlice);
    this.buildCells(job, state, endCell);
    PerfCounters.inc('grassBuildSlices');

    if (state.cellCursor < totalCells) return true;
    this.finishBuild(job, state);
    return true;
  }

  buildCells(job, state, endCell) {
    const base = this.geometry.getAttribute('instanceBase').array;
    const parameters = this.geometry.getAttribute('instanceParams').array;
    const trample = this.geometry.getAttribute('instanceTrample').array;

    for (; state.cellCursor < endCell; state.cellCursor += 1) {
      const cellIndex = state.cellCursor;
      if (!state.eligible.has(job.page.tiles[cellIndex])) continue;
      const localX = cellIndex % this.chunkSize;
      const localZ = Math.floor(cellIndex / this.chunkSize);
      for (let sampleIndex = 0; sampleIndex < job.bladesPerCell; sampleIndex += 1) {
        const jitterX = cellSampleRandom01(job.descriptor.chunkX, job.descriptor.chunkZ, cellIndex, sampleIndex, 0);
        const jitterZ = cellSampleRandom01(job.descriptor.chunkX, job.descriptor.chunkZ, cellIndex, sampleIndex, 1);
        const sampleX = localX + jitterX;
        const sampleZ = localZ + jitterZ;
        const localWorldX = -this.chunkWorldSize / 2 + sampleX * this.tileSize;
        const localWorldZ = this.chunkWorldSize / 2 - sampleZ * this.tileSize;
        const worldX = job.descriptor.centerWorldX + localWorldX;
        const worldZ = job.descriptor.centerWorldZ + localWorldZ;
        const height = sampleHeight(job.page, sampleX, sampleZ, this.chunkSize);
        const width = this.config.grass.minWidth
          + cellSampleRandom01(job.descriptor.chunkX, job.descriptor.chunkZ, cellIndex, sampleIndex, 2)
            * (this.config.grass.maxWidth - this.config.grass.minWidth);
        const length = this.config.grass.minLength
          + cellSampleRandom01(job.descriptor.chunkX, job.descriptor.chunkZ, cellIndex, sampleIndex, 3)
            * (this.config.grass.maxLength - this.config.grass.minLength);
        const angle = cellSampleRandom01(job.descriptor.chunkX, job.descriptor.chunkZ, cellIndex, sampleIndex, 4) * TWO_PI;
        const rock = findTrample(
          worldX,
          worldZ,
          job.boulders,
          this.config.rocks.radius,
          this.config.rocks.falloff,
        );

        const baseOffset = state.count * 3;
        base[baseOffset] = localWorldX;
        base[baseOffset + 1] = height;
        base[baseOffset + 2] = localWorldZ;
        const parameterOffset = state.count * 4;
        parameters[parameterOffset] = width;
        parameters[parameterOffset + 1] = length;
        parameters[parameterOffset + 2] = angle;
        parameters[parameterOffset + 3] = cellSampleRandom01(
          job.descriptor.chunkX,
          job.descriptor.chunkZ,
          cellIndex,
          sampleIndex,
          5,
        );
        trample[baseOffset] = rock.directionX;
        trample[baseOffset + 1] = rock.directionZ;
        trample[baseOffset + 2] = rock.influence;
        state.minimumHeight = Math.min(state.minimumHeight, height);
        state.maximumHeight = Math.max(state.maximumHeight, height);
        state.count += 1;
      }
    }
  }

  finishBuild(job, state) {
    const baseAttribute = this.geometry.getAttribute('instanceBase');
    const parameterAttribute = this.geometry.getAttribute('instanceParams');
    const trampleAttribute = this.geometry.getAttribute('instanceTrample');
    this.geometry.instanceCount = state.count;
    baseAttribute.needsUpdate = true;
    parameterAttribute.needsUpdate = true;
    trampleAttribute.needsUpdate = true;
    setGeometryBounds(
      this.geometry,
      this.chunkWorldSize,
      state.minimumHeight,
      state.maximumHeight,
      this.config.grass.maxLength,
    );
    this.readyKey = job.descriptor.key;
    this.readyRevision = job.revision;
    this.readyObjectSignature = job.objectSignature;
    this.readyBladesPerCell = job.bladesPerCell;
    this.pendingRebuild = null;
    this.buildState = null;
    this.mesh.visible = Boolean(
      this.terrainSlot.mesh.visible
      && this.terrainSlot.descriptor?.key === this.readyKey,
    );
    PerfCounters.set('grassLastChunkInstances', state.count);
  }

  dispose() {
    this.terrainView.scene.remove(this.mesh);
    this.releaseResources();
    this.emptyGeometry.dispose();
  }
}
