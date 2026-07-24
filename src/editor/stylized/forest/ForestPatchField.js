import { hash32 } from '../scatterMath.js';

const TAU = Math.PI * 2;
const DEFAULT_SUPERCELL_SIZE = 384;
const HASH_X = 73856093;
const HASH_Z = 19349663;
const HASH_CHANNEL = 83492791;
const MAX_PATCH_CENTER_OFFSET = 0.85;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum, maximum, value) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function hashCoordinate(cellX, cellZ, seed, channel) {
  const value = Math.imul(cellX, HASH_X)
    ^ Math.imul(cellZ, HASH_Z)
    ^ Math.imul(channel + 1, HASH_CHANNEL)
    ^ seed;
  return hash32(value) / 0xffffffff;
}

function interpolate(left, right, amount) {
  return left + (right - left) * amount;
}

function valueNoise(x, z, seed, channel) {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = x - cellX;
  const localZ = z - cellZ;
  const smoothX = localX * localX * (3 - 2 * localX);
  const smoothZ = localZ * localZ * (3 - 2 * localZ);
  const bottom = interpolate(
    hashCoordinate(cellX, cellZ, seed, channel),
    hashCoordinate(cellX + 1, cellZ, seed, channel),
    smoothX,
  );
  const top = interpolate(
    hashCoordinate(cellX, cellZ + 1, seed, channel),
    hashCoordinate(cellX + 1, cellZ + 1, seed, channel),
    smoothX,
  );
  return interpolate(bottom, top, smoothZ);
}

function patchId(cellX, cellZ, seed, supercellSize, profile) {
  const suffix = hash32(
    Math.imul(cellX, HASH_X) ^ Math.imul(cellZ, HASH_Z) ^ seed,
  ).toString(16).padStart(8, '0');
  return `${profile.tileId}:${supercellSize}:${cellX}:${cellZ}:${suffix}`;
}

function patchSearchRadius(profile) {
  const boundaryScale = 1 + profile.boundaryWarp * 0.5;
  const maximumAxis = profile.patchRadiusMax
    * Math.max(1, profile.patchAspectMax)
    * boundaryScale;
  return Math.max(2, Math.floor(maximumAxis + MAX_PATCH_CENTER_OFFSET));
}

function evaluatePatch({ x, z, cellX, cellZ, seed, supercellSize, profile }) {
  const centerX = (cellX + 0.15 + hashCoordinate(cellX, cellZ, seed, 0) * 0.7)
    * supercellSize;
  const centerZ = (cellZ + 0.15 + hashCoordinate(cellX, cellZ, seed, 1) * 0.7)
    * supercellSize;
  const radiusRatio = interpolate(
    profile.patchRadiusMin,
    profile.patchRadiusMax,
    hashCoordinate(cellX, cellZ, seed, 2),
  );
  const aspect = interpolate(
    profile.patchAspectMin,
    profile.patchAspectMax,
    hashCoordinate(cellX, cellZ, seed, 3),
  );
  const angle = hashCoordinate(cellX, cellZ, seed, 4) * TAU;
  const radius = Math.max(1, radiusRatio * supercellSize);
  const deltaX = x - centerX;
  const deltaZ = z - centerZ;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotatedX = deltaX * cosine - deltaZ * sine;
  const rotatedZ = deltaX * sine + deltaZ * cosine;
  const ellipseDistance = Math.hypot(
    rotatedX / radius,
    rotatedZ / Math.max(1, radius * aspect),
  );
  const boundaryNoise = valueNoise(
    x / supercellSize * 3.1,
    z / supercellSize * 3.1,
    seed,
    11,
  ) - 0.5;

  return {
    cellX,
    cellZ,
    distance: ellipseDistance + boundaryNoise * profile.boundaryWarp,
  };
}

export class ForestPatchField {
  constructor({ seed = 0, supercellSize = DEFAULT_SUPERCELL_SIZE } = {}) {
    this.seed = Number.isInteger(seed) ? seed : Math.trunc(seed) || 0;
    this.supercellSize = Math.max(32, Number(supercellSize) || DEFAULT_SUPERCELL_SIZE);
    this.signature = `${this.seed}:${this.supercellSize}`;
  }

  sample(x, z, profile) {
    if (!profile || profile.density <= 0) {
      return Object.freeze({
        patchId: null,
        patchCoverage: 0,
        patchEdge: 0,
        patchDistance: Number.POSITIVE_INFINITY,
      });
    }

    const warpScale = this.supercellSize * 0.22;
    const warpedX = x + (valueNoise(
      x / this.supercellSize,
      z / this.supercellSize,
      this.seed,
      17,
    ) - 0.5) * warpScale;
    const warpedZ = z + (valueNoise(
      x / this.supercellSize,
      z / this.supercellSize,
      this.seed,
      19,
    ) - 0.5) * warpScale;
    const baseCellX = Math.floor(warpedX / this.supercellSize);
    const baseCellZ = Math.floor(warpedZ / this.supercellSize);
    const searchRadius = patchSearchRadius(profile);
    let best = null;

    for (let offsetZ = -searchRadius; offsetZ <= searchRadius; offsetZ += 1) {
      for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX += 1) {
        const candidate = evaluatePatch({
          x: warpedX,
          z: warpedZ,
          cellX: baseCellX + offsetX,
          cellZ: baseCellZ + offsetZ,
          seed: this.seed,
          supercellSize: this.supercellSize,
          profile,
        });
        if (!best || candidate.distance < best.distance) best = candidate;
      }
    }

    const edgeWidth = profile.patchEdgeWidth;
    const coverage = 1 - smoothstep(1 - edgeWidth, 1 + edgeWidth, best.distance);
    const edge = 1 - Math.min(1, Math.abs(best.distance - 1) / edgeWidth);

    return Object.freeze({
      patchId: patchId(
        best.cellX,
        best.cellZ,
        this.seed,
        this.supercellSize,
        profile,
      ),
      patchCoverage: clamp01(coverage),
      patchEdge: clamp01(edge),
      patchDistance: best.distance,
    });
  }
}

export const FOREST_PATCH_DEFAULT_SUPERCELL_SIZE = DEFAULT_SUPERCELL_SIZE;
