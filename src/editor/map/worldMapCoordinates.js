import { cellCenterToWorld } from '../world/WorldCoordinates.js';

export function burgToNormalized(burg, source) {
  return Object.freeze({
    nx: burg.x / source.sourceWidth,
    nz: burg.y / source.sourceHeight,
  });
}

export function normalizedToCanonicalWorld(nx, nz, bounds, tileSize) {
  const cellX = Math.floor(bounds.minCellX + nx * bounds.widthCells);
  const cellZ = Math.floor(bounds.minCellZ + nz * bounds.heightCells);
  return cellCenterToWorld(cellX, cellZ, tileSize);
}

export function canonicalWorldToNormalized(worldX, worldZ, bounds, tileSize) {
  const cellX = worldX / tileSize;
  const cellZ = -worldZ / tileSize;
  return Object.freeze({
    nx: (cellX - bounds.minCellX) / bounds.widthCells,
    nz: (cellZ - bounds.minCellZ) / bounds.heightCells,
  });
}

// The streamed terrain quantises land/water to the coarse macro atlas, so a
// click on a fine vector coastline can resolve to an ocean cell. Spiral out in
// atlas-sized steps for the nearest cell `isLand` accepts, returning the query
// cell unchanged when it is already land (or when nothing is found in range).
export function findNearestLandCell(cellX, cellZ, isLand, { stepCells, maxRings }) {
  if (isLand(cellX, cellZ)) {
    return Object.freeze({ x: cellX, z: cellZ, snapped: false, found: true });
  }
  const step = Math.max(1, Math.round(stepCells));
  for (let ring = 1; ring <= maxRings; ring += 1) {
    let best = null;
    let bestDistanceSquared = Infinity;
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const candidateX = cellX + dx * step;
        const candidateZ = cellZ + dz * step;
        if (!isLand(candidateX, candidateZ)) continue;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared < bestDistanceSquared) {
          bestDistanceSquared = distanceSquared;
          best = { x: candidateX, z: candidateZ };
        }
      }
    }
    if (best) {
      return Object.freeze({ x: best.x, z: best.z, snapped: true, found: true });
    }
  }
  return Object.freeze({ x: cellX, z: cellZ, snapped: false, found: false });
}
