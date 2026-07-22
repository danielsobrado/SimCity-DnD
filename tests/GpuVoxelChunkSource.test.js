import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE_PATH = new URL('../src/editor/voxel/GpuVoxelChunk.js', import.meta.url);

test('uses GPU density, smoothing, classification, emission, and indirect drawing', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');

  assert.match(source, /StorageBufferAttribute\(layout\.sampleCount, 1\)/);
  assert.match(source, /Apply voxel SDF stamps/);
  assert.match(source, /Smooth voxel SDF stamps/);
  assert.match(source, /Classify marching-cubes cells/);
  assert.match(source, /Emit marching-cubes surface/);
  assert.match(source, /IndirectStorageBufferAttribute/);
  assert.match(source, /geometry\.setAttribute\('position', positionBuffer\)/);
  assert.match(source, /geometry\.setAttribute\('normal', normalBuffer\)/);
  assert.match(source, /geometry\.setIndirect\(drawBuffer\)/);
  assert.match(source, /computeAsync\(this\.computeDensity\)/);
  assert.match(source, /computeAsync\(this\.computeSmooth\)/);
  assert.match(source, /atomicAdd\([\s\S]*vertexCount/);
});

test('emits a marching-cubes surface instead of voxel cube instances', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');

  assert.match(source, /MC_TRIANGLE_EDGES/);
  assert.doesNotMatch(source, /BoxGeometry\([\s\S]*VOXEL_CUBE_FILL_RATIO/);
});

test('uploads only sparse stamp controls from the CPU', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');

  assert.match(source, /stampShapeBuffer\.needsUpdate = true/);
  assert.match(source, /stampControlBuffer\.needsUpdate = true/);
  assert.match(source, /stampCountUniform\.value = stamps\.length/);
});

test('does not introduce GPU-to-CPU readbacks', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');

  assert.doesNotMatch(
    source,
    /getArrayBufferAsync|mapAsync|readRenderTargetPixels|readRenderTargetPixelsAsync/,
  );
});
