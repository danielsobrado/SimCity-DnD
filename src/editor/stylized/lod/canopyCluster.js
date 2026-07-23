function hash32(value) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

export function aggregateCanopyCluster({
  chunkX,
  chunkZ,
  placements,
  minimumWidth = 8,
  minimumHeight = 4,
}) {
  if (!Array.isArray(placements) || placements.length === 0) return null;

  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let totalHeight = 0;
  let totalScale = 0;

  for (const placement of placements) {
    minimumX = Math.min(minimumX, placement.x);
    maximumX = Math.max(maximumX, placement.x);
    minimumZ = Math.min(minimumZ, placement.z);
    maximumZ = Math.max(maximumZ, placement.z);
    totalHeight += placement.height;
    totalScale += placement.scale;
  }

  const count = placements.length;
  const averageGround = totalHeight / count;
  const averageScale = totalScale / count;
  const width = Math.max(minimumWidth, maximumX - minimumX + minimumWidth * 0.55);
  const depth = Math.max(minimumWidth, maximumZ - minimumZ + minimumWidth * 0.55);
  const height = Math.max(minimumHeight, minimumHeight * averageScale * (0.9 + Math.log2(count + 1) * 0.16));
  const seed = hash32(Math.imul(chunkX, 73856093) ^ Math.imul(chunkZ, 19349663));

  return Object.freeze({
    stableId: `canopy:${chunkX}:${chunkZ}`,
    x: (minimumX + maximumX) * 0.5,
    y: averageGround,
    z: (minimumZ + maximumZ) * 0.5,
    width,
    height,
    depth,
    seed: seed / 0xffffffff,
    count,
  });
}
