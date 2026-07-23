/**
 * Per-chunk rock influence signatures so grass rebuilds only when local rocks change.
 */

function rockIntersectsChunk({
  rockX,
  rockZ,
  rockRadius,
  falloff,
  descriptor,
  chunkWorldSize,
}) {
  const half = chunkWorldSize / 2;
  const expand = rockRadius + falloff;
  return rockX >= descriptor.centerWorldX - half - expand
    && rockX <= descriptor.centerWorldX + half + expand
    && rockZ >= descriptor.centerWorldZ - half - expand
    && rockZ <= descriptor.centerWorldZ + half + expand;
}

export function rocksInfluencingChunk({
  descriptor,
  rockPlacements,
  chunkWorldSize,
  radius,
  falloff,
}) {
  const local = [];
  for (const rock of rockPlacements) {
    const rockRadius = rock.radius ?? radius;
    if (!rockIntersectsChunk({
      rockX: rock.x,
      rockZ: rock.z,
      rockRadius,
      falloff,
      descriptor,
      chunkWorldSize,
    })) {
      continue;
    }
    local.push(rock);
  }
  return local;
}

export function rockSignatureForChunk({
  descriptor,
  rockPlacements,
  chunkWorldSize,
  radius,
  falloff,
}) {
  const local = rocksInfluencingChunk({
    descriptor,
    rockPlacements,
    chunkWorldSize,
    radius,
    falloff,
  });
  if (local.length === 0) {
    return '';
  }
  return local
    .map((rock) => {
      const rockRadius = rock.radius ?? radius;
      return `${rock.x.toFixed(2)}:${rock.z.toFixed(2)}:${rockRadius.toFixed(2)}`;
    })
    .sort()
    .join('|');
}

export function objectBoulderSignatureForChunk({
  objectMap,
  descriptor,
  tileSize,
  chunkWorldSize,
  radius,
  falloff,
}) {
  const parts = [];
  for (const object of objectMap.list()) {
    if (object.definitionKey !== 'boulder') continue;
    const center = {
      x: (object.x + 0.5) * tileSize,
      z: -(object.z + 0.5) * tileSize,
    };
    if (!rockIntersectsChunk({
      rockX: center.x,
      rockZ: center.z,
      rockRadius: radius,
      falloff,
      descriptor,
      chunkWorldSize,
    })) {
      continue;
    }
    parts.push(`${object.id}:${object.x}:${object.z}`);
  }
  return parts.sort().join('|');
}
