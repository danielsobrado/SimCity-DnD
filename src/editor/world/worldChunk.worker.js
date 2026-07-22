import { generateBaseWorldChunk } from './generateWorldChunk.js';

self.addEventListener('message', (event) => {
  const { id, request } = event.data ?? {};
  try {
    const page = generateBaseWorldChunk(request);
    self.postMessage({ id, page }, [page.tiles.buffer, page.heights.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
