import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeChunkDocument,
  encodeChunkDocument,
} from '../src/editor/world/ChunkDocumentCodec.js';

test('reserved tile value 255 remains lossless by using sparse encoding', () => {
  const chunk = {
    x: -2,
    z: 4,
    tiles: Array.from({ length: 16 }, (_, index) => [index, index === 7 ? 255 : 9]),
    heights: [],
  };

  const encoded = encodeChunkDocument(chunk, 4);
  assert.equal(encoded.tileData, undefined);
  assert.deepEqual(encoded.tiles, chunk.tiles);

  const decoded = decodeChunkDocument(encoded, 4);
  assert.deepEqual(decoded.tiles, chunk.tiles);
});
