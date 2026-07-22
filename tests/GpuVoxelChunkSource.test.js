import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CHUNK_SOURCE = new URL('../src/editor/voxel/GpuVoxelChunk.js', import.meta.url);
const WORLD_SOURCE = new URL('../src/editor/voxel/GpuVoxelWorld.js', import.meta.url);

async function readSources() {
  return Promise.all([
    readFile(CHUNK_SOURCE, 'utf8'),
    readFile(WORLD_SOURCE, 'utf8'),
  ]);
}

test('uses per-chunk GPU density, storage geometry, and indirect drawing', async () => {
  const [source] = await readSources();

  assert.match(source, /StorageBufferAttribute/);
  assert.match(source, /IndirectStorageBufferAttribute/);
  assert.match(source, /geometry\.setAttribute\('position', positionBuffer\)/);
  assert.match(source, /geometry\.setAttribute\('normal', normalBuffer\)/);
  assert.match(source, /geometry\.setIndirect\(drawBuffer\)/);
  assert.match(source, /computeAsync\(this\.computeDensity\)/);
  assert.match(source, /computeAsync\(this\.computeSmooth\)/);
  assert.match(source, /computeAsync\(this\.computeClassify\)/);
  assert.match(source, /computeAsync\(this\.computeEmit\)/);
});

test('samples the procedural field in absolute voxel-world coordinates with a halo', async () => {
  const [source] = await readSources();

  assert.match(source, /descriptor\.offsetX/);
  assert.match(source, /descriptor\.offsetZ/);
  assert.match(source, /layout\.totalCellsX/);
  assert.match(source, /layout\.totalCellsZ/);
  assert.match(source, /samplePosition\.x\.add\(halo\)/);
  assert.match(source, /createSampleGridPosition/);
});

test('filters stamps per chunk and avoids unrelated regeneration', async () => {
  const [, source] = await readSources();

  assert.match(source, /selectVoxelStampsForChunk/);
  assert.match(source, /stampSignatures/);
  assert.match(source, /chunk\.setStamps\(selected\)/);
});

test('does not introduce GPU-to-CPU readbacks', async () => {
  const sources = (await readSources()).join('\n');

  assert.doesNotMatch(
    sources,
    /getArrayBufferAsync|mapAsync|readRenderTargetPixels|readRenderTargetPixelsAsync/,
  );
});
