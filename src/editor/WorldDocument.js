import { VOXEL_STAMP_MAP_FORMAT_VERSION } from './constants.js';
import { INFINITE_WORLD_FORMAT_VERSION } from './world/worldConstants.js';

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

function resolveWorldStore(tileMap, heightField) {
  return tileMap?.worldStore ?? heightField?.worldStore ?? null;
}

function migrateLegacyObjects(document, objects) {
  if (document?.version === INFINITE_WORLD_FORMAT_VERSION || !Array.isArray(objects)) {
    return objects ?? [];
  }
  const offsetX = Number.isInteger(document.width) ? -Math.floor(document.width / 2) : 0;
  const offsetZ = Number.isInteger(document.height) ? -Math.floor(document.height / 2) : 0;
  return objects.map((object) => ({
    ...object,
    x: object.x + offsetX,
    z: object.z + offsetZ,
  }));
}

export function createWorldDocument(
  tileMap,
  heightFieldOrObjectMap,
  objectMap = null,
  voxelStampStore = null,
) {
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap, voxelStampStore);
  const worldStore = resolveWorldStore(tileMap, models.heightField);
  const terrainDocument = worldStore
    ? worldStore.toDocument()
    : {
      ...tileMap.toDocument(),
      ...(models.heightField ? { heightfield: models.heightField.toDocument() } : {}),
    };
  return {
    ...terrainDocument,
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
  const worldStore = resolveWorldStore(tileMap, models.heightField);
  const previousWorld = worldStore?.createSnapshot() ?? null;
  const previousTiles = !worldStore && tileMap.tiles ? new Uint8Array(tileMap.tiles) : null;
  const previousHeights = !worldStore && models.heightField?.heights
    ? new Float32Array(models.heightField.heights)
    : null;
  const previousObjects = models.objectMap.toDocument();
  const previousVoxelStamps = models.voxelStampStore?.toDocument() ?? null;

  try {
    if (worldStore) {
      worldStore.loadDocument(document);
    } else {
      tileMap.loadDocument(document);
      models.heightField?.loadDocument(document.heightfield);
    }
    const objects = worldStore
      ? migrateLegacyObjects(document, document.objects)
      : document.objects ?? [];
    models.objectMap.loadDocument(objects);
    models.voxelStampStore?.loadDocument(document.voxelStamps ?? [], {
      sourceCells: resolveVoxelSourceCells(document, models.voxelStampStore),
      legacyDocument: document,
    });
    validate?.();
  } catch (error) {
    if (worldStore && previousWorld) {
      worldStore.restoreSnapshot(previousWorld);
    } else {
      if (previousTiles) {
        tileMap.replaceTiles(previousTiles);
      }
      if (models.heightField && previousHeights) {
        models.heightField.replaceHeights(previousHeights);
      }
    }
    models.objectMap.replaceAll(previousObjects);
    if (models.voxelStampStore && previousVoxelStamps) {
      models.voxelStampStore.replaceAll(previousVoxelStamps);
    }
    throw error;
  }
}
