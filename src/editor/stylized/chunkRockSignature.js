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

export function collectObjectBoulderPlacements({ objectMap, tileSize, radius }) {
  return objectMap.list()
    .filter((object) => object.definitionKey === 'boulder')
    .map((object) => ({
      stableId: `object:${object.id}`,
      x: (object.x + 0.5) * tileSize,
      z: -(object.z + 0.5) * tileSize,
      radius,
    }));
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
  if (local.length === 0) return '';
  return local
    .map((rock) => {
      const rockRadius = rock.radius ?? radius;
      return `${rock.stableId ?? ''}:${rock.x.toFixed(2)}:${rock.z.toFixed(2)}:${rockRadius.toFixed(2)}`;
    })
    .sort()
    .join('|');
}

export function objectBoulderSignatureForChunk({
  objectMap,
  objectPlacements = null,
  descriptor,
  tileSize,
  chunkWorldSize,
  radius,
  falloff,
}) {
  const placements = objectPlacements ?? collectObjectBoulderPlacements({
    objectMap,
    tileSize,
    radius,
  });
  return rockSignatureForChunk({
    descriptor,
    rockPlacements: placements,
    chunkWorldSize,
    radius,
    falloff,
  });
}
