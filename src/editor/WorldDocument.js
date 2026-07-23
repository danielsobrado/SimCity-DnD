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

function assertInfiniteWorldDocument(document) {
  if (document?.version !== INFINITE_WORLD_FORMAT_VERSION) {
    throw new Error(
      'This file uses an older dense map format that is no longer supported. '
      + 'Use a current infinite-world save, or import Azgaar Full JSON.',
    );
  }
}

export function createWorldDocument(
  tileMap,
  heightFieldOrObjectMap,
  objectMap = null,
  voxelStampStore = null,
) {
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap, voxelStampStore);
  const worldStore = resolveWorldStore(tileMap, models.heightField);
  if (!worldStore) {
    throw new Error('World documents require an infinite world store.');
  }
  return {
    ...worldStore.toDocument(),
    objects: models.objectMap.toDocument(),
    ...(models.voxelStampStore
      ? {
        voxelWorld: models.voxelStampStore.toMetadata(),
        voxelStamps: models.voxelStampStore.toDocument(),
      }
      : {}),
  };
}

export function loadWorldDocument(
  document,
  tileMap,
  heightFieldOrObjectMap,
  objectMap = null,
  voxelStampStore = null,
  validate = null,
) {
  assertInfiniteWorldDocument(document);
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap, voxelStampStore);
  const worldStore = resolveWorldStore(tileMap, models.heightField);
  if (!worldStore) {
    throw new Error('World documents require an infinite world store.');
  }
  const previousWorld = worldStore.createSnapshot();
  const previousObjects = models.objectMap.toDocument();
  const previousVoxelStamps = models.voxelStampStore?.toDocument() ?? null;

  try {
    worldStore.loadDocument(document);
    models.objectMap.loadDocument(document.objects ?? []);
    models.voxelStampStore?.loadDocument(document.voxelStamps ?? [], {
      sourceCells: document.voxelWorld?.cells ?? null,
      sourceUnboundedXZ: Boolean(document.voxelWorld?.unboundedXZ),
    });
    validate?.();
  } catch (error) {
    worldStore.restoreSnapshot(previousWorld);
    models.objectMap.replaceAll(previousObjects);
    if (models.voxelStampStore && previousVoxelStamps) {
      models.voxelStampStore.replaceAll(previousVoxelStamps);
    }
    throw error;
  }
}
