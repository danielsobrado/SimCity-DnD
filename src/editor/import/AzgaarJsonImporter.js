import { INFINITE_WORLD_FORMAT_VERSION } from '../world/worldConstants.js';
import {
  buildAzgaarImportSummary,
  createAzgaarMacroWorldSource,
} from './AzgaarMacroWorldSource.js';

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

function cloneCampaignArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

function createCampaign(document, baseTerrain, summary) {
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
      target: {
        ...baseTerrain.bounds,
        atlasWidth: summary.atlasWidth,
        atlasHeight: summary.atlasHeight,
        physicalWidthMeters: summary.physicalWidthMeters,
        physicalHeightMeters: summary.physicalHeightMeters,
        boundary: 'ocean',
      },
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
    features: cloneCampaignArray(document.pack?.features),
    goods: cloneCampaignArray(document.pack?.goods),
    markets: cloneCampaignArray(document.pack?.markets),
    deals: cloneCampaignArray(document.pack?.deals),
    measurers: cloneCampaignArray(document.pack?.measurers),
    notes: cloneCampaignArray(document.notes),
  };
}

export function isAzgaarFullJson(document) {
  return String(document?.info?.description ?? '')
    .toLowerCase()
    .includes("azgaar's fantasy map generator")
    && Array.isArray(document?.grid?.cells);
}

export function importAzgaarFullJson(document, config, options = {}) {
  assertAzgaarDocument(document);
  const chunkSize = config.world.chunkSize;
  const summary = buildAzgaarImportSummary(document, config, options);
  const baseTerrain = createAzgaarMacroWorldSource(document, config, options);
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
      baseTerrain,
    },
    chunks: [],
    objects: [],
    voxelWorld: { unboundedXZ: true, cellsY: config.voxelPrototype.cells[1] },
    voxelStamps: [],
    campaign: createCampaign(document, baseTerrain, summary),
    importWarnings: [
      `Azgaar macro atlas ${summary.atlasWidth}×${summary.atlasHeight}; `
        + `${Math.round(summary.physicalWidthMeters / 1000)}×`
        + `${Math.round(summary.physicalHeightMeters / 1000)} km; `
        + `${(summary.estimatedRawBytes / 1024 / 1024).toFixed(1)} MiB raw.`,
      'Terrain is generated and streamed on demand; edits remain sparse.',
      'Labels, heraldry, and political overlays are preserved as campaign metadata.',
      ...(summary.usedCustomUnitFallback
        ? [`Unknown distance unit "${summary.distanceUnit}" was interpreted as kilometers.`]
        : []),
    ],
    savedAt: new Date().toISOString(),
  };
}
