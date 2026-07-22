import { createVoxelChunkLayout } from './VoxelChunkLayout.js';
import { VOXEL_MAX_RESIDENT_CHUNKS } from './voxelConstants.js';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertStreamingConfig(config) {
  if (!Number.isInteger(config?.streamRadius) || config.streamRadius < 0) {
    throw new Error('Voxel prototype streamRadius must be a non-negative integer.');
  }
  if (!Number.isInteger(config.slotCount)
      || config.slotCount < 1
      || config.slotCount > VOXEL_MAX_RESIDENT_CHUNKS) {
    throw new Error(
      `Voxel prototype slotCount must be within 1–${VOXEL_MAX_RESIDENT_CHUNKS}.`,
    );
  }
}

export function createVoxelChunkDescriptor(worldLayout, chunkX, chunkZ) {
  if (!Number.isInteger(chunkX)
      || !Number.isInteger(chunkZ)
      || chunkX < 0
      || chunkZ < 0
      || chunkX >= worldLayout.chunksX
      || chunkZ >= worldLayout.chunksZ) {
    throw new Error(`Voxel chunk coordinate is outside the world: ${chunkX}:${chunkZ}.`);
  }

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
    centerWorldX: -worldLayout.mapWorldWidth / 2
      + (offsetX + worldLayout.chunkCellsX * 0.5) * worldLayout.voxelSize,
    centerWorldZ: -worldLayout.mapWorldDepth / 2
      + (offsetZ + worldLayout.chunkCellsZ * 0.5) * worldLayout.voxelSize,
  });
}

export function createVoxelWorldLayout(config, mapConfig) {
  assertStreamingConfig(config);
  const chunkLayout = createVoxelChunkLayout(config, mapConfig);
  const mapWorldWidth = mapConfig.width * mapConfig.tileSize;
  const mapWorldDepth = mapConfig.height * mapConfig.tileSize;
  const chunksX = Math.ceil(mapWorldWidth / chunkLayout.chunkWorldWidth);
  const chunksZ = Math.ceil(mapWorldDepth / chunkLayout.chunkWorldDepth);
  const worldChunkCount = chunksX * chunksZ;
  const requestedWindow = (config.streamRadius * 2 + 1) ** 2;
  const requiredSlots = Math.min(requestedWindow, worldChunkCount);
  if (config.slotCount < requiredSlots) {
    throw new Error(
      `Voxel prototype slotCount must be at least ${requiredSlots} for streamRadius ${config.streamRadius}.`,
    );
  }

  return Object.freeze({
    ...chunkLayout,
    chunksX,
    chunksZ,
    worldChunkCount,
    slotCount: config.slotCount,
    streamRadius: config.streamRadius,
    chunkCellsX: chunkLayout.cellsX,
    chunkCellsY: chunkLayout.cellsY,
    chunkCellsZ: chunkLayout.cellsZ,
    totalCellsX: chunksX * chunkLayout.cellsX,
    totalCellsY: chunkLayout.cellsY,
    totalCellsZ: chunksZ * chunkLayout.cellsZ,
    mapWorldWidth,
    mapWorldDepth,
    worldWidth: chunksX * chunkLayout.chunkWorldWidth,
    worldDepth: chunksZ * chunkLayout.chunkWorldDepth,
    originX: (mapConfig.width - 1) / 2,
    originZ: (mapConfig.height - 1) / 2,
  });
}

export function worldToVoxel(worldLayout, worldX, worldZ) {
  return Object.freeze({
    x: clamp(
      (worldX + worldLayout.mapWorldWidth / 2) / worldLayout.voxelSize,
      0,
      worldLayout.totalCellsX,
    ),
    z: clamp(
      (worldZ + worldLayout.mapWorldDepth / 2) / worldLayout.voxelSize,
      0,
      worldLayout.totalCellsZ,
    ),
  });
}

export function worldToVoxelChunk(worldLayout, worldX, worldZ) {
  const voxel = worldToVoxel(worldLayout, worldX, worldZ);
  return Object.freeze({
    chunkX: clamp(
      Math.floor(voxel.x / worldLayout.chunkCellsX),
      0,
      worldLayout.chunksX - 1,
    ),
    chunkZ: clamp(
      Math.floor(voxel.z / worldLayout.chunkCellsZ),
      0,
      worldLayout.chunksZ - 1,
    ),
  });
}

export function selectResidentChunkDescriptors(worldLayout, focusWorld) {
  const focusChunk = worldToVoxelChunk(worldLayout, focusWorld.x, focusWorld.z);
  const descriptors = [];
  for (let chunkZ = 0; chunkZ < worldLayout.chunksZ; chunkZ += 1) {
    for (let chunkX = 0; chunkX < worldLayout.chunksX; chunkX += 1) {
      descriptors.push(createVoxelChunkDescriptor(worldLayout, chunkX, chunkZ));
    }
  }

  descriptors.sort((left, right) => {
    const leftChebyshev = Math.max(
      Math.abs(left.chunkX - focusChunk.chunkX),
      Math.abs(left.chunkZ - focusChunk.chunkZ),
    );
    const rightChebyshev = Math.max(
      Math.abs(right.chunkX - focusChunk.chunkX),
      Math.abs(right.chunkZ - focusChunk.chunkZ),
    );
    const leftDistance = (left.chunkX - focusChunk.chunkX) ** 2
      + (left.chunkZ - focusChunk.chunkZ) ** 2;
    const rightDistance = (right.chunkX - focusChunk.chunkX) ** 2
      + (right.chunkZ - focusChunk.chunkZ) ** 2;
    return leftChebyshev - rightChebyshev
      || leftDistance - rightDistance
      || left.chunkZ - right.chunkZ
      || left.chunkX - right.chunkX;
  });

  return Object.freeze({
    focusChunk,
    descriptors: Object.freeze(descriptors.slice(0, worldLayout.slotCount)),
  });
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
