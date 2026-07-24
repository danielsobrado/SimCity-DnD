import assert from 'node:assert/strict';
import test from 'node:test';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';
import { createProceduralMedievalParts } from '../src/editor/workshop/ProceduralMedievalGenerator.js';

const recipe = {
  archetype: 'wall',
  style: 'limestone',
  topStyle: 'battlements',
  width: 6,
  depth: 1.5,
  height: 4,
  seed: 77,
  detail: 2,
  weathering: 0.35,
  windows: false,
  ivy: false,
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
    assert.equal(first.length, 2);
    assert.equal(first.stats.drawParts, 2);
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

test('semantic gatehouse details remain bounded after remeshing', () => {
  const parts = createProceduralMedievalParts({
    ...recipe,
    archetype: 'gatehouse',
    topStyle: 'terracotta',
    windows: true,
    ivy: true,
  });
  try {
    assert.ok(parts.stats.stones > 200);
    assert.ok(parts.stats.features > 20);
    assert.ok(parts.length <= 7);
    assert.equal(parts.stats.drawParts, parts.length);
    assert.ok(parts[0].geometry.getAttribute('color'));
    for (const part of parts) {
      assert.ok(part.geometry.boundingBox);
      assert.ok(part.geometry.boundingSphere);
      for (const value of part.geometry.getAttribute('position').array) {
        assert.ok(Number.isFinite(value));
      }
    }
  } finally {
    disposeModelParts(parts);
  }
});

test('square keep towers generate openings, battlements, and mortar backing deterministically', () => {
  const towerRecipe = {
    ...recipe,
    archetype: 'square-tower',
    width: 6,
    depth: 2,
    height: 7,
    windows: true,
    ivy: true,
  };
  const first = createProceduralMedievalParts(towerRecipe);
  const second = createProceduralMedievalParts(towerRecipe);
  try {
    assert.ok(first.stats.stones > 300);
    assert.ok(first.stats.features > 30);
    assert.ok(first.length <= 7);
    assert.equal(positionSignature(first), positionSignature(second));
  } finally {
    disposeModelParts(first);
    disposeModelParts(second);
  }
});
