import { ProceduralWorldGenerator } from './ProceduralWorldGenerator.js';
import { chunkKey } from './WorldCoordinates.js';

function assertChunkRequest(request) {
  if (!Number.isSafeInteger(request?.chunkX) || !Number.isSafeInteger(request?.chunkZ)) {
    throw new Error('World chunk coordinates must be safe integers.');
  }
  if (!Number.isInteger(request.chunkSize) || request.chunkSize < 1) {
    throw new Error('World chunk size must be a positive integer.');
  }
}

export function generateBaseWorldChunk(request) {
  assertChunkRequest(request);
  const generator = new ProceduralWorldGenerator(request.generator);
  const { chunkX, chunkZ, chunkSize } = request;
  const vertexSize = chunkSize + 1;
  const tiles = new Uint8Array(chunkSize * chunkSize);
  const heights = new Float32Array(vertexSize * vertexSize);
  const originX = chunkX * chunkSize;
  const originZ = chunkZ * chunkSize;

  for (let localZ = 0; localZ < chunkSize; localZ += 1) {
    for (let localX = 0; localX < chunkSize; localX += 1) {
      tiles[localZ * chunkSize + localX] = generator.sampleTile(
        originX + localX,
        originZ + localZ,
      );
    }
  }
  for (let localZ = 0; localZ <= chunkSize; localZ += 1) {
    for (let localX = 0; localX <= chunkSize; localX += 1) {
      heights[localZ * vertexSize + localX] = generator.sampleHeight(
        originX + localX,
        originZ + localZ,
      );
    }
  }

  return {
    key: chunkKey(chunkX, chunkZ),
    chunkX,
    chunkZ,
    originX,
    originZ,
    tiles,
    heights,
  };
}
