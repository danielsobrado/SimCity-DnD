import { decodeMacroAtlas } from '../import/AzgaarMacroWorldSource.js';

const WATER_TILE_ID = 2;
const PLAINS_TILE_ID = 0;
const FOREST_TILE_ID = 1;
const STONE_TILE_ID = 5;
const DESERT_TILE_ID = 6;
const SWAMP_TILE_ID = 7;
const SNOW_TILE_ID = 8;
const LAND_HEIGHT = 20;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2d(x, z, seed) {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ (seed | 0);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);
  const north = lerp(hash2d(x0, z0, seed), hash2d(x0 + 1, z0, seed), tx);
  const south = lerp(hash2d(x0, z0 + 1, seed), hash2d(x0 + 1, z0 + 1, seed), tx);
  return lerp(north, south, tz) * 2 - 1;
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const amount = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (ax + dx * amount), py - (ay + dy * amount));
}

function tileForBiome(rawHeight, biome) {
  if (rawHeight < LAND_HEIGHT) return WATER_TILE_ID;
  if (rawHeight >= 78) return STONE_TILE_ID;
  if (biome === 2 || biome === 10 || biome === 11) return SNOW_TILE_ID;
  if (biome === 1) return DESERT_TILE_ID;
  if (biome === 12) return SWAMP_TILE_ID;
  if (biome >= 5 && biome <= 9) return FOREST_TILE_ID;
  return PLAINS_TILE_ID;
}

function convertHeight(rawHeight, terrain) {
  if (rawHeight < LAND_HEIGHT) {
    return terrain.minHeight * clamp((LAND_HEIGHT - rawHeight) / LAND_HEIGHT, 0, 1) * 0.35;
  }
  return clamp((rawHeight - LAND_HEIGHT) / (100 - LAND_HEIGHT), 0, 1)
    * terrain.maxHeight * 0.85;
}

function createRiverIndex(rivers, width, height) {
  const buckets = new Map();
  for (const river of rivers ?? []) {
    for (let index = 1; index < river.points.length; index += 1) {
      const [ax, ay] = river.points[index - 1];
      const [bx, by] = river.points[index];
      const segment = { ax, ay, bx, by, width: river.widthAtlas };
      const margin = Math.max(0.5, river.widthAtlas);
      const minX = clamp(Math.floor(Math.min(ax, bx) - margin), 0, width - 1);
      const maxX = clamp(Math.floor(Math.max(ax, bx) + margin), 0, width - 1);
      const minY = clamp(Math.floor(Math.min(ay, by) - margin), 0, height - 1);
      const maxY = clamp(Math.floor(Math.max(ay, by) + margin), 0, height - 1);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = `${x}:${y}`;
          const entries = buckets.get(key) ?? [];
          entries.push(segment);
          buckets.set(key, entries);
        }
      }
    }
  }
  return buckets;
}

export class AzgaarMacroWorldGenerator {
  constructor(source, proceduralMetadata) {
    const decoded = decodeMacroAtlas(source);
    this.source = structuredClone(source);
    this.heights = decoded.heights;
    this.biomes = decoded.biomes;
    this.features = decoded.features;
    this.seed = proceduralMetadata.seed;
    this.version = proceduralMetadata.version;
    this.heightScale = proceduralMetadata.heightScale;
    this.seaLevel = proceduralMetadata.seaLevel;
    this.riverIndex = createRiverIndex(
      source.rivers,
      source.atlas.width,
      source.atlas.height,
    );
  }

  toMetadata() {
    return Object.freeze({
      seed: this.seed,
      version: this.version,
      heightScale: this.heightScale,
      seaLevel: this.seaLevel,
    });
  }

  toBaseTerrain() {
    return structuredClone(this.source);
  }

  toAtlasPosition(cellX, cellZ) {
    const { bounds, atlas } = this.source;
    return {
      x: (cellX - bounds.minCellX) / bounds.widthCells * atlas.width,
      y: (cellZ - bounds.minCellZ) / bounds.heightCells * atlas.height,
    };
  }

  isInside(cellX, cellZ) {
    const { bounds } = this.source;
    return cellX >= bounds.minCellX
      && cellZ >= bounds.minCellZ
      && cellX < bounds.minCellX + bounds.widthCells
      && cellZ < bounds.minCellZ + bounds.heightCells;
  }

  atlasIndex(x, y) {
    const { width, height } = this.source.atlas;
    const clampedX = clamp(x, 0, width - 1);
    const clampedY = clamp(y, 0, height - 1);
    return clampedY * width + clampedX;
  }

  sampleRawHeight(cellX, cellZ) {
    const { width, height } = this.source.atlas;
    const position = this.toAtlasPosition(cellX, cellZ);
    const fx = clamp(position.x - 0.5, 0, width - 1);
    const fy = clamp(position.y - 0.5, 0, height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const north = lerp(
      this.heights[this.atlasIndex(x0, y0)],
      this.heights[this.atlasIndex(x1, y0)],
      fx - x0,
    );
    const south = lerp(
      this.heights[this.atlasIndex(x0, y1)],
      this.heights[this.atlasIndex(x1, y1)],
      fx - x0,
    );
    return lerp(north, south, fy - y0);
  }

  outsideDistance(cellX, cellZ) {
    const { bounds } = this.source;
    const maxX = bounds.minCellX + bounds.widthCells;
    const maxZ = bounds.minCellZ + bounds.heightCells;
    return Math.hypot(
      Math.max(bounds.minCellX - cellX, 0, cellX - maxX),
      Math.max(bounds.minCellZ - cellZ, 0, cellZ - maxZ),
    );
  }

  sampleHeight(vertexX, vertexZ) {
    const rawHeight = this.sampleRawHeight(vertexX, vertexZ);
    const base = convertHeight(rawHeight, this.source.terrain);
    if (!this.isInside(vertexX, vertexZ)) {
      const amount = smoothstep(
        this.outsideDistance(vertexX, vertexZ) / this.source.oceanTransitionCells,
      );
      return lerp(base, this.source.terrain.minHeight * 0.35, amount);
    }
    if (rawHeight < LAND_HEIGHT) return base;
    const coastFade = clamp((rawHeight - LAND_HEIGHT) / 10, 0, 1);
    const detail = (
      valueNoise(vertexX / 96, vertexZ / 96, this.seed + 1709) * 1.4
      + valueNoise(vertexX / 24, vertexZ / 24, this.seed + 1877) * 0.35
    );
    return base + detail * coastFade;
  }

  isRiver(cellX, cellZ) {
    const position = this.toAtlasPosition(cellX + 0.5, cellZ + 0.5);
    const key = `${Math.floor(position.x)}:${Math.floor(position.y)}`;
    const segments = this.riverIndex.get(key);
    if (!segments) return false;
    return segments.some((segment) => pointSegmentDistance(
      position.x,
      position.y,
      segment.ax,
      segment.ay,
      segment.bx,
      segment.by,
    ) <= segment.width * 0.5);
  }

  sampleTile(cellX, cellZ) {
    if (!this.isInside(cellX + 0.5, cellZ + 0.5)) return WATER_TILE_ID;
    const position = this.toAtlasPosition(cellX + 0.5, cellZ + 0.5);
    const index = this.atlasIndex(Math.floor(position.x), Math.floor(position.y));
    const rawHeight = this.heights[index];
    if (rawHeight >= LAND_HEIGHT && this.isRiver(cellX, cellZ)) return WATER_TILE_ID;
    return tileForBiome(rawHeight, this.biomes[index]);
  }
}

