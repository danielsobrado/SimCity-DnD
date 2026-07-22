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

test('uses per-slot GPU density, storage geometry, and indirect drawing', async () => {
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

test('feeds streamed chunk offsets through reusable shader uniforms', async () => {
  const [chunkSource, worldSource] = await readSources();

  assert.match(chunkSource, /descriptor\.offsetX/);
  assert.match(chunkSource, /descriptor\.offsetZ/);
  assert.match(worldSource, /offsetX: uniform\(0\)/);
  assert.match(worldSource, /slot\.shaderDescriptor\.offsetX\.value = descriptor\.offsetX/);
  assert.match(worldSource, /slot\.shaderDescriptor\.offsetZ\.value = descriptor\.offsetZ/);
});

test('reuses a fixed slot pool and regenerates only changed assignments or stamps', async () => {
  const [, source] = await readSources();

  assert.match(source, /createVoxelStreamingPlan/);
  assert.match(source, /signature === slot\.signature/);
  assert.match(source, /slot\.chunk\.setStamps\(selected\)/);
  assert.match(source, /Array\.from\([\s\S]*layout\.slotCount/);
});

test('serializes reassignment until active GPU rebuilds finish', async () => {
  const [, source] = await readSources();

  assert.match(source, /pendingFocusWorld/);
  assert.match(source, /slot\.chunk\.getStatus\(\)\.rebuilding/);
  assert.match(source, /this\.pendingFocusWorld && !rebuilding/);
});

test('does not introduce GPU-to-CPU readbacks', async () => {
  const sources = (await readSources()).join('\n');

  assert.doesNotMatch(
    sources,
    /getArrayBufferAsync|mapAsync|readRenderTargetPixels|readRenderTargetPixelsAsync/,
  );
});

test('does not embed Infinity into TSL voxel field constants', async () => {
  const [source] = await readSources();

  // Unbounded layouts use Infinity for totalCells*; baking that into TSL emits
  // invalid WGSL `Infinity.0`. Center offsets must be finite before Fn().
  assert.match(source, /Number\.isFinite\(layout\.totalCellsX\)/);
  assert.match(source, /Number\.isFinite\(layout\.totalCellsZ\)/);
  assert.doesNotMatch(source, /\.sub\(\s*layout\.totalCellsX\s*\*\s*0\.5\s*\)/);
  assert.doesNotMatch(source, /\.sub\(\s*layout\.totalCellsZ\s*\*\s*0\.5\s*\)/);
  assert.match(source, /chunkCellsX\s*\*\s*layout\.voxelSize/);
});
