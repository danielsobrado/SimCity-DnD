import { generateBaseWorldChunk } from './generateWorldChunk.js';

self.addEventListener('message', (event) => {
  const { id, request } = event.data ?? {};
  try {
    const page = generateBaseWorldChunk(request);
    const transfer = [
      page.tiles.buffer,
      page.heights.buffer,
    ];
    if (page.tilePixels?.buffer) {
      transfer.push(page.tilePixels.buffer);
    }
    if (page.surfaceMaskPixels?.buffer) {
      transfer.push(page.surfaceMaskPixels.buffer);
    }
    self.postMessage({ id, page }, transfer);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
