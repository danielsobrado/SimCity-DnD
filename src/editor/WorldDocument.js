export function createWorldDocument(tileMap, objectMap) {
  return {
    ...tileMap.toDocument(),
    objects: objectMap.toDocument(),
  };
}

export function loadWorldDocument(document, tileMap, objectMap) {
  const previousTiles = new Uint8Array(tileMap.tiles);
  const previousObjects = objectMap.toDocument();

  try {
    tileMap.loadDocument(document);
    objectMap.loadDocument(document.objects ?? []);
  } catch (error) {
    tileMap.replaceTiles(previousTiles);
    objectMap.replaceAll(previousObjects);
    throw error;
  }
}
