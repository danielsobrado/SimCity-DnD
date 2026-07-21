function parseDocument(serialized) {
  const document = JSON.parse(serialized);
  if (!document || typeof document !== 'object') {
    throw new Error('The selected file is not a valid map document.');
  }
  return document;
}

export function saveToBrowser(storageKey, document) {
  localStorage.setItem(storageKey, JSON.stringify(document));
}

export function loadFromBrowser(storageKey) {
  const serialized = localStorage.getItem(storageKey);
  return serialized ? parseDocument(serialized) : null;
}

export function exportMap(worldDocument) {
  const blob = new Blob([JSON.stringify(worldDocument)], { type: 'application/json' });
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
