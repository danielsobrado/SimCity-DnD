import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE_PATH = new URL('../src/editor/voxel/GpuVoxelChunk.js', import.meta.url);

test('uses compute storage and indirect drawing for voxel generation', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');

  assert.match(source, /StorageInstancedBufferAttribute/);
  assert.match(source, /IndirectStorageBufferAttribute/);
  assert.match(source, /geometry\.setIndirect\(drawBuffer\)/);
  assert.match(source, /computeAsync\(this\.computeGenerate\)/);
});

test('does not introduce GPU-to-CPU readbacks', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');

  assert.doesNotMatch(
    source,
    /getArrayBufferAsync|mapAsync|readRenderTargetPixels|readRenderTargetPixelsAsync/,
  );
});
