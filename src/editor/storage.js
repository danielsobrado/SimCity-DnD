function parseDocument(serialized) {
  const document = JSON.parse(serialized);
  if (!document || typeof document !== 'object') {
    throw new Error('The selected file is not a valid map document.');
  }
  return document;
}

export function saveToBrowser(storageKey, tileMap) {
  localStorage.setItem(storageKey, JSON.stringify(tileMap.toDocument()));
}

export function loadFromBrowser(storageKey) {
  const serialized = localStorage.getItem(storageKey);
  return serialized ? parseDocument(serialized) : null;
}

export function exportMap(tileMap) {
  const blob = new Blob([JSON.stringify(tileMap.toDocument())], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `simcity-dnd-map-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importMap(file) {
  return parseDocument(await file.text());
}
