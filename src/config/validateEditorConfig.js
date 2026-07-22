const REQUIRED_POSITIVE_PATHS = Object.freeze([
  Object.freeze(['map', 'width']),
  Object.freeze(['map', 'height']),
  Object.freeze(['map', 'tileSize']),
  Object.freeze(['map', 'chunkSize']),
  Object.freeze(['world', 'chunkSize']),
  Object.freeze(['world', 'prefetchSeconds']),
  Object.freeze(['world', 'maxResidentChunks']),
  Object.freeze(['world', 'maxCpuChunks']),
  Object.freeze(['world', 'floatingOriginThreshold']),
  Object.freeze(['world', 'minimapCells']),
  Object.freeze(['world', 'heightScale']),
  Object.freeze(['camera', 'viewSize']),
  Object.freeze(['player', 'fovDegrees']),
  Object.freeze(['player', 'walkSpeed']),
  Object.freeze(['player', 'runMultiplier']),
  Object.freeze(['player', 'jumpSpeed']),
  Object.freeze(['player', 'gravity']),
  Object.freeze(['player', 'eyeHeight']),
  Object.freeze(['player', 'stepHeight']),
  Object.freeze(['player', 'groundSnapDistance']),
  Object.freeze(['player', 'mouseSensitivity']),
  Object.freeze(['renderer', 'maxPixelRatio']),
  Object.freeze(['terrain', 'sculptStrength']),
]);

const REQUIRED_BOOLEAN_PATHS = Object.freeze([
  Object.freeze(['renderer', 'antialias']),
  Object.freeze(['renderer', 'forceWebGL']),
]);

function readPath(value, path) {
  return path.reduce((current, segment) => current?.[segment], value);
}

function assertPositiveNumber(config, path) {
  const value = readPath(config, path);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid editor configuration: ${path.join('.')} must be positive.`);
  }
}

function assertBoolean(config, path) {
  if (typeof readPath(config, path) !== 'boolean') {
    throw new Error(`Invalid editor configuration: ${path.join('.')} must be boolean.`);
  }
}

function assertNonNegativeInteger(config, path) {
  const value = readPath(config, path);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid editor configuration: ${path.join('.')} must be a non-negative integer.`);
  }
}

export function validateEditorConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Invalid editor configuration: expected a YAML object.');
  }

  for (const path of REQUIRED_POSITIVE_PATHS) {
    assertPositiveNumber(config, path);
  }
  for (const path of REQUIRED_BOOLEAN_PATHS) {
    assertBoolean(config, path);
  }
  assertNonNegativeInteger(config, ['world', 'loadRadius']);
  assertNonNegativeInteger(config, ['world', 'unloadRadius']);

  if (!Number.isSafeInteger(config.world.seed)) {
    throw new Error('Invalid editor configuration: world.seed must be a safe integer.');
  }
  if (!Number.isInteger(config.world.generatorVersion) || config.world.generatorVersion < 1) {
    throw new Error('Invalid editor configuration: world.generatorVersion must be a positive integer.');
  }
  if (!Number.isInteger(config.world.chunkSize)
      || !Number.isInteger(config.world.maxResidentChunks)
      || !Number.isInteger(config.world.maxCpuChunks)
      || !Number.isInteger(config.world.minimapCells)) {
    throw new Error('Invalid editor configuration: world chunk and cache sizes must be integers.');
  }
  if (config.world.loadRadius > config.world.unloadRadius) {
    throw new Error('Invalid editor configuration: world.unloadRadius must cover world.loadRadius.');
  }
  const minimumResidentChunks = (config.world.unloadRadius * 2 + 1) ** 2;
  if (config.world.maxResidentChunks < minimumResidentChunks) {
    throw new Error(`Invalid editor configuration: world.maxResidentChunks must be at least ${minimumResidentChunks} for the unload window.`);
  }
  if (config.world.maxCpuChunks < config.world.maxResidentChunks) {
    throw new Error('Invalid editor configuration: world.maxCpuChunks must cover resident GPU chunks.');
  }
  if (!Number.isFinite(config.world.seaLevel)) {
    throw new Error('Invalid editor configuration: world.seaLevel must be finite.');
  }

  if (config.player.fovDegrees >= 180) {
    throw new Error('Invalid editor configuration: player.fovDegrees must be below 180.');
  }
  if (!Number.isFinite(config.player.maxPitchDegrees)
      || config.player.maxPitchDegrees <= 0
      || config.player.maxPitchDegrees >= 90) {
    throw new Error('Invalid editor configuration: player.maxPitchDegrees must be within (0, 90).');
  }

  if (!Number.isFinite(config.terrain?.minHeight) || !Number.isFinite(config.terrain?.maxHeight)) {
    throw new Error('Invalid editor configuration: terrain height limits must be finite.');
  }
  if (config.terrain.maxHeight <= config.terrain.minHeight) {
    throw new Error('Invalid editor configuration: terrain.maxHeight must exceed terrain.minHeight.');
  }
  if (!Number.isFinite(config.terrain.smoothFactor)
      || config.terrain.smoothFactor <= 0
      || config.terrain.smoothFactor > 1) {
    throw new Error('Invalid editor configuration: terrain.smoothFactor must be within (0, 1].');
  }

  if (!Array.isArray(config.brush?.sizes) || config.brush.sizes.length === 0) {
    throw new Error('Invalid editor configuration: brush.sizes must not be empty.');
  }
  if (config.brush.sizes.some((size) => !Number.isInteger(size) || size <= 0)) {
    throw new Error('Invalid editor configuration: brush.sizes must contain positive integers.');
  }
  if (!config.brush.sizes.includes(config.brush.defaultSize)) {
    throw new Error('Invalid editor configuration: brush.defaultSize must be listed in brush.sizes.');
  }

  return config;
}
