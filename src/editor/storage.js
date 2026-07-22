import { loadEditorConfig } from '../config/loadEditorConfig.js';
import {
  importAzgaarFullJson,
  isAzgaarFullJson,
} from './import/AzgaarJsonImporter.js';

const DATABASE_NAME = 'simcity-dnd-worlds';
const DATABASE_VERSION = 1;
const STORE_NAME = 'worlds';

function parseDocument(serialized) {
  const document = JSON.parse(serialized);
  if (!document || typeof document !== 'object') {
    throw new Error('The selected file is not a valid map document.');
  }
  return document;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB failed to open.')));
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  if (!database) {
    return action(null);
  }
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.addEventListener('complete', () => resolve(result?.result));
      transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')));
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')));
    });
  } finally {
    database.close();
  }
}

export async function saveToBrowser(storageKey, document) {
  if (typeof indexedDB !== 'undefined') {
    await withStore('readwrite', (store) => store.put(document, storageKey));
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // IndexedDB is authoritative; stale localStorage cleanup is best effort.
    }
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(document));
}

export async function loadFromBrowser(storageKey) {
  if (typeof indexedDB !== 'undefined') {
    const document = await withStore('readonly', (store) => store.get(storageKey));
    if (document) {
      return document;
    }
  }
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

export async function importMap(file, { config = null } = {}) {
  const document = parseDocument(await file.text());
  if (!isAzgaarFullJson(document)) {
    return document;
  }
  return importAzgaarFullJson(document, config ?? loadEditorConfig());
}
