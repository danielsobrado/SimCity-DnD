function resolveWorldModels(heightFieldOrObjectMap, objectMap) {
  if (objectMap) {
    return { heightField: heightFieldOrObjectMap, objectMap };
  }
  return { heightField: null, objectMap: heightFieldOrObjectMap };
}

export function createWorldDocument(tileMap, heightFieldOrObjectMap, objectMap = null) {
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap);
  return {
    ...tileMap.toDocument(),
    ...(models.heightField ? { heightfield: models.heightField.toDocument() } : {}),
    objects: models.objectMap.toDocument(),
  };
}

export function loadWorldDocument(document, tileMap, heightFieldOrObjectMap, objectMap = null) {
  const models = resolveWorldModels(heightFieldOrObjectMap, objectMap);
  const previousTiles = new Uint8Array(tileMap.tiles);
  const previousHeights = models.heightField ? new Float32Array(models.heightField.heights) : null;
  const previousObjects = models.objectMap.toDocument();

  try {
    tileMap.loadDocument(document);
    models.heightField?.loadDocument(document.heightfield);
    models.objectMap.loadDocument(document.objects ?? []);
  } catch (error) {
    tileMap.replaceTiles(previousTiles);
    if (models.heightField && previousHeights) {
      models.heightField.replaceHeights(previousHeights);
    }
    models.objectMap.replaceAll(previousObjects);
    throw error;
  }
}
