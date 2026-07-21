import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  atomicAdd,
  atomicStore,
  clamp,
  cos,
  float,
  instanceIndex,
  mix,
  positionLocal,
  sin,
  storage,
  struct,
  uint,
  vec3,
  vec4,
} from 'three/tsl';
import { createVoxelChunkLayout } from './VoxelChunkLayout.js';
import {
  VOXEL_BOUNDS_COLOR,
  VOXEL_CUBE_FILL_RATIO,
  VOXEL_HIGH_COLOR,
  VOXEL_LOW_COLOR,
  VOXEL_METALNESS,
  VOXEL_ROUGHNESS,
  VOXEL_WORKGROUP_SIZE,
} from './voxelConstants.js';

const STATUS_DISABLED = 'disabled';
const STATUS_PENDING = 'pending';
const STATUS_READY = 'ready';
const STATUS_UNSUPPORTED = 'unsupported';
const STATUS_FAILED = 'failed';

function createInstancedCubeGeometry(voxelSize, maxInstances) {
  const source = new THREE.BoxGeometry(
    voxelSize * VOXEL_CUBE_FILL_RATIO,
    voxelSize * VOXEL_CUBE_FILL_RATIO,
    voxelSize * VOXEL_CUBE_FILL_RATIO,
  );
  const geometry = new THREE.InstancedBufferGeometry().copy(source);
  source.dispose();
  geometry.instanceCount = maxInstances;
  return geometry;
}

function createBounds(layout) {
  const box = new THREE.BoxGeometry(layout.worldWidth, layout.worldHeight, layout.worldDepth);
  const geometry = new THREE.EdgesGeometry(box);
  box.dispose();

  const material = new THREE.LineBasicMaterial({
    color: VOXEL_BOUNDS_COLOR,
    transparent: true,
    opacity: 0.35,
  });
  const bounds = new THREE.LineSegments(geometry, material);
  bounds.position.y = layout.worldHeight / 2;
  bounds.name = 'gpu-voxel-prototype-bounds';
  return bounds;
}

export class GpuVoxelChunk {
  constructor({ terrainView, config, mapConfig }) {
    this.terrainView = terrainView;
    this.renderer = terrainView.renderer;
    this.layout = createVoxelChunkLayout(config, mapConfig);
    this.statusCode = this.layout.enabled ? STATUS_PENDING : STATUS_DISABLED;
    this.errorMessage = null;
    this.group = null;
    this.mesh = null;
    this.bounds = null;
    this.geometry = null;
    this.material = null;
    this.positionBuffer = null;
    this.drawBuffer = null;
    this.computeInit = null;
    this.computeGenerate = null;
    this.disposed = false;
  }

  getStatus() {
    return Object.freeze({
      code: this.statusCode,
      enabled: this.layout.enabled,
      supported: this.statusCode !== STATUS_UNSUPPORTED,
      ready: this.statusCode === STATUS_READY,
      visible: Boolean(this.group?.visible),
      maxInstances: this.layout.maxInstances,
      cells: Object.freeze([
        this.layout.cellsX,
        this.layout.cellsY,
        this.layout.cellsZ,
      ]),
      error: this.errorMessage,
    });
  }

  async initialize() {
    if (this.statusCode === STATUS_DISABLED || this.disposed) {
      return this.getStatus();
    }

    if (!this.renderer.backend?.isWebGPUBackend) {
      this.statusCode = STATUS_UNSUPPORTED;
      this.errorMessage = 'The voxel prototype requires the WebGPU backend.';
      return this.getStatus();
    }

    try {
      this.createGpuResources();
      await this.renderer.computeAsync(this.computeInit);
      await this.renderer.computeAsync(this.computeGenerate);
      this.statusCode = STATUS_READY;
      this.group.visible = this.layout.visible;
      this.update();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.statusCode = STATUS_FAILED;
      this.disposeGpuResources();
    }

    return this.getStatus();
  }

  createGpuResources() {
    const layout = this.layout;
    const geometry = createInstancedCubeGeometry(layout.voxelSize, layout.maxInstances);
    const indexCount = geometry.index?.count ?? 0;
    if (indexCount === 0) {
      geometry.dispose();
      throw new Error('Voxel prototype requires indexed cube geometry.');
    }

    const positionBuffer = new THREE.StorageInstancedBufferAttribute(
      new Float32Array(layout.maxInstances * 4),
      4,
    );
    const positionWrite = storage(positionBuffer, 'vec4', layout.maxInstances);
    const positionRead = storage(positionBuffer, 'vec4', layout.maxInstances).toReadOnly();

    const drawBuffer = new THREE.IndirectStorageBufferAttribute(new Uint32Array(5), 5);
    const drawBufferStruct = struct({
      indexCount: 'uint',
      instanceCount: { type: 'uint', atomic: true },
      firstIndex: 'uint',
      baseVertex: 'uint',
      firstInstance: 'uint',
    }, 'VoxelDrawBuffer');
    const drawStorage = storage(drawBuffer, drawBufferStruct, drawBuffer.count);
    geometry.setIndirect(drawBuffer);

    const computeInit = Fn(() => {
      drawStorage.get('indexCount').assign(uint(indexCount));
      atomicStore(drawStorage.get('instanceCount'), uint(0));
      drawStorage.get('firstIndex').assign(uint(0));
      drawStorage.get('baseVertex').assign(uint(0));
      drawStorage.get('firstInstance').assign(uint(0));
    })().compute(1).setName('Initialize voxel indirect draw');

    const computeGenerate = Fn(() => {
      const linearIndex = uint(instanceIndex).toVar('voxelLinearIndex');
      const yzIndex = linearIndex.div(uint(layout.cellsX)).toVar('voxelYZIndex');
      const voxelX = linearIndex.sub(yzIndex.mul(uint(layout.cellsX))).toVar('voxelX');
      const voxelY = yzIndex.div(uint(layout.cellsZ)).toVar('voxelY');
      const voxelZ = yzIndex.sub(voxelY.mul(uint(layout.cellsZ))).toVar('voxelZ');

      const localX = float(voxelX).sub((layout.cellsX - 1) * 0.5).toVar('localX');
      const localY = float(voxelY).toVar('localY');
      const localZ = float(voxelZ).sub((layout.cellsZ - 1) * 0.5).toVar('localZ');
      const phase = layout.seed * 0.173;
      const frequency = layout.surfaceFrequency;
      const amplitude = layout.surfaceAmplitude;
      const surfaceHeight = clamp(
        float(layout.baseHeight)
          .add(sin(localX.mul(frequency).add(phase)).mul(amplitude))
          .add(cos(localZ.mul(frequency * 0.83).sub(phase * 0.7)).mul(amplitude * 0.65))
          .add(
            sin(localX.add(localZ).mul(frequency * 0.43).add(phase * 0.37))
              .mul(amplitude * 0.35),
          ),
        0,
        layout.cellsY - 1,
      ).toVar('surfaceHeight');
      const density = surfaceHeight.sub(localY).toVar('density');

      If(density.greaterThanEqual(0), () => {
        const outputIndex = atomicAdd(drawStorage.get('instanceCount'), uint(1));
        positionWrite.element(outputIndex).assign(vec4(
          localX.mul(layout.voxelSize),
          localY.add(0.5).mul(layout.voxelSize),
          localZ.mul(layout.voxelSize),
          1,
        ));
      });
    })().compute(layout.maxInstances, [VOXEL_WORKGROUP_SIZE]).setName('Generate voxel density chunk');

    const voxelPosition = positionRead.element(instanceIndex).xyz;
    const heightMix = clamp(voxelPosition.y.div(layout.worldHeight), 0, 1);
    const material = new THREE.MeshStandardNodeMaterial({
      roughness: VOXEL_ROUGHNESS,
      metalness: VOXEL_METALNESS,
    });
    material.positionNode = positionLocal.add(voxelPosition);
    material.colorNode = mix(
      vec3(...VOXEL_LOW_COLOR),
      vec3(...VOXEL_HIGH_COLOR),
      heightMix,
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'gpu-voxel-prototype';

    const group = new THREE.Group();
    group.name = 'gpu-voxel-prototype-root';
    group.visible = false;
    const bounds = createBounds(layout);
    group.add(mesh, bounds);
    this.terrainView.scene.add(group);

    this.group = group;
    this.mesh = mesh;
    this.bounds = bounds;
    this.geometry = geometry;
    this.material = material;
    this.positionBuffer = positionBuffer;
    this.drawBuffer = drawBuffer;
    this.computeInit = computeInit;
    this.computeGenerate = computeGenerate;
  }

  setVisible(visible) {
    if (this.statusCode !== STATUS_READY || !this.group) {
      return false;
    }
    this.group.visible = Boolean(visible);
    return this.group.visible;
  }

  toggle() {
    return this.setVisible(!this.group?.visible);
  }

  update() {
    if (this.statusCode !== STATUS_READY || !this.group) {
      return;
    }
    const origin = this.terrainView.cellToWorld(this.layout.originX, this.layout.originZ);
    this.group.position.set(
      origin.x,
      origin.y + this.layout.verticalOffset,
      origin.z,
    );
  }

  disposeGpuResources() {
    if (this.group) {
      this.terrainView.scene.remove(this.group);
    }
    this.geometry?.dispose();
    this.material?.dispose();
    this.bounds?.geometry.dispose();
    this.bounds?.material.dispose();
    this.positionBuffer?.dispose?.();
    this.drawBuffer?.dispose?.();
    this.group = null;
    this.mesh = null;
    this.bounds = null;
    this.geometry = null;
    this.material = null;
    this.positionBuffer = null;
    this.drawBuffer = null;
    this.computeInit = null;
    this.computeGenerate = null;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeGpuResources();
  }
}
