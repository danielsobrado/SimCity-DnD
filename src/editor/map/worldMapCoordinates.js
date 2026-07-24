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
