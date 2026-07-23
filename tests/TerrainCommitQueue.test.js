import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSurfaceMaskPixels,
  buildTilePixels,
  computeRoadDistanceField,
  createSurfaceMaskConfig,
  getSurfaceMaskSearchRadius,
} from '../src/editor/world/ChunkRenderPixels.js';
import {
  TerrainCommitQueue,
  commitPriority,
  createTerrainCommitJob,
} from '../src/editor/world/TerrainCommitQueue.js';
import {
  rockSignatureForChunk,
  rocksInfluencingChunk,
} from '../src/editor/stylized/chunkRockSignature.js';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';
import { TILE_BY_KEY } from '../src/editor/tileCatalog.js';

test('getSurfaceMaskSearchRadius matches prior CPU blend search', () => {
  assert.equal(getSurfaceMaskSearchRadius(2.5), 4);
  assert.equal(getSurfaceMaskSearchRadius(0.5), 2);
});

test('buildTilePixels writes RGBA color + tile id', () => {
  const plains = TILE_BY_KEY.get('plains');
  const pixels = buildTilePixels(Uint8Array.of(plains.id));
  assert.equal(pixels.length, 4);
  assert.equal(pixels[3], plains.id);
});

test('buildTilePixels accepts an imported custom biome definition', () => {
  const definitions = new Map([[
    32,
    { id: 32, color: '#7f5ac6' },
  ]]);
  const pixels = buildTilePixels(Uint8Array.of(32), definitions);
  assert.deepEqual([...pixels], [127, 90, 198, 32]);
});

test('computeRoadDistanceField zeros roads and spreads outward', () => {
  const width = 3;
  const height = 3;
  const roadTileId = 3;
  const halo = new Uint8Array(width * height);
  halo[4] = roadTileId;
  const dist = computeRoadDistanceField(halo, width, height, roadTileId);
  assert.equal(dist[4], 0);
  assert.ok(dist[1] < 2);
  assert.ok(dist[0] > dist[1]);
});

test('buildSurfaceMaskPixels samples halo exterior at most O(halo² - chunk²)', () => {
  const chunkSize = 8;
  const blendCells = 0.5;
  const searchRadius = getSurfaceMaskSearchRadius(blendCells);
  const haloSize = chunkSize + searchRadius * 2;
  const tiles = new Uint8Array(chunkSize * chunkSize);
  let sampleCalls = 0;
  buildSurfaceMaskPixels({
    tiles,
    originX: 0,
    originZ: 0,
    chunkSize,
    sampleTile: () => {
      sampleCalls += 1;
      return 0;
    },
    maskConfig: createSurfaceMaskConfig({
      path: { blendCells, tileId: 3 },
      water: { tileId: 2 },
      grass: { tileIds: [0, 1, 4] },
    }),
  });
  const exteriorCells = haloSize * haloSize - chunkSize * chunkSize;
  assert.equal(sampleCalls, exteriorCells);
  assert.ok(sampleCalls <= 144);
});

test('TerrainCommitQueue commits at most one job per flush by default', () => {
  const queue = new TerrainCommitQueue({
    maxCommitsPerFrame: 1,
    commitBudgetMs: 1000,
    now: () => 0,
  });
  const slots = [0, 1, 2].map((slotIndex) => ({
    slotIndex,
    token: 1,
    key: `${slotIndex}:0`,
    descriptor: { key: `${slotIndex}:0` },
  }));
  for (const slot of slots) {
    queue.enqueue(createTerrainCommitJob({
      slot,
      page: { id: slot.slotIndex },
      token: 1,
      priority: slot.slotIndex,
    }));
  }
  const committed = [];
  const first = queue.flush((job) => committed.push(job.page.id));
  assert.equal(first.committed, 1);
  assert.equal(first.remaining, 2);
  assert.deepEqual(committed, [0]);
  queue.flush((job) => committed.push(job.page.id));
  assert.deepEqual(committed, [0, 1]);
});

test('commitPriority prefers nearer chunks and movement ahead', () => {
  const focusChunk = { chunkX: 0, chunkZ: 0 };
  const near = commitPriority({
    descriptor: { chunkX: 1, chunkZ: 0 },
    focusChunk,
    velocity: { x: 0, z: 0 },
  });
  const far = commitPriority({
    descriptor: { chunkX: 3, chunkZ: 0 },
    focusChunk,
    velocity: { x: 0, z: 0 },
  });
  assert.ok(near < far);

  const ahead = commitPriority({
    descriptor: { chunkX: 1, chunkZ: 0 },
    focusChunk,
    velocity: { x: 10, z: 0 },
  });
  const behind = commitPriority({
    descriptor: { chunkX: -1, chunkZ: 0 },
    focusChunk,
    velocity: { x: 10, z: 0 },
  });
  assert.ok(ahead < behind);
});

test('rockSignatureForChunk only includes overlapping rocks', () => {
  const descriptor = { centerWorldX: 0, centerWorldZ: 0 };
  const rocks = [
    { x: 1, z: 1, radius: 2 },
    { x: 500, z: 500, radius: 2 },
  ];
  const local = rocksInfluencingChunk({
    descriptor,
    rockPlacements: rocks,
    chunkWorldSize: 128,
    radius: 1.8,
    falloff: 0.7,
  });
  assert.equal(local.length, 1);
  const signature = rockSignatureForChunk({
    descriptor,
    rockPlacements: rocks,
    chunkWorldSize: 128,
    radius: 1.8,
    falloff: 0.7,
  });
  assert.ok(signature.includes('1.00:1.00'));
  assert.equal(signature.includes('500'), false);
});

test('rocksInfluencingChunk honors per-rock radius beyond base expand', () => {
  const descriptor = { centerWorldX: 0, centerWorldZ: 0 };
  const chunkWorldSize = 128;
  const half = chunkWorldSize / 2;
  const baseRadius = 1.8;
  const falloff = 0.7;
  // Just outside base expand, but inside scaled rock reach (radius 2.16 + falloff).
  const rockX = half + baseRadius + falloff + 0.3;
  const rocks = [{ x: rockX, z: 0, radius: baseRadius * 1.2 }];
  const withBaseOnly = rocksInfluencingChunk({
    descriptor,
    rockPlacements: [{ x: rockX, z: 0, radius: baseRadius }],
    chunkWorldSize,
    radius: baseRadius,
    falloff,
  });
  const withScaled = rocksInfluencingChunk({
    descriptor,
    rockPlacements: rocks,
    chunkWorldSize,
    radius: baseRadius,
    falloff,
  });
  assert.equal(withBaseOnly.length, 0);
  assert.equal(withScaled.length, 1);
});

test('StylizedBuildQueue does not spend budget on no-op jobs', () => {
  const queue = new StylizedBuildQueue({ buildsPerFrame: 1, budgetMs: 100, now: () => 0 });
  const ran = [];
  queue.enqueue({ key: 'stale', slot: { applyPendingRebuild: () => false } });
  queue.enqueue({ key: 'fresh', slot: { applyPendingRebuild: () => true } });
  const result = queue.flush((job) => {
    ran.push(job.key);
    return job.slot.applyPendingRebuild();
  });
  assert.deepEqual(ran, ['stale', 'fresh']);
  assert.equal(result.built, 1);
  assert.equal(result.remaining, 0);
});
