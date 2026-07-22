import { MC_MAX_TRIANGLES_PER_CELL } from './MarchingCubesTables.js';
import {
  VOXEL_MAX_AXIS_CELLS,
  VOXEL_MAX_OUTPUT_VERTICES,
  VOXEL_MAX_STAMPS,
  VOXEL_MAX_TOTAL_CELLS,
} from './voxelConstants.js';

function assertBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`Voxel prototype ${fieldName} must be boolean.`);
  }
}

function assertFinite(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new Error(`Voxel prototype ${fieldName} must be finite.`);
  }
}

function assertPositive(value, fieldName) {
  assertFinite(value, fieldName);
  if (value <= 0) {
    throw new Error(`Voxel prototype ${fieldName} must be positive.`);
  }
}

function assertUnitInterval(value, fieldName) {
  assertFinite(value, fieldName);
  if (value < 0 || value > 1) {
    throw new Error(`Voxel prototype ${fieldName} must be within [0, 1].`);
  }
}

function assertIntegerTuple(value, length, fieldName) {
  if (!Array.isArray(value)
      || value.length !== length
      || value.some((entry) => !Number.isInteger(entry))) {
    throw new Error(`Voxel prototype ${fieldName} must contain ${length} integers.`);
  }
}

export function createVoxelChunkLayout(config, mapConfig) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Voxel prototype configuration must be an object.');
  }

  assertBoolean(config.enabled, 'enabled');
  assertBoolean(config.visible, 'visible');
  assertIntegerTuple(config.cells, 3, 'cells');
  assertIntegerTuple(config.originCell, 2, 'originCell');
  assertPositive(config.voxelSize, 'voxelSize');
  assertFinite(config.verticalOffset, 'verticalOffset');
  assertPositive(config.baseHeight, 'baseHeight');
  assertPositive(config.surfaceAmplitude, 'surfaceAmplitude');
  assertPositive(config.surfaceFrequency, 'surfaceFrequency');
  assertPositive(config.defaultRadius, 'defaultRadius');
  assertUnitInterval(config.defaultStrength, 'defaultStrength');
  assertPositive(config.defaultSmoothness, 'defaultSmoothness');
  if (!Number.isInteger(config.maxStamps)
      || config.maxStamps < 1
      || config.maxStamps > VOXEL_MAX_STAMPS) {
    throw new Error(`Voxel prototype maxStamps must be within 1–${VOXEL_MAX_STAMPS}.`);
  }
  if (!Number.isInteger(config.seed)) {
    throw new Error('Voxel prototype seed must be an integer.');
  }

  const [cellsX, cellsY, cellsZ] = config.cells;
  const [originX, originZ] = config.originCell;
  for (const [axis, value] of [['x', cellsX], ['y', cellsY], ['z', cellsZ]]) {
    if (value < 1 || value > VOXEL_MAX_AXIS_CELLS) {
      throw new Error(`Voxel prototype ${axis} cells must be within 1–${VOXEL_MAX_AXIS_CELLS}.`);
    }
  }

  const cellCount = cellsX * cellsY * cellsZ;
  if (cellCount > VOXEL_MAX_TOTAL_CELLS) {
    throw new Error(`Voxel prototype cell count exceeds ${VOXEL_MAX_TOTAL_CELLS}.`);
  }

  const maxTriangles = cellCount * MC_MAX_TRIANGLES_PER_CELL;
  const maxVertices = maxTriangles * 3;
  if (maxVertices > VOXEL_MAX_OUTPUT_VERTICES) {
    throw new Error(`Voxel prototype marching-cubes output exceeds ${VOXEL_MAX_OUTPUT_VERTICES} vertices.`);
  }

  if (!mapConfig
      || !Number.isInteger(mapConfig.width)
      || !Number.isInteger(mapConfig.height)
      || !Number.isFinite(mapConfig.tileSize)
      || mapConfig.tileSize <= 0) {
    throw new Error('Voxel prototype requires valid map dimensions and tile size.');
  }
  if (originX < 0 || originZ < 0 || originX >= mapConfig.width || originZ >= mapConfig.height) {
    throw new Error('Voxel prototype originCell must be inside the map.');
  }

  const sampleCountX = cellsX + 1;
  const sampleCountY = cellsY + 1;
  const sampleCountZ = cellsZ + 1;

  return Object.freeze({
    enabled: config.enabled,
    visible: config.visible,
    cellsX,
    cellsY,
    cellsZ,
    originX,
    originZ,
    tileSize: mapConfig.tileSize,
    voxelSize: config.voxelSize,
    verticalOffset: config.verticalOffset,
    baseHeight: config.baseHeight,
    surfaceAmplitude: config.surfaceAmplitude,
    surfaceFrequency: config.surfaceFrequency,
    seed: config.seed,
    maxStamps: config.maxStamps,
    defaultRadius: config.defaultRadius,
    defaultStrength: config.defaultStrength,
    defaultSmoothness: config.defaultSmoothness,
    cellCount,
    sampleCountX,
    sampleCountY,
    sampleCountZ,
    samplePlaneSize: sampleCountX * sampleCountZ,
    sampleCount: sampleCountX * sampleCountY * sampleCountZ,
    maxTriangles,
    maxVertices,
    maxInstances: maxTriangles,
    worldWidth: cellsX * config.voxelSize,
    worldHeight: cellsY * config.voxelSize,
    worldDepth: cellsZ * config.voxelSize,
  });
}
