const EPSILON = 1e-4;
const RADIANS_TO_DEGREES = 180 / Math.PI;

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return Object.freeze({ x: x / length, y: y / length, z: z / length });
}

function sampleNormal(heightField, centerX, centerZ, tileSize) {
  const halfStep = 0.5;
  const west = heightField.sample(centerX - halfStep, centerZ);
  const east = heightField.sample(centerX + halfStep, centerZ);
  const north = heightField.sample(centerX, centerZ - halfStep);
  const south = heightField.sample(centerX, centerZ + halfStep);
  const slopeX = (east - west) / tileSize;
  const slopeZ = (south - north) / tileSize;

  return normalize(-slopeX, 1, slopeZ);
}

export function analyzeTerrainSurface({ heightField, bounds, tileSize }) {
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  let totalHeight = 0;
  let sampleCount = 0;
  let maximumRise = 0;

  for (let z = bounds.minZ; z <= bounds.maxZ + 1; z += 1) {
    for (let x = bounds.minX; x <= bounds.maxX + 1; x += 1) {
      const height = heightField.getVertex(x, z);
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
      totalHeight += height;
      sampleCount += 1;

      if (x <= bounds.maxX) {
        maximumRise = Math.max(maximumRise, Math.abs(heightField.getVertex(x + 1, z) - height));
      }
      if (z <= bounds.maxZ) {
        maximumRise = Math.max(maximumRise, Math.abs(heightField.getVertex(x, z + 1) - height));
      }
    }
  }

  const centerX = (bounds.minX + bounds.maxX + 1) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ + 1) / 2;
  const centerHeight = heightField.sample(centerX, centerZ);
  const maximumSlopeDegrees = Math.atan(maximumRise / tileSize) * RADIANS_TO_DEGREES;

  return Object.freeze({
    minimumHeight,
    maximumHeight,
    averageHeight: totalHeight / sampleCount,
    centerHeight,
    heightRange: maximumHeight - minimumHeight,
    maximumSlopeDegrees,
    normal: sampleNormal(heightField, centerX, centerZ, tileSize),
  });
}

export function evaluateObjectSurface({ definition, heightField, bounds, tileSize }) {
  const analyzed = analyzeTerrainSurface({ heightField, bounds, tileSize });
  const foundation = definition.foundation;
  const baseHeight = foundation.mode === 'terrace'
    ? analyzed.maximumHeight
    : analyzed.centerHeight;
  const foundationDepth = foundation.mode === 'terrace'
    ? Math.max(0, baseHeight - analyzed.minimumHeight)
    : 0;
  const surface = Object.freeze({
    ...analyzed,
    baseHeight,
    foundationDepth,
  });

  if (analyzed.maximumSlopeDegrees > foundation.maxSlopeDegrees + EPSILON) {
    return Object.freeze({
      valid: false,
      reason: `Terrain slope ${analyzed.maximumSlopeDegrees.toFixed(1)}° exceeds the ${foundation.maxSlopeDegrees}° limit.`,
      surface,
    });
  }

  if (foundation.mode === 'terrace' && foundationDepth > foundation.maxDepth + EPSILON) {
    return Object.freeze({
      valid: false,
      reason: `Foundation depth ${foundationDepth.toFixed(1)} exceeds the ${foundation.maxDepth} limit.`,
      surface,
    });
  }

  return Object.freeze({ valid: true, reason: null, surface });
}
