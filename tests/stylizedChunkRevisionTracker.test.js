import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedChunkRevisionTracker } from '../src/editor/stylized/StylizedChunkRevisionTracker.js';

class WorldStoreStub {
  constructor() {
    this.chunkSize = 64;
    this.listener = null;
  }
  subscribe(listener) {
    this.listener = listener;
    return () => { this.listener = null; };
  }
  emit(change) { this.listener?.(change); }
}

test('tile edits dirty only the owning chunk', () => {
  const store = new WorldStoreStub();
  const tracker = new StylizedChunkRevisionTracker({ worldStore: store });
  const before = tracker.signature(0, 0);
  store.emit({ kind: 'tile', cells: [{ x: 65, z: 1 }] });
  assert.equal(tracker.signature(0, 0), before);
  assert.notEqual(tracker.signature(1, 0), before);
  tracker.dispose();
});

test('shared height vertices dirty every owning chunk', () => {
  const store = new WorldStoreStub();
  const tracker = new StylizedChunkRevisionTracker({ worldStore: store });
  store.emit({ kind: 'height', vertices: [{ x: 64, z: 64 }] });
  for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    assert.match(tracker.signature(x, z), /:1$/);
  }
  tracker.dispose();
});

test('reset invalidates all cached signatures', () => {
  const store = new WorldStoreStub();
  const tracker = new StylizedChunkRevisionTracker({ worldStore: store });
  const before = tracker.signature(10, 10);
  store.emit({ kind: 'reset' });
  assert.notEqual(tracker.signature(10, 10), before);
  tracker.dispose();
});
