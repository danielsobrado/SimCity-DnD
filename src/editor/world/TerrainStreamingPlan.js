import { cellToChunk, chunkKey, worldToCell } from './WorldCoordinates.js';

function distanceSquared(left, right) {
  const deltaX = left.chunkX - right.chunkX;
  const deltaZ = left.chunkZ - right.chunkZ;
  return deltaX * deltaX + deltaZ * deltaZ;
}

export function worldToTerrainChunk(worldX, worldZ, tileSize, chunkSize) {
  const cell = worldToCell(worldX, worldZ, tileSize);
  const chunk = cellToChunk(cell.x, cell.z, chunkSize);
  return Object.freeze({ chunkX: chunk.chunkX, chunkZ: chunk.chunkZ });
}

export function createTerrainChunkDescriptor({ chunkX, chunkZ, chunkSize, tileSize }) {
  const originCellX = chunkX * chunkSize;
  const originCellZ = chunkZ * chunkSize;
  return Object.freeze({
    key: chunkKey(chunkX, chunkZ),
    chunkX,
    chunkZ,
    originCellX,
    originCellZ,
    centerWorldX: (originCellX + chunkSize * 0.5) * tileSize,
    centerWorldZ: -(originCellZ + chunkSize * 0.5) * tileSize,
  });
}

function appendRadius(targets, center, radius, priority, config) {
  for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const chunkX = center.chunkX + offsetX;
      const chunkZ = center.chunkZ + offsetZ;
      const key = chunkKey(chunkX, chunkZ);
      const descriptor = createTerrainChunkDescriptor({
        chunkX,
        chunkZ,
        chunkSize: config.chunkSize,
        tileSize: config.tileSize,
      });
      const candidate = {
        descriptor,
        priority,
        currentDistance: distanceSquared(descriptor, config.currentChunk),
        predictedDistance: distanceSquared(descriptor, config.predictedChunk),
      };
      const previous = targets.get(key);
      if (!previous
          || candidate.priority < previous.priority
          || candidate.currentDistance < previous.currentDistance
          || candidate.predictedDistance < previous.predictedDistance) {
        targets.set(key, candidate);
      }
    }
  }
}

export function selectTerrainResidentDescriptors(options) {
  const {
    focusWorld,
    velocity = { x: 0, z: 0 },
    tileSize,
    chunkSize,
    loadRadius,
    unloadRadius,
    prefetchSeconds,
    slotCount,
  } = options;
  const currentChunk = worldToTerrainChunk(focusWorld.x, focusWorld.z, tileSize, chunkSize);
  const predictedWorld = {
    x: focusWorld.x + velocity.x * prefetchSeconds,
    z: focusWorld.z + velocity.z * prefetchSeconds,
  };
  const predictedChunk = worldToTerrainChunk(predictedWorld.x, predictedWorld.z, tileSize, chunkSize);
  const config = { tileSize, chunkSize, currentChunk, predictedChunk };
  const targets = new Map();

  appendRadius(targets, currentChunk, unloadRadius, 2, config);
  appendRadius(targets, currentChunk, loadRadius, 0, config);
  appendRadius(targets, predictedChunk, loadRadius, 1, config);

  const descriptors = [...targets.values()]
    .sort((left, right) => left.priority - right.priority
      || left.currentDistance - right.currentDistance
      || left.predictedDistance - right.predictedDistance
      || left.descriptor.chunkZ - right.descriptor.chunkZ
      || left.descriptor.chunkX - right.descriptor.chunkX)
    .slice(0, slotCount)
    .map((entry) => entry.descriptor);

  return Object.freeze({
    currentChunk,
    predictedChunk,
    descriptors: Object.freeze(descriptors),
  });
}

export function createTerrainSlotPlan({ slots, targets, focusChunk }) {
  const targetKeys = new Set(targets.map((descriptor) => descriptor.key));
  const retained = slots.filter((slot) => slot.key && targetKeys.has(slot.key));
  const retainedKeys = new Set(retained.map((slot) => slot.key));
  const missing = targets.filter((descriptor) => !retainedKeys.has(descriptor.key));
  const candidates = slots
    .filter((slot) => !slot.key || !targetKeys.has(slot.key))
    .sort((left, right) => {
      if (!left.key && right.key) return -1;
      if (left.key && !right.key) return 1;
      if (left.descriptor && right.descriptor) {
        const distanceDifference = distanceSquared(right.descriptor, focusChunk)
          - distanceSquared(left.descriptor, focusChunk);
        if (distanceDifference !== 0) return distanceDifference;
      }
      return left.lastUsed - right.lastUsed || left.slotIndex - right.slotIndex;
    });

  if (missing.length > candidates.length) {
    throw new Error('Terrain slot pool cannot satisfy the requested resident set.');
  }

  return Object.freeze({
    retained: Object.freeze(retained.map((slot) => slot.slotIndex)),
    assignments: Object.freeze(missing.map((descriptor, index) => Object.freeze({
      slotIndex: candidates[index].slotIndex,
      descriptor,
      evictedKey: candidates[index].key ?? null,
    }))),
  });
}
