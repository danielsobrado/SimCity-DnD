import assert from 'node:assert/strict';
import test from 'node:test';
import { VoxelStampStore } from '../src/editor/voxel/VoxelStampStore.js';

function createStore(maxStamps = 4) {
  return new VoxelStampStore({
    cells: [48, 16, 48],
    maxStamps,
  });
}

function createStamp(operation = 'subtract') {
  return {
    operation,
    center: [24, 7, 24],
    radius: 2.5,
    strength: 0.75,
    smoothness: 0.65,
  };
}

test('stores sparse voxel stamps with stable IDs', () => {
  const store = createStore();
  const first = store.add(createStamp('add'));
  const second = store.add(createStamp('smooth'));

  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.equal(store.size, 2);
  assert.deepEqual(store.toDocument().map((stamp) => stamp.operation), ['add', 'smooth']);
  assert.deepEqual(store.toMetadata(), { cells: [48, 16, 48] });
});

test('applies voxel stamp undo and redo changes', () => {
  const store = createStore();
  const stamp = store.add(createStamp());
  const change = { before: null, after: stamp };

  store.applyChange(change, 'undo');
  assert.equal(store.size, 0);

  store.applyChange(change, 'redo');
  assert.deepEqual(store.toDocument(), [{ id: 1, ...createStamp() }]);
});

test('round trips a sparse voxel stamp document', () => {
  const source = createStore();
  source.add(createStamp('add'));
  source.add({ ...createStamp('subtract'), center: [18, 4, 20] });

  const target = createStore();
  target.loadDocument(source.toDocument());

  assert.deepEqual(target.toDocument(), source.toDocument());
  assert.equal(target.add(createStamp('smooth')).id, 3);
});

test('centers stamps from a smaller source volume', () => {
  const target = createStore();
  target.loadDocument([{
    id: 1,
    operation: 'subtract',
    center: [12, 7, 12],
    radius: 2.5,
    strength: 0.75,
    smoothness: 0.65,
  }], { sourceCells: [24, 16, 24] });

  assert.deepEqual(target.toDocument()[0].center, [24, 7, 24]);
});

test('rejects invalid stamps and capacity overflow', () => {
  const store = createStore(1);
  assert.throws(
    () => store.add({ ...createStamp(), center: [49, 4, 4] }),
    /center\[0\] must be within the voxel world/,
  );

  store.add(createStamp());
  assert.throws(() => store.add(createStamp()), /capacity is 1/);
});
