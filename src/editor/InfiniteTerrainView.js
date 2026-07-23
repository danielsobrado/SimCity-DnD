import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { PerfCounters } from './performance/qa/PerfCounters.js';
import { createTerrainMaterial } from './terrainMaterial.js';
import { cellCenterToWorld, worldToCell } from './world/WorldCoordinates.js';
import {
  createTerrainSlotPlan,
  selectTerrainResidentDescriptors,
} from './world/TerrainStreamingPlan.js';
import {
  TERRAIN_COMMIT_BUDGET_MS,
  TERRAIN_MAX_COMMITS_PER_FRAME,
  TerrainCommitQueue,
  commitPriority,
  createTerrainCommitJob,
} from './world/TerrainCommitQueue.js';
import {
  createSurfaceMaskConfig,
  enrichPageRenderPixels,
} from './world/ChunkRenderPixels.js';

const PICK_ITERATIONS = 6;
const PREVIEW_HEIGHT_OFFSET = 0.08;

function createSlot({ slotIndex, scene, geometry, worldStore, stylizedConfig }) {
  const chunkSize = worldStore.chunkSize;
  const texturePixels = new Uint8Array(chunkSize * chunkSize * 4);
  const surfaceMaskPixels = new Uint8Array(chunkSize * chunkSize * 4);
  const heightPixels = new Float32Array((chunkSize + 1) * (chunkSize + 1));
  const tileTexture = new THREE.DataTexture(
    texturePixels,
    chunkSize,
    chunkSize,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tileTexture.magFilter = THREE.NearestFilter;
  tileTexture.minFilter = THREE.NearestFilter;
  tileTexture.generateMipmaps = false;
  tileTexture.colorSpace = THREE.SRGBColorSpace;

  const surfaceMaskTexture = new THREE.DataTexture(
    surfaceMaskPixels,
    chunkSize,
    chunkSize,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  surfaceMaskTexture.magFilter = THREE.LinearFilter;
  surfaceMaskTexture.minFilter = THREE.LinearFilter;
  surfaceMaskTexture.generateMipmaps = false;
  surfaceMaskTexture.colorSpace = THREE.NoColorSpace;

  const heightTexture = new THREE.DataTexture(
    heightPixels,
    chunkSize + 1,
    chunkSize + 1,
    THREE.RedFormat,
    THREE.FloatType,
  );
  heightTexture.magFilter = THREE.NearestFilter;
  heightTexture.minFilter = THREE.NearestFilter;
  heightTexture.generateMipmaps = false;
  heightTexture.unpackAlignment = 1;

  const chunkCenter = uniform(new THREE.Vector2());
  const material = createTerrainMaterial({
    tileTexture,
    heightTexture,
    surfaceMaskTexture,
    chunkCenter,
    chunkWorldSize: chunkSize * worldStore.tileSize,
    width: chunkSize,
    height: chunkSize,
    stylizedConfig,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.name = `terrain-slot-${slotIndex}`;
  scene.add(mesh);

  return {
    slotIndex,
    key: null,
    descriptor: null,
    page: null,
    lastUsed: 0,
    token: 0,
    loading: false,
    pageRevision: -1,
    texturePixels,
    surfaceMaskPixels,
    heightPixels,
    tileTexture,
    surfaceMaskTexture,
    heightTexture,
    chunkCenter,
    material,
    mesh,
  };
}

export class InfiniteTerrainView {
  constructor({
    container,
    tileMap,
    heightField,
    worldStore,
    floatingOrigin,
    streamingConfig,
    rendererConfig,
    stylizedConfig,
  }) {
    this.container = container;
    this.tileMap = tileMap;
    this.heightField = heightField;
    this.worldStore = worldStore;
    this.floatingOrigin = floatingOrigin;
    this.streamingConfig = streamingConfig;
    this.stylizedConfig = stylizedConfig;
    this.surfaceMaskConfig = createSurfaceMaskConfig(stylizedConfig);
    this.chunkSize = worldStore.chunkSize;
    this.chunkWorldSize = this.chunkSize * worldStore.tileSize;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pickPoint = new THREE.Vector3();
    this.lastFocus = null;
    this.lastFocusTimestamp = null;
    this.focusChunkKey = null;
    this.clock = 0;
    this.disposed = false;
    this.focusChunk = { chunkX: 0, chunkZ: 0 };
    this.focusVelocity = { x: 0, z: 0 };
    this.commitQueue = new TerrainCommitQueue({
      maxCommitsPerFrame: streamingConfig.maxCommitsPerFrame ?? TERRAIN_MAX_COMMITS_PER_FRAME,
      commitBudgetMs: streamingConfig.commitBudgetMs ?? TERRAIN_COMMIT_BUDGET_MS,
    });
    this.pendingFetches = new Set();

    this.renderer = new THREE.WebGPURenderer({
      antialias: rendererConfig.antialias,
      forceWebGL: rendererConfig.forceWebGL,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, rendererConfig.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.domElement.setAttribute('aria-label', 'SimCity DnD infinite world editor viewport');
    container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a100c');
    this.geometry = new THREE.PlaneGeometry(
      this.chunkWorldSize,
      this.chunkWorldSize,
      this.chunkSize,
      this.chunkSize,
    );
    this.slots = Array.from(
      { length: streamingConfig.maxResidentChunks },
      (_, slotIndex) => createSlot({
        slotIndex,
        scene: this.scene,
        geometry: this.geometry,
        worldStore,
        stylizedConfig,
      }),
    );

    this.preview = new THREE.Mesh(
      new THREE.PlaneGeometry(worldStore.tileSize, worldStore.tileSize),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.visible = false;
    this.scene.add(this.preview);

    this.unsubscribeWorld = worldStore.subscribe((change) => this.onWorldChange(change));
  }

  async initialize() {
    await this.renderer.init();
    await this.updateStreaming({ x: 0, z: 0 }, 0, true);
    await this.drainPendingUploads();
  }

  setAnimationLoop(callback) {
    this.renderer.setAnimationLoop(callback);
  }

  resize(width, height) {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  getStreamingStatus() {
    return Object.freeze({
      resident: this.slots.filter((slot) => slot.key && slot.mesh.visible).length,
      loading: this.slots.filter((slot) => slot.loading).length,
      pendingCommits: this.commitQueue.size,
      maxQueuedCommitAgeMs: this.commitQueue.maxQueuedAgeMs,
      capacity: this.slots.length,
      focusChunk: this.focusChunkKey,
      cache: this.worldStore.getStats(),
      origin: this.floatingOrigin.getState(),
    });
  }

  async updateStreaming(focusWorld, timestamp = performance.now(), force = false) {
    const velocity = this.calculateVelocity(focusWorld, timestamp);
    this.focusVelocity = velocity;
    const selection = selectTerrainResidentDescriptors({
      focusWorld,
      velocity,
      tileSize: this.worldStore.tileSize,
      chunkSize: this.chunkSize,
      loadRadius: this.streamingConfig.loadRadius,
      unloadRadius: this.streamingConfig.unloadRadius,
      prefetchSeconds: this.streamingConfig.prefetchSeconds,
      slotCount: this.slots.length,
    });
    const nextFocusKey = `${selection.currentChunk.chunkX}:${selection.currentChunk.chunkZ}`;
    this.focusChunk = selection.currentChunk;
    if (!force && nextFocusKey === this.focusChunkKey) {
      this.positionSlots();
      return;
    }
    this.focusChunkKey = nextFocusKey;
    this.clock += 1;
    const plan = createTerrainSlotPlan({
      slots: this.slots,
      targets: selection.descriptors,
      focusChunk: selection.currentChunk,
    });
    for (const slotIndex of plan.retained) {
      this.slots[slotIndex].lastUsed = this.clock;
    }
    for (const assignment of plan.assignments) {
      void this.assignSlot(
        this.slots[assignment.slotIndex],
        assignment.descriptor,
      );
    }
    this.positionSlots();
  }

  calculateVelocity(focusWorld, timestamp) {
    let velocity = { x: 0, z: 0 };
    if (this.lastFocus && Number.isFinite(this.lastFocusTimestamp)) {
      const deltaSeconds = Math.max(0.001, (timestamp - this.lastFocusTimestamp) / 1000);
      velocity = {
        x: (focusWorld.x - this.lastFocus.x) / deltaSeconds,
        z: (focusWorld.z - this.lastFocus.z) / deltaSeconds,
      };
    }
    this.lastFocus = { x: focusWorld.x, z: focusWorld.z };
    this.lastFocusTimestamp = timestamp;
    return velocity;
  }

  async assignSlot(slot, descriptor, { immediate = false } = {}) {
    PerfCounters.inc('terrainAssignSlots');
    slot.token += 1;
    const token = slot.token;
    slot.key = descriptor.key;
    slot.descriptor = descriptor;
    slot.lastUsed = this.clock;
    slot.loading = true;
    slot.mesh.visible = false;
    this.positionSlot(slot);

    const fetchPromise = this.worldStore.requestChunk(descriptor.chunkX, descriptor.chunkZ)
      .then((page) => {
        if (this.disposed || slot.token !== token || slot.key !== descriptor.key) {
          if (slot.token === token) {
            slot.loading = false;
          }
          return;
        }
        if (immediate) {
          this.commitPage(slot, page);
          return;
        }
        this.commitQueue.enqueue(createTerrainCommitJob({
          slot,
          page,
          token,
          priority: commitPriority({
            descriptor,
            focusChunk: this.focusChunk,
            velocity: this.focusVelocity,
          }),
        }));
      })
      .catch((error) => {
        if (slot.token === token) {
          slot.loading = false;
        }
        console.error('Terrain chunk request failed.', error);
      });

    this.pendingFetches.add(fetchPromise);
    try {
      await fetchPromise;
    } finally {
      this.pendingFetches.delete(fetchPromise);
    }
  }

  ensurePageRenderPixels(page) {
    if (page.tilePixels && page.surfaceMaskPixels && !page.renderPixelsDirty) {
      return page;
    }
    if (typeof this.worldStore.refreshPageRenderPixels === 'function') {
      return this.worldStore.refreshPageRenderPixels(page);
    }
    return enrichPageRenderPixels(
      page,
      (cellX, cellZ) => this.worldStore.getTile(cellX, cellZ),
      this.surfaceMaskConfig,
    );
  }

  /**
   * Main-thread materialization only: typed-array copies + texture flags.
   * Must not call getTile / generate masks (worker already did that).
   */
  commitPage(slot, page) {
    const ready = this.ensurePageRenderPixels(page);
    if (!ready.tilePixels || !ready.surfaceMaskPixels) {
      throw new Error('Terrain page commit requires tilePixels and surfaceMaskPixels.');
    }
    slot.texturePixels.set(ready.tilePixels);
    slot.surfaceMaskPixels.set(ready.surfaceMaskPixels);
    slot.heightPixels.set(ready.heights);
    slot.tileTexture.needsUpdate = true;
    slot.surfaceMaskTexture.needsUpdate = true;
    slot.heightTexture.needsUpdate = true;
    slot.page = ready;
    slot.pageRevision = ready.revision;
    slot.mesh.visible = true;
    slot.loading = false;
    PerfCounters.inc('terrainUploadPages');
  }

  flushUploadQueue(options = {}) {
    if (this.disposed || this.commitQueue.size === 0) {
      return { committed: 0, remaining: 0, maxQueuedAgeMs: this.commitQueue.maxQueuedAgeMs };
    }
    return this.commitQueue.flush(
      (job) => this.commitPage(job.slot, job.page),
      (job) => (
        !this.disposed
        && job.slot.token === job.token
        && job.slot.key === job.slot.descriptor?.key
      ),
      options,
    );
  }

  async drainPendingUploads() {
    while (!this.disposed && (this.pendingFetches.size > 0 || this.commitQueue.size > 0)) {
      if (this.pendingFetches.size > 0) {
        await Promise.allSettled([...this.pendingFetches]);
      }
      this.commitQueue.drain(
        (job) => this.commitPage(job.slot, job.page),
        (job) => (
          !this.disposed
          && job.slot.token === job.token
          && job.slot.key === job.slot.descriptor?.key
        ),
      );
    }
  }

  /** Editor paint/sculpt path — mark dirty then memcpy commit. */
  uploadPage(slot, page) {
    page.renderPixelsDirty = true;
    this.commitPage(slot, page);
  }

  positionSlots() {
    for (const slot of this.slots) {
      this.positionSlot(slot);
    }
    if (this.preview.visible && this.preview.userData.cell) {
      this.positionPreview(this.preview.userData.cell);
    }
  }

  positionSlot(slot) {
    if (!slot.descriptor) {
      return;
    }
    const render = this.floatingOrigin.toRender(
      slot.descriptor.centerWorldX,
      slot.descriptor.centerWorldZ,
    );
    slot.mesh.position.set(render.x, 0, render.z);
    slot.chunkCenter.value.set(slot.descriptor.centerWorldX, slot.descriptor.centerWorldZ);
  }

  onWorldChange(change) {
    if (change.kind === 'reset') {
      for (const slot of this.slots) {
        if (slot.descriptor) {
          void this.assignSlot(slot, slot.descriptor, { immediate: true });
        }
      }
      return;
    }
    const coordinates = change.cells ?? change.vertices ?? [];
    const affected = new Set();
    for (const coordinate of coordinates) {
      const chunkX = Math.floor(coordinate.x / this.chunkSize);
      const chunkZ = Math.floor(coordinate.z / this.chunkSize);
      const minimumOffset = -1;
      const maximumOffset = change.kind === 'tile' ? 1 : 0;
      for (let offsetZ = minimumOffset; offsetZ <= maximumOffset; offsetZ += 1) {
        for (let offsetX = minimumOffset; offsetX <= maximumOffset; offsetX += 1) {
          affected.add(`${chunkX + offsetX}:${chunkZ + offsetZ}`);
        }
      }
    }
    for (const slot of this.slots) {
      if (slot.key && affected.has(slot.key)) {
        const page = this.worldStore.getChunk(slot.descriptor.chunkX, slot.descriptor.chunkZ);
        if (change.kind === 'tile') {
          page.renderPixelsDirty = true;
        }
        this.uploadPage(slot, page);
      }
    }
    if (change.kind === 'height' && this.preview.visible && this.preview.userData.cell) {
      this.positionPreview(this.preview.userData.cell);
    }
  }

  refreshAll() {
    for (const slot of this.slots) {
      if (slot.descriptor) {
        const page = this.worldStore.getChunk(slot.descriptor.chunkX, slot.descriptor.chunkZ);
        this.uploadPage(slot, page);
      }
    }
    this.positionSlots();
  }

  updatePatch() {
    // World-store notifications update resident slots directly.
  }

  updateHeightPatch() {
    // World-store notifications update resident slots directly.
  }

  pickWorld(clientX, clientY, camera) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    this.pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, camera);
    this.pickPlane.constant = 0;
    if (!this.raycaster.ray.intersectPlane(this.pickPlane, this.pickPoint)) {
      return null;
    }
    for (let iteration = 0; iteration < PICK_ITERATIONS; iteration += 1) {
      const height = this.getWorldHeight(this.pickPoint.x, this.pickPoint.z);
      this.pickPlane.constant = -height;
      if (!this.raycaster.ray.intersectPlane(this.pickPlane, this.pickPoint)) {
        return null;
      }
    }
    return Object.freeze({ x: this.pickPoint.x, z: this.pickPoint.z });
  }

  pickCell(clientX, clientY, camera) {
    const world = this.pickWorld(clientX, clientY, camera);
    if (!world) {
      return null;
    }
    const canonical = this.floatingOrigin.toCanonical(world.x, world.z);
    return worldToCell(canonical.x, canonical.z, this.worldStore.tileSize);
  }

  getWorldHeight(renderX, renderZ) {
    const canonical = this.floatingOrigin.toCanonical(renderX, renderZ);
    return this.getCanonicalHeight(canonical.x, canonical.z);
  }

  getCanonicalHeight(worldX, worldZ) {
    const cellX = worldX / this.worldStore.tileSize;
    const cellZ = -worldZ / this.worldStore.tileSize;
    return this.heightField.sample(cellX, cellZ);
  }

  setPreview(cell, brushSize, color) {
    if (!cell) {
      this.preview.visible = false;
      this.preview.userData.cell = null;
      return;
    }
    this.preview.userData.cell = cell;
    this.positionPreview(cell);
    this.preview.scale.set(brushSize, brushSize, 1);
    this.preview.material.color.set(color);
    this.preview.visible = true;
  }

  positionPreview(cell) {
    const world = this.cellToWorld(cell.x, cell.z);
    this.preview.position.set(world.x, world.y + PREVIEW_HEIGHT_OFFSET, world.z);
  }

  cellToWorld(x, z) {
    const canonical = cellCenterToWorld(x, z, this.worldStore.tileSize);
    const render = this.floatingOrigin.toRender(canonical.x, canonical.z);
    return {
      x: render.x,
      y: this.heightField.getCellHeight(x, z),
      z: render.z,
    };
  }

  boundsToWorld(bounds) {
    const min = this.cellToWorld(bounds.minX, bounds.minZ);
    const max = this.cellToWorld(bounds.maxX, bounds.maxZ);
    return {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
  }

  updateFloatingOrigin(renderFocus) {
    const event = this.floatingOrigin.update(renderFocus);
    if (event) {
      this.positionSlots();
    }
    return event;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.commitQueue.clear();
    this.pendingFetches.clear();
    this.setAnimationLoop(null);
    this.unsubscribeWorld?.();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    for (const slot of this.slots) {
      this.scene.remove(slot.mesh);
      slot.material.dispose();
      slot.tileTexture.dispose();
      slot.surfaceMaskTexture.dispose();
      slot.heightTexture.dispose();
    }
    this.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
