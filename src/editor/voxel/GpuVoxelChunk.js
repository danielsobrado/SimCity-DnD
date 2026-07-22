import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  atomicAdd,
  atomicStore,
  attribute,
  clamp,
  cos,
  distance,
  float,
  instanceIndex,
  max,
  mix,
  normalize,
  sin,
  storage,
  struct,
  uint,
  uniform,
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
import { VOXEL_STAMP_OPERATION_CODES } from './VoxelStampStore.js';
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

function createBaseFieldFunction(layout) {
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

function createLinearCoordinates(linearIndex, sizeX, sizeZ) {
  const yzIndex = linearIndex.div(uint(sizeX));
  const x = linearIndex.sub(yzIndex.mul(uint(sizeX)));
  const y = yzIndex.div(uint(sizeZ));
  const z = yzIndex.sub(y.mul(uint(sizeZ)));
  return { x, y, z };
}

function createGridPosition(linearIndex, sizeX, sizeZ) {
  const coordinates = createLinearCoordinates(linearIndex, sizeX, sizeZ);
  return vec3(float(coordinates.x), float(coordinates.y), float(coordinates.z));
}

function createSampleIndex(samplePosition, layout) {
  const x = uint(clamp(samplePosition.x, 0, layout.cellsX));
  const y = uint(clamp(samplePosition.y, 0, layout.cellsY));
  const z = uint(clamp(samplePosition.z, 0, layout.cellsZ));
  return y
    .mul(uint(layout.samplePlaneSize))
    .add(z.mul(uint(layout.sampleCountX)))
    .add(x);
}

function createSmoothMinimum(left, right, smoothing) {
  const radius = max(smoothing, VOXEL_INTERPOLATION_EPSILON);
  const weight = clamp(
    float(0.5).add(right.sub(left).div(radius).mul(0.5)),
    0,
    1,
  );
  return mix(right, left, weight).sub(radius.mul(weight).mul(float(1).sub(weight)));
}

function createSmoothMaximum(left, right, smoothing) {
  return createSmoothMinimum(left.negate(), right.negate(), smoothing).negate();
}

export class GpuVoxelChunk {
  constructor({ terrainView, config, mapConfig, stampStore }) {
    validateMarchingCubesTables();

    this.terrainView = terrainView;
    this.renderer = terrainView.renderer;
    this.layout = createVoxelChunkLayout(config, mapConfig);
    this.stampStore = stampStore;
    this.statusCode = this.layout.enabled ? STATUS_PENDING : STATUS_DISABLED;
    this.errorMessage = null;
    this.group = null;
    this.mesh = null;
    this.bounds = null;
    this.geometry = null;
    this.material = null;
    this.densityBuffer = null;
    this.smoothedDensityBuffer = null;
    this.classificationBuffer = null;
    this.positionBuffer = null;
    this.normalBuffer = null;
    this.drawBuffer = null;
    this.stampShapeBuffer = null;
    this.stampControlBuffer = null;
    this.stampCountUniform = null;
    this.computeInit = null;
    this.computeDensity = null;
    this.computeSmooth = null;
    this.computeClassify = null;
    this.computeEmit = null;
    this.unsubscribeStamps = null;
    this.regenerationPromise = null;
    this.regenerationRequested = false;
    this.rebuilding = false;
    this.disposed = false;
  }

  getStatus() {
    return Object.freeze({
      code: this.statusCode,
      enabled: this.layout.enabled,
      supported: this.statusCode !== STATUS_UNSUPPORTED,
      ready: this.statusCode === STATUS_READY,
      visible: Boolean(this.group?.visible),
      rebuilding: this.rebuilding,
      algorithm: 'marching-cubes',
      cellCount: this.layout.cellCount,
      maxTriangles: this.layout.maxTriangles,
      maxVertices: this.layout.maxVertices,
      stampCount: this.stampStore?.size ?? 0,
      maxStamps: this.layout.maxStamps,
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
      this.uploadStamps();
      await this.regeneratePasses();
      this.statusCode = STATUS_READY;
      this.group.visible = this.layout.visible;
      this.update();
      this.unsubscribeStamps = this.stampStore?.subscribe(() => this.requestRegeneration());
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.statusCode = STATUS_FAILED;
      this.disposeGpuResources();
    }

    return this.getStatus();
  }

  async regeneratePasses() {
    if (!this.computeInit
        || !this.computeDensity
        || !this.computeSmooth
        || !this.computeClassify
        || !this.computeEmit) {
      throw new Error('GPU marching-cubes resources are not initialized.');
    }

    await this.renderer.computeAsync(this.computeInit);
    await this.renderer.computeAsync(this.computeDensity);
    await this.renderer.computeAsync(this.computeSmooth);
    await this.renderer.computeAsync(this.computeClassify);
    await this.renderer.computeAsync(this.computeEmit);
  }

  requestRegeneration() {
    if (this.disposed || !this.computeInit) {
      return Promise.resolve();
    }

    this.regenerationRequested = true;
    if (this.regenerationPromise) {
      return this.regenerationPromise;
    }

    this.regenerationPromise = (async () => {
      this.rebuilding = true;
      while (this.regenerationRequested && !this.disposed) {
        this.regenerationRequested = false;
        this.uploadStamps();
        await this.regeneratePasses();
      }
    })().catch((error) => {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.statusCode = STATUS_FAILED;
      console.error('GPU marching-cubes regeneration failed.', error);
    }).finally(() => {
      this.rebuilding = false;
      this.regenerationPromise = null;
    });

    return this.regenerationPromise;
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

    const densityBuffer = new THREE.StorageBufferAttribute(layout.sampleCount, 1);
    const smoothedDensityBuffer = new THREE.StorageBufferAttribute(layout.sampleCount, 1);
    const densityWrite = storage(densityBuffer, 'float', layout.sampleCount);
    const densityRead = storage(densityBuffer, 'float', layout.sampleCount).toReadOnly();
    const smoothedDensityWrite = storage(
      smoothedDensityBuffer,
      'float',
      layout.sampleCount,
    );
    const smoothedDensityRead = storage(
      smoothedDensityBuffer,
      'float',
      layout.sampleCount,
    ).toReadOnly();

    const classificationBuffer = new THREE.StorageBufferAttribute(layout.cellCount, 2);
    const classificationWrite = storage(classificationBuffer, 'uvec2', layout.cellCount);
    const classificationRead = storage(classificationBuffer, 'uvec2', layout.cellCount).toReadOnly();

    const stampShapeBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(layout.maxStamps * 4),
      4,
    );
    const stampControlBuffer = new THREE.StorageBufferAttribute(
      new Float32Array(layout.maxStamps * 4),
      4,
    );
    const stampShapes = storage(stampShapeBuffer, 'vec4', layout.maxStamps).toReadOnly();
    const stampControls = storage(stampControlBuffer, 'vec4', layout.maxStamps).toReadOnly();
    const stampCountUniform = uniform(0, 'uint');

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

    const sampleBaseField = createBaseFieldFunction(layout);
    const sampleDensity = (samplePosition) => smoothedDensityRead.element(
      createSampleIndex(samplePosition, layout),
    );
    const sampleGradient = Fn(([samplePosition]) => normalize(vec3(
      sampleDensity(samplePosition.add(vec3(1, 0, 0)))
        .sub(sampleDensity(samplePosition.sub(vec3(1, 0, 0)))),
      sampleDensity(samplePosition.add(vec3(0, 1, 0)))
        .sub(sampleDensity(samplePosition.sub(vec3(0, 1, 0)))),
      sampleDensity(samplePosition.add(vec3(0, 0, 1)))
        .sub(sampleDensity(samplePosition.sub(vec3(0, 0, 1)))),
    )));

    const computeInit = Fn(() => {
      atomicStore(drawStorage.get('vertexCount'), uint(0));
      drawStorage.get('instanceCount').assign(uint(1));
      drawStorage.get('firstVertex').assign(uint(0));
      drawStorage.get('firstInstance').assign(uint(0));
      drawStorage.get('offset').assign(uint(0));
    })().compute(1).setName('Initialize marching-cubes indirect draw');

    const computeDensity = Fn(() => {
      const sampleIndex = uint(instanceIndex).toVar('densitySampleIndex');
      const samplePosition = createGridPosition(
        sampleIndex,
        layout.sampleCountX,
        layout.sampleCountZ,
      ).toVar('densitySamplePosition');
      const field = sampleBaseField(samplePosition).toVar('editedDensity');

      for (let stampIndex = 0; stampIndex < layout.maxStamps; stampIndex += 1) {
        If(uint(stampIndex).lessThan(stampCountUniform), () => {
          const shape = stampShapes.element(stampIndex);
          const control = stampControls.element(stampIndex);
          const sphereDistance = distance(samplePosition, shape.xyz).sub(shape.w);
          const smoothing = max(control.z, VOXEL_INTERPOLATION_EPSILON);

          If(control.x.lessThan(0.5), () => {
            const combined = createSmoothMinimum(field, sphereDistance, smoothing);
            field.assign(mix(field, combined, control.y));
          }).ElseIf(control.x.lessThan(1.5), () => {
            const carved = createSmoothMaximum(field, sphereDistance.negate(), smoothing);
            field.assign(mix(field, carved, control.y));
          });
        });
      }

      densityWrite.element(sampleIndex).assign(field);
    })().compute(layout.sampleCount, [VOXEL_WORKGROUP_SIZE]).setName('Apply voxel SDF stamps');

    const computeSmooth = Fn(() => {
      const sampleIndex = uint(instanceIndex).toVar('smoothSampleIndex');
      const samplePosition = createGridPosition(
        sampleIndex,
        layout.sampleCountX,
        layout.sampleCountZ,
      ).toVar('smoothSamplePosition');
      const centerDensity = densityRead.element(sampleIndex);
      const neighborAverage = densityRead.element(createSampleIndex(samplePosition.add(vec3(1, 0, 0)), layout))
        .add(densityRead.element(createSampleIndex(samplePosition.sub(vec3(1, 0, 0)), layout)))
        .add(densityRead.element(createSampleIndex(samplePosition.add(vec3(0, 1, 0)), layout)))
        .add(densityRead.element(createSampleIndex(samplePosition.sub(vec3(0, 1, 0)), layout)))
        .add(densityRead.element(createSampleIndex(samplePosition.add(vec3(0, 0, 1)), layout)))
        .add(densityRead.element(createSampleIndex(samplePosition.sub(vec3(0, 0, 1)), layout)))
        .div(6);
      const smoothWeight = float(0).toVar('smoothStampWeight');

      for (let stampIndex = 0; stampIndex < layout.maxStamps; stampIndex += 1) {
        If(uint(stampIndex).lessThan(stampCountUniform), () => {
          const shape = stampShapes.element(stampIndex);
          const control = stampControls.element(stampIndex);
          If(control.x.greaterThan(1.5), () => {
            const radialWeight = clamp(
              float(1).sub(distance(samplePosition, shape.xyz).div(shape.w)),
              0,
              1,
            ).mul(control.y);
            smoothWeight.assign(max(smoothWeight, radialWeight));
          });
        });
      }

      smoothedDensityWrite.element(sampleIndex).assign(mix(
        centerDensity,
        neighborAverage,
        clamp(smoothWeight, 0, 1),
      ));
    })().compute(layout.sampleCount, [VOXEL_WORKGROUP_SIZE]).setName('Smooth voxel SDF stamps');

    const computeClassify = Fn(() => {
      const linearIndex = uint(instanceIndex).toVar('cellLinearIndex');
      const cellOrigin = createGridPosition(
        linearIndex,
        layout.cellsX,
        layout.cellsZ,
      ).toVar('cellOrigin');
      const caseIndex = uint(0).toVar('caseIndex');

      for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
        const cornerPosition = cellOrigin.add(cornerOffsets.element(cornerIndex).xyz);
        If(sampleDensity(cornerPosition).lessThan(0), () => {
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
      const cellOrigin = createGridPosition(
        linearIndex,
        layout.cellsX,
        layout.cellsZ,
      ).toVar('emitCellOrigin');

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
              const fieldA = sampleDensity(pointA);
              const fieldB = sampleDensity(pointB);
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
              const normal = normalize(mix(
                sampleGradient(pointA),
                sampleGradient(pointB),
                interpolation,
              ));

              positionWrite.element(outputIndex).assign(vec4(localPosition, 1));
              normalWrite.element(outputIndex).assign(vec4(normal, 0));
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
    this.densityBuffer = densityBuffer;
    this.smoothedDensityBuffer = smoothedDensityBuffer;
    this.classificationBuffer = classificationBuffer;
    this.positionBuffer = positionBuffer;
    this.normalBuffer = normalBuffer;
    this.drawBuffer = drawBuffer;
    this.stampShapeBuffer = stampShapeBuffer;
    this.stampControlBuffer = stampControlBuffer;
    this.stampCountUniform = stampCountUniform;
    this.lookupAttributes = [
      cornerOffsetAttribute,
      edgeCornerAttribute,
      triangleCountAttribute,
      triangleEdgeAttribute,
    ];
    this.computeInit = computeInit;
    this.computeDensity = computeDensity;
    this.computeSmooth = computeSmooth;
    this.computeClassify = computeClassify;
    this.computeEmit = computeEmit;
  }

  uploadStamps() {
    if (!this.stampShapeBuffer || !this.stampControlBuffer || !this.stampCountUniform) {
      return;
    }

    const shapes = this.stampShapeBuffer.array;
    const controls = this.stampControlBuffer.array;
    shapes.fill(0);
    controls.fill(0);

    const stamps = this.stampStore?.list() ?? [];
    for (let index = 0; index < stamps.length; index += 1) {
      const stamp = stamps[index];
      const offset = index * 4;
      shapes[offset] = stamp.center[0];
      shapes[offset + 1] = stamp.center[1];
      shapes[offset + 2] = stamp.center[2];
      shapes[offset + 3] = stamp.radius;
      controls[offset] = VOXEL_STAMP_OPERATION_CODES[stamp.operation];
      controls[offset + 1] = stamp.strength;
      controls[offset + 2] = stamp.smoothness;
    }

    this.stampShapeBuffer.needsUpdate = true;
    this.stampControlBuffer.needsUpdate = true;
    this.stampCountUniform.value = stamps.length;
  }

  mapCellToVoxel(cellX, cellZ) {
    const world = this.terrainView.cellToWorld(cellX, cellZ);
    const origin = this.terrainView.cellToWorld(this.layout.originX, this.layout.originZ);
    const x = (world.x - origin.x) / this.layout.voxelSize + this.layout.cellsX * 0.5;
    const z = (world.z - origin.z) / this.layout.voxelSize + this.layout.cellsZ * 0.5;
    if (x < 0 || z < 0 || x > this.layout.cellsX || z > this.layout.cellsZ) {
      return null;
    }
    return Object.freeze({ x, z });
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
    this.densityBuffer?.dispose?.();
    this.smoothedDensityBuffer?.dispose?.();
    this.classificationBuffer?.dispose?.();
    this.positionBuffer?.dispose?.();
    this.normalBuffer?.dispose?.();
    this.drawBuffer?.dispose?.();
    this.stampShapeBuffer?.dispose?.();
    this.stampControlBuffer?.dispose?.();
    for (const lookupAttribute of this.lookupAttributes ?? []) {
      lookupAttribute.dispose?.();
    }
    this.group = null;
    this.mesh = null;
    this.bounds = null;
    this.geometry = null;
    this.material = null;
    this.densityBuffer = null;
    this.smoothedDensityBuffer = null;
    this.classificationBuffer = null;
    this.positionBuffer = null;
    this.normalBuffer = null;
    this.drawBuffer = null;
    this.stampShapeBuffer = null;
    this.stampControlBuffer = null;
    this.stampCountUniform = null;
    this.lookupAttributes = null;
    this.computeInit = null;
    this.computeDensity = null;
    this.computeSmooth = null;
    this.computeClassify = null;
    this.computeEmit = null;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribeStamps?.();
    this.unsubscribeStamps = null;
    this.disposeGpuResources();
  }
}
