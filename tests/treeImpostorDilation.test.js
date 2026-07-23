import assert from 'node:assert/strict';
import test from 'node:test';
import { createDilatedTile } from '../src/editor/stylized/impostor/TreeImpostorBaker.js';

test('dilates opaque RGB into transparent gutter without changing alpha', () => {
  const pixels = new Uint8Array([
    255, 0, 0, 255,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const tile = createDilatedTile(pixels, 2, 4, 1);
  const transparentColoredPixels = [];
  let opaquePixels = 0;
  for (let offset = 0; offset < tile.length; offset += 4) {
    if (tile[offset + 3] > 0) opaquePixels += 1;
    if (tile[offset + 3] === 0 && tile[offset] === 255) {
      transparentColoredPixels.push(offset);
    }
  }
  assert.ok(transparentColoredPixels.length > 0);
  assert.equal(opaquePixels, 1);
});
