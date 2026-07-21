import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolvePublicAssetPath, validateGlbBuffer } from '../scripts/lib/glb-validation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the settlement GLB has a valid glTF 2 binary structure', async () => {
  const filePath = resolvePublicAssetPath(ROOT, 'assets/models/settlement-core.glb');
  const result = validateGlbBuffer(await readFile(filePath), 'settlement core');

  assert.ok(result.meshCount > 0);
  assert.ok(result.nodeCount > 0);
  assert.ok(result.nodeNames.includes('cottage'));
  assert.ok(result.nodeNames.includes('keep'));
});

test('GLB validation rejects corrupted headers', () => {
  const invalid = Buffer.alloc(32);
  assert.throws(() => validateGlbBuffer(invalid, 'broken'), /magic header/);
});

test('public asset paths cannot traverse outside public', () => {
  assert.throws(
    () => resolvePublicAssetPath(ROOT, '../package.json'),
    /escapes the public directory/,
  );
});
