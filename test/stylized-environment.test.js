import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { validateEditorConfig } from '../src/config/validateEditorConfig.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET_PATHS = Object.freeze([
  'public/assets/grass-scene.glb',
  'public/assets/textures/bark/bark_color.png',
  'public/assets/textures/bark/bark_AO.png',
  'public/assets/textures/bark/bark_height.png',
  'public/assets/textures/flower/flowers.png',
  'public/assets/textures/flower/flowersRGB.png',
  'public/assets/textures/flower/flowersGradient.png',
  'public/assets/textures/flower3/flowers.png',
  'public/assets/textures/flower3/flowersRGB.png',
  'public/assets/textures/flower3/flowersGradient.png',
]);

async function loadConfig() {
  const text = await readFile(path.join(ROOT, 'editor.config.yaml'), 'utf8');
  return validateEditorConfig(yaml.load(text));
}

test('stylized environment config validates all enabled layers', async () => {
  const config = await loadConfig();
  const surface = config.stylizedSurface;
  assert.equal(surface.enabled, true);
  assert.equal(surface.rocks.enabled, true);
  assert.equal(surface.flowers.enabled, true);
  assert.equal(surface.trees.enabled, true);
  assert.equal(surface.sky.enabled, true);
  assert.ok(surface.grass.bladesPerCell > 0);
  assert.ok(surface.path.blendCells > 0);
});

test('stylized source assets are present with valid container signatures', async () => {
  for (const relativePath of ASSET_PATHS) {
    const data = await readFile(path.join(ROOT, relativePath));
    if (relativePath.endsWith('.glb')) {
      assert.equal(data.subarray(0, 4).toString('ascii'), 'glTF', relativePath);
      assert.equal(data.readUInt32LE(4), 2, relativePath);
    } else {
      assert.deepEqual(
        [...data.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
        relativePath,
      );
    }
  }
});

test('stylized render path remains WebGPU/TSL and avoids GPU readbacks', async () => {
  const directory = path.join(ROOT, 'src/editor/stylized');
  const fileNames = (await readdir(directory)).filter((fileName) => fileName.endsWith('.js'));
  const source = (await Promise.all(fileNames.map((fileName) => readFile(
    path.join(directory, fileName),
    'utf8',
  )))).join('\n');

  assert.match(source, /three\/webgpu/);
  assert.match(source, /three\/tsl/);
  assert.match(source, /InstancedMesh|InstancedBufferGeometry/);
  assert.doesNotMatch(source, /mapAsync\s*\(/);
  assert.doesNotMatch(source, /readRenderTargetPixels/);
  assert.doesNotMatch(source, /getBufferSubData/);
});

test('upstream MIT attribution is retained', async () => {
  const notice = await readFile(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(notice, /Christian Ortiz \(Cortiz\)/);
  assert.match(notice, /MIT License/);
  assert.match(notice, /Copyright \(c\) 2026/);
});
