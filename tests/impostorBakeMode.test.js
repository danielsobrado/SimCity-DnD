import assert from 'node:assert/strict';
import test from 'node:test';
import { isTreeImpostorBakeMode } from '../src/editor/stylized/impostorBakeMode.js';

test('detects the explicit tree impostor bake query', () => {
  assert.equal(isTreeImpostorBakeMode({ search: '?bakeImpostors=1&download=1' }), true);
});

test('does not enable bake mode for normal editor URLs', () => {
  assert.equal(isTreeImpostorBakeMode({ search: '' }), false);
  assert.equal(isTreeImpostorBakeMode({ search: '?bakeImpostors=0' }), false);
  assert.equal(isTreeImpostorBakeMode(null), false);
});
