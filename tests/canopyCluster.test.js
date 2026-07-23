import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCanopyCluster } from '../src/editor/stylized/lod/canopyCluster.js';

test('empty chunks produce no canopy cluster', () => {
  assert.equal(aggregateCanopyCluster({ chunkX: 0, chunkZ: 0, placements: [] }), null);
});

test('canopy aggregation is stable and covers placements', () => {
  const placements = [
    { x: 2, z: 4, height: 1, scale: 1 },
    { x: 10, z: 16, height: 3, scale: 1.2 },
  ];
  const first = aggregateCanopyCluster({ chunkX: 1, chunkZ: -2, placements });
  const second = aggregateCanopyCluster({ chunkX: 1, chunkZ: -2, placements });
  assert.deepEqual(first, second);
  assert.ok(first.width >= 8);
  assert.ok(first.depth >= 12);
  assert.equal(first.count, 2);
});
