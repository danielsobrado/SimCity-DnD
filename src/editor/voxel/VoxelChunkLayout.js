import {
  VOXEL_MAX_AXIS_CELLS,
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

  const maxInstances = cellsX * cellsY * cellsZ;
  if (maxInstances > VOXEL_MAX_TOTAL_CELLS) {
    throw new Error(`Voxel prototype cell count exceeds ${VOXEL_MAX_TOTAL_CELLS}.`);
  }

  if (!mapConfig
      || !Number.isInteger(mapConfig.width)
      || !Number.isInteger(mapConfig.height)) {
    throw new Error('Voxel prototype requires valid map dimensions.');
  }
  if (originX < 0 || originZ < 0 || originX >= mapConfig.width || originZ >= mapConfig.height) {
    throw new Error('Voxel prototype originCell must be inside the map.');
  }

  return Object.freeze({
    enabled: config.enabled,
    visible: config.visible,
    cellsX,
    cellsY,
    cellsZ,
    originX,
    originZ,
    voxelSize: config.voxelSize,
    verticalOffset: config.verticalOffset,
    baseHeight: config.baseHeight,
    surfaceAmplitude: config.surfaceAmplitude,
    surfaceFrequency: config.surfaceFrequency,
    seed: config.seed,
    maxInstances,
    worldWidth: cellsX * config.voxelSize,
    worldHeight: cellsY * config.voxelSize,
    worldDepth: cellsZ * config.voxelSize,
  });
}
