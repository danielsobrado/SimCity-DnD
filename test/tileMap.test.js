import assert from 'node:assert/strict';
import test from 'node:test';
import { TileMap } from '../src/editor/TileMap.js';

test('paintSquare paints a clipped square and returns a reversible patch', () => {
  const map = new TileMap({ width: 4, height: 4, tileSize: 2, defaultTileId: 0 });
  const patch = map.paintSquare(0, 0, 3, 2);

  assert.equal(patch.indices.length, 4);
  assert.equal(map.get(0, 0), 2);
  assert.equal(map.get(1, 1), 2);
  assert.equal(map.get(2, 2), 0);

  map.applyPatch(patch, 'undo');
  assert.deepEqual(Array.from(map.tiles), new Array(16).fill(0));

  map.applyPatch(patch, 'redo');
  assert.equal(map.get(1, 1), 2);
});

test('fill skips tiles that already have the requested value', () => {
  const map = new TileMap({ width: 3, height: 2, tileSize: 1, defaultTileId: 1 });
  map.paintSquare(1, 0, 1, 2);

  const patch = map.fill(1);

  assert.equal(patch.indices.length, 1);
  assert.deepEqual(Array.from(map.tiles), new Array(6).fill(1));
});

test('documents round-trip with dimension and version checks', () => {
  const source = new TileMap({ width: 2, height: 2, tileSize: 2, defaultTileId: 0 });
  source.paintSquare(1, 1, 1, 4);

  const target = new TileMap({ width: 2, height: 2, tileSize: 2, defaultTileId: 0 });
  target.loadDocument(source.toDocument());

  assert.deepEqual(Array.from(target.tiles), Array.from(source.tiles));
  assert.throws(
    () => target.loadDocument({ ...source.toDocument(), width: 3 }),
    /Map dimensions must be 2 × 2/,
  );
});
