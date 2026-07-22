import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  atomicAdd,
  atomicStore,
  attribute,
  clamp,
  cos,
  float,
  instanceIndex,
  mix,
  normalize,
  sin,
  storage,
  struct,
  uint,
  uvec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  MC_CORNER_OFFSETS,
  MC_EDGE_CORNERS,
  MC_MAX_TRIANGLES_PER_CELL,
  MC_TABLE_WIDTH,
  MC_TRIANGLE_COUNTS,
  MC_TRIANGLE_EDGES,
  validateMarchingCubesTables,
} from './MarchingCubesTables.js';
import { createVoxelChunkLayout } from './VoxelChunkLayout.js';
import {
  VOXEL_BOUNDS_COLOR,
  VOXEL_HIGH_COLOR,
  VOXEL_INTERPOLATION_EPSILON,
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
  bounds.name = 'gpu-marching-cubes-bounds';
  return bounds;
}

function createFieldFunction(layout) {
  const phase = layout.seed * 0.173;
  const frequency = layout.surfaceFrequency;
  const amplitude = layout.surfaceAmplitude;

  return Fn(([samplePosition]) => {
    const localX = samplePosition.x.sub(layout.cellsX * 0.5);
    const localZ = samplePosition.z.sub(layout.cellsZ * 0.5);
    const surfaceHeight = float(layout.baseHeight)
      .add(sin(localX.mul(frequency).add(phase)).mul(amplitude))
      .add(cos(localZ.mul(frequency * 0.83).sub(phase * 0.7)).mul(amplitude * 0.65))
      .add(
        sin(localX.add(localZ).mul(frequency * 0.43).add(phase * 0.37))
          .mul(amplitude * 0.35),
      );

    return samplePosition.y.sub(surfaceHeight);
  });
}

function createNormalFunction(layout) {
  const phase = layout.seed * 0.173;
  const frequency = layout.surfaceFrequency;
  const amplitude = layout.surfaceAmplitude;
  const diagonalFrequency = frequency * 0.43;
  const diagonalAmplitude = amplitude * 0.35;

  return Fn(([samplePosition]) => {
    const localX = samplePosition.x.sub(layout.cellsX * 0.5);
    const localZ = samplePosition.z.sub(layout.cellsZ * 0.5);
    const diagonalPhase = localX.add(localZ).mul(diagonalFrequency).add(phase * 0.37);

    const surfaceDx = cos(localX.mul(frequency).add(phase))
      .mul(amplitude * frequency)
      .add(cos(diagonalPhase).mul(diagonalAmplitude * diagonalFrequency));
    const surfaceDz = sin(localZ.mul(frequency * 0.83).sub(phase * 0.7))
      .mul(-amplitude * 0.65 * frequency * 0.83)
      .add(cos(diagonalPhase).mul(diagonalAmplitude * diagonalFrequency));

    return normalize(vec3(surfaceDx.negate(), 1, surfaceDz.negate()));
  });
}

function createCellOrigin(linearIndex, layout) {
  const yzIndex = linearIndex.div(uint(layout.cellsX));
  const cellX = linearIndex.sub(yzIndex.mul(uint(layout.cellsX)));
  const cellY = yzIndex.div(uint(layout.cellsZ));
  const cellZ = yzIndex.sub(cellY.mul(uint(layout.cellsZ)));
  return vec3(float(cellX), float(cellY), float(cellZ));
}

export class GpuVoxelChunk {
  constructor({ terrainView, config, mapConfig }) {
    validateMarchingCubesTables();

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
    this.classificationBuffer = null;
    this.positionBuffer = null;
    this.normalBuffer = null;
    this.drawBuffer = null;
    this.computeInit = null;
    this.computeClassify = null;
    this.computeEmit = null;
    this.disposed = false;
  }

  getStatus() {
    return Object.freeze({
      code: this.statusCode,
      enabled: this.layout.enabled,
      supported: this.statusCode !== STATUS_UNSUPPORTED,
      ready: this.statusCode === STATUS_READY,
      visible: Boolean(this.group?.visible),
      algorithm: 'marching-cubes',
      cellCount: this.layout.cellCount,
      maxTriangles: this.layout.maxTriangles,
      maxVertices: this.layout.maxVertices,
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
      this.errorMessage = 'GPU marching cubes requires the WebGPU backend.';
      return this.getStatus();
    }

    try {
      this.createGpuResources();
      await this.regenerate();
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

  async regenerate() {
    if (!this.computeInit || !this.computeClassify || !this.computeEmit) {
      throw new Error('GPU marching-cubes resources are not initialized.');
    }

    await this.renderer.computeAsync(this.computeInit);
    await this.renderer.computeAsync(this.computeClassify);
    await this.renderer.computeAsync(this.computeEmit);
  }

  createGpuResources() {
    const layout = this.layout;
    const geometry = new THREE.BufferGeometry();
    const positionBuffer = new THREE.StorageBufferAttribute(layout.maxVertices, 4);
    const normalBuffer = new THREE.StorageBufferAttribute(layout.maxVertices, 4);
    geometry.setAttribute('position', positionBuffer);
    geometry.setAttribute('normal', normalBuffer);

    const positionWrite = storage(positionBuffer, 'vec4', layout.maxVertices);
    const normalWrite = storage(normalBuffer, 'vec4', layout.maxVertices);

    const classificationBuffer = new THREE.StorageBufferAttribute(layout.cellCount, 2);
    const classificationWrite = storage(classificationBuffer, 'uvec2', layout.cellCount);
    const classificationRead = storage(classificationBuffer, 'uvec2', layout.cellCount).toReadOnly();

    const cornerOffsetAttribute = new THREE.StorageBufferAttribute(MC_CORNER_OFFSETS, 4);
    const edgeCornerAttribute = new THREE.StorageBufferAttribute(MC_EDGE_CORNERS, 2);
    const triangleCountAttribute = new THREE.StorageBufferAttribute(MC_TRIANGLE_COUNTS, 1);
    const triangleEdgeAttribute = new THREE.StorageBufferAttribute(MC_TRIANGLE_EDGES, 1);
    const cornerOffsets = storage(cornerOffsetAttribute, 'vec4', 8).toReadOnly();
    const edgeCorners = storage(edgeCornerAttribute, 'uvec2', 12).toReadOnly();
    const triangleCounts = storage(triangleCountAttribute, 'uint', 256).toReadOnly();
    const triangleEdges = storage(
      triangleEdgeAttribute,
      'uint',
      MC_TRIANGLE_EDGES.length,
    ).toReadOnly();

    const drawBuffer = new THREE.IndirectStorageBufferAttribute(new Uint32Array(5), 5);
    const drawBufferStruct = struct({
      vertexCount: { type: 'uint', atomic: true },
      instanceCount: 'uint',
      firstVertex: 'uint',
      firstInstance: 'uint',
      offset: 'uint',
    }, 'MarchingCubesDrawBuffer');
    const drawStorage = storage(drawBuffer, drawBufferStruct, drawBuffer.count);
    geometry.setIndirect(drawBuffer);

    const sampleField = createFieldFunction(layout);
    const sampleNormal = createNormalFunction(layout);

    const computeInit = Fn(() => {
      atomicStore(drawStorage.get('vertexCount'), uint(0));
      drawStorage.get('instanceCount').assign(uint(1));
      drawStorage.get('firstVertex').assign(uint(0));
      drawStorage.get('firstInstance').assign(uint(0));
      drawStorage.get('offset').assign(uint(0));
    })().compute(1).setName('Initialize marching-cubes indirect draw');

    const computeClassify = Fn(() => {
      const linearIndex = uint(instanceIndex).toVar('cellLinearIndex');
      const cellOrigin = createCellOrigin(linearIndex, layout).toVar('cellOrigin');
      const caseIndex = uint(0).toVar('caseIndex');

      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
        const cornerPosition = cellOrigin.add(cornerOffsets.element(cornerIndex).xyz);
        If(sampleField(cornerPosition).lessThan(0), () => {
          caseIndex.addAssign(uint(1 << cornerIndex));
        });
      }

      classificationWrite.element(linearIndex).assign(uvec2(
        caseIndex,
        triangleCounts.element(caseIndex),
      ));
    })().compute(layout.cellCount, [VOXEL_WORKGROUP_SIZE]).setName('Classify marching-cubes cells');

    const computeEmit = Fn(() => {
      const linearIndex = uint(instanceIndex).toVar('emitCellLinearIndex');
      const classification = classificationRead.element(linearIndex);
      const caseIndex = classification.x;
      const triangleCount = classification.y;
      const cellOrigin = createCellOrigin(linearIndex, layout).toVar('emitCellOrigin');

      If(triangleCount.greaterThan(0), () => {
        const vertexBase = atomicAdd(
          drawStorage.get('vertexCount'),
          triangleCount.mul(uint(3)),
        );

        for (
          let triangleSlot = 0;
          triangleSlot < MC_MAX_TRIANGLES_PER_CELL;
          triangleSlot += 1
        ) {
          If(uint(triangleSlot).lessThan(triangleCount), () => {
            for (let vertexSlot = 0; vertexSlot < 3; vertexSlot += 1) {
              const tableIndex = caseIndex
                .mul(uint(MC_TABLE_WIDTH))
                .add(uint(triangleSlot * 3 + vertexSlot));
              const edgeIndex = triangleEdges.element(tableIndex);
              const cornerPair = edgeCorners.element(edgeIndex);
              const pointA = cellOrigin.add(cornerOffsets.element(cornerPair.x).xyz);
              const pointB = cellOrigin.add(cornerOffsets.element(cornerPair.y).xyz);
              const fieldA = sampleField(pointA);
              const fieldB = sampleField(pointB);
              const interpolation = clamp(
                fieldA.negate().div(
                  fieldB.sub(fieldA).add(VOXEL_INTERPOLATION_EPSILON),
                ),
                0,
                1,
              );
              const samplePosition = mix(pointA, pointB, interpolation);
              const localPosition = vec3(
                samplePosition.x.sub(layout.cellsX * 0.5).mul(layout.voxelSize),
                samplePosition.y.mul(layout.voxelSize),
                samplePosition.z.sub(layout.cellsZ * 0.5).mul(layout.voxelSize),
              );
              const outputIndex = vertexBase.add(uint(triangleSlot * 3 + vertexSlot));

              positionWrite.element(outputIndex).assign(vec4(localPosition, 1));
              normalWrite.element(outputIndex).assign(vec4(sampleNormal(samplePosition), 0));
            }
          });
        }
      });
    })().compute(layout.cellCount, [VOXEL_WORKGROUP_SIZE]).setName('Emit marching-cubes surface');

    const material = new THREE.MeshStandardNodeMaterial({
      roughness: VOXEL_ROUGHNESS,
      metalness: VOXEL_METALNESS,
      side: THREE.DoubleSide,
    });
    const heightMix = clamp(attribute('position').y.div(layout.worldHeight), 0, 1);
    material.colorNode = mix(
      vec3(...VOXEL_LOW_COLOR),
      vec3(...VOXEL_HIGH_COLOR),
      heightMix,
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'gpu-marching-cubes-surface';

    const group = new THREE.Group();
    group.name = 'gpu-marching-cubes-root';
    group.visible = false;
    const bounds = createBounds(layout);
    group.add(mesh, bounds);
    this.terrainView.scene.add(group);

    this.group = group;
    this.mesh = mesh;
    this.bounds = bounds;
    this.geometry = geometry;
    this.material = material;
    this.classificationBuffer = classificationBuffer;
    this.positionBuffer = positionBuffer;
    this.normalBuffer = normalBuffer;
    this.drawBuffer = drawBuffer;
    this.lookupAttributes = [
      cornerOffsetAttribute,
      edgeCornerAttribute,
      triangleCountAttribute,
      triangleEdgeAttribute,
    ];
    this.computeInit = computeInit;
    this.computeClassify = computeClassify;
    this.computeEmit = computeEmit;
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
    this.classificationBuffer?.dispose?.();
    this.positionBuffer?.dispose?.();
    this.normalBuffer?.dispose?.();
    this.drawBuffer?.dispose?.();
    for (const attribute of this.lookupAttributes ?? []) {
      attribute.dispose?.();
    }
    this.group = null;
    this.mesh = null;
    this.bounds = null;
    this.geometry = null;
    this.material = null;
    this.classificationBuffer = null;
    this.positionBuffer = null;
    this.normalBuffer = null;
    this.drawBuffer = null;
    this.lookupAttributes = null;
    this.computeInit = null;
    this.computeClassify = null;
    this.computeEmit = null;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeGpuResources();
  }
}
