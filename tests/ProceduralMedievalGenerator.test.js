import assert from 'node:assert/strict';
import test from 'node:test';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { createProceduralMedievalParts } from '../src/editor/workshop/ProceduralMedievalGenerator.js';

const recipe = {
  archetype: 'wall',
  style: 'limestone',
  width: 6,
  depth: 1.5,
  height: 4,
  seed: 77,
  detail: 2,
  remesh: true,
  albedo: true,
};

function positionSignature(parts) {
  let hash = 2166136261;
  for (const part of parts) {
    for (const value of part.geometry.getAttribute('position').array) {
      const quantized = Math.round(value * 10000);
      hash ^= quantized;
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

test('procedural masonry is deterministic and remeshed', () => {
  const first = createProceduralMedievalParts(recipe);
  const second = createProceduralMedievalParts(recipe);
  try {
    assert.equal(first.length, 1);
    assert.equal(first.stats.drawParts, 1);
    assert.ok(first.stats.stones > 20);
    assert.equal(positionSignature(first), positionSignature(second));
    assert.ok(first[0].geometry.boundingBox);
    assert.ok(first[0].geometry.boundingSphere);
  } finally {
    disposeModelParts(first);
    disposeModelParts(second);
  }
});

test('albedo baking creates a reusable sRGB data texture', () => {
  const parts = createProceduralMedievalParts(recipe);
  try {
    const texture = parts[0].material.map;
    assert.ok(texture?.isDataTexture);
    assert.equal(texture.image.width, 128);
    assert.equal(texture.image.height, 128);
    assert.equal(texture.image.data.length, 128 * 128 * 4);
  } finally {
    disposeModelParts(parts);
  }
});
