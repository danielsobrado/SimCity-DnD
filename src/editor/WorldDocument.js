import { VOXEL_STAMP_MAP_FORMAT_VERSION } from './constants.js';

function resolveWorldModels(heightFieldOrObjectMap, objectMap, voxelStampStore) {
  if (objectMap) {
    return {
      heightField: heightFieldOrObjectMap,
      objectMap,
      voxelStampStore: voxelStampStore ?? null,
    };
  }
  return {
    heightField: null,
    objectMap: heightFieldOrObjectMap,
    voxelStampStore: null,
  };
}

export function createWorldDocument(
  tileMap,
  heightFieldOrObjectMap,
  objectMap = null,
  voxelStampStore = null,
) {
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap, voxelStampStore);
  return {
    ...tileMap.toDocument(),
    ...(models.heightField ? { heightfield: models.heightField.toDocument() } : {}),
    objects: models.objectMap.toDocument(),
    ...(models.voxelStampStore
      ? {
        voxelWorld: models.voxelStampStore.toMetadata(),
        voxelStamps: models.voxelStampStore.toDocument(),
      }
      : {}),
  };
}

function resolveVoxelSourceCells(document, voxelStampStore) {
  if (!voxelStampStore) {
    return null;
  }
  if (document.version === VOXEL_STAMP_MAP_FORMAT_VERSION) {
    return voxelStampStore.legacyCells;
  }
  return document.voxelWorld?.cells ?? voxelStampStore.cells;
}

export function loadWorldDocument(
  document,
  tileMap,
  heightFieldOrObjectMap,
  objectMap = null,
  voxelStampStore = null,
  validate = null,
) {
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap, voxelStampStore);
  const previousTiles = new Uint8Array(tileMap.tiles);
  const previousHeights = models.heightField ? new Float32Array(models.heightField.heights) : null;
  const previousObjects = models.objectMap.toDocument();
  const previousVoxelStamps = models.voxelStampStore?.toDocument() ?? null;

  try {
    tileMap.loadDocument(document);
    models.heightField?.loadDocument(document.heightfield);
    models.objectMap.loadDocument(document.objects ?? []);
    models.voxelStampStore?.loadDocument(document.voxelStamps ?? [], {
      sourceCells: resolveVoxelSourceCells(document, models.voxelStampStore),
    });
    validate?.();
  } catch (error) {
    tileMap.replaceTiles(previousTiles);
    if (models.heightField && previousHeights) {
      models.heightField.replaceHeights(previousHeights);
    }
    models.objectMap.replaceAll(previousObjects);
    if (models.voxelStampStore && previousVoxelStamps) {
      models.voxelStampStore.replaceAll(previousVoxelStamps);
    }
    throw error;
  }
}
