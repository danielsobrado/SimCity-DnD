import { floorDiv, positiveModulo } from '../world/WorldCoordinates.js';
import { INFINITE_WORLD_FORMAT_VERSION } from '../world/worldConstants.js';

const AZGAAR_LAND_HEIGHT = 20;
const WATER_TILE_ID = 2;
const PLAINS_TILE_ID = 0;
const FOREST_TILE_ID = 1;
const STONE_TILE_ID = 5;
const DESERT_TILE_ID = 6;
const SWAMP_TILE_ID = 7;
const SNOW_TILE_ID = 8;

function assertAzgaarDocument(document) {
  const description = String(document?.info?.description ?? '').toLowerCase();
  if (!description.includes("azgaar's fantasy map generator")) {
    throw new Error('The selected JSON is not an Azgaar Full JSON export.');
  }
  if (!Array.isArray(document?.grid?.cells) || !Number.isInteger(document.grid.cellsX)
      || !Number.isInteger(document.grid.cellsY)) {
    throw new Error('Azgaar Full JSON must include grid cells and grid dimensions.');
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function readBiomeNames(biomesData) {
  if (Array.isArray(biomesData?.name)) {
    return biomesData.name;
  }
  if (Array.isArray(biomesData?.names)) {
    return biomesData.names;
  }
  return [];
}

function tileForBiome(height, biomeName) {
  if (height < AZGAAR_LAND_HEIGHT) {
    return WATER_TILE_ID;
  }
  const name = normalizeName(biomeName);
  if (height >= 78 || name.includes('mountain') || name.includes('rock')) {
    return STONE_TILE_ID;
  }
  if (name.includes('glacier') || name.includes('tundra') || name.includes('cold')) {
    return SNOW_TILE_ID;
  }
  if (name.includes('desert')) {
    return DESERT_TILE_ID;
  }
  if (name.includes('wetland') || name.includes('swamp') || name.includes('marsh')) {
    return SWAMP_TILE_ID;
  }
  if (name.includes('forest') || name.includes('rainforest') || name.includes('taiga')) {
    return FOREST_TILE_ID;
  }
  return PLAINS_TILE_ID;
}

function convertHeight(height, terrainConfig) {
  const numericHeight = Number.isFinite(height) ? height : 0;
  if (numericHeight < AZGAAR_LAND_HEIGHT) {
    return terrainConfig.minHeight * clamp(
      (AZGAAR_LAND_HEIGHT - numericHeight) / AZGAAR_LAND_HEIGHT,
      0,
      1,
    ) * 0.35;
  }
  return clamp(
    (numericHeight - AZGAAR_LAND_HEIGHT) / (100 - AZGAAR_LAND_HEIGHT),
    0,
    1,
  ) * terrainConfig.maxHeight * 0.85;
}

function buildGridCellLookup(grid) {
  const byId = new Map(grid.cells.map((cell) => [cell.i, cell]));
  const maximumId = grid.cells.reduce((maximum, cell) => Math.max(maximum, cell.i), 0);
  return { byId, maximumId };
}

function sourceCellAt(grid, lookup, normalizedX, normalizedZ) {
  const column = clamp(Math.floor(normalizedX * grid.cellsX), 0, grid.cellsX - 1);
  const row = clamp(Math.floor(normalizedZ * grid.cellsY), 0, grid.cellsY - 1);
  const approximateId = clamp(row * grid.cellsX + column, 0, lookup.maximumId);
  return lookup.byId.get(approximateId)
    ?? grid.cells[clamp(approximateId, 0, grid.cells.length - 1)];
}

function buildPackByGrid(pack) {
  const result = new Map();
  for (const cell of pack?.cells ?? []) {
    if (!Number.isInteger(cell?.g)) {
      continue;
    }
    const previous = result.get(cell.g);
    if (!previous || Number(cell.h ?? 0) > Number(previous.h ?? 0)) {
      result.set(cell.g, cell);
    }
  }
  return result;
}

function getChunk(chunks, chunkX, chunkZ) {
  const key = `${chunkX}:${chunkZ}`;
  let chunk = chunks.get(key);
  if (!chunk) {
    chunk = { x: chunkX, z: chunkZ, tiles: [], heights: [] };
    chunks.set(key, chunk);
  }
  return chunk;
}

function writeTile(chunks, x, z, tileId, chunkSize) {
  const chunkX = floorDiv(x, chunkSize);
  const chunkZ = floorDiv(z, chunkSize);
  const localX = positiveModulo(x, chunkSize);
  const localZ = positiveModulo(z, chunkSize);
  getChunk(chunks, chunkX, chunkZ).tiles.push([localZ * chunkSize + localX, tileId]);
}

function writeHeight(chunks, x, z, height, chunkSize) {
  const chunkX = floorDiv(x, chunkSize);
  const chunkZ = floorDiv(z, chunkSize);
  const localX = positiveModulo(x, chunkSize);
  const localZ = positiveModulo(z, chunkSize);
  const vertexSize = chunkSize + 1;
  getChunk(chunks, chunkX, chunkZ).heights.push([localZ * vertexSize + localX, height]);
}

function cloneCampaignArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

function createCampaign(document, target) {
  return {
    source: {
      type: 'azgaar-full-json',
      version: document.info.version ?? null,
      mapId: document.info.mapId ?? null,
      mapName: document.info.mapName ?? document.settings?.mapName ?? 'Azgaar world',
      seed: document.info.seed ?? document.grid.seed ?? null,
      importedAt: new Date().toISOString(),
      sourceWidth: document.info.width ?? null,
      sourceHeight: document.info.height ?? null,
      target,
    },
    states: cloneCampaignArray(document.pack?.states),
    provinces: cloneCampaignArray(document.pack?.provinces),
    cultures: cloneCampaignArray(document.pack?.cultures),
    religions: cloneCampaignArray(document.pack?.religions),
    burgs: cloneCampaignArray(document.pack?.burgs),
    rivers: cloneCampaignArray(document.pack?.rivers),
    routes: cloneCampaignArray(document.pack?.routes),
    markers: cloneCampaignArray(document.pack?.markers),
    zones: cloneCampaignArray(document.pack?.zones),
    notes: cloneCampaignArray(document.notes),
  };
}

export function isAzgaarFullJson(document) {
  return String(document?.info?.description ?? '')
    .toLowerCase()
    .includes("azgaar's fantasy map generator")
    && Array.isArray(document?.grid?.cells);
}

export function importAzgaarFullJson(document, config) {
  assertAzgaarDocument(document);
  const targetWidth = config.map.width;
  const targetHeight = config.map.height;
  const chunkSize = config.world.chunkSize;
  const offsetX = -Math.floor(targetWidth / 2);
  const offsetZ = -Math.floor(targetHeight / 2);
  const lookup = buildGridCellLookup(document.grid);
  const packByGrid = buildPackByGrid(document.pack);
  const biomeNames = readBiomeNames(document.biomesData);
  const chunks = new Map();

  for (let targetZ = 0; targetZ < targetHeight; targetZ += 1) {
    const normalizedZ = (targetZ + 0.5) / targetHeight;
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const normalizedX = (targetX + 0.5) / targetWidth;
      const gridCell = sourceCellAt(document.grid, lookup, normalizedX, normalizedZ);
      const packCell = packByGrid.get(gridCell.i);
      const height = Number(packCell?.h ?? gridCell.h ?? 0);
      const biomeName = biomeNames[packCell?.biome ?? -1];
      writeTile(
        chunks,
        offsetX + targetX,
        offsetZ + targetZ,
        tileForBiome(height, biomeName),
        chunkSize,
      );
    }
  }

  for (let targetZ = 0; targetZ <= targetHeight; targetZ += 1) {
    const normalizedZ = clamp(targetZ / targetHeight, 0, 1 - Number.EPSILON);
    for (let targetX = 0; targetX <= targetWidth; targetX += 1) {
      const normalizedX = clamp(targetX / targetWidth, 0, 1 - Number.EPSILON);
      const gridCell = sourceCellAt(document.grid, lookup, normalizedX, normalizedZ);
      const packCell = packByGrid.get(gridCell.i);
      writeHeight(
        chunks,
        offsetX + targetX,
        offsetZ + targetZ,
        convertHeight(Number(packCell?.h ?? gridCell.h ?? 0), config.terrain),
        chunkSize,
      );
    }
  }

  const target = {
    minX: offsetX,
    minZ: offsetZ,
    width: targetWidth,
    height: targetHeight,
    boundary: 'procedural-extension',
  };
  return {
    version: INFINITE_WORLD_FORMAT_VERSION,
    world: {
      chunkSize,
      tileSize: config.map.tileSize,
      generator: {
        seed: config.world.seed,
        version: config.world.generatorVersion,
        heightScale: config.world.heightScale,
        seaLevel: config.world.seaLevel,
      },
    },
    chunks: [...chunks.values()]
      .sort((left, right) => left.z - right.z || left.x - right.x),
    objects: [],
    voxelWorld: { unboundedXZ: true, cellsY: config.voxelPrototype.cells[1] },
    voxelStamps: [],
    campaign: createCampaign(document, target),
    importWarnings: [
      'Azgaar political, settlement, river, route, marker, and note data is preserved as campaign metadata.',
      'Exact Voronoi cells, labels, heraldry, and Azgaar visual styling are not rasterized into terrain.',
    ],
    savedAt: new Date().toISOString(),
  };
}
