import {
  importAzgaarFullJson,
  isAzgaarFullJson,
} from './import/AzgaarJsonImporter.js';

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
  anchor.download = `simcity-dnd-world-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importMap(file, { config } = {}) {
  const document = parseDocument(await file.text());
  if (!isAzgaarFullJson(document)) {
    return document;
  }
  if (!config) {
    throw new Error('Azgaar import requires the active editor configuration.');
  }
  return importAzgaarFullJson(document, config);
}
