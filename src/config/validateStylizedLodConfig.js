function assertBoolean(value, path) {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid editor configuration: ${path} must be boolean.`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid editor configuration: ${path} must be a non-negative integer.`);
  }
}

function assertPositive(value, path) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid editor configuration: ${path} must be positive.`);
  }
}

function assertUnitInterval(value, path, allowZero = true) {
  const minimum = allowZero ? 0 : Number.EPSILON;
  if (!Number.isFinite(value) || value < minimum || value > 1) {
    throw new Error(`Invalid editor configuration: ${path} must be within ${allowZero ? '[0, 1]' : '(0, 1]'}.`);
  }
}

function validateLodBand(name, band, { hasBillboard }) {
  if (!band || typeof band !== 'object') {
    throw new Error(`Invalid editor configuration: stylizedSurface.lod.${name} is required.`);
  }
  assertNonNegativeInteger(band.meshRadius, `stylizedSurface.lod.${name}.meshRadius`);
  assertNonNegativeInteger(band.proxyRadius, `stylizedSurface.lod.${name}.proxyRadius`);
  if (band.proxyRadius < band.meshRadius) {
    throw new Error(`Invalid editor configuration: stylizedSurface.lod.${name}.proxyRadius must cover meshRadius.`);
  }
  if (hasBillboard) {
    assertNonNegativeInteger(band.billboardRadius, `stylizedSurface.lod.${name}.billboardRadius`);
    if (band.billboardRadius < band.proxyRadius) {
      throw new Error(`Invalid editor configuration: stylizedSurface.lod.${name}.billboardRadius must cover proxyRadius.`);
    }
  }
  assertPositive(band.nearPixels, `stylizedSurface.lod.${name}.nearPixels`);
  assertPositive(band.proxyPixels, `stylizedSurface.lod.${name}.proxyPixels`);
  assertPositive(band.billboardPixels, `stylizedSurface.lod.${name}.billboardPixels`);
  if (!(band.nearPixels > band.proxyPixels && band.proxyPixels > band.billboardPixels)) {
    throw new Error(`Invalid editor configuration: stylizedSurface.lod.${name} pixel thresholds must descend near > proxy > billboard.`);
  }
  assertUnitInterval(band.hysteresisRatio, `stylizedSurface.lod.${name}.hysteresisRatio`);
}

export function validateStylizedLodConfig(config) {
  const surface = config.stylizedSurface;
  if (!surface?.enabled) return config;

  if (surface.grass.outerRingDensity !== undefined) {
    assertUnitInterval(surface.grass.outerRingDensity, 'stylizedSurface.grass.outerRingDensity', false);
  }
  if (surface.flowers.outerRingDensity !== undefined) {
    assertUnitInterval(surface.flowers.outerRingDensity, 'stylizedSurface.flowers.outerRingDensity', false);
  }
  if (surface.streaming?.grassCellsPerBuildSlice !== undefined) {
    assertNonNegativeInteger(
      surface.streaming.grassCellsPerBuildSlice,
      'stylizedSurface.streaming.grassCellsPerBuildSlice',
    );
    if (surface.streaming.grassCellsPerBuildSlice < 1) {
      throw new Error('Invalid editor configuration: stylizedSurface.streaming.grassCellsPerBuildSlice must be positive.');
    }
  }
  if (surface.streaming?.inactiveReleaseFrames !== undefined) {
    assertNonNegativeInteger(
      surface.streaming.inactiveReleaseFrames,
      'stylizedSurface.streaming.inactiveReleaseFrames',
    );
  }

  if (!surface.lod) return config;
  assertBoolean(surface.lod.enabled, 'stylizedSurface.lod.enabled');
  validateLodBand('tree', surface.lod.tree, { hasBillboard: true });
  validateLodBand('rock', surface.lod.rock, { hasBillboard: false });
  return config;
}
