import { createVoxelChunkLayout } from './VoxelChunkLayout.js';
import { VOXEL_MAX_RESIDENT_CHUNKS } from './voxelConstants.js';

function assertChunkGrid(value) {
  if (!Array.isArray(value)
      || value.length !== 2
      || value.some((entry) => !Number.isInteger(entry) || entry < 1)) {
    throw new Error('Voxel prototype chunkGrid must contain two positive integers.');
  }
}

function createChunkDescriptor(worldLayout, chunkX, chunkZ) {
  const offsetX = chunkX * worldLayout.chunkCellsX;
  const offsetZ = chunkZ * worldLayout.chunkCellsZ;
  return Object.freeze({
    key: `${chunkX}:${chunkZ}`,
    chunkX,
    chunkZ,
    offsetX,
    offsetZ,
    minX: offsetX,
    maxX: offsetX + worldLayout.chunkCellsX,
    minZ: offsetZ,
    maxZ: offsetZ + worldLayout.chunkCellsZ,
    centerOffsetX: (
      offsetX + worldLayout.chunkCellsX * 0.5 - worldLayout.totalCellsX * 0.5
    ) * worldLayout.voxelSize,
    centerOffsetZ: (
      offsetZ + worldLayout.chunkCellsZ * 0.5 - worldLayout.totalCellsZ * 0.5
    ) * worldLayout.voxelSize,
  });
}

export function createVoxelWorldLayout(config, mapConfig) {
  assertChunkGrid(config?.chunkGrid);
  const chunkLayout = createVoxelChunkLayout(config, mapConfig);
  const [chunksX, chunksZ] = config.chunkGrid;
  const chunkCount = chunksX * chunksZ;
  if (chunkCount > VOXEL_MAX_RESIDENT_CHUNKS) {
    throw new Error(
      `Voxel prototype chunkGrid exceeds ${VOXEL_MAX_RESIDENT_CHUNKS} resident chunks.`,
    );
  }

  const totalCellsX = chunkLayout.cellsX * chunksX;
  const totalCellsZ = chunkLayout.cellsZ * chunksZ;
  const worldWidth = totalCellsX * chunkLayout.voxelSize;
  const worldDepth = totalCellsZ * chunkLayout.voxelSize;
  const halfMapCellsX = worldWidth / (mapConfig.tileSize * 2);
  const halfMapCellsZ = worldDepth / (mapConfig.tileSize * 2);
  if (chunkLayout.originX - halfMapCellsX < 0
      || chunkLayout.originX + halfMapCellsX >= mapConfig.width
      || chunkLayout.originZ - halfMapCellsZ < 0
      || chunkLayout.originZ + halfMapCellsZ >= mapConfig.height) {
    throw new Error('Voxel prototype multi-chunk world must fit inside the logical map.');
  }

  const worldLayout = {
    ...chunkLayout,
    chunksX,
    chunksZ,
    chunkCount,
    chunkCellsX: chunkLayout.cellsX,
    chunkCellsY: chunkLayout.cellsY,
    chunkCellsZ: chunkLayout.cellsZ,
    totalCellsX,
    totalCellsY: chunkLayout.cellsY,
    totalCellsZ,
    worldWidth,
    worldDepth,
  };
  worldLayout.chunks = Object.freeze(Array.from({ length: chunkCount }, (_, index) => {
    const chunkX = index % chunksX;
    const chunkZ = Math.floor(index / chunksX);
    return createChunkDescriptor(worldLayout, chunkX, chunkZ);
  }));
  return Object.freeze(worldLayout);
}

export function toGlobalVoxelSample(descriptor, localPosition) {
  return Object.freeze({
    x: descriptor.offsetX + localPosition.x,
    y: localPosition.y,
    z: descriptor.offsetZ + localPosition.z,
  });
}

function intersectsChunk(stamp, descriptor, worldCellsY, halo) {
  const [x, y, z] = stamp.center;
  const radius = stamp.radius;
  return x + radius >= descriptor.minX - halo
    && x - radius <= descriptor.maxX + halo
    && y + radius >= -halo
    && y - radius <= worldCellsY + halo
    && z + radius >= descriptor.minZ - halo
    && z - radius <= descriptor.maxZ + halo;
}

export function selectVoxelStampsForChunk(stamps, descriptor, worldLayout) {
  return stamps
    .filter((stamp) => intersectsChunk(
      stamp,
      descriptor,
      worldLayout.totalCellsY,
      worldLayout.sampleHalo,
    ))
    .map((stamp) => Object.freeze({
      ...stamp,
      center: Object.freeze([
        stamp.center[0] - descriptor.offsetX,
        stamp.center[1],
        stamp.center[2] - descriptor.offsetZ,
      ]),
    }));
}
