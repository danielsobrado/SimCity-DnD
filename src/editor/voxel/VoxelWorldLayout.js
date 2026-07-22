import { createVoxelChunkLayout } from './VoxelChunkLayout.js';
import { VOXEL_MAX_RESIDENT_CHUNKS } from './voxelConstants.js';

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
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
  const requiredSlots = (config.streamRadius * 2 + 1) ** 2;
  if (config.slotCount < requiredSlots) {
    throw new Error(
      `Voxel prototype slotCount must be at least ${requiredSlots} for streamRadius ${config.streamRadius}.`,
    );
  }
}

export function createVoxelChunkDescriptor(worldLayout, chunkX, chunkZ) {
  if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkZ)) {
    throw new Error(`Voxel chunk coordinate is invalid: ${chunkX}:${chunkZ}.`);
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
    centerWorldX: (offsetX + worldLayout.chunkCellsX * 0.5) * worldLayout.voxelSize,
    centerWorldZ: -(offsetZ + worldLayout.chunkCellsZ * 0.5) * worldLayout.voxelSize,
  });
}

export function createVoxelWorldLayout(config, mapConfig) {
  assertStreamingConfig(config);
  const chunkLayout = createVoxelChunkLayout(config, mapConfig);
  return Object.freeze({
    ...chunkLayout,
    unboundedXZ: true,
    chunksX: Number.POSITIVE_INFINITY,
    chunksZ: Number.POSITIVE_INFINITY,
    worldChunkCount: Number.POSITIVE_INFINITY,
    slotCount: config.slotCount,
    streamRadius: config.streamRadius,
    chunkCellsX: chunkLayout.cellsX,
    chunkCellsY: chunkLayout.cellsY,
    chunkCellsZ: chunkLayout.cellsZ,
    totalCellsX: Number.POSITIVE_INFINITY,
    totalCellsY: chunkLayout.cellsY,
    totalCellsZ: Number.POSITIVE_INFINITY,
    worldWidth: Number.POSITIVE_INFINITY,
    worldDepth: Number.POSITIVE_INFINITY,
    originX: 0,
    originZ: 0,
  });
}

export function worldToVoxel(worldLayout, worldX, worldZ) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    throw new Error('Voxel world position must be finite.');
  }
  return Object.freeze({
    x: normalizeZero(worldX / worldLayout.voxelSize),
    z: normalizeZero(-worldZ / worldLayout.voxelSize),
  });
}

export function worldToVoxelChunk(worldLayout, worldX, worldZ) {
  const voxel = worldToVoxel(worldLayout, worldX, worldZ);
  return Object.freeze({
    chunkX: normalizeZero(Math.floor(voxel.x / worldLayout.chunkCellsX)),
    chunkZ: normalizeZero(Math.floor(voxel.z / worldLayout.chunkCellsZ)),
  });
}

export function selectResidentChunkDescriptors(worldLayout, focusWorld) {
  const focusChunk = worldToVoxelChunk(worldLayout, focusWorld.x, focusWorld.z);
  const descriptors = [];
  for (let offsetZ = -worldLayout.streamRadius; offsetZ <= worldLayout.streamRadius; offsetZ += 1) {
    for (let offsetX = -worldLayout.streamRadius; offsetX <= worldLayout.streamRadius; offsetX += 1) {
      descriptors.push(createVoxelChunkDescriptor(
        worldLayout,
        focusChunk.chunkX + offsetX,
        focusChunk.chunkZ + offsetZ,
      ));
    }
  }

  descriptors.sort((left, right) => {
    const leftDistance = (left.chunkX - focusChunk.chunkX) ** 2
      + (left.chunkZ - focusChunk.chunkZ) ** 2;
    const rightDistance = (right.chunkX - focusChunk.chunkX) ** 2
      + (right.chunkZ - focusChunk.chunkZ) ** 2;
    return leftDistance - rightDistance
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
