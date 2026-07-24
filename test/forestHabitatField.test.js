import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStableChunkManifest } from '../src/editor/stylized/StableScatterManifest.js';
import {
  ForestHabitatField,
  createForestPlacementEvaluator,
} from '../src/editor/stylized/forest/ForestHabitatField.js';

function createField({ seed = 17, tileId = 7, heightAt = () => 10, config = {} } = {}) {
  return new ForestHabitatField({
    seed,
    tileSize: 2,
    tileAt: () => tileId,
    heightAt,
    config,
  });
}

function findBestSample(field) {
  let best = null;
  for (let z = -640; z <= 640; z += 32) {
    for (let x = -640; x <= 640; x += 32) {
      const sample = field.sample(x, z);
      if (!best || sample.suitability > best.sample.suitability) {
        best = { x, z, sample };
      }
    }
  }
  return best;
}

test('forest habitat samples are deterministic for a world seed', () => {
  const first = createField({ seed: 918273 });
  const second = createField({ seed: 918273 });
  const positions = [
    [0, 0],
    [127.5, -64.25],
    [-384.1, 512.75],
  ];

  for (const [x, z] of positions) {
    assert.deepEqual(first.sample(x, z), second.sample(x, z));
  }
});

test('different world seeds change the patch authority', () => {
  const first = createField({ seed: 11 });
  const second = createField({ seed: 29 });
  let changed = false;

  for (let z = -512; z <= 512 && !changed; z += 64) {
    for (let x = -512; x <= 512; x += 64) {
      const left = first.sample(x, z);
      const right = second.sample(x, z);
      if (left.patchId !== right.patchId || left.patchCoverage !== right.patchCoverage) {
        changed = true;
        break;
      }
    }
  }

  assert.equal(changed, true);
});

test('unsupported biomes remain tree free', () => {
  const field = createField({ tileId: 0 });
  const sample = field.sample(0, 0);
  assert.equal(sample.profileKey, null);
  assert.equal(sample.patchId, null);
  assert.equal(sample.suitability, 0);
});

test('steep terrain suppresses an otherwise suitable patch', () => {
  const flat = createField();
  const best = findBestSample(flat);
  assert.ok(best.sample.suitability > 0.5);

  const steep = createField({
    heightAt: (x) => 10 + (x - best.x) * 3,
  });
  const sample = steep.sample(best.x, best.z);
  assert.ok(sample.slope > 2);
  assert.equal(sample.slopeWeight, 0);
  assert.equal(sample.suitability, 0);
});

test('placement evaluation uses stable priority as the density threshold', () => {
  const evaluator = createForestPlacementEvaluator({
    sample: () => ({
      patchId: '4:7:patch',
      profileKey: 'temperate_deciduous_forest',
      structure: 'fragmented_woodland',
      suitability: 0.4,
      patchCoverage: 0.75,
      patchEdge: 0.25,
      slope: 0.1,
      elevation: 12,
    }),
  });

  const accepted = evaluator({ x: 0, z: 0, priority: 0.25 });
  const rejected = evaluator({ x: 0, z: 0, priority: 0.5 });
  assert.equal(accepted.patchId, '4:7:patch');
  assert.equal(accepted.forestSuitability, 0.4);
  assert.equal(rejected, null);
});

test('stable scatter caps accepted records and preserves evaluator metadata', () => {
  const placements = buildStableChunkManifest({
    kind: 'tree',
    chunkX: 0,
    chunkZ: 0,
    chunkSize: 16,
    tileSize: 2,
    perChunk: 16,
    maxAccepted: 2,
    tileIds: [7],
    tileAt: () => 7,
    heightAt: () => 0,
    prototypeCount: 2,
    minScale: 0.8,
    maxScale: 1.2,
    radiusForScale: () => 0,
    candidateEvaluator: (candidate) => (
      candidate.priority < 0.9 ? { patchId: 'stable-patch' } : null
    ),
  });

  assert.equal(placements.length, 2);
  assert.ok(placements.every((placement) => placement.patchId === 'stable-patch'));
  assert.ok(placements[0].index < placements[1].index);
});
