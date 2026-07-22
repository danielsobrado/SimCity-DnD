function distanceSquared(descriptor, focusChunk) {
  const deltaX = descriptor.chunkX - focusChunk.chunkX;
  const deltaZ = descriptor.chunkZ - focusChunk.chunkZ;
  return deltaX * deltaX + deltaZ * deltaZ;
}

export function createVoxelStreamingPlan({ slots, targets, focusChunk }) {
  const targetKeys = new Set(targets.map((descriptor) => descriptor.key));
  const retained = slots.filter((slot) => slot.key && targetKeys.has(slot.key));
  const retainedKeys = new Set(retained.map((slot) => slot.key));
  const missing = targets.filter((descriptor) => !retainedKeys.has(descriptor.key));
  const candidates = slots
    .filter((slot) => !slot.key || !targetKeys.has(slot.key))
    .sort((left, right) => {
      if (!left.key && right.key) {
        return -1;
      }
      if (left.key && !right.key) {
        return 1;
      }
      if (left.descriptor && right.descriptor) {
        const distanceDifference = distanceSquared(right.descriptor, focusChunk)
          - distanceSquared(left.descriptor, focusChunk);
        if (distanceDifference !== 0) {
          return distanceDifference;
        }
      }
      if (left.lastUsed !== right.lastUsed) {
        return left.lastUsed - right.lastUsed;
      }
      return left.slotIndex - right.slotIndex;
    });

  if (missing.length > candidates.length) {
    throw new Error('Voxel slot pool cannot satisfy the requested resident set.');
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
