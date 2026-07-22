import { importAzgaarFullJson } from './AzgaarJsonImporter.js';

self.addEventListener('message', (event) => {
  const { id, document, config } = event.data ?? {};
  try {
    self.postMessage({ id, world: importAzgaarFullJson(document, config) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
